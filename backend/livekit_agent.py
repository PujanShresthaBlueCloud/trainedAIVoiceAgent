"""LiveKit agent worker — voice pipeline (STT → LLM → TTS) with tool execution."""
import asyncio
import json
import logging
import time
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()

from livekit import agents
from livekit.agents import AgentSession, Agent
from livekit.agents.llm import function_tool
from livekit.plugins import deepgram, openai, cartesia, silero, anthropic

from app.database import get_supabase
from app.config import settings
from app.voice.functions import execute_tool
from app.voice.tools import get_tools_for_agent, BUILT_IN_TOOLS

logger = logging.getLogger(__name__)


def _build_stt(agent_config: dict) -> deepgram.STT:
    """Build Deepgram STT plugin from agent config."""
    language = agent_config.get("language", "en-US")
    return deepgram.STT(
        model="nova-3",
        language=language[:2] if language else "en",
        api_key=settings.DEEPGRAM_API_KEY,
        no_delay=True,
        endpointing_ms=100,
        smart_format=False,
        punctuate=False,
        interim_results=True,
    )


def _build_llm(agent_config: dict):
    """Build LLM plugin from agent config, supporting multiple providers."""
    model = agent_config.get("llm_model", "gpt-4")
    temperature = 0.7

    if model.startswith("claude"):
        return anthropic.LLM(
            model=model,
            api_key=settings.ANTHROPIC_API_KEY,
            temperature=temperature,
        )
    elif model.startswith("deepseek"):
        return openai.LLM(
            model=model,
            base_url="https://api.deepseek.com",
            api_key=settings.DEEPSEEK_API_KEY,
            temperature=temperature,
        )
    elif model.startswith("llama") or model.startswith("mixtral"):
        return openai.LLM(
            model=model,
            base_url="https://api.groq.com/openai/v1",
            api_key=settings.GROQ_API_KEY,
            temperature=temperature,
        )
    else:
        # Default: OpenAI (gpt-*)
        return openai.LLM(
            model=model,
            api_key=settings.OPENAI_API_KEY,
            temperature=temperature,
        )


def _build_tts(agent_config: dict) -> cartesia.TTS:
    """Build Cartesia TTS plugin from agent config."""
    language = agent_config.get("language", "en-US")

    # Use Cartesia voice ID from agent metadata, or fall back to default
    metadata = agent_config.get("metadata") or {}
    cartesia_voice = metadata.get("cartesia_voice_id")

    return cartesia.TTS(
        model="sonic-3",
        language=language[:2] if language else "en",
        api_key=settings.CARTESIA_API_KEY,
        **({"voice": cartesia_voice} if cartesia_voice else {}),
    )


def _load_rag_context(agent_config: dict) -> str:
    """Load RAG context from knowledge base if configured."""
    kb_id = agent_config.get("knowledge_base_id")
    if not kb_id:
        return ""

    try:
        db = get_supabase()
        kb_result = db.table("knowledge_bases").select("*").eq("id", kb_id).eq("is_active", True).execute()
        if not kb_result.data:
            return ""

        kb = kb_result.data[0]
        # Return a note that RAG is available — actual retrieval happens at query time
        return f"\n\n[Knowledge Base '{kb['name']}' is connected. Use information from it when relevant.]"
    except Exception as e:
        logger.error(f"Failed to load RAG context: {e}")
        return ""


def _load_custom_functions(tool_names: list[str]) -> dict[str, dict]:
    """Batch-load all custom function definitions in a single DB query."""
    custom_names = [n for n in tool_names if n not in BUILT_IN_TOOLS]
    if not custom_names:
        return {}

    try:
        db = get_supabase()
        result = db.table("custom_functions").select("name,description").eq("is_active", True).in_("name", custom_names).execute()
        return {f["name"]: f for f in (result.data or [])}
    except Exception as e:
        logger.error(f"Failed to batch-load custom functions: {e}")
        return {}


def _build_agent(agent_config: dict, call_id: str) -> Agent:
    """Build a LiveKit Agent with instructions and tools from agent config."""
    system_prompt = agent_config.get("system_prompt", "You are a helpful voice AI assistant.")
    rag_context = _load_rag_context(agent_config)
    instructions = system_prompt + rag_context

    tools_enabled = agent_config.get("tools_enabled", [])

    # Batch-load all custom function defs in one query (instead of N queries)
    custom_funcs = _load_custom_functions(tools_enabled)

    class VoiceAgent(Agent):
        def __init__(self):
            super().__init__(instructions=instructions)
            self._call_id = call_id
            self._agent_config = agent_config

            # Register dynamic tools based on agent config
            for tool_name in tools_enabled:
                self._register_tool(tool_name)

        def _register_tool(self, tool_name: str):
            """Register a tool as a function_tool on this agent."""
            cid = self._call_id

            if tool_name == "end_call":
                @function_tool(name="end_call", description="End the current phone call.")
                async def end_call(reason: str = "completed") -> str:
                    result = await execute_tool(cid, "end_call", {"reason": reason})
                    return json.dumps(result)

            elif tool_name == "transfer_call":
                @function_tool(name="transfer_call", description="Transfer the call to another phone number or department.")
                async def transfer_call(to_number: str = "", department: str = "") -> str:
                    result = await execute_tool(cid, "transfer_call", {"to_number": to_number, "department": department})
                    return json.dumps(result)

            elif tool_name == "check_availability":
                @function_tool(name="check_availability", description="Check availability for a given date and time.")
                async def check_availability(date: str, time: str = "") -> str:
                    result = await execute_tool(cid, "check_availability", {"date": date, "time": time})
                    return json.dumps(result)

            elif tool_name == "book_appointment":
                @function_tool(name="book_appointment", description="Book an appointment for the caller.")
                async def book_appointment(name: str, date: str, time: str, notes: str = "") -> str:
                    result = await execute_tool(cid, "book_appointment", {"name": name, "date": date, "time": time, "notes": notes})
                    return json.dumps(result)

            elif tool_name in custom_funcs:
                # Custom function — already loaded from DB
                func_def = custom_funcs[tool_name]
                description = func_def.get("description", f"Custom function: {tool_name}")

                @function_tool(name=tool_name, description=description)
                async def custom_tool(**kwargs) -> str:
                    result = await execute_tool(cid, tool_name, kwargs)
                    return json.dumps(result)

    return VoiceAgent()


