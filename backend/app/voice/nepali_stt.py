"""Custom Nepali STT plugin for LiveKit agents.

Wraps addy88/wav2vec2-nepali-stt (HuggingFace) and implements the
livekit.agents.stt.STT interface so it can be used as a drop-in STT
provider in the voice pipeline.

Model is lazy-loaded on first use and cached as a module-level singleton
so it is only loaded once per worker process.
"""
from __future__ import annotations

import asyncio
import logging
from typing import AsyncIterable

import numpy as np

from livekit.agents import stt, utils
from livekit.agents.stt import (
    STTCapabilities,
    SpeechData,
    SpeechEvent,
    SpeechEventType,
)

logger = logging.getLogger(__name__)

# ── Model singleton (lazy-loaded) ────────────────────────────────

_processor = None
_model = None
_model_name = "addy88/wav2vec2-nepali-stt"
_load_lock: asyncio.Lock | None = None   # created lazily inside async context


def _get_lock() -> asyncio.Lock:
    global _load_lock
    if _load_lock is None:
        _load_lock = asyncio.Lock()
    return _load_lock


async def _ensure_model_loaded() -> None:
    global _processor, _model
    if _model is not None:
        return
    async with _get_lock():
        if _model is not None:
            return
        try:
            from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor
            import torch  # noqa: F401 — confirm torch is available

            logger.info(f"Loading Nepali STT model: {_model_name}")
            loop = asyncio.get_event_loop()
            # Load in thread pool so we don't block the event loop
            _processor, _model = await loop.run_in_executor(
                None, _load_model_sync
            )
            logger.info("Nepali STT model loaded and ready")
        except ImportError as e:
            raise RuntimeError(
                "Nepali STT requires: pip install transformers torch soundfile torchaudio"
            ) from e


def _load_model_sync():
    from transformers import Wav2Vec2ForCTC, Wav2Vec2Processor
    import torch

    proc = Wav2Vec2Processor.from_pretrained(_model_name)
    mdl = Wav2Vec2ForCTC.from_pretrained(_model_name)
    mdl.eval()
    if torch.cuda.is_available():
        mdl = mdl.cuda()
        logger.info("Nepali STT: running on GPU")
    else:
        logger.info("Nepali STT: running on CPU")
    return proc, mdl


def _transcribe_sync(audio_float32: np.ndarray, sample_rate: int) -> str:
    """Synchronous inference — called from a thread pool executor."""
    import torch

    input_values = _processor(
        audio_float32,
        sampling_rate=sample_rate,
        return_tensors="pt",
    ).input_values

    if torch.cuda.is_available():
        input_values = input_values.cuda()

    with torch.no_grad():
        logits = _model(input_values).logits

    predicted_ids = torch.argmax(logits, dim=-1)
    return _processor.decode(predicted_ids[0], skip_special_tokens=True)


# ── LiveKit STT plugin ────────────────────────────────────────────

class NepaliSTT(stt.STT):
    """Nepali speech-to-text using wav2vec2-nepali-stt.

    Non-streaming: the LiveKit VAD collects speech frames, then calls
    `recognize()` with the full buffer. Ideal for turn-based voice agents.
    """

    TARGET_SAMPLE_RATE = 16000  # wav2vec2 requires 16 kHz

    def __init__(self) -> None:
        super().__init__(
            capabilities=STTCapabilities(
                streaming=False,
                interim_results=False,
            )
        )

    async def _recognize_impl(
        self,
        buffer: utils.AudioBuffer,
        *,
        language: str | None = "ne",
        conn_options=None,
    ) -> SpeechEvent:
        await _ensure_model_loaded()

        # In livekit-agents v1.4, buffer is a single AudioFrame
        from livekit import rtc
        if isinstance(buffer, rtc.AudioFrame):
            frames = [buffer]
        else:
            frames = list(buffer) if buffer else []

        logger.info(f"NepaliSTT._recognize_impl called, frames={len(frames)}")

        audio_float32 = _audio_buffer_to_float32(frames)
        sample_rate = _get_sample_rate(frames)

        # Resample to 16 kHz if needed
        if sample_rate and sample_rate != self.TARGET_SAMPLE_RATE:
            audio_float32 = _resample(audio_float32, sample_rate, self.TARGET_SAMPLE_RATE)

        if audio_float32.size == 0:
            return SpeechEvent(
                type=SpeechEventType.FINAL_TRANSCRIPT,
                alternatives=[SpeechData(text="", language="ne", confidence=0.0)],
            )

        # Run inference off the event loop
        loop = asyncio.get_event_loop()
        transcription = await loop.run_in_executor(
            None, _transcribe_sync, audio_float32, self.TARGET_SAMPLE_RATE
        )

        # Transliterate Devanagari → Latin (ITRANS) so LLM receives plain ASCII
        transcription = _to_latin(transcription)
        logger.info(f"Nepali STT transcript (latin): {transcription!r}")

        return SpeechEvent(
            type=SpeechEventType.FINAL_TRANSCRIPT,
            alternatives=[
                SpeechData(text=transcription, language="ne", confidence=1.0)
            ],
        )

    # stream() is intentionally not overridden — callers should wrap this STT
    # with livekit.agents.stt.StreamAdapter(stt=NepaliSTT(), vad=...) to get
    # a streaming interface. See _build_stt() in livekit_agent.py.


# ── Audio helpers ─────────────────────────────────────────────────

def _audio_buffer_to_float32(buffer: utils.AudioBuffer) -> np.ndarray:
    """Convert a list of AudioFrames (int16 PCM) to a float32 numpy array."""
    if not buffer:
        return np.array([], dtype=np.float32)

    chunks = []
    for frame in buffer:
        pcm = np.frombuffer(bytes(frame.data), dtype=np.int16)
        chunks.append(pcm.astype(np.float32) / 32768.0)

    return np.concatenate(chunks) if chunks else np.array([], dtype=np.float32)


def _get_sample_rate(buffer: utils.AudioBuffer) -> int:
    if buffer:
        return buffer[0].sample_rate
    return NepaliSTT.TARGET_SAMPLE_RATE


def _to_latin(text: str) -> str:
    """Transliterate Devanagari text to Latin (ITRANS) ASCII."""
    try:
        from indic_transliteration import sanscript
        from indic_transliteration.sanscript import transliterate
        return transliterate(text, sanscript.DEVANAGARI, sanscript.ITRANS)
    except Exception:
        return text  # fallback: return original if library missing


def _resample(audio: np.ndarray, from_rate: int, to_rate: int) -> np.ndarray:
    """Resample audio using torchaudio (best quality) or scipy fallback."""
    try:
        import torch
        import torchaudio.functional as F
        tensor = torch.from_numpy(audio).unsqueeze(0)
        resampled = F.resample(tensor, from_rate, to_rate)
        return resampled.squeeze(0).numpy()
    except ImportError:
        pass

    try:
        from scipy.signal import resample_poly
        from math import gcd
        g = gcd(from_rate, to_rate)
        return resample_poly(audio, to_rate // g, from_rate // g).astype(np.float32)
    except ImportError:
        pass

    # Naive linear interpolation fallback
    ratio = to_rate / from_rate
    new_length = int(len(audio) * ratio)
    return np.interp(
        np.linspace(0, len(audio) - 1, new_length),
        np.arange(len(audio)),
        audio,
    ).astype(np.float32)
