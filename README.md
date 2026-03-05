# Trained Logic AI Voice

Voice AI platform with real-time voice calls powered by LiveKit (STT → LLM → TTS), custom webhook functions, integration templates, AI chat, and RAG-powered knowledge bases.

## Architecture

```
Frontend (Next.js 14)                Backend (FastAPI + LiveKit Agent)
├── Dashboard                        ├── Routers (REST API)
├── Agent Detail (/agents/[id])      │   ├── /api/agents
│   ├── Model & Voice config         │   ├── /api/calls
│   ├── System Prompt editor         │   ├── /api/system-prompts
│   ├── Functions & Integrations     │   ├── /api/custom-functions
│   ├── Test Voice Call (LiveKit)    │   ├── /api/knowledge-bases
│   └── Test AI Chat (streaming)     │   ├── /api/livekit
├── Agents list                      │   └── /api/phone-numbers
├── Calls history                    ├── LiveKit Agent Worker
├── System Prompts                   │   ├── livekit_agent.py (entrypoint)
├── Custom Functions                 │   ├── Deepgram STT (nova-3)
├── Knowledge Base                   │   ├── Multi-provider LLM
├── Phone Numbers                    │   ├── Cartesia TTS (sonic-3)
└── Settings                         │   └── Silero VAD
                                     ├── Voice Pipeline
                                     │   ├── tools.py (built-in + custom)
                                     │   └── functions.py (webhook executor)
                                     └── Services
                                         ├── livekit_service.py (rooms/tokens)
                                         ├── vector_db.py (Pinecone)
                                         └── document_processor.py (RAG)
```

## Quick Start

```bash
# Backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # Fill in API keys
uvicorn app.main:app --reload --port 8000

# LiveKit Agent (separate terminal)
cd backend
source venv/bin/activate
python livekit_agent.py dev

# Frontend
cd frontend
npm install
cp .env.local.example .env.local  # Fill in keys
npm run dev  # http://localhost:3000
```

See [SETUP.md](SETUP.md) for detailed setup instructions.

## Features

### Agents
Voice AI agents with configurable:
- **System prompt** with welcome message and AI-speaks-first option
- **LLM model** — GPT-4/4o, Claude, Gemini, Llama, Mixtral, DeepSeek
- **Voice** — Cartesia voice ID (for LiveKit calls) + optional ElevenLabs voice ID
- **Language** — STT/TTS language code
- **Tools** — built-in tools + custom webhook functions
- **Knowledge Base** — optional RAG-powered context retrieval
- **Integration templates** — quick-create webhook functions for n8n, Zapier, Make

### Voice Calls (LiveKit)
Real-time voice calls via LiveKit with low-latency pipeline:
1. Browser captures microphone → LiveKit room
2. **Deepgram STT** (nova-3) transcribes with 100ms endpointing
3. **LLM** processes with conversation history, tools, and RAG context
4. **Tool calls** execute built-in functions or custom webhooks
5. **Cartesia TTS** (sonic-3) synthesizes response audio
6. Audio streams back to browser in real-time

Features: preemptive generation, interruption support, welcome message on connect.

### AI Chat
Browser-based streaming chat with agent's system prompt and tools:
- Multi-provider LLM routing (OpenAI, Anthropic, DeepSeek, Google, Groq)
- Server-Sent Events (SSE) streaming
- Function/tool calling with webhook execution (up to 5 rounds)
- Inline tool call and result display

### Custom Functions (Webhook Integration)
Define webhook-backed tools that agents can call during voice or chat conversations:

| Field | Description |
|---|---|
| `name` | Function name (used as tool name in LLM) |
| `description` | What the function does (sent to LLM) |
| `webhook_url` | URL to call when function is invoked |
| `method` | HTTP method (GET/POST/PUT/PATCH) |
| `parameters` | JSON Schema for function arguments |
| `headers` | Custom HTTP headers (key-value pairs) |
| `query_params` | Query parameters appended to URL |
| `timeout_seconds` | Request timeout (default: 30s) |
| `retry_count` | Number of retries on failure (default: 0) |
| `payload_mode` | `args_only` or `full_context` |
| `response_mapping` | Extract fields from response using dot-notation paths |
| `store_variables` | Extract and store variables from response |
| `speak_during_execution` | Filler text spoken while webhook executes |
| `speak_on_failure` | Text spoken if webhook fails after retries |

### Integration Templates
Quick-create webhook functions from the agent detail page:
- **n8n** — pre-filled URL pattern `https://your-n8n.com/webhook/...`
- **Zapier** — pre-filled URL pattern `https://hooks.zapier.com/hooks/catch/...`
- **Make** — pre-filled URL pattern `https://hook.us1.make.com/...`
- **Custom Webhook** — generic, no prefill

### Knowledge Base (RAG)
Upload documents to a vector database for context-aware responses.

