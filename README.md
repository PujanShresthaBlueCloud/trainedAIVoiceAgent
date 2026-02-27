# trainedAIVoiceAgent

Voice AI platform with real-time STT → LLM → TTS pipeline, custom webhook functions, and RAG-powered knowledge bases.

## Architecture

```
Frontend (Next.js)          Backend (FastAPI)
├── Dashboard               ├── Routers (REST API)
├── Agents                  │   ├── /api/agents
├── Calls                   │   ├── /api/calls
├── System Prompts          │   ├── /api/system-prompts
├── Custom Functions        │   ├── /api/custom-functions
├── Knowledge Base          │   └── /api/knowledge-bases
└── WebSocket Client        ├── Voice Pipeline
                            │   ├── session.py (STT→LLM→TTS)
                            │   ├── tools.py (built-in + custom)
                            │   └── functions.py (webhook executor)
                            ├── Services
                            │   ├── deepgram_stt.py
                            │   ├── elevenlabs_tts.py
                            │   ├── llm.py (OpenAI/Anthropic/Google/Groq/DeepSeek)
                            │   ├── vector_db.py (Pinecone)
                            │   └── document_processor.py (RAG pipeline)
                            └── WebSocket (/ws/voice-browser)
```

## Setup

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # Fill in API keys
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev  # http://localhost:3000
```

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_KEY` | Yes | Supabase anon/service key |
| `OPENAI_API_KEY` | Yes | OpenAI API key (LLM + embeddings) |
| `DEEPGRAM_API_KEY` | Yes | Deepgram STT key |
| `ELEVENLABS_API_KEY` | Yes | ElevenLabs TTS key |
| `ANTHROPIC_API_KEY` | No | Claude models |
| `GOOGLE_API_KEY` | No | Gemini models |
| `GROQ_API_KEY` | No | Groq models (Llama, Mixtral) |
| `DEEPSEEK_API_KEY` | No | DeepSeek models |
| `TWILIO_ACCOUNT_SID` | No | Twilio for phone calls |
| `TWILIO_AUTH_TOKEN` | No | Twilio auth |
| `TWILIO_PHONE_NUMBER` | No | Twilio phone number |
| `PINECONE_API_KEY` | No | Pinecone for knowledge base RAG |
| `EMBEDDING_MODEL` | No | Default: `text-embedding-3-small` |
| `CHUNK_SIZE` | No | Default: `500` tokens |
| `CHUNK_OVERLAP` | No | Default: `50` tokens |
| `RAG_TOP_K` | No | Default: `5` chunks returned |

### Database Migration

Run the SQL from `GET /api/migrate` in the Supabase SQL Editor to create all tables.

## Features

### Agents

Voice AI agents with configurable:
- **System prompt** — personality and instructions
- **LLM model** — GPT-4, Claude, Gemini, Llama, Mixtral, DeepSeek
- **Voice** — ElevenLabs voice ID
- **Language** — STT language code
- **Tools** — built-in tools + custom webhook functions
- **Knowledge Base** — optional RAG-powered context retrieval

### Custom Functions (Webhook Integration)

Define webhook-backed tools that agents can call during voice conversations.

| Field | Description |
|---|---|
| `name` | Function name (used as tool name in LLM) |
| `description` | What the function does (sent to LLM) |
| `webhook_url` | URL to call when function is invoked |
| `method` | HTTP method (GET/POST/PUT/PATCH) |
| `parameters` | JSON Schema for function arguments |
| `headers` | Custom HTTP headers |
| `timeout_seconds` | Request timeout (default: 30s) |
| `retry_count` | Number of retries on failure (default: 0) |
| `response_mapping` | Extract fields from response using dot-notation paths |
| `speak_during_execution` | Filler text spoken to user while webhook executes |
| `speak_on_failure` | Text spoken if webhook fails after retries |

**Response Mapping** uses dot-notation paths to extract fields from webhook responses:
```json
{
  "status": "$.data.status",
  "message": "$.result.message",
  "price": "$.items.0.price"
}
```

**Test Webhook** button sends a test request to validate the webhook URL and shows the response inline.

**Call Context Injection** — when a custom function is called during a voice session, the request body includes `_call_context` with `call_id` and `recent_transcript`.

### Knowledge Base (RAG)

Upload documents to a vector database. During voice calls, the agent automatically searches the knowledge base for relevant context before responding.

