"""LiveKit agent worker — voice pipeline (STT → LLM → TTS) with tool execution."""
import asyncio
import json
import logging
import time
import aiohttp
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
from app.services.livekit_service import transfer_sip_participant, create_sip_participant_with_headers

logger = logging.getLogger(__name__)

import re

def _to_e164(number: str) -> str:
    """Normalize a phone number to E.164 format (+country digits)."""
    digits = re.sub(r"[^\d+]", "", number.strip())
    if not digits.startswith("+"):
        digits = "+" + digits
    return digits


def _find_sip_participant_identity(room) -> str | None:
    """Find the SIP caller participant identity in the room."""
    for identity, participant in room.remote_participants.items():
        # SIP participants have identity starting with 'sip_' or 'phone-' or contain a phone number
        if (identity.startswith("sip_") or identity.startswith("phone-") or
                identity.startswith("tel:") or re.search(r"\+?\d{7,}", identity)):
            return identity
    # Fall back to first remote participant
    for identity in room.remote_participants:
        return identity
    return None


async def _resolve_dynamic_destination(routing_prompt: str, reason: str, transcript: str) -> str:
    """Use LLM to resolve the transfer destination from routing rules and call context."""
    import openai as openai_sdk
    client = openai_sdk.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    response = await client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": (
                    f"You are a call routing assistant. Given routing rules and the call context, "
                    f"return ONLY the E.164 phone number to transfer to. No explanation, just the number.\n\n"
                    f"Routing rules:\n{routing_prompt}"
                ),
            },
            {
                "role": "user",
                "content": f"Transfer reason: {reason}\n\nRecent conversation:\n{transcript or '(none)'}",
            },
        ],
        temperature=0,
        max_tokens=20,
    )
    raw = response.choices[0].message.content.strip()
    # Extract E.164-like number from response
    match = re.search(r"\+?\d[\d\s\-()]{6,}", raw)
    return _to_e164(match.group(0)) if match else raw


async def _execute_transfer(agent_ref, cid: str, reason: str, transfer_cfg: dict, db) -> str:
    """Perform the full transfer_call flow including routing, TTS, and SIP transfer."""
    session = agent_ref._session
    room = agent_ref._room

    # 1. Resolve destination
    dest_type = transfer_cfg.get("destination_type", "static")
    routing_text = transfer_cfg.get("routing_text", "")

    if dest_type == "dynamic" or (routing_text and not routing_text.strip().startswith("+")):
        # Get recent transcript for context
        transcript = ""
        if cid:
            try:
                result = db.table("transcript_entries").select("role,content") \
                    .eq("call_id", cid).order("timestamp", desc=True).limit(10).execute()
                entries = list(reversed(result.data or []))
                transcript = "\n".join(f"{e['role'].upper()}: {e['content']}" for e in entries)
            except Exception:
                pass
        destination = await _resolve_dynamic_destination(routing_text, reason, transcript)
    else:
        destination = _to_e164(routing_text) if routing_text else ""

    if not destination or len(destination) < 8:
        logger.error(f"Transfer: could not resolve destination from routing_text='{routing_text}'")
        return json.dumps({"error": "Could not determine transfer destination"})

    # 2. Talk while waiting
    talk_msg = ""
    if transfer_cfg.get("talk_while_waiting"):
        talk_msg = transfer_cfg.get("talk_message", "").strip()
    if not talk_msg:
        talk_msg = "Please hold while I transfer your call."
    if session:
        await session.say(talk_msg, add_to_chat_ctx=False)

    transfer_type = transfer_cfg.get("transfer_type", "cold")
    sip_headers = {h["key"]: h["value"] for h in transfer_cfg.get("sip_headers", []) if h.get("key")}

    if transfer_type == "cold":
        # Cold transfer: move the SIP caller directly to the destination, AI exits
        sip_identity = _find_sip_participant_identity(room) if room else None
        if sip_identity and room:
            try:
                await transfer_sip_participant(room.name, sip_identity, destination)
                logger.info(f"Cold transfer executed: {sip_identity} → {destination}")
            except Exception as e:
                logger.error(f"Cold transfer failed: {e}")
                return json.dumps({"error": f"Transfer failed: {e}"})
        else:
            logger.warning("Cold transfer: no SIP participant found in room")

    elif transfer_type in ("warm", "agentic_warm"):
        # Warm transfer: dial human agent into room first
        if room:
            try:
                await create_sip_participant_with_headers(room.name, destination, sip_headers=sip_headers)
                logger.info(f"Warm transfer: dialled {destination} into room {room.name}")
            except Exception as e:
                logger.error(f"Warm transfer dial-out failed: {e}")
                return json.dumps({"error": f"Warm transfer failed: {e}"})

            # Wait briefly for agent to answer
            wait_time = min(transfer_cfg.get("wait_time", 10), 30)
            await asyncio.sleep(wait_time)

            # Whisper debrief (spoken in room — heard by agent, caller also hears in LiveKit rooms)
            whisper_msg = transfer_cfg.get("whisper_message", "").strip()
            if whisper_msg and session:
                await session.say(whisper_msg, add_to_chat_ctx=False)

            # Three-way / public handoff message
            if transfer_cfg.get("three_way_enabled"):
                three_way_msg = transfer_cfg.get("three_way_message", "").strip()
                if three_way_msg and session:
                    await session.say(three_way_msg, add_to_chat_ctx=False)

    # Log to DB
    try:
        db.table("function_call_logs").insert({
            "call_id": cid,
            "function_name": "transfer_call",
            "arguments": {"to_number": destination, "reason": reason, "type": transfer_type},
            "result": {"transferred": True},
            "status": "completed",
        }).execute()
    except Exception:
        pass

    return json.dumps({"transferred": True, "to": destination, "type": transfer_type})


