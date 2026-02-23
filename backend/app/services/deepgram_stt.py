import asyncio
import json
import logging
from typing import Callable, Awaitable
from app.config import settings

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

    _send_count = 0

    async def send_audio(self, audio_bytes: bytes):
        if self._ws and self._running:
            try:
                self._send_count += 1
                if self._send_count <= 3 or self._send_count % 200 == 0:
                    logger.info(f"Deepgram send_audio #{self._send_count}: {len(audio_bytes)} bytes")
                await self._ws.send(audio_bytes)
            except Exception as e:
                if self._send_count <= 5:
                    logger.error(f"Deepgram send error: {e}")

    async def _receive_loop(self):
        import websockets

        msg_count = 0
        try:
            async for msg in self._ws:
                data = json.loads(msg)
                msg_count += 1
                msg_type = data.get("type", "unknown")

                if msg_type == "Results":
                    alternatives = data.get("channel", {}).get("alternatives", [])
                    if alternatives:
                        transcript = alternatives[0].get("transcript", "")
                        is_final = data.get("is_final", False)
                        if transcript.strip():
                            logger.info(f"Deepgram transcript (final={is_final}): '{transcript}'")
                            await self.on_transcript(transcript, is_final)
                elif msg_count <= 5:
                    logger.info(f"Deepgram msg #{msg_count}: type={msg_type}")
        except websockets.ConnectionClosed as e:
            logger.info(f"Deepgram connection closed: {e}")
        except Exception as e:
            logger.error(f"Deepgram receive error: {e}", exc_info=True)
        finally:
            self._running = False
            logger.info(f"Deepgram receive loop ended after {msg_count} messages")

    async def close(self):
        self._running = False
        if self._ws:
            try:
                await self._ws.send(json.dumps({"type": "CloseStream"}))
                await self._ws.close()
            except Exception:
                pass
            self._ws = None
