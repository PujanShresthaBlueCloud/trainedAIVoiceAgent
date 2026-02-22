"""Base VoiceSession — STT -> LLM -> TTS pipeline."""
import asyncio
import logging
import time
from typing import Callable, Awaitable
from database import get_supabase
from services.llm import stream_llm_response
from services.deepgram_stt import DeepgramSTT
from services.elevenlabs_tts import synthesize_speech
from voice.tools import get_tools_for_agent
from voice.functions import execute_tool

logger = logging.getLogger(__name__)


class VoiceSession:
    def __init__(
        self,
        call_id: str | None = None,
        agent_id: str | None = None,
        send_audio: Callable[[bytes], Awaitable[None]] | None = None,
        send_message: Callable[[dict], Awaitable[None]] | None = None,
    ):
        self.call_id = call_id
        self.agent_id = agent_id
        self.send_audio = send_audio
        self.send_message = send_message
        self.agent: dict | None = None
        self.messages: list[dict] = []
        self.stt: DeepgramSTT | None = None
        self._is_speaking = False
        self._interrupt_tts = False
        self._started_at = time.time()

    async def start(self):
        if self.agent_id:
            db = get_supabase()
            result = db.table("agents").select("*").eq("id", self.agent_id).execute()
            if result.data:
                self.agent = result.data[0]

        if not self.agent:
            self.agent = {
                "system_prompt": "You are a helpful voice AI assistant. Keep responses concise and conversational.",
                "voice_id": "21m00Tcm4TlvDq8ikWAM",
                "llm_model": "gpt-4",
                "language": "en-US",
                "tools_enabled": [],
            }

        self.messages = [{"role": "system", "content": self.agent["system_prompt"]}]

        if self.call_id:
            db = get_supabase()
            db.table("calls").update({"status": "in-progress"}).eq("id", self.call_id).execute()

        self.stt = DeepgramSTT(
            on_transcript=self._on_transcript,
            language=self.agent.get("language", "en-US"),
        )
        await self.stt.connect()

        if self.send_message:
            await self.send_message({"type": "session_started", "agent": self.agent.get("name", "AI Assistant")})

        logger.info(f"Voice session started: call={self.call_id}, agent={self.agent_id}")

    async def handle_audio(self, audio_bytes: bytes):
        if self.stt:
            if self._is_speaking:
                self._interrupt_tts = True
                self._is_speaking = False
            await self.stt.send_audio(audio_bytes)

    async def _on_transcript(self, text: str, is_final: bool):
        if self.send_message:
            await self.send_message({"type": "transcript", "role": "user", "content": text, "is_final": is_final})
        if is_final and text.strip():
            await self._process_user_message(text)

    async def _process_user_message(self, text: str):
        self.messages.append({"role": "user", "content": text})

        if self.call_id:
            db = get_supabase()
            db.table("transcript_entries").insert({"call_id": self.call_id, "role": "user", "content": text}).execute()

        tools = get_tools_for_agent(self.agent.get("tools_enabled", []))
        full_response = ""
        self._interrupt_tts = False

        async for chunk in stream_llm_response(
            self.messages,
            model=self.agent.get("llm_model", "gpt-4"),
            tools=tools if tools else None,
        ):
            if self._interrupt_tts:
                break

            if chunk["type"] == "text_delta":
                full_response += chunk["content"]
                if self.send_message:
                    await self.send_message({"type": "transcript", "role": "assistant", "content": chunk["content"], "is_final": False})

            elif chunk["type"] == "tool_call":
                result = await execute_tool(self.call_id, chunk["name"], chunk["arguments"])
                if self.send_message:
                    await self.send_message({"type": "tool_call", "name": chunk["name"], "arguments": chunk["arguments"], "result": result})
                if result.get("action") == "end_call":
                    await self.end(reason=result.get("reason", "agent_ended"))
                    return
                self.messages.append({"role": "assistant", "content": f"[Called {chunk['name']}]"})
                self.messages.append({"role": "user", "content": f"Tool result: {result}"})

        if full_response and not self._interrupt_tts:
            self.messages.append({"role": "assistant", "content": full_response})
            if self.call_id:
                db = get_supabase()
                db.table("transcript_entries").insert({"call_id": self.call_id, "role": "assistant", "content": full_response}).execute()
            if self.send_message:
                await self.send_message({"type": "transcript", "role": "assistant", "content": full_response, "is_final": True})
            await self._speak(full_response)

    async def _speak(self, text: str):
        if not self.send_audio:
            return
        self._is_speaking = True
        self._interrupt_tts = False
        try:
            async for audio_chunk in synthesize_speech(text=text, voice_id=self.agent.get("voice_id")):
                if self._interrupt_tts:
                    break
                await self.send_audio(audio_chunk)
        except Exception as e:
            logger.error(f"TTS error: {e}")
        finally:
            self._is_speaking = False

    async def end(self, reason: str = "completed"):
        if self.stt:
            await self.stt.close()
        duration = int(time.time() - self._started_at)
        if self.call_id:
            db = get_supabase()
            db.table("calls").update({"status": "completed", "end_reason": reason, "duration_seconds": duration, "ended_at": "now()"}).eq("id", self.call_id).execute()
        if self.send_message:
            await self.send_message({"type": "session_ended", "reason": reason, "duration": duration})
        logger.info(f"Voice session ended: call={self.call_id}, reason={reason}, duration={duration}s")