**Pipeline:** Upload → Parse (PDF/TXT/DOCX/CSV) → Chunk (500 tokens, 50 overlap) → Embed (OpenAI) → Upsert (Pinecone)

**Supported file types:** `.pdf`, `.txt`, `.docx`, `.csv`

**How RAG works in calls:**
1. User speaks → STT transcribes
2. User message is embedded via OpenAI
3. Top-K similar chunks are retrieved from Pinecone
4. Chunks are injected as a system message before the LLM call
5. LLM responds with knowledge-base-informed answer
6. Response is spoken via TTS

**Configuration per knowledge base:**
- Provider (Pinecone)
- API key, index name, host, namespace

**Connecting to an agent:**
Select a knowledge base in the agent's edit form. The agent will use it for RAG during all voice calls.

### Voice Pipeline

Real-time bidirectional audio over WebSocket:

1. **Browser** captures microphone audio → sends to backend via WebSocket
2. **Deepgram STT** transcribes audio in real-time
3. **LLM** processes transcript with conversation history, tools, and RAG context
4. **Tool calls** execute built-in functions or custom webhooks (with filler speech)
5. **ElevenLabs TTS** synthesizes response audio
6. **Audio chunks** stream back to browser for playback

**Interruption:** User speech detected by STT cancels in-progress TTS playback.

### Built-in Tools

| Tool | Description |
|---|---|
| `end_call` | End the current call with a reason |
| `transfer_call` | Transfer to another number/department |
| `check_availability` | Check appointment availability |
| `book_appointment` | Book an appointment |

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
- `DELETE /api/knowledge-bases/{id}` — Delete knowledge base (removes vectors)
- `GET /api/knowledge-bases/{id}/files` — List files
- `POST /api/knowledge-bases/{id}/files` — Upload file (multipart)
- `DELETE /api/knowledge-bases/{id}/files/{file_id}` — Delete file (removes vectors)

### Other
- `GET /` — Service status
- `GET /health` — Health check
- `GET /api/diagnostics` — Check configured API keys
- `POST /api/migrate` — Get migration SQL
- `WS /ws/voice-browser?agent_id={id}` — Voice WebSocket

## Project Structure

```
backend/
├── app/
│   ├── main.py                    # FastAPI app, routes, WebSocket
│   ├── config.py                  # Settings (env vars)
│   ├── database.py                # Supabase client + migration SQL
│   ├── routers/
│   │   ├── agents.py              # Agent CRUD
│   │   ├── calls.py               # Call management
│   │   ├── system_prompts.py      # System prompt CRUD
│   │   ├── custom_functions.py    # Custom function CRUD + test
│   │   ├── knowledge_bases.py     # KB CRUD + file upload
│   │   └── twilio_webhooks.py     # Twilio webhooks
│   ├── voice/
│   │   ├── session.py             # VoiceSession (STT→LLM→TTS + RAG)
│   │   ├── session_browser.py     # Browser WebSocket session
│   │   ├── session_twilio.py      # Twilio WebSocket session
│   │   ├── tools.py               # Tool definitions (built-in + dynamic)
│   │   ├── functions.py           # Tool execution (webhooks + retry)
│   │   └── audio_codec.py         # Audio encoding/decoding
│   └── services/
│       ├── llm.py                 # Multi-provider LLM streaming
│       ├── deepgram_stt.py        # Speech-to-text
│       ├── elevenlabs_tts.py      # Text-to-speech
│       ├── twilio_service.py      # Twilio integration
│       ├── vector_db.py           # Vector DB provider (Pinecone)
│       └── document_processor.py  # Parse, chunk, embed documents
└── requirements.txt

frontend/
├── app/
│   ├── layout.tsx                 # Root layout with sidebar
│   ├── page.tsx                   # Landing page
│   ├── dashboard/page.tsx         # Dashboard
│   ├── agents/page.tsx            # Agent management
│   ├── calls/page.tsx             # Call history
│   ├── system-prompts/page.tsx    # System prompts
│   ├── custom-functions/page.tsx  # Custom functions
│   └── knowledge-base/page.tsx    # Knowledge base management
├── components/
│   ├── Sidebar.tsx                # Navigation sidebar
│   ├── TestCallSection.tsx        # Voice call testing UI
│   └── VoiceCallButton.tsx        # Voice call button
├── lib/
│   ├── api.ts                     # API client
│   └── useVoiceSession.ts         # Voice WebSocket hook
└── types/index.ts                 # TypeScript interfaces
```
