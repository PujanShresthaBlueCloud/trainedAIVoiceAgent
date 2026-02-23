"""Browser WebSocket voice session — PCM16 audio."""
import json
import logging
from fastapi import WebSocket

from app.voice.session import VoiceSession

logger = logging.getLogger(__name__)


class BrowserVoiceSession:
    def __init__(self, websocket: WebSocket, agent_id: str | None = None):
        self.ws = websocket
        self.agent_id = agent_id
        self.session: VoiceSession | None = None

    async def run(self):
        try:
            call_id = await self._create_call()
        except Exception as e:
            logger.error(f"Failed to create call record: {e}")
            call_id = None

        self.session = VoiceSession(
            call_id=call_id, agent_id=self.agent_id,
            send_audio=self._send_audio, send_message=self._send_message,
        )

        try:
            await self.session.start()
        except Exception as e:
            logger.error(f"Session start failed: {e}")
            await self._send_message({"type": "error", "message": f"Session start failed: {e}"})
            return

        audio_recv_count = 0
        try:
            while True:
                msg = await self.ws.receive()
                if msg.get("type") == "websocket.disconnect":
                    break
                if "bytes" in msg:
                    audio_recv_count += 1
                    if audio_recv_count <= 3 or audio_recv_count % 100 == 0:
                        logger.info(f"Received browser audio chunk #{audio_recv_count}: {len(msg['bytes'])} bytes")
                    await self.session.handle_audio(msg["bytes"])
                elif "text" in msg:
                    data = json.loads(msg["text"])
                    if data.get("type") == "audio":
                        import base64
                        await self.session.handle_audio(base64.b64decode(data["data"]))
                    elif data.get("type") == "end":
                        break
        except Exception as e:
            logger.error(f"Browser WS error: {e}")
        finally:
            if self.session:
                await self.session.end(reason="browser_disconnect")

    async def _create_call(self) -> str | None:
        from app.database import get_supabase
        db = get_supabase()
        result = db.table("calls").insert({"agent_id": self.agent_id, "direction": "browser", "status": "connecting"}).execute()
        return result.data[0]["id"] if result.data else None

    _audio_chunk_count = 0

    async def _send_audio(self, audio_bytes: bytes):
        try:
            self._audio_chunk_count += 1
            if self._audio_chunk_count <= 5 or self._audio_chunk_count % 20 == 0:
                logger.info(f"Sending audio chunk #{self._audio_chunk_count}: {len(audio_bytes)} bytes")
            await self.ws.send_bytes(audio_bytes)
        except Exception as e:
            logger.error(f"Send audio error: {e}")

    async def _send_message(self, msg: dict):
        try:
            await self.ws.send_json(msg)
        except Exception as e:
            logger.error(f"Send message error: {e}")
