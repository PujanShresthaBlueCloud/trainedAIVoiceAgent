"""Custom Nepali TTS plugin for LiveKit agents.

Uses a locally fine-tuned SpeechT5ForTextToSpeech model with speaker embeddings
and microsoft/speecht5_hifigan vocoder to synthesize Nepali speech.

Model path: backend/models/nepali_tts/tts_model/speecht5_finetuned/checkpoint-2500
Speaker embeddings: backend/models/nepali_tts/tts_model/speaker_embeddings.pt
"""
from __future__ import annotations

import asyncio
import io
import logging
import os
from pathlib import Path

import numpy as np

from livekit.agents import tts, utils
from livekit.agents.tts import TTS, TTSCapabilities, SynthesizedAudio, ChunkedStream

logger = logging.getLogger(__name__)

# ── Paths ─────────────────────────────────────────────────────────

_BASE = Path(__file__).resolve().parents[3] / "models" / "nepali_tts" / "tts_model"
MODEL_PATH = str(_BASE / "speecht5_finetuned" / "checkpoint-2500")
SPEAKER_EMBEDDINGS_PATH = str(_BASE / "speaker_embeddings.pt")
VOCODER_NAME = "microsoft/speecht5_hifigan"
SAMPLE_RATE = 16000

# ── Model singleton ───────────────────────────────────────────────

_processor = None
_model = None
_vocoder = None
_speaker_embeddings = None
_load_lock: asyncio.Lock | None = None


def _get_lock() -> asyncio.Lock:
    global _load_lock
    if _load_lock is None:
        _load_lock = asyncio.Lock()
    return _load_lock


async def _ensure_model_loaded() -> None:
    global _processor, _model, _vocoder, _speaker_embeddings
    if _model is not None:
        return
    async with _get_lock():
        if _model is not None:
            return
        loop = asyncio.get_event_loop()
        _processor, _model, _vocoder, _speaker_embeddings = await loop.run_in_executor(
            None, _load_model_sync
        )
        logger.info("Nepali TTS model loaded and ready")


def _load_model_sync():
    import torch
    from transformers import SpeechT5Processor, SpeechT5ForTextToSpeech, SpeechT5HifiGan

    logger.info(f"Loading Nepali TTS model from: {MODEL_PATH}")

    processor = SpeechT5Processor.from_pretrained(MODEL_PATH)
    model = SpeechT5ForTextToSpeech.from_pretrained(MODEL_PATH)
    model.eval()

    logger.info(f"Loading vocoder: {VOCODER_NAME}")
    vocoder = SpeechT5HifiGan.from_pretrained(VOCODER_NAME)
    vocoder.eval()

    logger.info(f"Loading speaker embeddings from: {SPEAKER_EMBEDDINGS_PATH}")
    speaker_embeddings = torch.load(SPEAKER_EMBEDDINGS_PATH, map_location="cpu")

    # Ensure shape is [1, 512]
    if speaker_embeddings.dim() == 1:
        speaker_embeddings = speaker_embeddings.unsqueeze(0)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    if device == "cuda":
        model = model.cuda()
        vocoder = vocoder.cuda()
        speaker_embeddings = speaker_embeddings.cuda()
        logger.info("Nepali TTS: running on GPU")
    else:
        logger.info("Nepali TTS: running on CPU")

    return processor, model, vocoder, speaker_embeddings


def _synthesize_sync(text: str) -> np.ndarray:
    """Run TTS inference synchronously — called from thread pool."""
    import torch

    inputs = _processor(text=text, return_tensors="pt")
    input_ids = inputs["input_ids"]

    device = next(_model.parameters()).device
    input_ids = input_ids.to(device)
    embeddings = _speaker_embeddings.to(device)

    with torch.no_grad():
        speech = _model.generate_speech(input_ids, embeddings, vocoder=_vocoder)

    # speech is a 1-D float32 tensor — convert to numpy
    audio = speech.cpu().numpy().astype(np.float32)
    return audio


def _float32_to_int16_bytes(audio: np.ndarray) -> bytes:
    """Convert float32 [-1, 1] audio to int16 PCM bytes."""
    clipped = np.clip(audio, -1.0, 1.0)
    return (clipped * 32767).astype(np.int16).tobytes()


# ── ChunkedStream ─────────────────────────────────────────────────

class NepaliChunkedStream(ChunkedStream):
    """Synthesizes the full text in one shot then yields it as a single chunk."""

    def __init__(self, tts_instance: "NepaliTTS", text: str) -> None:
        super().__init__(tts=tts_instance, input_text=text)
        self._text = text

    async def _run(self) -> None:
        await _ensure_model_loaded()

        loop = asyncio.get_event_loop()
        audio_np = await loop.run_in_executor(None, _synthesize_sync, self._text)

        pcm_bytes = _float32_to_int16_bytes(audio_np)

        # Build a single AudioFrame and emit it
        from livekit import rtc
        frame = rtc.AudioFrame(
            data=pcm_bytes,
            sample_rate=SAMPLE_RATE,
            num_channels=1,
            samples_per_channel=len(audio_np),
        )
        self._event_ch.send_nowait(
            SynthesizedAudio(
                request_id=self._request_id,
                segment_id=self._segment_id,
                frame=frame,
            )
        )


# ── TTS plugin ────────────────────────────────────────────────────

class NepaliTTS(TTS):
    """Nepali text-to-speech using a locally fine-tuned SpeechT5 model."""

    def __init__(self) -> None:
        super().__init__(
            capabilities=TTSCapabilities(streaming=False),
            sample_rate=SAMPLE_RATE,
            num_channels=1,
        )

    def synthesize(self, text: str) -> NepaliChunkedStream:
        return NepaliChunkedStream(self, text)

    def stream(self) -> tts.SynthesizeStream:
        return tts.SynthesizeStream(self)
