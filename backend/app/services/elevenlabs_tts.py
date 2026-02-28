import logging
import struct
import asyncio
import io
from typing import AsyncGenerator
import httpx
from app.config import settings

logger = logging.getLogger(__name__)
ELEVENLABS_API_URL = "https://api.elevenlabs.io/v1"


async def synthesize_speech(
    text: str,
    voice_id: str | None = None,
    model_id: str = "eleven_flash_v2_5",
    output_format: str = "pcm_16000",
) -> AsyncGenerator[bytes, None]:
    """Try ElevenLabs → OpenAI → gTTS (free) fallback chain."""

    # Try ElevenLabs
    if settings.ELEVENLABS_API_KEY:
        try:
            chunks_yielded = 0
            async for chunk in _elevenlabs_tts(text, voice_id, model_id, output_format):
                chunks_yielded += 1
                yield chunk
            if chunks_yielded > 0:
                return
            logger.warning("ElevenLabs returned no audio, trying fallbacks")
        except Exception as e:
            logger.warning(f"ElevenLabs TTS failed: {e}, trying fallbacks")

    # Fallback: OpenAI TTS
    if settings.OPENAI_API_KEY:
        try:
            chunks_yielded = 0
            logger.info("Trying OpenAI TTS fallback")
            async for chunk in _openai_tts(text):
                chunks_yielded += 1
                yield chunk
            if chunks_yielded > 0:
                return
            logger.warning("OpenAI TTS returned no audio, trying gTTS fallback")
        except Exception as e:
            logger.warning(f"OpenAI TTS failed: {e}, trying gTTS fallback")

    # Final fallback: Edge TTS (free, no API key, streaming, good quality)
    logger.info("Using Edge TTS (free) fallback")
    async for chunk in _edge_tts(text):
        yield chunk


async def _elevenlabs_tts(
    text: str,
    voice_id: str | None = None,
    model_id: str = "eleven_flash_v2_5",
    output_format: str = "pcm_16000",
) -> AsyncGenerator[bytes, None]:
    voice = voice_id or settings.ELEVENLABS_VOICE_ID
    url = f"{ELEVENLABS_API_URL}/text-to-speech/{voice}/stream?output_format={output_format}&optimize_streaming_latency=4"

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
            async for chunk in resp.aiter_bytes(chunk_size=2048):
                if chunk:
                    yield chunk


async def _openai_tts(text: str) -> AsyncGenerator[bytes, None]:
    """OpenAI TTS — returns PCM16 at 24kHz, resampled to 16kHz."""
    url = "https://api.openai.com/v1/audio/speech"
    headers = {
        "Authorization": f"Bearer {settings.OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": "tts-1",
        "input": text,
        "voice": "alloy",
        "response_format": "pcm",
    }

    logger.info(f"OpenAI TTS request: text_len={len(text)}")

    async with httpx.AsyncClient(timeout=30.0) as client:
        async with client.stream("POST", url, json=payload, headers=headers) as resp:
            if resp.status_code != 200:
                body = await resp.aread()
                logger.error(f"OpenAI TTS error {resp.status_code}: {body}")
                return

            buffer = bytearray()
            async for chunk in resp.aiter_bytes(chunk_size=8192):
                if chunk:
                    buffer.extend(chunk)
                    while len(buffer) >= 600:
                        take = min(len(buffer), 6000)
                        take = take - (take % 2)
                        pcm_out = _resample_pcm16(bytes(buffer[:take]), 24000, 16000)
                        del buffer[:take]
                        if pcm_out:
                            yield pcm_out

            if len(buffer) >= 4:
                pcm_out = _resample_pcm16(bytes(buffer), 24000, 16000)
                if pcm_out:
                    yield pcm_out


