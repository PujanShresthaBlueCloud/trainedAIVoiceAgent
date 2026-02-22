"""Twilio media stream WebSocket voice session — mulaw audio."""
import json
import logging
from fastapi import WebSocket
from app.voice.session import VoiceSession
from app.voice.audio_codec import base64_mulaw_to_pcm16, pcm16_to_base64_mulaw
from app.database import get_supabase

logger = logging.getLogger(__name__)


class TwilioVoiceSession:
    def __init__(self, websocket: WebSocket):
        self.ws = websocket
        self.session: VoiceSession | None = None
        self.stream_sid: str | None = None
        self.call_sid: str | None = None
        self.call_id: str | None = None

    async def run(self):
        try:
            while True:
                msg = await self.ws.receive()
                if msg.get("type") == "websocket.disconnect":
                    break
                if "text" in msg:
                    data = json.loads(msg["text"])
                    event = data.get("event")

                    if event == "start":
                        self.stream_sid = data.get("streamSid")
                        start_data = data.get("start", {})
                        self.call_sid = start_data.get("callSid") or start_data.get("customParameters", {}).get("callSid")
                        self.call_id = await self._find_call_id()
                        agent_id = await self._get_agent_for_call()
                        self.session = VoiceSession(
                            call_id=self.call_id, agent_id=agent_id,
                            send_audio=self._send_audio, send_message=self._send_message,
                        )
                        await self.session.start()

                    elif event == "media" and self.session:
                        payload = data.get("media", {}).get("payload", "")
                        if payload:
                            pcm_audio = base64_mulaw_to_pcm16(payload)
                            await self.session.handle_audio(pcm_audio)

                    elif event == "stop":
                        break
        except Exception as e:
            logger.error(f"Twilio WS error: {e}")
        finally:
            if self.session:
                await self.session.end(reason="twilio_disconnect")

    async def _find_call_id(self) -> str | None:
        if not self.call_sid:
            return None
        db = get_supabase()
        result = db.table("calls").select("id").eq("twilio_call_sid", self.call_sid).execute()
        return result.data[0]["id"] if result.data else None

    async def _get_agent_for_call(self) -> str | None:
        if not self.call_id:
            return None
        db = get_supabase()
        result = db.table("calls").select("agent_id").eq("id", self.call_id).execute()
        return result.data[0]["agent_id"] if result.data else None

    async def _send_audio(self, pcm_audio: bytes):
        if not self.stream_sid:
            return
        try:
            b64_mulaw = pcm16_to_base64_mulaw(pcm_audio)
            await self.ws.send_json({"event": "media", "streamSid": self.stream_sid, "media": {"payload": b64_mulaw}})
        except Exception as e:
            logger.error(f"Twilio send audio error: {e}")

    async def _send_message(self, msg: dict):
        logger.debug(f"Twilio session msg: {msg}")
