# Voice AI Platform - Setup & Run Guide

## Architecture Overview

The platform runs as **4 processes**:

| Process | Role | Default URL |
|---------|------|-------------|
| **LiveKit Server** | Media routing, WebRTC, SIP bridging | `ws://localhost:7880` |
| **FastAPI Backend** | REST APIs, token generation, CRUD | `http://localhost:8000` |
| **LiveKit Agent Worker** | Voice pipeline (STT → LLM → TTS), tool execution | Connects to LiveKit |
| **Next.js Frontend** | Web UI for managing agents, calls, test calls | `http://localhost:3000` |

**Voice call flow:** Browser → LiveKit (WebRTC) → Agent Worker (Deepgram STT → LLM → ElevenLabs TTS) → LiveKit → Browser

---

## Prerequisites

- **Python 3.12+**
- **Node.js 18+** and npm
- **Docker** (for LiveKit server)
- **Supabase** project (for database)
- API keys for: Deepgram, ElevenLabs, OpenAI (and/or Anthropic, DeepSeek, Groq)

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
│   ├── app/                   # Next.js pages
│   ├── components/            # UI components
│   ├── lib/                   # API client, LiveKit voice hook
│   └── package.json
└── SETUP.md                   # This file
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

Create `backend/.env` with the following:

```env
# === Required ===

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-supabase-anon-key

# LiveKit (use these defaults for local development)
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=devsecret

# Deepgram (Speech-to-Text)
DEEPGRAM_API_KEY=your-deepgram-api-key

# ElevenLabs (Text-to-Speech)
ELEVENLABS_API_KEY=your-elevenlabs-api-key
ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM

# At least one LLM provider:
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-4

# === Optional LLM Providers ===

ANTHROPIC_API_KEY=          # For claude-* models
DEEPSEEK_API_KEY=           # For deepseek-* models
GROQ_API_KEY=               # For llama-*/mixtral-* models
GOOGLE_API_KEY=             # For gemini-* models

# === Optional ===

# Twilio (for phone number sync, not needed for browser calls)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

# Knowledge Base / RAG
PINECONE_API_KEY=
EMBEDDING_MODEL=text-embedding-3-small

APP_URL=http://localhost:8000
```

### Frontend

The frontend uses environment variables from `frontend/.env.local` (optional):

```env
NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
NEXT_PUBLIC_LIVEKIT_URL=ws://localhost:7880
```

These default to `http://127.0.0.1:8000` and `ws://localhost:7880` if not set, so you typically don't need to create this file for local development.

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

You need **4 terminal windows** (or run them in the background). Start them in this order:

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

### Terminal 2: FastAPI Backend

```bash
cd backend
source venv/bin/activate
uvicorn app.main:app --port 8000
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

You should see `true` for `supabase`, `deepgram`, `elevenlabs`, `livekit`, and at least one LLM provider (`openai`, `anthropic`, `deepseek`, etc.).

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
3. Fill in:
   - **Name**: e.g., "My Assistant"
   - **System Prompt**: Instructions for the AI
   - **LLM Model**: Choose from `gpt-4`, `claude-3-opus-20240229`, `deepseek-chat`, etc.
   - **Voice ID**: ElevenLabs voice ID (default: Rachel)
   - **Tools**: Enable built-in tools like `end_call`, `book_appointment`, etc.
4. Click **Create Agent**

### Make a Test Call (Browser)

1. On the Agents page, find your agent card
2. Click **Test Call**
3. Click **Start Call**
4. Allow microphone access when prompted
5. Speak to the agent — you should hear a response
6. Click **End Call** when done

### View Call History

Go to **Calls** page (`/calls`) to see all past calls, including transcripts.

### Make an Outbound Call (requires SIP setup)

Go to **Calls** page → **Outbound Call** → enter a phone number. This requires LiveKit SIP trunk configuration.

---

## API Endpoints

### Core APIs

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/api/diagnostics` | Check all integration statuses |
| POST | `/api/migrate` | Get database migration SQL |

### LiveKit

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/livekit/token` | Generate token for browser voice call |
| GET | `/api/livekit/rooms` | List active LiveKit rooms |

### Agents

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/agents` | List all agents |
| POST | `/api/agents` | Create agent |
| GET | `/api/agents/:id` | Get agent |
| PUT | `/api/agents/:id` | Update agent |
| DELETE | `/api/agents/:id` | Delete agent |

### Calls

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/calls` | List calls |
| GET | `/api/calls/:id` | Get call details |
| GET | `/api/calls/:id/transcript` | Get call transcript |
| POST | `/api/calls/outbound` | Make outbound call (SIP) |
| DELETE | `/api/calls/:id` | Delete call |

### Other

| Prefix | Description |
|--------|-------------|
| `/api/system-prompts` | CRUD for reusable system prompts |
| `/api/custom-functions` | CRUD for webhook-based custom tools |
| `/api/knowledge-bases` | CRUD for RAG knowledge bases + file upload |
| `/api/phone-numbers` | Phone number management |

---

## LLM Provider Mapping

The agent worker automatically routes to the correct provider based on model name:

| Model prefix | Provider | Required env var |
|-------------|----------|-----------------|
| `gpt-*` | OpenAI | `OPENAI_API_KEY` |
| `claude-*` | Anthropic | `ANTHROPIC_API_KEY` |
| `deepseek-*` | DeepSeek | `DEEPSEEK_API_KEY` |
| `llama-*`, `mixtral-*` | Groq | `GROQ_API_KEY` |

---

## Troubleshooting

### "LiveKit not configured"
Make sure `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` are set in `backend/.env` and match the `LIVEKIT_KEYS` in the Docker command.

### Agent worker shows "registered worker" but calls don't work
- Check that the LiveKit server is running (`docker ps` should show `livekit-server`)
- Check that `LIVEKIT_URL` in `.env` matches the Docker port (`ws://localhost:7880`)

### No audio playback in browser
- Make sure you allowed microphone access
- Check browser console for errors
- LiveKit requires a secure context (HTTPS) in production; `localhost` works for development

### Agent crashes with API key errors
- Check the agent's `llm_model` setting matches an LLM provider you have configured
- For example, if the agent uses `deepseek-chat`, you need `DEEPSEEK_API_KEY` set

### Database tables not found
- Run the migration: visit `http://localhost:8000/api/migrate` and execute the SQL in Supabase SQL Editor

### Docker not running
- Start Docker Desktop, then retry the `docker run` command
- On Linux: `sudo systemctl start docker`

---

## Production Deployment

For production, you'll need to:

1. **LiveKit Server**: Deploy a self-hosted instance or use [LiveKit Cloud](https://livekit.io/cloud)
2. **Update URLs**: Set `LIVEKIT_URL` to your production LiveKit server URL (use `wss://`)
3. **Update API keys**: Generate production LiveKit API key/secret
4. **Frontend**: Set `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_LIVEKIT_URL` to production URLs
5. **SIP (for phone calls)**: Configure a LiveKit SIP trunk with your Twilio or SIP provider
6. **HTTPS**: Required for WebRTC in production browsers
