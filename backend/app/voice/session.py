"""Base VoiceSession — STT -> LLM -> TTS pipeline."""
import asyncio
import logging
import re
import time
from typing import Callable, Awaitable
from app.database import get_supabase
from app.services.llm import stream_llm_response
from app.services.deepgram_stt import DeepgramSTT
from app.services.elevenlabs_tts import synthesize_speech
from app.voice.tools import get_tools_for_agent, get_custom_function_metadata, BUILT_IN_TOOLS
from app.voice.functions import execute_tool

logger = logging.getLogger(__name__)

_SENTENCE_END = re.compile(r'(?<=[.!?:])(?:\s|$)')


def _split_sentences(text: str) -> list[str]:
    """Split text on sentence boundaries, keeping partial trailing text."""
    parts = _SENTENCE_END.split(text)
    return [p for p in parts if p.strip()]


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
        logger.info(f"Voice session starting: call={self.call_id}, agent={self.agent_id}")

        if self.agent_id:
            try:
                db = get_supabase()
                result = db.table("agents").select("*").eq("id", self.agent_id).execute()
                if result.data:
                    self.agent = result.data[0]
                    logger.info(f"Loaded agent: {self.agent.get('name', 'unknown')}, model={self.agent.get('llm_model')}")
            except Exception as e:
                logger.error(f"Failed to load agent: {e}")

        if not self.agent:
            self.agent = {
                "system_prompt": "You are a helpful voice AI assistant. Keep responses concise and conversational.",
                "voice_id": "21m00Tcm4TlvDq8ikWAM",
                "llm_model": "gpt-4",
                "language": "en-US",
                "tools_enabled": [],
            }
            logger.info("Using default agent config")

        self.messages = [{"role": "system", "content": self.agent["system_prompt"]}]

        if self.call_id:
            try:
                db = get_supabase()
                db.table("calls").update({"status": "in-progress"}).eq("id", self.call_id).execute()
            except Exception as e:
                logger.error(f"Failed to update call status: {e}")

        self.stt = DeepgramSTT(
            on_transcript=self._on_transcript,
            language=self.agent.get("language", "en-US"),
        )
        await self.stt.connect()

        if not self.stt._ws:
            logger.error("Deepgram STT failed to connect - check DEEPGRAM_API_KEY")
            if self.send_message:
                await self.send_message({"type": "error", "message": "Speech-to-text service failed to connect. Check Deepgram API key."})
            return

        if self.send_message:
            await self.send_message({"type": "session_started", "agent": self.agent.get("name", "AI Assistant")})

        logger.info(f"Voice session started: call={self.call_id}, agent={self.agent_id}, stt_connected={self.stt._ws is not None}")

    async def handle_audio(self, audio_bytes: bytes):
        if self.stt:
            await self.stt.send_audio(audio_bytes)

    async def _on_transcript(self, text: str, is_final: bool):
        # Interrupt TTS only when user actually speaks (detected by STT)
        if self._is_speaking and text.strip():
            logger.info(f"User speaking while TTS playing — interrupting TTS")
            self._interrupt_tts = True
            self._is_speaking = False
        if self.send_message:
            await self.send_message({"type": "transcript", "role": "user", "content": text, "is_final": is_final})
        if is_final and text.strip():
            await self._process_user_message(text)

    async def _get_rag_context(self, user_message: str) -> str | None:
        """Embed user query, search knowledge base, return top-k text chunks."""
        kb_id = self.agent.get("knowledge_base_id") if self.agent else None
        if not kb_id:
            return None

        try:
            db = get_supabase()
            kb_result = db.table("knowledge_bases").select("*").eq("id", kb_id).eq("is_active", True).execute()
            if not kb_result.data:
                return None

            kb = kb_result.data[0]
            from app.services.vector_db import get_provider
            from app.services.document_processor import generate_embedding
            from app.config import settings

            provider = get_provider(kb["provider"], kb.get("config", {}))
            embedding = await generate_embedding(user_message)
            results = await provider.query(embedding, top_k=settings.RAG_TOP_K, namespace=kb.get("config", {}).get("namespace"))

            if not results:
                return None

            chunks = [r["text"] for r in results if r.get("text")]
            if not chunks:
                return None

            context = "\n\n---\n\n".join(chunks)
            logger.info(f"RAG context retrieved: {len(chunks)} chunks for KB {kb['name']}")
            return context
        except Exception as e:
            logger.error(f"RAG context retrieval error: {e}")
            return None

    async def _process_user_message(self, text: str):
        logger.info(f"Processing user message: '{text[:80]}...' model={self.agent.get('llm_model', 'gpt-4')}")
        self.messages.append({"role": "user", "content": text})

        if self.call_id:
            try:
                db = get_supabase()
                db.table("transcript_entries").insert({"call_id": self.call_id, "role": "user", "content": text}).execute()
            except Exception as e:
                logger.error(f"Failed to save transcript: {e}")

        # Inject RAG context if knowledge base is configured
        rag_context = await self._get_rag_context(text)
        if rag_context:
            rag_message = {
                "role": "system",
                "content": f"Relevant knowledge base context (use this to answer the user's question):\n\n{rag_context}",
            }
            self.messages.insert(-1, rag_message)
            logger.info("Injected RAG context into conversation")

        tools = get_tools_for_agent(self.agent.get("tools_enabled", []))
        full_response = ""
        self._interrupt_tts = False

        # Build call context for custom function webhook bodies
        call_context = {"call_id": self.call_id} if self.call_id else {}
        recent_transcript = [m["content"] for m in self.messages[-6:] if m["role"] in ("user", "assistant")]
        if recent_transcript:
            call_context["recent_transcript"] = recent_transcript

        # Queue for streaming sentence chunks to TTS
        tts_queue: asyncio.Queue[str | None] = asyncio.Queue()
        tts_task = asyncio.create_task(self._tts_consumer(tts_queue))
        sentence_buffer = ""

        try:
            async for chunk in stream_llm_response(
                self.messages,
                model=self.agent.get("llm_model", "gpt-4"),
                tools=tools if tools else None,
            ):
                if self._interrupt_tts:
                    break

                if chunk["type"] == "text_delta":
                    full_response += chunk["content"]
                    sentence_buffer += chunk["content"]
                    if self.send_message:
                        await self.send_message({"type": "transcript", "role": "assistant", "content": chunk["content"], "is_final": False})

                    # Flush completed sentences to TTS immediately
                    sentences = _split_sentences(sentence_buffer)
                    if len(sentences) > 1:
                        for s in sentences[:-1]:
                            await tts_queue.put(s)
                        sentence_buffer = sentences[-1]

                elif chunk["type"] == "tool_call":
                    # Flush any buffered text before tool call
                    if sentence_buffer.strip():
                        await tts_queue.put(sentence_buffer)
                        sentence_buffer = ""

                    tool_name = chunk["name"]

                    # Speak filler text while custom function executes
                    filler_task = None
                    if tool_name not in BUILT_IN_TOOLS:
                        func_meta = get_custom_function_metadata(tool_name)
                        speak_text = func_meta.get("speak_during_execution") if func_meta else None
                        if speak_text:
                            filler_task = asyncio.create_task(self._speak(speak_text))

                    result = await execute_tool(self.call_id, tool_name, chunk["arguments"], call_context=call_context)

                    # Cancel filler if still playing
                    if filler_task and not filler_task.done():
                        self._interrupt_tts = True
                        await asyncio.sleep(0.1)
                        self._interrupt_tts = False

                    if self.send_message:
                        await self.send_message({"type": "tool_call", "name": tool_name, "arguments": chunk["arguments"], "result": result})

                    # Speak failure message if webhook failed
                    if result.get("error") and result.get("_speak_on_failure"):
                        await tts_queue.put(result["_speak_on_failure"])

                    if result.get("action") == "end_call":
                        await tts_queue.put(None)
                        await tts_task
                        await self.end(reason=result.get("reason", "agent_ended"))
                        return
                    self.messages.append({"role": "assistant", "content": f"[Called {tool_name}]"})
                    self.messages.append({"role": "user", "content": f"Tool result: {result}"})
        except Exception as e:
            logger.error(f"LLM streaming error: {e}", exc_info=True)
            if self.send_message:
                await self.send_message({"type": "error", "message": f"LLM error: {e}"})
            await tts_queue.put(None)
            await tts_task
            return

        # Flush remaining buffered text
        if sentence_buffer.strip() and not self._interrupt_tts:
            await tts_queue.put(sentence_buffer)

        # Signal TTS consumer to finish
        await tts_queue.put(None)
        await tts_task

        logger.info(f"LLM response: '{full_response[:100]}...' ({len(full_response)} chars)")

        if full_response and not self._interrupt_tts:
            self.messages.append({"role": "assistant", "content": full_response})
            if self.call_id:
                try:
                    db = get_supabase()
                    db.table("transcript_entries").insert({"call_id": self.call_id, "role": "assistant", "content": full_response}).execute()
                except Exception as e:
                    logger.error(f"Failed to save transcript: {e}")
            if self.send_message:
                await self.send_message({"type": "transcript", "role": "assistant", "content": full_response, "is_final": True})

    async def _tts_consumer(self, queue: asyncio.Queue):
        """Consume sentence chunks from the queue and speak them sequentially."""
        while True:
            text = await queue.get()
            if text is None:
                break
            if self._interrupt_tts:
                break
            await self._speak(text)

    async def _speak(self, text: str):
        if not self.send_audio:
            logger.warning("No send_audio callback — skipping TTS")
            return
        self._is_speaking = True
        self._interrupt_tts = False
        chunk_count = 0
        total_bytes = 0
        try:
            async for audio_chunk in synthesize_speech(text=text, voice_id=self.agent.get("voice_id")):
                if self._interrupt_tts:
                    logger.info("TTS interrupted by user")
                    break
                chunk_count += 1
                total_bytes += len(audio_chunk)
                await self.send_audio(audio_chunk)
            logger.info(f"TTS complete: {chunk_count} chunks, {total_bytes} bytes total")
        except Exception as e:
            logger.error(f"TTS error: {e}", exc_info=True)
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
