# Voice AI Platform - Setup & Run Guide

## Architecture Overview

The platform runs as **4 processes**:

| Process | Role | Default URL |
|---------|------|-------------|
| **LiveKit Server** | Media routing, WebRTC, SIP bridging | `ws://localhost:7880` |
| **FastAPI Backend** | REST APIs, token generation, CRUD | `http://localhost:8000` |
| **LiveKit Agent Worker** | Voice pipeline (STT → LLM → TTS), tool execution | Connects to LiveKit |
| **Next.js Frontend** | Web UI for managing agents, calls, test calls, chat | `http://localhost:3000` |

**Voice call flow:** Browser → LiveKit (WebRTC) → Agent Worker (Deepgram STT → LLM → Cartesia TTS) → LiveKit → Browser

**Chat flow:** Browser → Next.js `/api/chat` (SSE) → LLM Provider (OpenAI/Anthropic/etc.) → Browser (streaming)

---

## Prerequisites

- **Python 3.11+**
- **Node.js 18+** and npm
- **Docker** (for LiveKit server) or LiveKit Cloud account
- **Supabase** project (for database)
- API keys for: Deepgram, Cartesia, and at least one LLM provider (OpenAI, Anthropic, DeepSeek, Groq)

---

## 1. Clone & Project Structure

```
trainedlogicaivoice/
├── backend/
│   ├── app/
│   │   ├── config.py          # Environment config (reads .env)
│   │   ├── database.py        # Supabase client + migration SQL
│   │   ├── main.py            # FastAPI app
│   │   ├── routers/           # API routes (agents, calls, livekit, etc.)
│   │   ├── services/          # LiveKit service, document processor, vector DB
│   │   └── voice/             # Tool definitions & function execution
│   ├── livekit_agent.py       # LiveKit agent worker (standalone process)
│   ├── requirements.txt
│   └── .env                   # Environment variables (create this)
├── frontend/
│   ├── app/                   # Next.js pages + API routes
│   │   └── api/chat/route.ts  # Streaming chat API (SSE)
│   ├── components/            # UI components
│   ├── lib/                   # API client, LiveKit voice hook
│   └── package.json
├── README.md
├── SETUP.md                   # This file
├── DOCUMENTATION.md           # Full technical documentation
└── FIXES_AND_TROUBLESHOOTING.md
```

---

## 2. Database Setup (Supabase)

1. Create a project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run the migration SQL:
   - Start the backend (step 4 below), then visit `http://localhost:8000/api/migrate`
   - Copy the returned SQL and run it in the Supabase SQL Editor
   - Or alternatively, find the SQL in `backend/app/database.py` (the `MIGRATION_SQL` variable)

This creates the tables: `agents`, `calls`, `transcript_entries`, `function_call_logs`, `system_prompts`, `custom_functions`, `knowledge_bases`, `knowledge_base_files`, `phone_numbers`

---

## 3. Environment Variables

### Backend (`backend/.env`)

Create `backend/.env` from the example:

```bash
cp backend/.env.example backend/.env
```

```env
# === Required ===

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-supabase-service-role-key

# LiveKit
LIVEKIT_URL=ws://localhost:7880          # or wss://your-app.livekit.cloud
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=devsecret

# Speech-to-Text (Deepgram)
DEEPGRAM_API_KEY=your-deepgram-api-key

# Text-to-Speech (Cartesia - used for voice calls)
CARTESIA_API_KEY=your-cartesia-api-key

# At least one LLM provider:
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-4

# === Optional LLM Providers ===

ANTHROPIC_API_KEY=          # For claude-* models
DEEPSEEK_API_KEY=           # For deepseek-* models
GROQ_API_KEY=               # For llama-*/mixtral-* models
GOOGLE_API_KEY=             # For gemini-* models

# === Optional ===

# ElevenLabs (alternative TTS, not used by LiveKit agent)
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM

# Twilio (for phone number management, not needed for browser calls)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# LiveKit SIP (for phone dial-out)
LIVEKIT_TRUNK_ID=

# Knowledge Base / RAG
PINECONE_API_KEY=
EMBEDDING_MODEL=text-embedding-3-small
CHUNK_SIZE=500
CHUNK_OVERLAP=50
RAG_TOP_K=5

APP_URL=http://localhost:8000
```

### Frontend (`frontend/.env.local`)

```env
# Backend API URL
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000

# LiveKit URL (for browser WebRTC client)
NEXT_PUBLIC_LIVEKIT_URL=ws://localhost:7880

# LLM keys for the /api/chat streaming endpoint
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4
ANTHROPIC_API_KEY=sk-ant-...
DEEPSEEK_API_KEY=sk-...
GOOGLE_API_KEY=...
GROQ_API_KEY=gsk_...
```

These default to `http://127.0.0.1:8000` and `ws://localhost:7880` if not set.

---

## 4. Install Dependencies

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Frontend

```bash
cd frontend
npm install
```

---

## 5. Start All Services

You need **4 terminal windows**. Start them in this order:

### Terminal 1: LiveKit Server (Docker)

```bash
docker run --rm \
  -p 7880:7880 \
  -p 7881:7881 \
  -p 7882:7882/udp \
  -e LIVEKIT_KEYS="devkey: devsecret" \
  livekit/livekit-server
```

Wait until you see `starting in development mode` in the logs.