async def _edge_tts(text: str, voice: str = "en-US-JennyNeural") -> AsyncGenerator[bytes, None]:
    """Free Microsoft Edge TTS — streams MP3, converts to PCM16 16kHz in chunks."""
    try:
        import edge_tts
    except ImportError:
        logger.error("edge-tts not installed. Run: pip install edge-tts")
        # Fall back to gTTS
        async for chunk in _gtts_tts(text):
            yield chunk
        return

    logger.info(f"Edge TTS request: voice={voice}, text_len={len(text)}")

    communicate = edge_tts.Communicate(text, voice)
    mp3_buffer = bytearray()

    async for msg in communicate.stream():
        if msg["type"] == "audio":
            mp3_buffer.extend(msg["data"])
            # Convert in chunks once we have enough MP3 data (~8KB)
            if len(mp3_buffer) >= 8192:
                pcm_data = await _mp3_to_pcm16(bytes(mp3_buffer))
                mp3_buffer.clear()
                if pcm_data:
                    for i in range(0, len(pcm_data), 2048):
                        yield pcm_data[i:i + 2048]

    # Flush remaining MP3 data
    if mp3_buffer:
        pcm_data = await _mp3_to_pcm16(bytes(mp3_buffer))
        if pcm_data:
            for i in range(0, len(pcm_data), 2048):
                yield pcm_data[i:i + 2048]

    logger.info("Edge TTS complete")


async def _gtts_tts(text: str) -> AsyncGenerator[bytes, None]:
    """Free Google TTS via gTTS — converts MP3 to PCM16 16kHz."""
    try:
        from gtts import gTTS
    except ImportError:
        logger.error("gTTS not installed. Run: pip install gTTS")
        return

    logger.info(f"gTTS request: text_len={len(text)}")

    # gTTS is synchronous, run in executor
    def _generate_mp3() -> bytes:
        tts = gTTS(text=text, lang="en")
        mp3_buf = io.BytesIO()
        tts.write_to_fp(mp3_buf)
        return mp3_buf.getvalue()

    try:
        mp3_data = await asyncio.get_event_loop().run_in_executor(None, _generate_mp3)
    except Exception as e:
        logger.error(f"gTTS generation error: {e}")
        return

    if not mp3_data:
        logger.error("gTTS returned empty MP3")
        return

    logger.info(f"gTTS generated {len(mp3_data)} bytes MP3, converting to PCM16")

    # Convert MP3 to PCM16 16kHz using ffmpeg (commonly available on macOS/Linux)
    pcm_data = await _mp3_to_pcm16(mp3_data)
    if not pcm_data:
        return

    logger.info(f"gTTS converted to {len(pcm_data)} bytes PCM16")

    # Yield in chunks
    chunk_size = 4096
    for i in range(0, len(pcm_data), chunk_size):
        yield pcm_data[i:i + chunk_size]


async def _mp3_to_pcm16(mp3_data: bytes) -> bytes | None:
    """Convert MP3 bytes to PCM16 mono 16kHz using ffmpeg."""
    try:
        proc = await asyncio.create_subprocess_exec(
            "ffmpeg", "-i", "pipe:0",
            "-f", "s16le", "-acodec", "pcm_s16le",
            "-ar", "16000", "-ac", "1",
            "pipe:1",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate(input=mp3_data)
        if proc.returncode != 0:
            logger.error(f"ffmpeg error: {stderr.decode()[:200]}")
            return None
        return stdout
    except FileNotFoundError:
        logger.error("ffmpeg not found. Install it: brew install ffmpeg")
        # Try pydub as alternative
        return _mp3_to_pcm16_pydub(mp3_data)
    except Exception as e:
        logger.error(f"MP3 to PCM conversion error: {e}")
        return None


def _mp3_to_pcm16_pydub(mp3_data: bytes) -> bytes | None:
    """Fallback: convert MP3 to PCM16 using pydub (if available)."""
    try:
        from pydub import AudioSegment
        audio = AudioSegment.from_mp3(io.BytesIO(mp3_data))
        audio = audio.set_frame_rate(16000).set_channels(1).set_sample_width(2)
        return audio.raw_data
    except ImportError:
        logger.error("Neither ffmpeg nor pydub available for MP3 conversion")
        return None
    except Exception as e:
        logger.error(f"pydub conversion error: {e}")
        return None


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
