import asyncio
import json
import logging
from typing import Callable, Awaitable
from config import settings

logger = logging.getLogger(__name__)

DEEPGRAM_WS_URL = "wss://api.deepgram.com/v1/listen"


class DeepgramSTT:
    def __init__(
        self,
        on_transcript: Callable[[str, bool], Awaitable[None]],
        language: str = "en-US",
        sample_rate: int = 16000,
        encoding: str = "linear16",
    ):
        self.on_transcript = on_transcript
        self.language = language
        self.sample_rate = sample_rate
        self.encoding = encoding
        self._ws = None
        self._running = False

    async def connect(self):
        import websockets

        params = (
            f"?language={self.language}&sample_rate={self.sample_rate}"
            f"&encoding={self.encoding}&channels=1&model=nova-2"
            f"&punctuate=true&interim_results=true&endpointing=300&vad_events=true"
        )
        headers = {"Authorization": f"Token {settings.DEEPGRAM_API_KEY}"}
        try:
            self._ws = await websockets.connect(
                DEEPGRAM_WS_URL + params,
                additional_headers=headers,
            )
            self._running = True
            asyncio.create_task(self._receive_loop())
            logger.info("Deepgram STT connected")
        except Exception as e:
            logger.error(f"Deepgram STT connection failed: {e}")
            self._running = False
            self._ws = None

    async def send_audio(self, audio_bytes: bytes):
        if self._ws and self._running:
            try:
                await self._ws.send(audio_bytes)
            except Exception as e:
                logger.error(f"Deepgram send error: {e}")

    async def _receive_loop(self):
        import websockets

        try:
            async for msg in self._ws:
                data = json.loads(msg)
                if data.get("type") == "Results":
                    alternatives = data.get("channel", {}).get("alternatives", [])
                    if alternatives:
                        transcript = alternatives[0].get("transcript", "")
                        is_final = data.get("is_final", False)
                        if transcript.strip():
                            await self.on_transcript(transcript, is_final)
        except websockets.ConnectionClosed:
            logger.info("Deepgram connection closed")
        except Exception as e:
            logger.error(f"Deepgram receive error: {e}")
        finally:
            self._running = False

    async def close(self):
        self._running = False
        if self._ws:
            try:
                await self._ws.send(json.dumps({"type": "CloseStream"}))
                await self._ws.close()
            except Exception:
                pass
            self._ws = None