def _build_stt(agent_config: dict):
    """Build STT plugin from agent config — supports Deepgram and OpenAI Whisper."""
    language = agent_config.get("language", "en-US")
    lang_short = (language[:2] if language else "en").lower()
    ts = (agent_config.get("metadata") or {}).get("transcription_settings", {})

    provider = ts.get("stt_provider", "deepgram")

    # Languages Deepgram does not support — auto-switch to a working provider
    DEEPGRAM_UNSUPPORTED = {"ne", "bn", "ur", "si", "km", "lo", "my", "am", "sw"}

    if provider == "deepgram" and lang_short in DEEPGRAM_UNSUPPORTED:
        if lang_short == "ne":
            provider = "nepali_wav2vec2"
            logger.info("STT: Nepali detected — switching to nepali_wav2vec2")
        else:
            provider = "openai_whisper"
            logger.info(f"STT: language={lang_short} not supported by Deepgram — switching to openai_whisper")

    transcription_mode = ts.get("transcription_mode", "speed")
    denoising_mode = ts.get("denoising_mode", "no_denoising")
    vocabulary = ts.get("vocabulary", "general")
    boosted_keywords: list[str] = ts.get("boosted_keywords", [])

    logger.info(
        f"STT: provider={provider}, mode={transcription_mode}, "
        f"denoising={denoising_mode}, vocab={vocabulary}, keywords={boosted_keywords}"
    )

    # ── Deepgram ──────────────────────────────────────────────────
    if provider == "deepgram":
        # Model: nova-3-medical for healthcare, nova-3 for everything else
        model = "nova-3-medical" if vocabulary == "medical" else "nova-3"

        # Transcription mode presets
        if transcription_mode == "accuracy":
            no_delay      = False
            endpointing_ms = 300
            smart_format  = True
            punctuate     = True
            interim_results = False
        else:
            # speed (default)
            no_delay       = True
            endpointing_ms = 100
            smart_format   = False
            punctuate      = False
            interim_results = True

        # Filler-word filtering (closest Deepgram equivalent to denoising)
        # no_denoising → preserve filler words; anything else → filter them
        filler_words = (denoising_mode == "no_denoising")

        # Profanity filter for aggressive denoising mode
        profanity_filter = (denoising_mode == "remove_noise_background_speech")

        stt_kwargs: dict = dict(
            model=model,
            language=lang_short,
            api_key=settings.DEEPGRAM_API_KEY,
            no_delay=no_delay,
            endpointing_ms=endpointing_ms,
            smart_format=smart_format,
            punctuate=punctuate,
            interim_results=interim_results,
            filler_words=filler_words,
            profanity_filter=profanity_filter,
        )

        # Keyword boosting — livekit-plugins-deepgram expects list[tuple[str, float]]
        if boosted_keywords:
            stt_kwargs["keywords"] = [(kw.strip(), 1.0) for kw in boosted_keywords if kw.strip()]

        return deepgram.STT(**stt_kwargs)

    # ── OpenAI Whisper ────────────────────────────────────────────
    elif provider == "openai_whisper":
        # gpt-4o-transcribe for accuracy, whisper-1 for speed
        model = "gpt-4o-transcribe" if transcription_mode == "accuracy" else "whisper-1"
        return openai.STT(
            model=model,
            language=lang_short,
            api_key=settings.OPENAI_API_KEY,
        )

    # ── Nepali wav2vec2 ───────────────────────────────────────────
    elif provider == "nepali_wav2vec2":
        from app.voice.nepali_stt import NepaliSTT
        from livekit.agents.stt import StreamAdapter
        # NepaliSTT is non-streaming; StreamAdapter adds VAD-based buffering
        # so the AgentSession gets a proper streaming STT interface
        _vad = silero.VAD.load(
            min_speech_duration=0.05,
            min_silence_duration=0.3,
            activation_threshold=0.5,
        )
        return StreamAdapter(stt=NepaliSTT(), vad=_vad)

    # ── Fallback: Deepgram with defaults ─────────────────────────
    else:
        logger.warning(f"Unknown STT provider '{provider}', falling back to Deepgram")
        return deepgram.STT(
            model="nova-3",
            language=lang_short,
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


def _build_tts(agent_config: dict):
    """Build TTS plugin from agent config — supports Cartesia and local Nepali model."""
    language = agent_config.get("language", "en-US")
    metadata = agent_config.get("metadata") or {}

    # Use Nepali local TTS only when language is Nepali
    if language and language.lower().startswith("ne"):
        logger.info("Using local Nepali TTS (SpeechT5 fine-tuned)")
        from app.voice.nepali_tts import NepaliTTS
        return NepaliTTS()

    # Default: Cartesia TTS
    cartesia_voice = metadata.get("cartesia_voice_id")
    tts_speed = metadata.get("tts_speed", "normal")
    tts_emotion = metadata.get("tts_emotion")

    tts_kwargs: dict = {
        "model": "sonic-3",
        "language": language[:2] if language else "en",
        "api_key": settings.CARTESIA_API_KEY,
    }
    if cartesia_voice:
        tts_kwargs["voice"] = cartesia_voice
    if tts_speed and tts_speed != "normal":
        tts_kwargs["speed"] = tts_speed
    if tts_emotion and isinstance(tts_emotion, list) and tts_emotion:
        tts_kwargs["emotion"] = tts_emotion

    return cartesia.TTS(**tts_kwargs)


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


async def _create_mcp_servers(mcp_configs: list[dict]) -> list:
    """Connect to configured MCP servers. Returns a list of server objects."""
    if not mcp_configs:
        return []

    try:
        from livekit.agents.mcp import MCPServerHTTP
    except ImportError:
        logger.warning("livekit.agents.mcp not available — skipping MCP servers")
        return []

    servers = []
    for cfg in mcp_configs:
        url = cfg.get("url", "").strip()
        name = cfg.get("name", "mcp")
        if not url:
            continue

        timeout_s = cfg.get("timeout", 10000) / 1000
        headers = {h["key"]: h["value"] for h in cfg.get("headers", []) if h.get("key")}

        # Append query params to URL if present
        params = {p["key"]: p["value"] for p in cfg.get("queryParams", []) if p.get("key")}
        if params:
            from urllib.parse import urlencode
            url += ("&" if "?" in url else "?") + urlencode(params)

        try:
            server = MCPServerHTTP(
                url=url,
                client_session_timeout=timeout_s,
                **({"headers": headers} if headers else {}),
            )
            servers.append(server)
            logger.info(f"MCP server connected: {name} @ {url}")
        except Exception as e:
            logger.error(f"Failed to create MCP server '{name}': {e}")

    return servers


def _build_agent(agent_config: dict, call_id: str, mcp_servers: list | None = None) -> Agent:
    """Build a LiveKit Agent with instructions and tools from agent config."""
    system_prompt = agent_config.get("system_prompt", "You are a helpful voice AI assistant.")
    rag_context = _load_rag_context(agent_config)
    instructions = system_prompt + rag_context

    tools_enabled = agent_config.get("tools_enabled", [])
    custom_funcs = _load_custom_functions(tools_enabled)

    # Mutable state for late-bound session/room (set after session.start())
    state: dict = {"session": None, "room": None}

    transfer_cfg = (agent_config.get("metadata") or {}).get("transfer_call_config", {})

    # ── Build tool list ───────────────────────────────────────────
    tools = []

    for tool_name in tools_enabled:

        if tool_name == "end_call":
            @function_tool(name="end_call", description="End the current phone call.")
            async def _end_call(reason: str = "completed") -> str:
                result = await execute_tool(call_id, "end_call", {"reason": reason})
                return json.dumps(result)
            tools.append(_end_call)

        elif tool_name == "transfer_call":
            _tc = transfer_cfg  # bind now — avoids closure over mutable
            _desc = _tc.get("description", "Transfer the call to a human agent.")

            @function_tool(name="transfer_call", description=_desc)
            async def _transfer_call(reason: str = "user request") -> str:
                db = get_supabase()

                class _Ref:
                    _session = state["session"]
                    _room = state["room"]

                return await _execute_transfer(_Ref(), call_id, reason, _tc, db)
            tools.append(_transfer_call)

        elif tool_name == "check_availability":
            @function_tool(name="check_availability", description="Check availability for a given date and time.")
            async def _check_availability(date: str, time: str = "") -> str:
                result = await execute_tool(call_id, "check_availability", {"date": date, "time": time})
                return json.dumps(result)
            tools.append(_check_availability)

        elif tool_name == "book_appointment":
            @function_tool(name="book_appointment", description="Book an appointment for the caller.")
            async def _book_appointment(name: str, date: str, time: str, notes: str = "") -> str:
                result = await execute_tool(call_id, "book_appointment", {"name": name, "date": date, "time": time, "notes": notes})
                return json.dumps(result)
            tools.append(_book_appointment)

        elif tool_name in custom_funcs:
            # Fix closure: bind tool_name via default arg so each function captures its own value
            func_def = custom_funcs[tool_name]
            _name = tool_name
            _desc = func_def.get("description", f"Custom function: {tool_name}")

            @function_tool(name=_name, description=_desc)
            async def _custom_tool(_tn: str = _name, **kwargs) -> str:
                result = await execute_tool(call_id, _tn, kwargs)
                return json.dumps(result)
            tools.append(_custom_tool)

        else:
            logger.warning(f"Tool '{tool_name}' not found in built-in or custom functions — skipping")

    logger.info(f"Agent tools registered: {[t.name if hasattr(t, 'name') else str(t) for t in tools]}")

    # ── Build Agent ───────────────────────────────────────────────
    class VoiceAgent(Agent):
        def __init__(self):
            super().__init__(
                instructions=instructions,
                tools=tools,
                **({"mcp_servers": mcp_servers} if mcp_servers else {}),
            )
            self._state = state   # shared mutable dict — session/room set after start()
            self._call_id = call_id
            self._agent_config = agent_config

        @property
        def _session(self):
            return self._state["session"]

        @_session.setter
        def _session(self, v):
            self._state["session"] = v

        @property
        def _room(self):
            return self._state["room"]

        @_room.setter
        def _room(self, v):
            self._state["room"] = v

    return VoiceAgent()


async def _fire_webhook(agent_config: dict, event: str, payload: dict) -> None:
    """Fire a webhook event to the agent-level webhook URL with retry logic.

    - Reads webhook_settings from agent metadata
    - Only fires if the event is in the subscribed events list
    - Retries up to 3 times with exponential backoff
    - Never raises — logs errors silently so the agent is never blocked
    """
    wh = (agent_config.get("metadata") or {}).get("webhook_settings", {})
    url = (wh.get("url") or "").strip()
    if not url:
        return

    subscribed = wh.get("events", [])
    if subscribed and event not in subscribed:
        return

    timeout_s = float(wh.get("timeout_seconds", 5))
    body = {
        "event": event,
        "agent_id": agent_config.get("id"),
        "agent_name": agent_config.get("name"),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        **payload,
    }

    for attempt in range(1, 4):
        try:
            async with aiohttp.ClientSession() as http:
                async with http.post(
                    url,
                    json=body,
                    timeout=aiohttp.ClientTimeout(total=timeout_s),
                    headers={"Content-Type": "application/json", "X-Webhook-Event": event},
                ) as resp:
                    if resp.status < 500:
                        logger.info(f"Webhook [{event}] → {url} — {resp.status}")
                        return
                    logger.warning(f"Webhook [{event}] attempt {attempt} — server error {resp.status}")
        except Exception as e:
            logger.warning(f"Webhook [{event}] attempt {attempt} failed: {e}")

        if attempt < 3:
            await asyncio.sleep(2 ** attempt)  # 2s, 4s backoff

    logger.error(f"Webhook [{event}] failed after 3 attempts — {url}")


async def _run_post_call_extraction(call_id: str, agent_config: dict, db) -> None:
    """Extract structured data from call transcript using LLM and save to call metadata."""
    extraction_cfg = (agent_config.get("metadata") or {}).get("post_call_extraction", {})
    if not extraction_cfg.get("enabled"):
        return

    fields = extraction_cfg.get("fields", [])
    if not fields:
        return

    # Load transcript
    try:
        transcript_result = db.table("transcript_entries") \
            .select("role,content") \
            .eq("call_id", call_id) \
            .order("timestamp") \
            .execute()
        entries = transcript_result.data or []
    except Exception as e:
        logger.error(f"Post-call extraction: failed to load transcript for {call_id}: {e}")
        return

    if not entries:
        logger.info(f"Post-call extraction: no transcript for call {call_id}, skipping")
        return

    # Build transcript text
    transcript_text = "\n".join(
        f"{e['role'].upper()}: {e['content']}" for e in entries
    )

    # Build field schema description
    fields_desc = "\n".join(
        f"- {f['name']} ({f.get('type', 'string')}): {f.get('description', '')}"
        for f in fields
    )

    prompt = (
        f"You are a data extraction assistant. Given the following call transcript, "
        f"extract the requested fields and return ONLY a valid JSON object with those fields.\n\n"
        f"Fields to extract:\n{fields_desc}\n\n"
        f"If a field cannot be determined from the transcript, use null.\n\n"
        f"Transcript:\n{transcript_text}\n\n"
        f"Return only the JSON object, no explanation."
    )

    try:
        import openai as openai_sdk
        client = openai_sdk.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
        response = await client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0,
            response_format={"type": "json_object"},
        )
        extracted = json.loads(response.choices[0].message.content)
        logger.info(f"Post-call extraction for {call_id}: {extracted}")
    except Exception as e:
        logger.error(f"Post-call extraction: LLM call failed for {call_id}: {e}")
        return

    # Save extracted data to call metadata
    try:
        call_result = db.table("calls").select("metadata").eq("id", call_id).execute()
        existing_meta = (call_result.data[0].get("metadata") or {}) if call_result.data else {}
        existing_meta["extracted_data"] = extracted
        db.table("calls").update({"metadata": existing_meta}).eq("id", call_id).execute()
    except Exception as e:
        logger.error(f"Post-call extraction: failed to save results for {call_id}: {e}")
        return

    # POST to extraction-specific webhook if configured
    webhook_url = extraction_cfg.get("webhook_url", "").strip()
    if webhook_url:
        try:
            payload = {"call_id": call_id, "extracted_data": extracted}
            async with aiohttp.ClientSession() as http:
                await http.post(webhook_url, json=payload, timeout=aiohttp.ClientTimeout(total=10))
            logger.info(f"Post-call extraction webhook sent for {call_id}")
        except Exception as e:
            logger.error(f"Post-call extraction: webhook failed for {call_id}: {e}")

    # Fire agent-level extraction_completed webhook event
    await _fire_webhook(agent_config, "extraction_completed", {
        "call_id": call_id,
        "extracted_data": extracted,
    })


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

    # Update call status and record consent entry
    if call_id:
        db.table("calls").update({"status": "in-progress"}).eq("id", call_id).execute()

        # Record implicit consent for call recording
        try:
            call_data = db.table("calls").select("caller_number").eq("id", call_id).execute()
            caller_number = call_data.data[0].get("caller_number", "") if call_data.data else ""
            db.table("consent_records").insert({
                "call_id": call_id,
                "caller_number": caller_number,
                "consent_type": "call_recording",
                "consent_given": True,
                "consent_method": "implicit_continued_participation",
            }).execute()
        except Exception as e:
            logger.error(f"Failed to record consent: {e}")

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

    # Agent metadata — read once and reuse throughout
    agent_metadata = agent_config.get("metadata") or {}

    # Connect to MCP servers configured on the agent
    mcp_configs = agent_metadata.get("mcp_servers", [])
    mcp_servers = await _create_mcp_servers(mcp_configs)

    # Build agent with tools and MCP servers
    agent = _build_agent(agent_config, call_id, mcp_servers=mcp_servers)

    # Speech session settings from agent metadata
    allow_interruptions = agent_metadata.get("allow_interruptions", True)
    min_endpointing_delay = float(agent_metadata.get("min_endpointing_delay", 0.3))
    max_endpointing_delay = float(agent_metadata.get("max_endpointing_delay", 1.5))

    # Create and start the session with low-latency settings
    session = AgentSession(
        stt=stt,
        llm=llm,
        tts=tts,
        vad=vad,
        min_endpointing_delay=min_endpointing_delay,
        max_endpointing_delay=max_endpointing_delay,
        preemptive_generation=True,
        allow_interruptions=allow_interruptions,
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
    try:
        await session.start(
            room=ctx.room,
            agent=agent,
        )
    except Exception as e:
        logger.error(f"Session start failed: {e}")
        await _fire_webhook(agent_config, "call_failed", {
            "call_id": call_id,
            "error": str(e),
            "stage": "session_start",
        })
        if call_id:
            try:
                db.table("calls").update({"status": "failed"}).eq("id", call_id).execute()
            except Exception:
                pass
        raise

    # Wire session and room onto agent so transfer_call tool can access them
    agent._session = session
    agent._room = ctx.room

    # Fire call_started webhook
    asyncio.create_task(_fire_webhook(agent_config, "call_started", {"call_id": call_id}))

    # Send welcome message so the agent speaks first (reduces perceived latency)
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
        duration = int(time.time() - started_at)
        if call_id:
            try:
                db.table("calls").update({
                    "status": "completed",
                    "duration_seconds": duration,
                    "ended_at": datetime.now(timezone.utc).isoformat(),
                    "end_reason": "participant_left",
                }).eq("id", call_id).execute()
            except Exception as e:
                logger.error(f"Failed to update call record: {e}")

        logger.info(f"Session ended: call={call_id}, duration={duration}s")

        # Fire call_ended webhook
        await _fire_webhook(agent_config, "call_ended", {
            "call_id": call_id,
            "duration_seconds": duration,
            "end_reason": "participant_left",
        })

        # Fire transcript_ready webhook — batch full transcript
        if call_id:
            try:
                transcript_result = db.table("transcript_entries") \
                    .select("role,content,timestamp") \
                    .eq("call_id", call_id) \
                    .order("timestamp") \
                    .execute()
                transcript = transcript_result.data or []
                if transcript:
                    await _fire_webhook(agent_config, "transcript_ready", {
                        "call_id": call_id,
                        "transcript": transcript,
                        "turn_count": len(transcript),
                    })
            except Exception as e:
                logger.error(f"Failed to fetch transcript for webhook: {e}")

        # Run post-call data extraction if configured
        await _run_post_call_extraction(call_id, agent_config, db)

    # Run disconnect monitor in background
    asyncio.create_task(_monitor_disconnect())


if __name__ == "__main__":
    agents.cli.run_app(agents.WorkerOptions(entrypoint_fnc=entrypoint))
