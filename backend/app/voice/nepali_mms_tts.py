"""Facebook MMS-TTS Nepali plugin for LiveKit agents.

Uses facebook/mms-tts-npi (VITS model) — better quality than SpeechT5,
downloads ~300MB from HuggingFace on first use, then cached locally.
"""
from __future__ import annotations

import asyncio
import logging
import numpy as np

from livekit.agents import tts, utils
from livekit.agents.tts import TTS, TTSCapabilities, ChunkedStream, AudioEmitter
from livekit.agents.types import APIConnectOptions, DEFAULT_API_CONNECT_OPTIONS

logger = logging.getLogger(__name__)

SAMPLE_RATE = 16000
_NEPALI_CONN_OPTIONS = APIConnectOptions(max_retry=1, retry_interval=0, timeout=120.0)

# ── Model singleton ───────────────────────────────────────────────

_tokenizer = None
_model = None
_load_lock: asyncio.Lock | None = None


def _get_lock() -> asyncio.Lock:
    global _load_lock
    if _load_lock is None:
        _load_lock = asyncio.Lock()
    return _load_lock


async def _ensure_model_loaded() -> None:
    global _tokenizer, _model
    if _model is not None:
        return
    async with _get_lock():
        if _model is not None:
            return
        loop = asyncio.get_event_loop()
        _tokenizer, _model = await loop.run_in_executor(None, _load_model_sync)
        logger.info("MMS-TTS Nepali model loaded and ready")


def _load_model_sync():
    import torch
    from transformers import VitsModel, AutoTokenizer

    logger.info("Loading Facebook MMS-TTS Nepali (facebook/mms-tts-npi)...")
    tokenizer = AutoTokenizer.from_pretrained("facebook/mms-tts-npi")
    model = VitsModel.from_pretrained("facebook/mms-tts-npi")
    model.eval()

    if torch.cuda.is_available():
        model = model.cuda()
        logger.info("MMS-TTS: running on GPU")
    else:
        logger.info("MMS-TTS: running on CPU")

    return tokenizer, model


def _synthesize_sync(text: str) -> np.ndarray:
    import torch

    inputs = _tokenizer(text, return_tensors="pt")
    device = next(_model.parameters()).device
    inputs = {k: v.to(device) for k, v in inputs.items()}

    with torch.no_grad():
        output = _model(**inputs).waveform

    audio = output.squeeze().cpu().numpy().astype(np.float32)
    return audio


def _float32_to_int16_bytes(audio: np.ndarray) -> bytes:
    clipped = np.clip(audio, -1.0, 1.0)
    return (clipped * 32767).astype(np.int16).tobytes()


# ── ChunkedStream ─────────────────────────────────────────────────

class NepaliMMSChunkedStream(ChunkedStream):
    def __init__(self, tts_instance: "NepaliMMSTTS", text: str, conn_options: APIConnectOptions) -> None:
        super().__init__(tts=tts_instance, input_text=text, conn_options=conn_options)
        self._text = text

    async def _run(self, output_emitter: AudioEmitter) -> None:
        logger.info(f"MMS-TTS._run called, text={self._text[:50]!r}")
        try:
            await _ensure_model_loaded()
            loop = asyncio.get_event_loop()
            audio_np = await loop.run_in_executor(None, _synthesize_sync, self._text)

            # MMS-TTS sample rate is 16000
            actual_sr = getattr(_model.config, "sampling_rate", SAMPLE_RATE)
            logger.info(f"MMS-TTS synthesis done: {len(audio_np)} samples @ {actual_sr}Hz")

            # Resample to 16kHz if needed
            if actual_sr != SAMPLE_RATE:
                import torchaudio.functional as F
                import torch
                tensor = torch.from_numpy(audio_np).unsqueeze(0)
                audio_np = F.resample(tensor, actual_sr, SAMPLE_RATE).squeeze(0).numpy()

            pcm_bytes = _float32_to_int16_bytes(audio_np)
            output_emitter.initialize(
                request_id=utils.shortuuid(),
                sample_rate=SAMPLE_RATE,
                num_channels=1,
                mime_type="audio/pcm",
            )
            output_emitter.push(pcm_bytes)
            output_emitter.end_input()
            logger.info("MMS-TTS audio emitted successfully")
        except Exception as e:
            logger.exception(f"MMS-TTS._run failed: {e}")
            raise


# ── TTS plugin ────────────────────────────────────────────────────

class NepaliMMSTTS(TTS):
    """Nepali TTS using Facebook MMS-TTS (VITS model, better quality)."""

    def __init__(self) -> None:
        super().__init__(
            capabilities=TTSCapabilities(streaming=False),
            sample_rate=SAMPLE_RATE,
            num_channels=1,
        )

    def synthesize(
        self,
        text: str,
        *,
        conn_options: APIConnectOptions = _NEPALI_CONN_OPTIONS,
    ) -> NepaliMMSChunkedStream:
        return NepaliMMSChunkedStream(self, text, conn_options)
