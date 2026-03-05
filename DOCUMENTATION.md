# Voice AI Platform — Complete Documentation

> A full-stack voice AI platform with LiveKit real-time voice calls (Deepgram STT → Multi-LLM → Cartesia TTS), streaming AI chat, custom webhook functions, integration templates, and RAG-powered knowledge bases.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Project Structure](#project-structure)
3. [Voice Pipeline Architecture](#voice-pipeline-architecture)
4. [AI Chat Architecture](#ai-chat-architecture)
5. [Agent Configuration](#agent-configuration)
6. [Custom Functions & Integrations](#custom-functions--integrations)
7. [Knowledge Base (RAG)](#knowledge-base-rag)
8. [LLM Provider Configuration](#llm-provider-configuration)
9. [API Endpoints Reference](#api-endpoints-reference)
10. [Frontend Pages & Components](#frontend-pages--components)
11. [Important Files Guide](#important-files-guide)
12. [Monitoring & Debugging](#monitoring--debugging)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js 14)                         │
│  localhost:3000                                                   │
│  ┌──────────┬──────────┬──────────┬───────────┬───────────────┐  │
│  │Dashboard │ Agents   │ Calls    │ Sys Prompts│ Custom Funcs  │  │
│  │          │ Detail   │          │           │ Knowledge Base │  │
│  └──────────┴──────────┴──────────┴───────────┴───────────────┘  │
│       │ REST API                │ LiveKit       │ SSE Stream     │
│       │ (fetch)                 │ (WebRTC)      │ (/api/chat)    │
└───────┼─────────────────────────┼───────────────┼────────────────┘
        │                         │               │
        ▼                         ▼               ▼
┌───────────────────┐   ┌─────────────────┐   ┌──────────────────┐
│  FastAPI Backend   │   │  LiveKit Server  │   │  LLM Providers   │
│  localhost:8000    │   │  :7880 (WS/RTC)  │   │  (OpenAI, etc.)  │
│                    │   │                  │   └──────────────────┘
│  REST API          │   │                  │
│  Token generation  │   │                  │
│  CRUD operations   │   └────────┬─────────┘
│                    │            │
└────────┬───────────┘            ▼
         │              ┌─────────────────────┐
         │              │  LiveKit Agent Worker │
         │              │  (livekit_agent.py)   │
         │              │                       │
         │              │  Deepgram STT (nova-3)│
         │              │  LLM (multi-provider) │
         │              │  Cartesia TTS (sonic-3)│
         │              │  Silero VAD            │
         │              │  Tool Execution        │
         │              └───────────┬───────────┘
         │                          │
         ▼                          ▼
┌─────────────────────────────────────────┐
│            Supabase (PostgreSQL)         │
│  agents, calls, transcript_entries,      │
│  custom_functions, system_prompts,       │
│  knowledge_bases, phone_numbers          │
└─────────────────────────────────────────┘
```

---

## Project Structure

```
trainedlogicaivoice/
├── README.md
├── SETUP.md
├── DOCUMENTATION.md                  ← This file
├── FIXES_AND_TROUBLESHOOTING.md
│
├── backend/
│   ├── .env.example                  # Environment variable template
│   ├── requirements.txt              # Python dependencies
│   ├── livekit_agent.py              # LiveKit agent worker (STT→LLM→TTS)
│   └── app/
│       ├── main.py                   # FastAPI app entry point + CORS
│       ├── config.py                 # Pydantic Settings (all env vars)
│       ├── database.py               # Supabase client + migration SQL
│       ├── routers/
│       │   ├── agents.py             # CRUD /api/agents
│       │   ├── calls.py              # CRUD /api/calls + outbound
│       │   ├── system_prompts.py     # CRUD /api/system-prompts
│       │   ├── custom_functions.py   # CRUD /api/custom-functions + test
│       │   ├── knowledge_bases.py    # CRUD /api/knowledge-bases + file upload
│       │   ├── phone_numbers.py      # Phone number management
│       │   └── livekit.py            # LiveKit token + room management
│       ├── services/
│       │   ├── livekit_service.py    # Room creation, token gen, SIP
│       │   ├── vector_db.py          # Pinecone vector DB provider
│       │   └── document_processor.py # Parse, chunk, embed documents
│       └── voice/
│           ├── tools.py              # Built-in tool definitions
│           └── functions.py          # Tool execution (webhooks + retry)
│
└── frontend/
    ├── package.json
    ├── next.config.js
    ├── tailwind.config.ts
    ├── tsconfig.json
    ├── app/
    │   ├── layout.tsx                # Root layout (sidebar + dark theme)
    │   ├── page.tsx                  # Landing/redirect page
    │   ├── globals.css               # Global styles + Tailwind
    │   ├── dashboard/page.tsx        # Dashboard with stats
    │   ├── agents/page.tsx           # Agent list (grid view)
    │   ├── agents/[id]/page.tsx      # Agent detail (config + test + chat)
    │   ├── calls/page.tsx            # Call history + transcripts
    │   ├── system-prompts/page.tsx   # System prompt CRUD
    │   ├── custom-functions/page.tsx # Custom function CRUD
    │   ├── knowledge-base/page.tsx   # Knowledge base + file upload
    │   ├── phone-numbers/page.tsx    # Phone number management
    │   ├── settings/page.tsx         # Platform settings
    │   └── api/chat/route.ts         # Streaming chat API (SSE + tool calling)
    ├── components/
    │   ├── Sidebar.tsx               # Navigation sidebar
    │   ├── TestCallSection.tsx       # Voice call testing wrapper
    │   └── VoiceCallButton.tsx       # Start/end voice call + transcript
    ├── lib/
    │   ├── api.ts                    # Backend REST API client
    │   └── useVoiceSession.ts        # LiveKit voice session React hook
    └── types/
        └── index.ts                  # TypeScript interfaces
```

---

## Voice Pipeline Architecture

### LiveKit Agent Worker (`backend/livekit_agent.py`)

The voice pipeline runs as a standalone LiveKit agent worker process. When a browser user starts a call:

1. Frontend requests a LiveKit token from `POST /api/livekit/token`
2. Backend creates a call record in Supabase, creates a LiveKit room with `agent_id` + `call_id` metadata
3. Frontend connects to the LiveKit room via WebRTC
4. LiveKit dispatches the agent worker to join the room
5. Agent worker loads the agent config from Supabase and builds the pipeline

### Pipeline Components

```
User Audio (WebRTC)
       │
       ▼
Silero VAD (Voice Activity Detection)
  min_silence_duration=0.15s
  activation_threshold=0.4
       │
       ▼
Deepgram STT (nova-3)
  no_delay=True
  endpointing_ms=100
  interim_results=True
       │
       ▼ (transcribed text)
LLM (multi-provider)
  temperature=0.7
  streaming=True
  tools=enabled
       │
       ├──► Tool calls → execute_tool() → webhook/built-in
       │        │
       │        ▼ (tool results fed back to LLM)
       │
       ▼ (response text, streamed)
Cartesia TTS (sonic-3)
  voice=metadata.cartesia_voice_id
       │
       ▼ (audio)
User Speaker (WebRTC)
```

### Low-Latency Settings

| Setting | Value | Effect |
|---------|-------|--------|
| `min_endpointing_delay` | 0.3s | Start LLM after 300ms of silence |
| `max_endpointing_delay` | 1.5s | Cap wait time at 1.5s |
| `preemptive_generation` | True | Start generating before user fully finishes |
| `allow_interruptions` | True | User can interrupt agent mid-speech |
| `endpointing_ms` (Deepgram) | 100 | Detect end-of-speech in 100ms |
| `no_delay` (Deepgram) | True | Disable internal buffering |

### Welcome Message

On session start, the agent speaks a welcome message:
- Reads `metadata.welcome_message` from agent config
- Reads `metadata.ai_speaks_first` (default: true)
- Uses `session.say(welcome_msg)` for immediate TTS without LLM round-trip

### Tool Execution in Voice Calls

Built-in tools (`end_call`, `transfer_call`, `check_availability`, `book_appointment`) are registered as LiveKit `function_tool` decorators. Custom functions are batch-loaded from Supabase in a single query and registered dynamically.

When the LLM calls a tool:
1. Tool execution runs via `execute_tool()` in `backend/app/voice/functions.py`
2. Built-in tools return mock data (customize for production)
3. Custom functions call the configured webhook URL with retry support
4. Results are fed back to the LLM for the final response

---

## AI Chat Architecture

### Streaming Chat API (`frontend/app/api/chat/route.ts`)

The chat feature runs entirely in the Next.js frontend API route (no backend involvement):

```
Browser (React UI)
       │
       ▼ POST /api/chat (with messages, systemPrompt, model, tools)
Next.js API Route
       │
       ├── getClient(model) → routes to correct LLM provider
       │     ├── OpenAI (default)
       │     ├── Anthropic (claude-*)
       │     ├── DeepSeek (deepseek-*)
       │     ├── Google (gemini-*)
       │     └── Groq (llama-*, mixtral-*)
       │
       ▼ streaming response (SSE)
       │
       ├── data: {"content": "Hello..."} (text chunks)
       ├── data: {"tool_call": {...}}     (tool invocation)
       ├── data: {"tool_result": {...}}   (webhook response)
       └── data: [DONE]
```

### Tool Calling in Chat

1. Frontend sends the agent's connected custom functions as `tools` in the request
2. API route converts them to OpenAI function-calling format (with schema sanitization)
3. When LLM returns `tool_calls`, the API route executes each webhook
4. Results are sent back to the LLM for a natural language response
5. Loop continues up to 5 rounds of tool calls

### Provider Routing

The `getClient(model)` function routes based on model name:

| Pattern | Base URL |
|---------|----------|
| `deepseek` | `https://api.deepseek.com` |
| `claude` / `anthropic` | `https://api.anthropic.com/v1/` |
| `gemini` | `https://generativelanguage.googleapis.com/v1beta/openai/` |
| `llama` / `mixtral` / `groq` | `https://api.groq.com/openai/v1` |
| Default | `https://api.openai.com/v1` |

---

## Agent Configuration

### Agent Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Agent display name |
| `description` | string | Brief description |
| `system_prompt` | string | Instructions for the LLM |
| `voice_id` | string | ElevenLabs voice ID (legacy, optional) |
| `language` | string | Language code (e.g. `en-US`) |
| `llm_model` | string | LLM model name (e.g. `gpt-4`, `claude-3-opus-20240229`) |
| `tools_enabled` | string[] | Array of tool names to enable |
| `is_active` | boolean | Whether the agent is active |
| `knowledge_base_id` | string | Connected knowledge base UUID |
| `metadata` | object | Additional configuration (see below) |

### Agent Metadata

| Key | Type | Description |
|-----|------|-------------|
| `welcome_message` | string | Message spoken when call starts |
| `ai_speaks_first` | boolean | Whether agent speaks first (default: true) |
| `pause_before_speaking` | number | Seconds to wait before speaking |
| `dynamic_message` | boolean | Whether to use dynamic welcome messages |
| `cartesia_voice_id` | string | Cartesia voice UUID for TTS in voice calls |
| `folder` | string | Organization folder |
| `agent_type` | string | "Single Prompt" or "Multi Prompt" |

### Voice ID Configuration

The platform uses **two separate TTS providers**:

| Provider | Used By | Voice ID Field |
|----------|---------|---------------|
| **Cartesia** | LiveKit voice calls | `metadata.cartesia_voice_id` |
| **ElevenLabs** | Legacy/alternative | `voice_id` (top-level field) |

To set a consistent voice for calls, set the Cartesia voice ID in the agent's metadata. Browse voices at [play.cartesia.ai](https://play.cartesia.ai).

---

## Custom Functions & Integrations

### Custom Function Fields

| Field | Type | Description |
|-------|------|-------------|
| `name` | string | Unique function name (used as tool name in LLM) |
| `description` | string | What the function does (sent to LLM) |
| `parameters` | JSON Schema | Schema for function arguments |
| `webhook_url` | string | URL called when function is invoked |
| `method` | string | HTTP method (GET/POST/PUT/PATCH) |
| `headers` | object | Custom HTTP headers (key-value) |
| `query_params` | object | Query parameters appended to URL |
| `timeout_seconds` | number | Request timeout (default: 30) |
| `retry_count` | number | Retries on failure (default: 0) |
| `payload_mode` | string | `args_only` (default) or `full_context` |
| `response_mapping` | object | Extract fields using dot-notation (e.g. `$.data.status`) |
| `store_variables` | object | Store response fields for later use |
| `speak_during_execution` | string | Filler text spoken while webhook runs |
| `speak_on_failure` | string | Text spoken if webhook fails |

### Integration Templates

The agent detail page provides quick-create templates for popular platforms:

| Template | URL Pattern | Description |
|----------|-------------|-------------|
| **n8n** | `https://your-n8n.com/webhook/...` | n8n workflow webhook |
| **Zapier** | `https://hooks.zapier.com/hooks/catch/...` | Zapier catch hook |
| **Make** | `https://hook.us1.make.com/...` | Make (Integromat) webhook |
| **Custom** | Any URL | Generic webhook |

Templates pre-fill the function name, description, placeholder URL, and method. After creating, the function is automatically enabled on the agent.

### Platform Detection

Connected functions display a platform badge based on URL pattern matching:
- URL contains `n8n` → n8n badge
- URL contains `hooks.zapier.com` → Zapier badge
- URL contains `make.com` or `integromat` → Make badge
- Otherwise → Custom badge

### Response Mapping

Extract specific fields from webhook responses using JSON dot-notation paths:

```json
{
  "status": "$.data.status",
  "message": "$.result.message",
  "price": "$.items.0.price"
}
```

### Built-in Tools

| Tool | Description | Parameters |
|------|-------------|------------|
| `end_call` | End the current call | `reason` (string) |
| `transfer_call` | Transfer to another number | `to_number`, `department` |
| `check_availability` | Check appointment slots | `date` (required), `time` |
| `book_appointment` | Book an appointment | `name`, `date`, `time` (required), `notes` |

---

## Knowledge Base (RAG)

### Pipeline

Upload → Parse (PDF/TXT/DOCX/CSV) → Chunk (500 tokens, 50 overlap) → Embed (OpenAI `text-embedding-3-small`) → Upsert (Pinecone)

### How RAG Works in Voice Calls

1. Agent loads knowledge base info on session start
2. User speaks → STT transcribes
3. (RAG context is made available to the LLM)
4. LLM responds with knowledge-base-informed answer
5. Response is spoken via TTS

### Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `PINECONE_API_KEY` | — | Pinecone API key |
| `EMBEDDING_MODEL` | `text-embedding-3-small` | OpenAI embedding model |
| `CHUNK_SIZE` | 500 | Tokens per chunk |
| `CHUNK_OVERLAP` | 50 | Overlap between chunks |
| `RAG_TOP_K` | 5 | Number of chunks retrieved |

---

## LLM Provider Configuration

### Voice Calls (LiveKit Agent)

| Model prefix | Provider | Plugin |
|-------------|----------|--------|
| `gpt-*` | OpenAI | `livekit.plugins.openai` |
| `claude-*` | Anthropic | `livekit.plugins.anthropic` |
| `deepseek-*` | DeepSeek | `livekit.plugins.openai` (custom base URL) |
| `llama-*`, `mixtral-*` | Groq | `livekit.plugins.openai` (custom base URL) |

### Chat (Next.js API)

| Model prefix | Provider | Base URL |
|-------------|----------|----------|
| `gpt-*` | OpenAI | Default |
| `claude-*` / `anthropic` | Anthropic | `https://api.anthropic.com/v1/` |
| `deepseek-*` | DeepSeek | `https://api.deepseek.com` |
| `gemini-*` | Google | `https://generativelanguage.googleapis.com/v1beta/openai/` |
| `llama-*` / `mixtral-*` / `groq` | Groq | `https://api.groq.com/openai/v1` |

---

## API Endpoints Reference

Base URL: `http://localhost:8000`

### Core

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Service status |
| GET | `/health` | Health check |
| GET | `/api/diagnostics` | Check all integration statuses |
| POST | `/api/migrate` | Get database migration SQL |

### LiveKit

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/livekit/token` | Generate token for browser voice call |
| GET | `/api/livekit/rooms` | List active LiveKit rooms |

**Token request:**
```json
{ "agent_id": "uuid", "participant_name": "user" }
```

**Token response:**
```json
{ "token": "jwt...", "room_name": "agent-uuid-hex", "livekit_url": "ws://...", "call_id": "uuid" }
```

### Agents

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/agents` | List all agents |
| POST | `/api/agents` | Create agent |
| GET | `/api/agents/:id` | Get agent |
| PUT | `/api/agents/:id` | Update agent |
| DELETE | `/api/agents/:id` | Delete agent |

### Calls

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/calls` | List calls |
| GET | `/api/calls/:id` | Get call details |
| GET | `/api/calls/:id/transcript` | Get call transcript |
| POST | `/api/calls/outbound` | Make outbound call (SIP) |
| DELETE | `/api/calls/:id` | Delete call |

### System Prompts

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/system-prompts` | List prompts |
| POST | `/api/system-prompts` | Create prompt |
| PUT | `/api/system-prompts/:id` | Update prompt |
| DELETE | `/api/system-prompts/:id` | Delete prompt |

### Custom Functions

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/custom-functions` | List functions |
| POST | `/api/custom-functions` | Create function |
| GET | `/api/custom-functions/:id` | Get function |
| PUT | `/api/custom-functions/:id` | Update function |
| DELETE | `/api/custom-functions/:id` | Delete function |
| POST | `/api/custom-functions/:id/test` | Test webhook |

### Knowledge Bases

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/knowledge-bases` | List knowledge bases |
| POST | `/api/knowledge-bases` | Create knowledge base |
| GET | `/api/knowledge-bases/:id` | Get knowledge base |
| PUT | `/api/knowledge-bases/:id` | Update knowledge base |
| DELETE | `/api/knowledge-bases/:id` | Delete knowledge base |
| GET | `/api/knowledge-bases/:id/files` | List files |
| POST | `/api/knowledge-bases/:id/files` | Upload file (multipart) |
| DELETE | `/api/knowledge-bases/:id/files/:file_id` | Delete file |

### Phone Numbers

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/phone-numbers` | List phone numbers |
| POST | `/api/phone-numbers/sync` | Sync from Twilio |
| PUT | `/api/phone-numbers/:id` | Update phone number |
| POST | `/api/phone-numbers/:id/configure` | Configure for voice |

### Frontend Chat API

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/chat` (Next.js) | Streaming chat with tool calling (SSE) |

**Chat request:**
```json
{
  "messages": [{"role": "user", "content": "Hello"}],
  "systemPrompt": "You are a helpful assistant.",
  "model": "gpt-4",
  "tools": [{ "id": "...", "name": "...", "description": "...", "parameters": {...}, "webhook_url": "...", "method": "POST", "headers": {...}, "timeout_seconds": 30, "payload_mode": "args_only" }]
}
```

**SSE response events:**
```
data: {"content": "Hello! "}
data: {"content": "How can "}
data: {"tool_call": {"name": "check_weather", "arguments": {"city": "NYC"}}}
data: {"tool_result": {"name": "check_weather", "result": "{\"temp\": 72}"}}
data: {"content": "The weather in NYC is 72°F."}
data: [DONE]
```

---

## Frontend Pages & Components

### Agent Detail Page (`/agents/[id]`)

The main configuration page with collapsible sections:

1. **Model & Voice** — LLM model, language, Cartesia voice ID, ElevenLabs voice ID
2. **Prompt** — System prompt, welcome message, AI speaks first toggle, pause slider
3. **Functions** — Built-in tools, integration templates, connected functions (with Test/Edit/Remove), available functions
4. **Knowledge Base** — Select connected knowledge base
5. **Advanced** — Agent type, folder, active toggle

Right panel has two tabs:
- **Audio** — Test voice call with VoiceCallButton + call history
- **Chat** — Streaming AI chat with tool calling display

### Dashboard (`/dashboard`)
Stats cards (agents, calls, prompts, functions) + recent calls list.

### Agents List (`/agents`)
Grid of agent cards. Edit button navigates to `/agents/[id]` detail page.

### Calls (`/calls`)
Table view with direction, status, duration, agent name. Transcript viewer.

### Custom Functions (`/custom-functions`)
Grid view with create/edit modal, JSON Schema editor, webhook test button.

---

## Important Files Guide

### `backend/livekit_agent.py` — Voice Agent (Critical)

The LiveKit agent worker. Key functions:
- `_build_stt()` — Deepgram STT with low-latency settings
- `_build_llm()` — Multi-provider LLM with temperature config
- `_build_tts()` — Cartesia TTS with voice from agent metadata
- `_load_custom_functions()` — Batch-loads custom function defs in single DB query
- `_build_agent()` — Creates Agent class with registered tools
- `entrypoint()` — Main session lifecycle: connect → build pipeline → start session → welcome message → monitor disconnect

### `frontend/app/api/chat/route.ts` — Chat API (Critical)

Streaming chat with multi-provider routing and tool calling:
- `getClient(model)` — Routes to correct LLM provider
- `executeWebhook(tool, args)` — Calls webhook URLs for tool execution
- `POST handler` — SSE streaming with up to 5 rounds of tool calls

### `frontend/app/agents/[id]/page.tsx` — Agent Detail Page

The largest frontend file. Contains:
- All agent form state and save logic
- Integration templates (INTEGRATION_TEMPLATES constant)
- QuickCreateModal for inline function creation/editing
- KeyValueEditor for headers/params
- Chat UI with streaming and tool call display
- Voice call section with LiveKit integration
- Connected functions management (test/edit/remove)

### `frontend/lib/useVoiceSession.ts` — LiveKit Voice Hook

React hook for browser voice calls via LiveKit:
- Connects to LiveKit room with token
- Manages microphone and audio playback
- Handles transcript data channel messages

### `backend/app/voice/functions.py` — Webhook Executor

Executes tool calls with full webhook support:
- HTTP requests with custom headers, query params, timeout
- Retry logic with exponential backoff
- Response mapping and variable storage
- Payload modes (args_only, full_context)

---

## Monitoring & Debugging

### Key Health Checks

```bash
# Backend health
curl http://localhost:8000/health

# Integration status
curl http://localhost:8000/api/diagnostics

# Active LiveKit rooms
curl http://localhost:8000/api/livekit/rooms
```

### Backend Logs

The backend logs to stdout. Key messages:
```
INFO:  Starting voice session: agent=AgentName, call=uuid
INFO:  Session ended: call=uuid, duration=45s
ERROR: Failed to load RAG context: ...
ERROR: Tool execution error: function_name: ...
```

### Supabase Monitoring

```sql
-- Active calls
SELECT * FROM calls WHERE status = 'in-progress';

-- Failed function calls
SELECT * FROM function_call_logs WHERE status = 'failed' ORDER BY executed_at DESC;

-- Call volume by day
SELECT DATE(started_at) as day, COUNT(*) FROM calls GROUP BY day ORDER BY day DESC;

-- Recent transcripts
SELECT t.role, t.content, t.timestamp
FROM transcript_entries t
JOIN calls c ON t.call_id = c.id
WHERE c.status = 'completed'
ORDER BY t.timestamp DESC
LIMIT 20;
```

### Debug Agent Worker

```bash
# Run with verbose logging
LOGLEVEL=DEBUG python livekit_agent.py dev
```

### Debug Chat API

Check browser DevTools → Network tab → filter by `/api/chat` → look at the EventStream response for errors.

Chat API logs to the Next.js server console:
```
[chat] model: gpt-4
[chat] tools received: 3
  -> check_weather | params type: object | url: https://...
[chat] round done — content: 42 chars, tool_calls: 1
  -> tool_call: check_weather({"city":"NYC"})
```
