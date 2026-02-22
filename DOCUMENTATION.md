# Voice AI Platform — Complete Documentation

> A full-stack Retell AI clone with Python (FastAPI) backend, Next.js frontend, Supabase database, multi-provider LLM, Deepgram STT, ElevenLabs TTS, and Twilio telephony.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Project Structure](#project-structure)
3. [Setup & Installation](#setup--installation)
4. [Environment Variables](#environment-variables)
5. [Database Setup (Supabase)](#database-setup-supabase)
6. [Running the Project](#running-the-project)
7. [API Endpoints Reference](#api-endpoints-reference)
8. [WebSocket Endpoints](#websocket-endpoints)
9. [Important Files Guide](#important-files-guide)
10. [Voice Pipeline Architecture](#voice-pipeline-architecture)
11. [LLM Provider Configuration](#llm-provider-configuration)
12. [Twilio Integration](#twilio-integration)
13. [Frontend Pages & Components](#frontend-pages--components)
14. [Monitoring & Debugging](#monitoring--debugging)
15. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Next.js 14)                     │
│  localhost:3000                                                   │
│  ┌──────────┬──────────┬──────────┬───────────┬───────────────┐  │
│  │Dashboard │ Agents   │ Calls    │ Sys Prompts│ Custom Funcs  │  │
│  └──────────┴──────────┴──────────┴───────────┴───────────────┘  │
│       │ REST API (fetch)                │ WebSocket (PCM16)       │
└───────┼─────────────────────────────────┼────────────────────────┘
        │                                 │
        ▼                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                     BACKEND (FastAPI/Python)                      │
│  localhost:8000                                                   │
│                                                                   │
│  REST API                          WebSocket Endpoints            │
│  ┌─────────────────┐              ┌─────────────────────┐        │
│  │ /api/agents      │              │ /ws/voice-browser    │        │
│  │ /api/calls       │              │ /ws/voice-twilio     │        │
│  │ /api/system-     │              └──────────┬──────────┘        │
│  │   prompts        │                         │                   │
│  │ /api/custom-     │              Voice Pipeline                 │
│  │   functions      │              ┌──────────┴──────────┐        │
│  │ /api/twilio/*    │              │ Deepgram STT (WS)    │        │
│  └────────┬────────┘              │ LLM (multi-provider) │        │
│           │                        │ ElevenLabs TTS (REST)│        │
│           ▼                        └─────────────────────┘        │
│  ┌─────────────────┐                                              │
│  │   Supabase DB    │◄───────────────────────────────────────────│
│  │   (PostgreSQL)   │                                              │
│  └─────────────────┘                                              │
└─────────────────────────────────────────────────────────────────┘
        ▲
        │ Twilio Media Streams (mulaw 8kHz)
        │
┌───────┴──────┐
│   Twilio     │  Phone calls (inbound/outbound)
│   PSTN       │
└──────────────┘
```

---

## Project Structure

```
trainedlogicaivoice/
├── DOCUMENTATION.md              ← This file
│
├── backend/                       ← Python FastAPI backend
│   ├── .env.example               ← Environment variable template
│   ├── requirements.txt           ← Python dependencies
│   ├── config.py                  ← Pydantic Settings (all env vars)
│   ├── database.py                ← Supabase client + SQL migration
│   ├── main.py                    ← FastAPI app entry point
│   │
│   ├── routers/                   ← REST API route handlers
│   │   ├── agents.py              ← CRUD /api/agents
│   │   ├── calls.py               ← CRUD /api/calls + outbound
│   │   ├── system_prompts.py      ← CRUD /api/system-prompts
│   │   ├── custom_functions.py    ← CRUD /api/custom-functions
│   │   └── twilio_webhooks.py     ← POST /api/twilio/* (TwiML)
│   │
│   ├── services/                  ← External service integrations
│   │   ├── llm.py                 ← Multi-provider LLM streaming
│   │   ├── deepgram_stt.py        ← Deepgram WebSocket STT client
│   │   ├── elevenlabs_tts.py      ← ElevenLabs REST TTS streaming
│   │   └── twilio_service.py      ← Twilio outbound call helper
│   │
│   ├── voice/                     ← Voice call pipeline
│   │   ├── session.py             ← Base VoiceSession (STT→LLM→TTS)
│   │   ├── session_browser.py     ← Browser WebSocket adapter (PCM16)
│   │   ├── session_twilio.py      ← Twilio WebSocket adapter (mulaw)
│   │   ├── audio_codec.py         ← mulaw ↔ PCM16 conversion
│   │   ├── tools.py               ← Built-in tool definitions
│   │   └── functions.py           ← Tool execution + webhook calls
│   │
│   └── ws/                        ← WebSocket endpoint definitions
│       ├── browser.py             ← /ws/voice-browser endpoint
│       └── twilio.py              ← /ws/voice-twilio endpoint
│
└── frontend/                      ← Next.js 14 frontend
    ├── .env.local                 ← Frontend env vars
    ├── package.json               ← Node.js dependencies
    ├── next.config.mjs            ← Next.js configuration
    ├── tailwind.config.ts         ← Tailwind CSS config
    ├── tsconfig.json              ← TypeScript config
    │
    ├── app/                       ← Next.js App Router pages
    │   ├── layout.tsx             ← Root layout (sidebar + dark theme)
    │   ├── page.tsx               ← Redirects to /dashboard
    │   ├── globals.css            ← Global styles + Tailwind
    │   ├── dashboard/page.tsx     ← Dashboard with stats
    │   ├── agents/page.tsx        ← Agent CRUD + test call
    │   ├── calls/page.tsx         ← Call history + outbound
    │   ├── system-prompts/page.tsx← System prompt CRUD
    │   └── custom-functions/page.tsx ← Custom function CRUD
    │
    ├── components/                ← Reusable React components
    │   ├── Sidebar.tsx            ← Navigation sidebar
    │   ├── VoiceCallButton.tsx    ← Start/end browser call
    │   └── TestCallSection.tsx    ← Test call wrapper
    │
    ├── lib/                       ← Utilities & hooks
    │   ├── api.ts                 ← REST API client (fetch wrapper)
    │   └── useVoiceSession.ts     ← WebSocket voice call hook
    │
    └── types/
        └── index.ts               ← TypeScript interfaces
```

---

## Setup & Installation

### Prerequisites

- **Python 3.11+** (for backend)
- **Node.js 18+** and **npm** (for frontend)
- **Supabase account** (free tier works) — [supabase.com](https://supabase.com)
- API keys for at least one LLM provider (OpenAI recommended to start)
- Optional: Deepgram, ElevenLabs, Twilio accounts for voice features

### Step 1: Clone and Install Backend

```bash
cd trainedlogicaivoice/backend

# Create virtual environment (recommended)
python3 -m venv venv
source venv/bin/activate   # macOS/Linux
# venv\Scripts\activate    # Windows

# Install dependencies
pip install -r requirements.txt

# Create .env from template
cp .env.example .env
# Edit .env and fill in your API keys (see Environment Variables section)
```

### Step 2: Install Frontend

```bash
cd trainedlogicaivoice/frontend

npm install
```

### Step 3: Set Up Supabase Database

See [Database Setup](#database-setup-supabase) section below.

### Step 4: Configure Environment Variables

See [Environment Variables](#environment-variables) section below.

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SUPABASE_URL` | **Yes** | — | Your Supabase project URL (e.g., `https://abc123.supabase.co`) |
| `SUPABASE_KEY` | **Yes** | — | Supabase service role key (from Project Settings → API) |
| `OPENAI_API_KEY` | **Yes*** | — | OpenAI API key (required if using GPT models) |
| `OPENAI_MODEL` | No | `gpt-4` | Default LLM model |
| `DEEPGRAM_API_KEY` | For voice | — | Deepgram API key (required for speech-to-text) |
| `ELEVENLABS_API_KEY` | For voice | — | ElevenLabs API key (required for text-to-speech) |
| `ELEVENLABS_VOICE_ID` | No | `21m00Tcm4TlvDq8ikWAM` | Default ElevenLabs voice (Rachel) |
| `ANTHROPIC_API_KEY` | No | — | For Claude models |
| `DEEPSEEK_API_KEY` | No | — | For DeepSeek models |
| `GOOGLE_API_KEY` | No | — | For Gemini models |
| `GROQ_API_KEY` | No | — | For Llama/Mixtral via Groq |
| `TWILIO_ACCOUNT_SID` | For phone | — | Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | For phone | — | Twilio Auth Token |
| `TWILIO_PHONE_NUMBER` | For phone | — | Your Twilio phone number (e.g., `+15551234567`) |
| `APP_URL` | No | `http://localhost:8000` | Backend public URL (for Twilio webhooks) |

*At least one LLM provider key is required.

### Frontend (`frontend/.env.local`)

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Backend REST API URL |
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:8000` | Backend WebSocket URL |

---

## Database Setup (Supabase)

### 1. Create a Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note your **Project URL** and **Service Role Key** (from Settings → API)
3. Add these to `backend/.env` as `SUPABASE_URL` and `SUPABASE_KEY`

### 2. Run the Migration SQL

Go to **Supabase Dashboard → SQL Editor** and run the following SQL:

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Agents table
CREATE TABLE IF NOT EXISTS agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    system_prompt TEXT DEFAULT 'You are a helpful voice AI assistant.',
    voice_id TEXT DEFAULT '21m00Tcm4TlvDq8ikWAM',
    language TEXT DEFAULT 'en-US',
    llm_model TEXT DEFAULT 'gpt-4',
    tools_enabled JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT true,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Calls table
CREATE TABLE IF NOT EXISTS calls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    direction TEXT DEFAULT 'inbound',
    caller_number TEXT,
    twilio_call_sid TEXT UNIQUE,
    status TEXT DEFAULT 'queued',
    end_reason TEXT,
    duration_seconds INT,
    summary TEXT,
    started_at TIMESTAMPTZ DEFAULT now(),
    ended_at TIMESTAMPTZ,
    metadata JSONB
);

-- Transcript entries
CREATE TABLE IF NOT EXISTS transcript_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    call_id UUID REFERENCES calls(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT now()
);

-- Function call logs
CREATE TABLE IF NOT EXISTS function_call_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    call_id UUID REFERENCES calls(id) ON DELETE CASCADE,
    function_name TEXT NOT NULL,
    arguments JSONB,
    result JSONB,
    status TEXT DEFAULT 'pending',
    error_message TEXT,
    executed_at TIMESTAMPTZ DEFAULT now()
);

-- System prompts
CREATE TABLE IF NOT EXISTS system_prompts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    content TEXT NOT NULL,
    variables JSONB,
    category TEXT,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Custom functions
CREATE TABLE IF NOT EXISTS custom_functions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    parameters JSONB DEFAULT '{}'::jsonb,
    webhook_url TEXT,
    method TEXT DEFAULT 'POST',
    headers JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_calls_agent_id ON calls(agent_id);
CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status);
CREATE INDEX IF NOT EXISTS idx_transcript_entries_call_id ON transcript_entries(call_id);
CREATE INDEX IF NOT EXISTS idx_function_call_logs_call_id ON function_call_logs(call_id);
```

### 3. Database Schema Summary

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `agents` | Voice agent configs | name, system_prompt, voice_id, llm_model, tools_enabled |
| `calls` | Call records | agent_id, direction, status, duration_seconds, twilio_call_sid |
| `transcript_entries` | Conversation logs | call_id, role (user/assistant), content |
| `function_call_logs` | Tool execution audit | call_id, function_name, arguments, result, status |
| `system_prompts` | Reusable prompts | name, content, category, is_default |
| `custom_functions` | Webhook-backed tools | name, webhook_url, method, parameters |

### Table Relationships

```
agents ──(1:many)──> calls
calls  ──(1:many)──> transcript_entries
calls  ──(1:many)──> function_call_logs
```

---

## Running the Project

### Start Backend

```bash
cd backend
source venv/bin/activate    # if using virtualenv
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

- API available at: `http://localhost:8000`
- Swagger docs at: `http://localhost:8000/docs`
- ReDoc at: `http://localhost:8000/redoc`

### Start Frontend

```bash
cd frontend
npm run dev
```

- UI available at: `http://localhost:3000`
- Redirects to `/dashboard` automatically

### Verify Everything Works

1. Open `http://localhost:8000/docs` — you should see the Swagger UI with all endpoints
2. Open `http://localhost:8000/health` — should return `{"status": "healthy"}`
3. Open `http://localhost:3000` — should show the dashboard
4. Try creating an agent via the Agents page

---

## API Endpoints Reference

Base URL: `http://localhost:8000`

### Health & Root

| Method | Path | Description | Response |
|--------|------|-------------|----------|
| `GET` | `/` | Service info | `{"status": "ok", "service": "Voice AI Platform"}` |
| `GET` | `/health` | Health check | `{"status": "healthy"}` |

---

### Agents — `/api/agents`

| Method | Path | Description | Request Body | Response |
|--------|------|-------------|-------------|----------|
| `GET` | `/api/agents` | List all agents | — | `Agent[]` |
| `GET` | `/api/agents/{id}` | Get single agent | — | `Agent` |
| `POST` | `/api/agents` | Create agent | `AgentCreate` | `Agent` |
| `PUT` | `/api/agents/{id}` | Update agent | `AgentUpdate` | `Agent` |
| `DELETE` | `/api/agents/{id}` | Delete agent | — | `{"deleted": true}` |

**AgentCreate body:**
```json
{
  "name": "My Agent",                              // required
  "description": "A helpful assistant",             // optional
  "system_prompt": "You are a helpful assistant.",   // default provided
  "voice_id": "21m00Tcm4TlvDq8ikWAM",              // ElevenLabs voice ID
  "language": "en-US",
  "llm_model": "gpt-4",                             // see LLM providers
  "tools_enabled": ["end_call", "book_appointment"], // array of tool names
  "is_active": true,
  "metadata": {}                                     // any JSON
}
```

**AgentUpdate body:** Same fields as create, all optional. Only provided fields are updated.

**Agent response:**
```json
{
  "id": "uuid",
  "name": "My Agent",
  "description": "...",
  "system_prompt": "...",
  "voice_id": "21m00Tcm4TlvDq8ikWAM",
  "language": "en-US",
  "llm_model": "gpt-4",
  "tools_enabled": ["end_call"],
  "is_active": true,
  "metadata": null,
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z"
}
```

**cURL examples:**
```bash
# List all agents
curl http://localhost:8000/api/agents

# Create an agent
curl -X POST http://localhost:8000/api/agents \
  -H "Content-Type: application/json" \
  -d '{"name": "Sales Agent", "system_prompt": "You are a sales assistant.", "llm_model": "gpt-4"}'

# Update an agent
curl -X PUT http://localhost:8000/api/agents/{id} \
  -H "Content-Type: application/json" \
  -d '{"name": "Updated Agent Name"}'

# Delete an agent
curl -X DELETE http://localhost:8000/api/agents/{id}
```

---

### Calls — `/api/calls`

| Method | Path | Description | Request Body | Response |
|--------|------|-------------|-------------|----------|
| `GET` | `/api/calls` | List calls (last 100) | — | `Call[]` (with agent name) |
| `GET` | `/api/calls/{id}` | Get single call | — | `Call` (with agent name) |
| `GET` | `/api/calls/{id}/transcript` | Get call transcript | — | `TranscriptEntry[]` |
| `POST` | `/api/calls/outbound` | Make outbound call | `OutboundCallRequest` | `OutboundCallResult` |
| `DELETE` | `/api/calls/{id}` | Delete call record | — | `{"deleted": true}` |

**OutboundCallRequest:**
```json
{
  "agent_id": "uuid-of-agent",
  "to_number": "+15551234567"
}
```

**Call response:**
```json
{
  "id": "uuid",
  "agent_id": "uuid",
  "direction": "inbound",        // "inbound", "outbound", "browser"
  "caller_number": "+15551234567",
  "twilio_call_sid": "CA...",
  "status": "completed",         // "queued", "ringing", "in-progress", "completed", "failed"
  "end_reason": "completed",
  "duration_seconds": 45,
  "summary": null,
  "started_at": "2024-01-01T00:00:00Z",
  "ended_at": "2024-01-01T00:00:45Z",
  "metadata": null,
  "agents": { "name": "My Agent" }  // joined from agents table
}
```

**TranscriptEntry response:**
```json
[
  {
    "id": "uuid",
    "call_id": "uuid",
    "role": "user",
    "content": "Hello, I'd like to book an appointment.",
    "timestamp": "2024-01-01T00:00:05Z"
  },
  {
    "id": "uuid",
    "call_id": "uuid",
    "role": "assistant",
    "content": "Of course! What date works for you?",
    "timestamp": "2024-01-01T00:00:08Z"
  }
]
```

**cURL examples:**
```bash
# List all calls
curl http://localhost:8000/api/calls

# Get transcript for a call
curl http://localhost:8000/api/calls/{call_id}/transcript

# Make outbound call (requires Twilio)
curl -X POST http://localhost:8000/api/calls/outbound \
  -H "Content-Type: application/json" \
  -d '{"agent_id": "uuid", "to_number": "+15551234567"}'
```

---

### System Prompts — `/api/system-prompts`

| Method | Path | Description | Request Body | Response |
|--------|------|-------------|-------------|----------|
| `GET` | `/api/system-prompts` | List all prompts | — | `SystemPrompt[]` |
| `GET` | `/api/system-prompts/{id}` | Get single prompt | — | `SystemPrompt` |
| `POST` | `/api/system-prompts` | Create prompt | `SystemPromptCreate` | `SystemPrompt` |
| `PUT` | `/api/system-prompts/{id}` | Update prompt | `SystemPromptUpdate` | `SystemPrompt` |
| `DELETE` | `/api/system-prompts/{id}` | Delete prompt | — | `{"deleted": true}` |

**SystemPromptCreate body:**
```json
{
  "name": "Customer Service",         // required
  "content": "You are a helpful...",   // required
  "description": "For support calls",  // optional
  "category": "support",              // optional
  "variables": {"company": "Acme"},   // optional (template vars)
  "is_default": false                  // optional
}
```

**cURL examples:**
```bash
# List all system prompts
curl http://localhost:8000/api/system-prompts

# Create a system prompt
curl -X POST http://localhost:8000/api/system-prompts \
  -H "Content-Type: application/json" \
  -d '{"name": "Sales Bot", "content": "You are a sales agent for Acme Corp."}'
```

---

### Custom Functions — `/api/custom-functions`

| Method | Path | Description | Request Body | Response |
|--------|------|-------------|-------------|----------|
| `GET` | `/api/custom-functions` | List all functions | — | `CustomFunction[]` |
| `GET` | `/api/custom-functions/{id}` | Get single function | — | `CustomFunction` |
| `POST` | `/api/custom-functions` | Create function | `FunctionCreate` | `CustomFunction` |
| `PUT` | `/api/custom-functions/{id}` | Update function | `FunctionUpdate` | `CustomFunction` |
| `DELETE` | `/api/custom-functions/{id}` | Delete function | — | `{"deleted": true}` |

**FunctionCreate body:**
```json
{
  "name": "get_weather",                     // required, must be unique
  "description": "Get current weather",       // optional
  "parameters": {                             // JSON Schema for LLM
    "type": "object",
    "properties": {
      "city": { "type": "string", "description": "City name" }
    },
    "required": ["city"]
  },
  "webhook_url": "https://api.example.com/weather",  // called when tool is invoked
  "method": "POST",                           // HTTP method (GET, POST, PUT, PATCH)
  "headers": { "Authorization": "Bearer ..." }, // optional custom headers
  "is_active": true
}
```

**cURL examples:**
```bash
# List all custom functions
curl http://localhost:8000/api/custom-functions

# Create a custom function
curl -X POST http://localhost:8000/api/custom-functions \
  -H "Content-Type: application/json" \
  -d '{
    "name": "lookup_order",
    "description": "Look up an order by ID",
    "parameters": {"type": "object", "properties": {"order_id": {"type": "string"}}, "required": ["order_id"]},
    "webhook_url": "https://api.myapp.com/orders/lookup",
    "method": "POST"
  }'
```

---

### Twilio Webhooks — `/api/twilio`

These are called by Twilio, not by the frontend.

| Method | Path | Description | Called By |
|--------|------|-------------|-----------|
| `POST` | `/api/twilio/incoming` | Handle inbound call | Twilio (Voice URL webhook) |
| `POST` | `/api/twilio/outbound-connect` | Handle outbound call connection | Twilio (after outbound call answers) |
| `POST` | `/api/twilio/status` | Handle call status updates | Twilio (Status Callback URL) |

**`/api/twilio/incoming`** — Returns TwiML that connects the call to `/ws/voice-twilio` media stream. Creates a call record in the database. Assigns the first active agent.

**`/api/twilio/outbound-connect`** — Same as incoming but for outbound calls initiated via `/api/calls/outbound`.

**`/api/twilio/status`** — Updates call status in the database when Twilio reports status changes (ringing, answered, completed, failed, etc.). Also records duration.

---

## WebSocket Endpoints

### Browser Voice — `/ws/voice-browser`

**URL:** `ws://localhost:8000/ws/voice-browser?agent_id={uuid}`

**Purpose:** Real-time browser voice calls with PCM16 audio.

**Protocol:**

| Direction | Format | Description |
|-----------|--------|-------------|
| Client → Server | Binary (PCM16 bytes) | Raw microphone audio at 16kHz mono |
| Client → Server | JSON `{"type": "audio", "data": "base64..."}` | Alternative base64 audio format |
| Client → Server | JSON `{"type": "end"}` | End the call |
| Server → Client | Binary (PCM16 bytes) | TTS audio response at 16kHz mono |
| Server → Client | JSON (see below) | Session events & transcripts |

**Server JSON messages:**
```json
// Session started
{"type": "session_started", "agent": "Agent Name"}

// User transcript (interim)
{"type": "transcript", "role": "user", "content": "Hello", "is_final": false}

// User transcript (final)
{"type": "transcript", "role": "user", "content": "Hello there", "is_final": true}

// Assistant transcript
{"type": "transcript", "role": "assistant", "content": "Hi! How can I help?", "is_final": true}

// Tool call executed
{"type": "tool_call", "name": "book_appointment", "arguments": {...}, "result": {...}}

// Session ended
{"type": "session_ended", "reason": "browser_disconnect", "duration": 45}
```

### Twilio Voice — `/ws/voice-twilio`

**URL:** `ws://localhost:8000/ws/voice-twilio`

**Purpose:** Twilio media stream for phone calls. Twilio connects here automatically via TwiML `<Stream>`.

**Protocol:** Twilio's standard media stream protocol:
- Receives: `{"event": "start"}`, `{"event": "media", "media": {"payload": "base64_mulaw"}}`, `{"event": "stop"}`
- Sends: `{"event": "media", "streamSid": "...", "media": {"payload": "base64_mulaw"}}`
- Audio format: mulaw 8kHz (converted internally to PCM16 16kHz)

---

## Important Files Guide

### Backend Core Files

#### `backend/config.py` — Configuration
- Loads all environment variables using Pydantic Settings
- Reads from `.env` file automatically
- All settings have defaults (empty strings) so the app starts even without full config
- **When to edit:** Adding new environment variables or changing defaults

#### `backend/database.py` — Database Client
- Creates a singleton Supabase client
- Contains the full SQL migration in `MIGRATION_SQL` constant
- **When to edit:** Changing database schema, adding new tables

#### `backend/main.py` — Application Entry Point
- Creates the FastAPI app instance
- Configures CORS (currently allows all origins — restrict in production!)
- Mounts all REST routers with their URL prefixes
- Mounts WebSocket routers
- **When to edit:** Adding new routers, changing CORS settings, adding middleware

### Backend Services

#### `backend/services/llm.py` — LLM Service (CRITICAL)
- Routes to the correct LLM provider based on model name
- Streams responses with text deltas and tool calls
- Supports: OpenAI, Anthropic, DeepSeek (via OpenAI-compatible), Groq (via OpenAI-compatible), Google Gemini
- **When to edit:** Adding new LLM providers, changing streaming behavior

#### `backend/services/deepgram_stt.py` — Speech-to-Text
- WebSocket client that connects to Deepgram's `nova-2` model
- Streams audio and receives transcripts (interim + final)
- Configured for 16kHz PCM16 mono input
- **When to edit:** Changing STT model, language, or audio format

#### `backend/services/elevenlabs_tts.py` — Text-to-Speech
- HTTP streaming client for ElevenLabs API
- Uses `eleven_turbo_v2` model for low latency
- Outputs PCM16 at 16kHz
- **When to edit:** Changing voice settings, TTS model, or output format

#### `backend/services/twilio_service.py` — Twilio Calls
- Creates outbound calls via Twilio REST API
- Sets up webhook URLs for call connection and status updates
- **When to edit:** Changing call routing, adding call recording

### Backend Voice Pipeline

#### `backend/voice/session.py` — Voice Session (CRITICAL)
- The core pipeline: audio → STT → LLM → TTS → audio
- Manages conversation history (messages array)
- Handles user interruption (barge-in)
- Saves transcripts to database
- Executes tool calls from LLM
- **When to edit:** Changing conversation flow, adding features like call recording, changing interrupt behavior

#### `backend/voice/audio_codec.py` — Audio Conversion
- Pure Python mulaw ↔ PCM16 conversion (no external dependencies)
- Includes linear interpolation resampling (8kHz ↔ 16kHz)
- **When to edit:** Only if changing audio formats or sample rates

#### `backend/voice/tools.py` — Built-in Tools
- Defines 4 built-in tools: `end_call`, `transfer_call`, `check_availability`, `book_appointment`
- Each tool has a JSON Schema for LLM function calling
- **When to edit:** Adding/removing built-in tools

#### `backend/voice/functions.py` — Tool Execution
- Executes built-in tools and custom webhook functions
- Logs all tool calls to `function_call_logs` table
- Built-in tools return mock data (customize for production)
- Custom functions call the configured webhook URL
- **When to edit:** Implementing real tool logic (e.g., actual booking system integration)

### Frontend Core Files

#### `frontend/lib/api.ts` — API Client
- Centralized fetch wrapper for all backend API calls
- Handles JSON serialization and error responses
- **When to edit:** Adding new API methods, changing error handling

#### `frontend/lib/useVoiceSession.ts` — Voice Hook (CRITICAL)
- React hook for browser WebSocket voice calls
- Manages microphone access, audio streaming, and playback
- Converts browser audio (Float32) to PCM16 for backend
- Converts received PCM16 to playable audio
- **When to edit:** Changing audio quality, adding audio processing, improving playback buffering

#### `frontend/components/Sidebar.tsx` — Navigation
- Fixed sidebar with navigation links
- Active route highlighting
- **When to edit:** Adding/removing navigation items

#### `frontend/types/index.ts` — TypeScript Types
- Shared interfaces matching the database schema
- **When to edit:** When database schema changes

---

## Voice Pipeline Architecture

### Call Flow (Browser)

```
Browser Microphone
       │
       ▼ (Float32 → PCM16 conversion in JS)
   WebSocket /ws/voice-browser
       │
       ▼ (raw PCM16 bytes)
   BrowserVoiceSession
       │
       ▼
   VoiceSession.handle_audio()
       │
       ▼ (PCM16 16kHz mono)
   DeepgramSTT.send_audio()  ──────► Deepgram WebSocket API
       │                                     │
       │                          transcript (text)
       │                                     │
       ▼                              ◄──────┘
   VoiceSession._on_transcript()
       │ (when is_final=true)
       ▼
   VoiceSession._process_user_message()
       │
       ├──► Save transcript to DB
       │
       ▼
   stream_llm_response()  ──────► OpenAI/Anthropic/etc.
       │                                │
       │                    text_delta / tool_call
       │                                │
       ▼                         ◄──────┘
   (if tool_call) → execute_tool() → webhook/built-in
       │
       ▼ (full text response)
   synthesize_speech()  ──────► ElevenLabs API
       │                              │
       │                    PCM16 audio chunks
       │                              │
       ▼                       ◄──────┘
   VoiceSession._speak()
       │
       ▼ (PCM16 bytes)
   BrowserVoiceSession._send_audio()
       │
       ▼ (WebSocket binary frame)
   Browser AudioContext ──► Speaker
```

### Call Flow (Twilio Phone)

```
Phone (PSTN)  ──► Twilio ──► POST /api/twilio/incoming
                                     │
                              TwiML <Stream> response
                                     │
                              Twilio Media Stream
                                     │
                                     ▼
                          WebSocket /ws/voice-twilio
                                     │
                          ┌──────────┴──────────┐
                          │ mulaw 8kHz base64    │
                          │          │           │
                          │    mulaw_to_pcm16()  │
                          │    resample 8k→16k   │
                          │          │           │
                          │    PCM16 16kHz       │
                          │          │           │
                          │   VoiceSession       │
                          │   (same as browser)  │
                          │          │           │
                          │    PCM16 16kHz       │
                          │          │           │
                          │   resample 16k→8k    │
                          │   pcm16_to_mulaw()   │
                          │          │           │
                          │   mulaw 8kHz base64  │
                          └──────────┬──────────┘
                                     │
                          Twilio Media Stream
                                     │
                              Twilio ──► Phone (PSTN)
```

---

## LLM Provider Configuration

The LLM provider is auto-detected from the model name. Set the model on each agent's `llm_model` field.

| Model Name Pattern | Provider | Required Env Var | Examples |
|-------------------|----------|-----------------|----------|
| `gpt-*` | OpenAI | `OPENAI_API_KEY` | `gpt-4`, `gpt-4-turbo`, `gpt-3.5-turbo` |
| `claude-*` | Anthropic | `ANTHROPIC_API_KEY` | `claude-3-opus-20240229`, `claude-3-sonnet-20240229` |
| `deepseek-*` | DeepSeek | `DEEPSEEK_API_KEY` | `deepseek-chat` |
| `gemini-*` | Google | `GOOGLE_API_KEY` | `gemini-pro` |
| `llama-*`, `mixtral-*` | Groq | `GROQ_API_KEY` | `llama-3.1-70b-versatile`, `mixtral-8x7b-32768` |

All providers support streaming. OpenAI, Anthropic, and Groq support tool calling. Google Gemini currently does not support tool calling in this implementation.

---

## Twilio Integration

### Setup

1. Create a Twilio account at [twilio.com](https://www.twilio.com)
2. Buy a phone number with Voice capability
3. Add credentials to `backend/.env`:
   ```
   TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   TWILIO_AUTH_TOKEN=your_auth_token
   TWILIO_PHONE_NUMBER=+15551234567
   ```

### Inbound Calls

1. In Twilio Console → Phone Numbers → your number → Voice Configuration:
   - **When a call comes in:** Webhook
   - **URL:** `https://your-domain.com/api/twilio/incoming` (must be publicly accessible)
   - **HTTP Method:** POST
2. For local development, use [ngrok](https://ngrok.com):
   ```bash
   ngrok http 8000
   # Use the ngrok URL in Twilio and set APP_URL in .env
   ```

### Outbound Calls

Make outbound calls from the Calls page in the UI, or via API:
```bash
curl -X POST http://localhost:8000/api/calls/outbound \
  -H "Content-Type: application/json" \
  -d '{"agent_id": "your-agent-uuid", "to_number": "+15559876543"}'
```

---

## Frontend Pages & Components

### Dashboard (`/dashboard`)
- Shows 4 stat cards: Agents, Total Calls, System Prompts, Functions
- Shows recent calls list (last 5)
- All data fetched from backend API on page load

### Agents (`/agents`)
- Grid of agent cards showing name, model, status, tools
- **Create Agent** button opens modal with all configuration fields
- **Test Call** button on each card opens a browser voice call
- **Edit/Delete** actions on each card

### Calls (`/calls`)
- Table view of all calls with direction icons, status badges, duration
- **Outbound Call** button to initiate phone calls
- **View Transcript** button opens chat-style transcript modal
- **Delete** to remove call records

### System Prompts (`/system-prompts`)
- Grid of prompt cards with content preview
- Create/edit modal with name, description, content, category
- Star icon for default prompts

### Custom Functions (`/custom-functions`)
- Grid of function cards showing name, method, webhook status
- Create/edit modal with JSON Schema editor for parameters
- Active/inactive toggle

---

## Monitoring & Debugging

### Backend Swagger Docs

Access `http://localhost:8000/docs` for interactive API documentation. You can test all endpoints directly from the browser.

### Key Endpoints to Monitor

```bash
# Health check
curl http://localhost:8000/health

# Count agents
curl http://localhost:8000/api/agents | python3 -c "import sys,json; print(len(json.load(sys.stdin)))"

# List recent calls with status
curl http://localhost:8000/api/calls | python3 -c "
import sys,json
for c in json.load(sys.stdin)[:10]:
    print(f\"{c['id'][:8]}  {c['direction']:8}  {c['status']:12}  {c.get('duration_seconds','—')}s\")
"

# Check function call logs for a specific call
curl http://localhost:8000/api/calls/{call_id}/transcript
```

### Supabase Dashboard Monitoring

- **Table Editor:** View and edit all records directly
- **SQL Editor:** Run custom queries:
  ```sql
  -- Active calls
  SELECT * FROM calls WHERE status = 'in-progress';

  -- Failed function calls
  SELECT * FROM function_call_logs WHERE status = 'failed' ORDER BY executed_at DESC;

  -- Call volume by day
  SELECT DATE(started_at) as day, COUNT(*) FROM calls GROUP BY day ORDER BY day DESC;

  -- Average call duration
  SELECT AVG(duration_seconds) FROM calls WHERE status = 'completed';
  ```

### Backend Logging

The backend uses Python's `logging` module. Logs are printed to stdout by uvicorn. Key log messages:

```
INFO:  Deepgram STT connected
INFO:  Voice session started: call=uuid, agent=uuid
INFO:  Voice session ended: call=uuid, reason=completed, duration=45s
ERROR: Deepgram send error: ...
ERROR: ElevenLabs TTS error 401: ...
ERROR: Tool execution error: get_weather: ...
```

To increase log verbosity:
```bash
uvicorn main:app --reload --log-level debug
```

---

## Troubleshooting

### "Cannot create agent" / API errors
- Verify Supabase is configured: check `SUPABASE_URL` and `SUPABASE_KEY` in `.env`
- Verify tables exist: run the migration SQL in Supabase SQL Editor
- Check backend logs for specific error messages

### WebSocket voice call doesn't work
- Ensure `DEEPGRAM_API_KEY` is set (required for STT)
- Ensure `ELEVENLABS_API_KEY` is set (required for TTS)
- Ensure at least one LLM provider key is set
- Check browser console for WebSocket errors
- Ensure microphone permissions are granted

### Twilio calls fail
- Ensure `APP_URL` is publicly accessible (use ngrok for local dev)
- Verify Twilio webhook URL points to `/api/twilio/incoming`
- Check Twilio Console → Monitor → Logs for error details
- Ensure the phone number has Voice capability enabled

### LLM returns empty response
- Verify the API key for the selected model's provider is set
- Check backend logs for authentication errors
- Try a different model/provider

### Frontend shows "Loading..." forever
- Verify the backend is running on port 8000
- Check browser Network tab for failed API requests
- Verify `NEXT_PUBLIC_API_URL` in `frontend/.env.local` matches the backend URL

### CORS errors
- The backend allows all origins by default (`allow_origins=["*"]`)
- If you've restricted CORS, ensure your frontend URL is included

---

## Production Deployment Notes

Before deploying to production:

1. **CORS:** Restrict `allow_origins` in `main.py` to your frontend domain
2. **Supabase Key:** Use a service role key with appropriate RLS policies
3. **APP_URL:** Set to your public backend URL for Twilio webhooks
4. **HTTPS:** Use HTTPS for both frontend and backend (required for browser microphone access)
5. **WebSocket URL:** Update `NEXT_PUBLIC_WS_URL` to `wss://` for production
6. **Rate Limiting:** Add rate limiting middleware to FastAPI
7. **Authentication:** Add user authentication (not included in this version)