**Pipeline:** Upload → Parse (PDF/TXT/DOCX/CSV) → Chunk (500 tokens, 50 overlap) → Embed (OpenAI) → Upsert (Pinecone)

### Built-in Tools

| Tool | Description |
|---|---|
| `end_call` | End the current call with a reason |
| `transfer_call` | Transfer to another number/department |
| `check_availability` | Check appointment availability |
| `book_appointment` | Book an appointment |

## Environment Variables

See [SETUP.md](SETUP.md) for the full list.

## API Endpoints

### Agents
- `GET /api/agents` — List all agents
- `GET /api/agents/{id}` — Get agent
- `POST /api/agents` — Create agent
- `PUT /api/agents/{id}` — Update agent
- `DELETE /api/agents/{id}` — Delete agent

### Calls
- `GET /api/calls` — List calls
- `GET /api/calls/{id}` — Get call details
- `GET /api/calls/{id}/transcript` — Get transcript
- `POST /api/calls/outbound` — Make outbound call
- `DELETE /api/calls/{id}` — Delete call

### System Prompts
- `GET /api/system-prompts` — List prompts
- `POST /api/system-prompts` — Create prompt
- `PUT /api/system-prompts/{id}` — Update prompt
- `DELETE /api/system-prompts/{id}` — Delete prompt

### Custom Functions
- `GET /api/custom-functions` — List functions
- `GET /api/custom-functions/{id}` — Get function
- `POST /api/custom-functions` — Create function
- `PUT /api/custom-functions/{id}` — Update function
- `DELETE /api/custom-functions/{id}` — Delete function
- `POST /api/custom-functions/{id}/test` — Test webhook

### Knowledge Bases
- `GET /api/knowledge-bases` — List knowledge bases
- `GET /api/knowledge-bases/{id}` — Get knowledge base
- `POST /api/knowledge-bases` — Create knowledge base
- `PUT /api/knowledge-bases/{id}` — Update knowledge base
- `DELETE /api/knowledge-bases/{id}` — Delete knowledge base
- `GET /api/knowledge-bases/{id}/files` — List files
- `POST /api/knowledge-bases/{id}/files` — Upload file (multipart)
- `DELETE /api/knowledge-bases/{id}/files/{file_id}` — Delete file

### LiveKit
- `POST /api/livekit/token` — Generate LiveKit token + create room
- `GET /api/livekit/rooms` — List active LiveKit rooms

### Other
- `GET /` — Service status
- `GET /health` — Health check
- `GET /api/diagnostics` — Check configured API keys
- `POST /api/migrate` — Get migration SQL

## Project Structure

```
backend/
├── app/
│   ├── main.py                    # FastAPI app, routes, CORS
│   ├── config.py                  # Settings (env vars via pydantic)
│   ├── database.py                # Supabase client + migration SQL
│   ├── routers/
│   │   ├── agents.py              # Agent CRUD
│   │   ├── calls.py               # Call management
│   │   ├── system_prompts.py      # System prompt CRUD
│   │   ├── custom_functions.py    # Custom function CRUD + test
│   │   ├── knowledge_bases.py     # KB CRUD + file upload
│   │   ├── phone_numbers.py       # Phone number management
│   │   └── livekit.py             # LiveKit token + rooms
│   ├── voice/
│   │   ├── tools.py               # Tool definitions (built-in + dynamic)
│   │   └── functions.py           # Tool execution (webhooks + retry)
│   └── services/
│       ├── livekit_service.py     # LiveKit room/token/SIP management
│       ├── vector_db.py           # Vector DB provider (Pinecone)
│       └── document_processor.py  # Parse, chunk, embed documents
├── livekit_agent.py               # LiveKit agent worker (STT→LLM→TTS)
└── requirements.txt

frontend/
├── app/
│   ├── layout.tsx                 # Root layout with sidebar
│   ├── page.tsx                   # Landing page
│   ├── dashboard/page.tsx         # Dashboard
│   ├── agents/page.tsx            # Agent list
│   ├── agents/[id]/page.tsx       # Agent detail (config + test call + chat)
│   ├── calls/page.tsx             # Call history
│   ├── system-prompts/page.tsx    # System prompts
│   ├── custom-functions/page.tsx  # Custom functions
│   ├── knowledge-base/page.tsx    # Knowledge base management
│   ├── phone-numbers/page.tsx     # Phone numbers
│   ├── settings/page.tsx          # Settings
│   └── api/chat/route.ts          # Streaming chat API (SSE)
├── components/
│   ├── Sidebar.tsx                # Navigation sidebar
│   ├── TestCallSection.tsx        # Voice call testing UI
│   └── VoiceCallButton.tsx        # Voice call button + transcript
├── lib/
│   ├── api.ts                     # Backend API client
│   └── useVoiceSession.ts         # LiveKit voice session hook
└── types/index.ts                 # TypeScript interfaces
```
