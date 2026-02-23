import logging
import struct
from typing import AsyncGenerator
import httpx
from app.config import settings

logger = logging.getLogger(__name__)
ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1"


async def synthesize_speech(
    text: str,
    voice_id: str | None = None,
    model_id: str = "eleven_multilingual_v2",
    output_format: str = "pcm_16000",
) -> AsyncGenerator[bytes, None]:
    """Try ElevenLabs first, fall back to OpenAI TTS if quota exceeded."""

    # Try ElevenLabs
    if settings.ELEVENLABS_API_KEY:
        try:
            chunks_yielded = 0
            async for chunk in _elevenlabs_tts(text, voice_id, model_id, output_format):
                chunks_yielded += 1
                yield chunk
            if chunks_yielded > 0:
                return
            # If no chunks yielded, ElevenLabs failed — fall through to OpenAI
            logger.warning("ElevenLabs returned no audio chunks, trying OpenAI TTS fallback")
        except Exception as e:
            logger.warning(f"ElevenLabs TTS failed: {e}, trying OpenAI TTS fallback")

    # Fallback: OpenAI TTS
    if settings.OPENAI_API_KEY:
        logger.info("Using OpenAI TTS fallback")
        async for chunk in _openai_tts(text):
            yield chunk
        return

    logger.error("No TTS provider available (ElevenLabs quota exceeded, no OpenAI key)")


async def _elevenlabs_tts(
    text: str,
    voice_id: str | None = None,
    model_id: str = "eleven_multilingual_v2",
    output_format: str = "pcm_16000",
) -> AsyncGenerator[bytes, None]:
    voice = voice_id or settings.ELEVENLABS_VOICE_ID
    url = f"{ELEVENLABS_API_URL}/text-to-speech/{voice}/stream?output_format={output_format}"

    headers = {"xi-api-key": settings.ELEVENLABS_API_KEY, "Content-Type": "application/json"}
    payload = {
        "text": text,
        "model_id": model_id,
        "voice_settings": {"stability": 0.5, "similarity_boost": 0.75, "style": 0.0, "use_speaker_boost": True},
    }

    logger.info(f"ElevenLabs TTS request: voice={voice}, model={model_id}, text_len={len(text)}")

    async with httpx.AsyncClient(timeout=30.0) as client:
        async with client.stream("POST", url, json=payload, headers=headers) as resp:
            if resp.status_code != 200:
                body = await resp.aread()
                logger.error(f"ElevenLabs TTS error {resp.status_code}: {body}")
                return
            async for chunk in resp.aiter_bytes(chunk_size=4096):
                if chunk:
                    yield chunk


async def _openai_tts(text: str) -> AsyncGenerator[bytes, None]:
    """OpenAI TTS — returns PCM16 at 16kHz (converted from WAV output)."""
    import io
    import wave

    url = "https://api.openai.com/v1/audio/speech"
    headers = {
        "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": "tts-1",
        "input": text,
        "voice": "alloy",
        "response_format": "pcm",  # raw PCM16 at 24kHz
    }

    logger.info(f"OpenAI TTS request: text_len={len(text)}")

    async with httpx.AsyncClient(timeout=30.0) as client:
        async with client.stream("POST", url, json=payload, headers=headers) as resp:
            if resp.status_code != 200:
                body = await resp.aread()
                logger.error(f"OpenAI TTS error {resp.status_code}: {body}")
                return

            # OpenAI PCM format is 24kHz 16-bit mono — resample to 16kHz
            buffer = bytearray()
            async for chunk in resp.aiter_bytes(chunk_size=8192):
                if chunk:
                    buffer.extend(chunk)
                    # Process complete sample pairs (2 bytes per sample)
                    while len(buffer) >= 6:  # need at least 3 samples for ratio 1.5
                        # Process in ~4096 byte output blocks
                        # Input: 24kHz, Output: 16kHz, ratio = 1.5
                        input_samples = len(buffer) // 2
                        output_samples = int(input_samples / 1.5)
                        if output_samples < 100:
                            break  # wait for more data
                        # Consume exactly the input samples needed
                        needed_input = int(output_samples * 1.5) + 1
                        needed_bytes = needed_input * 2
                        if needed_bytes > len(buffer):
                            needed_input = len(buffer) // 2
                            needed_bytes = needed_input * 2
                            output_samples = int(needed_input / 1.5)
                            if output_samples < 100:
                                break

                        input_data = bytes(buffer[:needed_bytes])
                        del buffer[:needed_bytes]

                        # Resample 24kHz -> 16kHz using linear interpolation
                        pcm_out = _resample_pcm16(input_data, 24000, 16000)
                        if pcm_out:
                            yield pcm_out

            # Process remaining buffer
            if len(buffer) >= 4:
                pcm_out = _resample_pcm16(bytes(buffer), 24000, 16000)
                if pcm_out:
                    yield pcm_out


def _resample_pcm16(data: bytes, from_rate: int, to_rate: int) -> bytes:
    """Resample PCM16 audio from one sample rate to another."""
    if from_rate == to_rate:
        return data

    num_samples = len(data) // 2
    if num_samples < 2:
        return b""

    samples = struct.unpack(f"<{num_samples}h", data)
    ratio = from_rate / to_rate
    out_len = int(num_samples / ratio)
    if out_len < 1:
        return b""

    output = []
    for i in range(out_len):
        src_idx = i * ratio
        idx0 = int(src_idx)
        idx1 = min(idx0 + 1, num_samples - 1)
        frac = src_idx - idx0
        val = samples[idx0] * (1 - frac) + samples[idx1] * frac
        output.append(int(max(-32768, min(32767, val))))

    return struct.pack(f"<{len(output)}h", *output)


async def get_available_voices() -> list[dict]:
    url = f"{ELEVENLABS_API_URL}/voices"
    headers = {"xi-api-key": settings.ELEVENLABS_API_KEY}
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.get(url, headers=headers)
        if resp.status_code == 200:
            return [
                {"voice_id": v["voice_id"], "name": v["name"], "category": v.get("category", "")}
                for v in resp.json().get("voices", [])
            ]
        return []