**Alternative:** Use [LiveKit Cloud](https://livekit.io/cloud) — set `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` to your cloud values.

### Terminal 2: FastAPI Backend

```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --port 8000 --reload
```

Wait until you see `Application startup complete`.

### Terminal 3: LiveKit Agent Worker

```bash
cd backend
source venv/bin/activate
python livekit_agent.py dev
```

Wait until you see `registered worker`. The `dev` flag enables hot-reload on file changes.

### Terminal 4: Frontend

```bash
cd frontend
npm run dev
```

Wait until you see `Ready in Xms`.

---

## 6. Verify Everything Works

### Check backend health

```bash
curl http://localhost:8000/health
# {"status":"healthy"}
```

### Check all integrations

```bash
curl http://localhost:8000/api/diagnostics
```

You should see `true` for `supabase`, `deepgram`, `livekit`, and at least one LLM provider.

### Check agent worker is connected

In the agent worker terminal, you should see:
```
registered worker  {"agent_name": "", "id": "AW_xxxxx", "url": "ws://localhost:7880", ...}
```

---

## 7. Using the Platform

Open **http://localhost:3000** in your browser.

### Create an Agent

1. Go to **Agents** page (`/agents`)
2. Click **Create Agent**
3. Fill in name, system prompt, LLM model, etc.
4. Click **Create Agent**
5. Click the agent card to open the detail page

### Configure Voice (Cartesia)

1. Open agent detail page (`/agents/[id]`)
2. In **Model & Voice** section, paste a Cartesia voice ID
3. Browse voices at [play.cartesia.ai](https://play.cartesia.ai)
4. If left blank, Cartesia uses a stable default voice

### Make a Test Voice Call

1. On the agent detail page, select the **Audio** tab on the right
2. Click **Start Call**
3. Allow microphone access when prompted
4. The agent will greet you with the welcome message
5. Speak to the agent — you should hear a response
6. Click **End Call** when done

### Use AI Chat

1. On the agent detail page, select the **Chat** tab on the right
2. Type a message and press Enter
3. The agent responds using the same system prompt and tools
4. Tool calls are shown inline with results

### Add Webhook Integrations

1. In the **Functions** section of the agent detail page
2. Click an integration template (n8n, Zapier, Make, or Custom)
3. Fill in webhook URL, function name, parameters
4. Click **Save & Connect**

### View Call History

Go to **Calls** page (`/calls`) to see all past calls, including transcripts.

---

## 8. LLM Provider Mapping

The agent worker and chat API automatically route to the correct provider based on model name:

| Model prefix | Provider | Required env var |
|-------------|----------|-----------------|
| `gpt-*` | OpenAI | `OPENAI_API_KEY` |
| `claude-*` | Anthropic | `ANTHROPIC_API_KEY` |
| `deepseek-*` | DeepSeek | `DEEPSEEK_API_KEY` |
| `gemini-*` | Google | `GOOGLE_API_KEY` |
| `llama-*`, `mixtral-*` | Groq | `GROQ_API_KEY` |

---

## 9. Voice Pipeline Configuration

The LiveKit agent (`backend/livekit_agent.py`) uses these components:

| Component | Provider | Model | Key Settings |
|-----------|----------|-------|-------------|
| STT | Deepgram | nova-3 | `no_delay=True`, `endpointing_ms=100`, `interim_results=True` |
| LLM | Multi-provider | Per agent config | `temperature=0.7`, streaming enabled |
| TTS | Cartesia | sonic-3 | Voice from `metadata.cartesia_voice_id` |
| VAD | Silero | — | `min_silence_duration=0.15`, `activation_threshold=0.4` |

**Session settings:** `min_endpointing_delay=0.3s`, `max_endpointing_delay=1.5s`, `preemptive_generation=True`, `allow_interruptions=True`

**Welcome message:** Reads `metadata.welcome_message` and `metadata.ai_speaks_first` from agent config. If `ai_speaks_first` is true (default), the agent speaks the welcome message immediately on connect.

---

## Troubleshooting

See [FIXES_AND_TROUBLESHOOTING.md](FIXES_AND_TROUBLESHOOTING.md) for a comprehensive troubleshooting guide.

### Quick checks

| Issue | Check |
|-------|-------|
| "LiveKit not configured" | `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` in `backend/.env` |
| Agent worker not connecting | LiveKit server running, `LIVEKIT_URL` matches Docker/Cloud URL |
| No audio in browser | Microphone permission, browser console errors |
| Agent uses wrong voice | Set `cartesia_voice_id` in agent metadata (not ElevenLabs voice_id) |
| Agent takes 10+ sec to respond | Ensure `livekit_agent.py` has low-latency settings, check LLM model speed |
| Chat not working | LLM API keys in `frontend/.env.local`, check `/api/chat` errors |
| Database tables not found | Run migration: `POST http://localhost:8000/api/migrate` |

---

## Production Deployment

For production:

1. **LiveKit Server**: Use [LiveKit Cloud](https://livekit.io/cloud) or deploy self-hosted
2. **Update URLs**: `LIVEKIT_URL` to `wss://...`, `NEXT_PUBLIC_LIVEKIT_URL` to `wss://...`
3. **HTTPS**: Required for WebRTC in production browsers
4. **CORS**: Restrict origins in `backend/app/main.py`
5. **Frontend**: Deploy to Vercel, set environment variables
6. **Backend**: Deploy to Railway/Render/AWS, run both `uvicorn` and `livekit_agent.py`
7. **SIP (phone calls)**: Configure LiveKit SIP trunk + Twilio