async def entrypoint(ctx: agents.JobContext):
    """Main entrypoint for the LiveKit agent worker."""
    await ctx.connect()

    # Parse agent_id and call_id from room metadata
    metadata = {}
    if ctx.room.metadata:
        try:
            metadata = json.loads(ctx.room.metadata)
        except json.JSONDecodeError:
            logger.error(f"Failed to parse room metadata: {ctx.room.metadata}")

    agent_id = metadata.get("agent_id")
    call_id = metadata.get("call_id")

    if not agent_id:
        logger.error("No agent_id in room metadata, cannot start session")
        return

    # Load agent config from Supabase
    db = get_supabase()
    agent_result = db.table("agents").select("*").eq("id", agent_id).execute()
    if not agent_result.data:
        logger.error(f"Agent not found: {agent_id}")
        return

    agent_config = agent_result.data[0]
    logger.info(f"Starting voice session: agent={agent_config['name']}, call={call_id}")

    # Update call status
    if call_id:
        db.table("calls").update({"status": "in-progress"}).eq("id", call_id).execute()

    # Build pipeline components
    stt = _build_stt(agent_config)
    llm = _build_llm(agent_config)
    tts = _build_tts(agent_config)
    vad = silero.VAD.load(
        min_speech_duration=0.05,
        min_silence_duration=0.15,
        prefix_padding_duration=0.1,
        activation_threshold=0.4,
    )

    # Build agent with tools
    agent = _build_agent(agent_config, call_id)

    # Create and start the session with low-latency settings
    session = AgentSession(
        stt=stt,
        llm=llm,
        tts=tts,
        vad=vad,
        min_endpointing_delay=0.3,
        max_endpointing_delay=1.5,
        preemptive_generation=True,
        allow_interruptions=True,
    )

    started_at = time.time()

    # Register transcript event handler (livekit-agents v1.0+)
    @session.on("conversation_item_added")
    def on_conversation_item(event):
        if not call_id:
            return
        try:
            role = event.item.role
            text = event.item.text_content
            if role in ("user", "assistant") and text:
                db.table("transcript_entries").insert({
                    "call_id": call_id,
                    "role": role,
                    "content": text,
                }).execute()
                logger.info(f"Transcript saved [{role}]: {text[:80]}")
        except Exception as e:
            logger.error(f"Failed to save transcript: {e}")

    # Start the session
    await session.start(
        room=ctx.room,
        agent=agent,
    )

    # Send welcome message so the agent speaks first (reduces perceived latency)
    agent_metadata = agent_config.get("metadata") or {}
    welcome_msg = agent_metadata.get("welcome_message", "")
    ai_speaks_first = agent_metadata.get("ai_speaks_first", True)
    if ai_speaks_first and welcome_msg:
        await session.say(welcome_msg)
    elif ai_speaks_first:
        await session.say("Hello! How can I help you today?")

    # Wait for the session to end (participant disconnects)
    async def _monitor_disconnect():
        """Update call record when the session ends."""
        # Wait for all participants to leave
        while True:
            participants = ctx.room.remote_participants
            if len(participants) == 0:
                # Give a grace period for reconnection
                await asyncio.sleep(5)
                if len(ctx.room.remote_participants) == 0:
                    break
            await asyncio.sleep(1)

        # Session ended — update call record
        if call_id:
            duration = int(time.time() - started_at)
            try:
                db.table("calls").update({
                    "status": "completed",
                    "duration_seconds": duration,
                    "ended_at": datetime.now(timezone.utc).isoformat(),
                    "end_reason": "participant_left",
                }).eq("id", call_id).execute()
            except Exception as e:
                logger.error(f"Failed to update call record: {e}")

        logger.info(f"Session ended: call={call_id}, duration={int(time.time() - started_at)}s")

    # Run disconnect monitor in background
    asyncio.create_task(_monitor_disconnect())


if __name__ == "__main__":
    agents.cli.run_app(agents.WorkerOptions(entrypoint_fnc=entrypoint))
