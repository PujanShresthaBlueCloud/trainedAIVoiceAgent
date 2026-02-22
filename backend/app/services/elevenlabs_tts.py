import logging
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
    voice = voice_id or settings.ELEVENLABS_VOICE_ID
    url = f"{ELEVENLABS_API_URL}/text-to-speech/{voice}/stream?output_format={output_format}"

    headers = {"xi-api-key": settings.ELEVENLABS_API_KEY, "Content-Type": "application/json"}
    payload = {
        "text": text,
        "model_id": model_id,
        "voice_settings": {"stability": 0.5, "similarity_boost": 0.75, "style": 0.0, "use_speaker_boost": True},
    }

    logger.info(f"TTS request: voice={voice}, model={model_id}, text_len={len(text)}")

    async with httpx.AsyncClient(timeout=30.0) as client:
        async with client.stream("POST", url, json=payload, headers=headers) as resp:
            if resp.status_code != 200:
                body = await resp.aread()
                logger.error(f"ElevenLabs TTS error {resp.status_code}: {body}")
                return
            async for chunk in resp.aiter_bytes(chunk_size=4096):
                if chunk:
                    yield chunk


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
