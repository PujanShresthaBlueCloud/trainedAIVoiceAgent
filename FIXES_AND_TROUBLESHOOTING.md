# Fixes & Troubleshooting Log

> A detailed record of every issue encountered during development and its resolution.
> Use this as a reference when debugging similar problems in the future.

---

## Table of Contents

1. [Dependency Version Conflicts](#1-dependency-version-conflicts)
2. [Supabase Connection Issues](#2-supabase-connection-issues)
3. [Python Import Path Issues](#3-python-import-path-issues)
4. [Environment Variable Loading](#4-environment-variable-loading)
5. [WebSocket Connection Failures](#5-websocket-connection-failures)
6. [CORS Errors](#6-cors-errors)
7. [Git Push Rejected (Secrets in History)](#7-git-push-rejected-secrets-in-history)
8. [Frontend Build Errors](#8-frontend-build-errors)
9. [Voice Pipeline Not Responding](#9-voice-pipeline-not-responding)
10. [Quick Diagnostic Commands](#10-quick-diagnostic-commands)

---

## 1. Dependency Version Conflicts

### Issue 1a: `supabase` SDK `proxy` argument error

**Error:**
```
TypeError: Client.__init__() got an unexpected keyword argument 'proxy'
```

**Root Cause:**
`supabase==2.3.4` depends on `gotrue==2.9.1` which passes a `proxy` keyword to `httpx.Client()`. However, the installed `httpx==0.25.2` doesn't support `proxy` (it was added in httpx 0.27+). The `supabase` package pins `httpx<0.26`, creating an impossible version conflict.

**Fix:**
Upgraded `supabase` from `2.3.4` to `>=2.28.0`, which pulls compatible versions of `gotrue`, `httpx`, and all sub-dependencies:
```bash
pip install --upgrade supabase
pip install --upgrade gotrue supafunc  # ensure these also upgrade
```

**requirements.txt change:**
```diff
- supabase==2.3.4
+ supabase>=2.28.0
```

---

### Issue 1b: `websockets` missing `asyncio` module

**Error:**
```
ModuleNotFoundError: No module named 'websockets.asyncio'
```

**Root Cause:**
The upgraded `supabase>=2.28.0` pulls `realtime==2.28.0`, which requires `websockets.asyncio` — a feature introduced in websockets 13.0+. The project had `websockets==12.0` pinned.

**Fix:**
```bash
pip install "websockets>=13,<16"
```

**requirements.txt change:**
```diff
- websockets==12.0
+ websockets>=13,<16
```

---

### Issue 1c: `openai` SDK `proxies` argument error

**Error:**
```
TypeError: AsyncClient.__init__() got an unexpected keyword argument 'proxies'
```

**Root Cause:**
`openai==1.12.0` uses `proxies` parameter when creating its internal `httpx.AsyncClient`. The upgraded `httpx==0.28.1` (pulled by `supabase>=2.28.0`) renamed `proxies` to `proxy`. The old `openai` SDK is incompatible.

**Fix:**
```bash
pip install --upgrade openai anthropic groq
```
This upgraded:
- `openai` from `1.12.0` to `2.21.0`
- `anthropic` from `0.18.1` to `0.83.0`
- `groq` from `0.4.2` to `1.0.0`

**requirements.txt change:**
```diff
- openai==1.12.0
- anthropic==0.18.1
- groq==0.4.2
+ openai>=2.0.0
+ anthropic>=0.80.0
+ groq>=1.0.0
```

**IMPORTANT:** This was the root cause of "AI voice agent not replying." The `openai` SDK crash was silent — STT worked, but the LLM call failed, so no response was ever generated or spoken back.

---

### Issue 1d: Anthropic streaming API change

**Error:** (Would occur when using Claude models after upgrading `anthropic` to 0.83.0)

**Root Cause:**
`anthropic>=0.80.0` changed the streaming API. The old code used `stream=True` as a keyword and iterated over raw events. The new SDK uses `.stream()` method without `stream=True`, and provides a cleaner `text_stream` iterator.

**Fix in `backend/app/services/llm.py`:**
```python
# OLD (anthropic 0.18.x):
kwargs = {"model": model, "messages": user_messages, "max_tokens": 1024, "stream": True}
async with client.messages.stream(**kwargs) as stream:
    async for event in stream:
        if event.type == "content_block_delta" and hasattr(event.delta, "text"):
            yield {"type": "text_delta", "content": event.delta.text}
final = await stream.get_final_message()

# NEW (anthropic 0.80+):
kwargs = {"model": model, "messages": user_messages, "max_tokens": 1024}
async with client.messages.stream(**kwargs) as stream:
    async for text in stream.text_stream:
        yield {"type": "text_delta", "content": text}
    final = await stream.get_final_message()
```

Key changes:
- Removed `"stream": True` from kwargs (`.stream()` method implies streaming)
- Use `stream.text_stream` instead of iterating raw events
- Moved `get_final_message()` inside the `async with` block

---

### Summary: Final Working `requirements.txt`

```
fastapi==0.109.2
uvicorn[standard]==0.27.1
websockets>=13,<16
python-dotenv==1.0.1
supabase>=2.28.0
pydantic-settings==2.1.0
openai>=2.0.0
anthropic>=0.80.0
google-generativeai==0.4.0
groq>=1.0.0
twilio==9.0.0
python-multipart==0.0.9
```

**Lesson learned:** When upgrading `supabase`, ALL HTTP-based SDKs (`openai`, `anthropic`, `groq`) must also be upgraded because `supabase` forces a newer `httpx` version that breaks older SDKs.

---

## 2. Supabase Connection Issues

### Issue 2a: "Invalid API key"

**Error:**
```
SupabaseException: Invalid API key
```

**Root Cause:**
The `SUPABASE_KEY` in `.env` was set to a `sb_secret_...` value — this is the **database password**, not the **API key**. Supabase API keys are JWTs that start with `eyJhbGciOi...`.

**Fix:**
1. Go to Supabase Dashboard → **Settings** → **API**
2. Copy the `anon` key (for public access) or `service_role` key (for backend, bypasses RLS)
3. Both keys start with `eyJhbGciOiJIUzI1NiIs...`
4. Update `backend/.env`:
   ```
   SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdX...
   ```

**How to tell the difference:**
| Value | What it is |
|-------|-----------|
| `sb_secret_...` or short random string | Database password (for psql/direct DB connection) |
| `eyJhbGciOi...` (long JWT) | API key (for Supabase REST API / PostgREST) |

---

### Issue 2b: "Could not find the table 'public.agents' in the schema cache"

**Error:**
```json
{"message": "Could not find the table 'public.agents' in the schema cache", "code": "PGRST205"}
```

**Root Cause:**
The database tables haven't been created yet. Supabase uses PostgREST which caches the schema — if the tables don't exist, you get this error.

**Fix:**
Run the migration SQL in Supabase Dashboard → **SQL Editor** → **New Query**:
```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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

CREATE TABLE IF NOT EXISTS transcript_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    call_id UUID REFERENCES calls(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT now()
);

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

CREATE INDEX IF NOT EXISTS idx_calls_agent_id ON calls(agent_id);
CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status);
CREATE INDEX IF NOT EXISTS idx_transcript_entries_call_id ON transcript_entries(call_id);
CREATE INDEX IF NOT EXISTS idx_function_call_logs_call_id ON function_call_logs(call_id);
```

---

## 3. Python Import Path Issues

### Issue 3a: `ModuleNotFoundError: No module named 'voice'`

**Error:**
```
from voice.session import VoiceSession
ModuleNotFoundError: No module named 'voice'
```

**Root Cause:**
The Python files are in `backend/app/`. The import style must match **where uvicorn is started from**:

| Running from | uvicorn command | Import style |
|-------------|----------------|-------------|
| `backend/app/` | `uvicorn main:app` | `from voice.session import ...` |
| `backend/` | `uvicorn app.main:app` | `from app.voice.session import ...` |

The project was initially built to run from `backend/app/`, but later changed to run from `backend/`. This caused mixed import styles.

**Fix:**
All internal imports were updated to use `app.` prefix since we run from `backend/`:

```bash
# Pattern: replace all bare internal imports with app. prefix
# Files affected: all .py files in backend/app/

# voice/ files:
from voice.session import VoiceSession      → from app.voice.session import VoiceSession
from voice.audio_codec import ...           → from app.voice.audio_codec import ...
from voice.tools import ...                  → from app.voice.tools import ...
from voice.functions import ...              → from app.voice.functions import ...

# services/ files:
from config import settings                  → from app.config import settings
from database import get_supabase            → from app.database import get_supabase

# ws/ files:
from voice.session_browser import ...        → from app.voice.session_browser import ...
from voice.session_twilio import ...         → from app.voice.session_twilio import ...

# routers/ files:
from database import get_supabase            → from app.database import get_supabase
from config import settings                  → from app.config import settings
```

**Correct startup command (from `backend/` directory):**
```bash
cd backend
./venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

---

### Issue 3b: Using wrong Python virtual environment

**Error:**
```
ModuleNotFoundError: No module named 'supabase'
```
(with traceback showing `frontend/venv/lib/python3.12/...`)

**Root Cause:**
Running `uvicorn` from the **frontend venv** instead of the **backend venv**. The frontend venv doesn't have `supabase`, `fastapi`, etc.

**Fix:**
Always use the backend venv explicitly:
```bash
# Correct:
/path/to/backend/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000

# Or activate first:
source backend/venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

**Tip:** Check which Python you're using:
```bash
which python    # should show backend/venv/bin/python
which uvicorn   # should show backend/venv/bin/uvicorn
```

---

## 4. Environment Variable Loading

### Issue: `supabase_url is required` / Empty config values

**Error:**
```json
{"error": "supabase_url is required", "type": "SupabaseException"}
```

**Root Cause:**
`backend/app/config.py` used a relative path for the `.env` file:
```python
model_config = {"env_file": "../.env", "extra": "ignore"}
```
This path is relative to the **working directory** (where you run uvicorn from), not the file location. When running from `backend/`, the path `../.env` points to the project root (wrong). When running from `backend/app/`, it points to `backend/.env` (correct).

**Fix:**
Changed to use an absolute path based on the file's location:
```python
from pathlib import Path

# Always resolves to backend/.env regardless of working directory
_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"

class Settings(BaseSettings):
    # ... fields ...
    model_config = {"env_file": str(_ENV_FILE), "extra": "ignore"}
```

This works regardless of where uvicorn is started from because `Path(__file__)` always points to `backend/app/config.py`, so `.parent.parent` always resolves to `backend/`.

---

## 5. WebSocket Connection Failures

### Issue 5a: "WebSocket is closed before the connection is established"

**Error (browser console):**
```
WebSocket connection to 'ws://localhost:8000/ws/voice-browser?agent_id=...' failed:
WebSocket is closed before the connection is established.
```

**Root Cause:**
React strict mode (enabled in development) mounts → unmounts → re-mounts components. The `useEffect` cleanup function calls `disconnect()`, which closes the WebSocket while it's still in `CONNECTING` state. The original code also tried to `ws.send(...)` on a non-OPEN WebSocket.

**Fix in `frontend/lib/useVoiceSession.ts`:**

1. **Check readyState before sending:**
```typescript
// OLD:
wsRef.current.send(JSON.stringify({ type: "end" }));

// NEW:
if (wsRef.current.readyState === WebSocket.OPEN) {
  wsRef.current.send(JSON.stringify({ type: "end" }));
}
```

2. **Track mounted state to prevent operations after unmount:**
```typescript
const mountedRef = useRef(true);

// In connect():
if (!mountedRef.current) {
  stream.getTracks().forEach((t) => t.stop());
  return;
}

// In ws.onopen:
if (!mountedRef.current) {
  ws.close();
  return;
}

// In useEffect cleanup:
useEffect(() => {
  mountedRef.current = true;
  return () => {
    mountedRef.current = false;
    disconnect();
  };
}, [disconnect]);
```

3. **Prevent duplicate connections:**
```typescript
const connect = useCallback(async () => {
  if (wsRef.current) return; // Already connected
  // ...
}, [agentId]);
```

4. **Clean up resources in onclose handler:**
```typescript
ws.onclose = () => {
  wsRef.current = null;
  cleanup(); // Stop mic, close audio contexts
  setState((s) => ({ ...s, isConnected: false, isRecording: false }));
};
```

---

### Issue 5b: Deepgram `extra_headers` → `additional_headers`

**Error:**
```
TypeError: connect() got an unexpected keyword argument 'extra_headers'
```

**Root Cause:**
`websockets>=13` renamed the `extra_headers` parameter to `additional_headers`.

**Fix in `backend/app/services/deepgram_stt.py`:**
```python
# OLD (websockets 12.x):
self._ws = await websockets.connect(url, extra_headers=headers)

# NEW (websockets 13+):
self._ws = await websockets.connect(url, additional_headers=headers)
```

Also added error handling so Deepgram connection failure doesn't crash the entire WebSocket session:
```python
try:
    self._ws = await websockets.connect(url, additional_headers=headers)
    self._running = True
    asyncio.create_task(self._receive_loop())
except Exception as e:
    logger.error(f"Deepgram STT connection failed: {e}")
    self._running = False
    self._ws = None
```

---

## 6. CORS Errors

### Issue: "No 'Access-Control-Allow-Origin' header"

**Error (browser console):**
```
Access to fetch at 'http://localhost:8000/api/agents' from origin 'http://localhost:3000'
has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present
```

**Root Cause:**
When the backend returns a 500 error, the exception happens BEFORE the CORS middleware can add headers. The browser sees a response without CORS headers and blocks it. The underlying 500 error was caused by the env file not loading (see Issue 4).

**Fix:**
1. Fixed the root cause (env file loading — see Issue 4)
2. Added a global exception handler in `main.py` that returns proper JSON errors (which the CORS middleware can then wrap with headers):
```python
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    tb = traceback.format_exc()
    print(f"ERROR: {request.method} {request.url.path} — {exc}\n{tb}")
    return JSONResponse(
        status_code=500,
        content={"error": str(exc), "type": type(exc).__name__},
    )
```

**Note:** The CORS middleware in `main.py` allows all origins:
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```
This is fine for development. For production, restrict `allow_origins` to your frontend domain.

---

## 7. Git Push Rejected (Secrets in History)

### Issue: GitHub Push Protection blocked push

**Error:**
```
remote: error: GH013: Repository rule violations found for refs/heads/main.
remote: - GITHUB PUSH PROTECTION
remote:   Push cannot contain secrets
remote:   —— OpenAI API Key ——
remote:   —— Anthropic API Key ——
remote:   —— Twilio Account String Identifier ——
```

**Root Cause:**
- `backend/.env` with real API keys was committed to git
- `backend/venv/` (thousands of files) was committed to git
- `frontend/venv/` was committed to git
- `__pycache__/` directories were committed
- `.DS_Store` files were committed
- No `.gitignore` existed at the project root

**Fix (multi-step):**

### Step 1: Created root `.gitignore`
```gitignore
# Environment / Secrets
.env
.env.*
.env.local
.env.production
!.env.example

# Python
__pycache__/
*.py[cod]
venv/
.venv/

# Node
node_modules/
.next/

# Database
*.db
*.sqlite
prisma/dev.db

# OS
.DS_Store

# IDE
.vscode/
.idea/
```

### Step 2: Removed tracked files that should be ignored
```bash
git rm -r --cached backend/venv/
git rm -r --cached backend/app/__pycache__/ backend/app/routers/__pycache__/ ...
git rm --cached .DS_Store backend/.DS_Store
```

### Step 3: Fixed frontend being tracked as a git submodule
The `frontend/` directory had its own `.git/` folder (created by `npx create-next-app`), which made git treat it as a submodule (showing as `160000` mode in `git ls-files --stage`).
```bash
rm -rf frontend/.git          # Remove inner .git
git rm --cached -f frontend    # Remove submodule reference
git add frontend/              # Re-add as normal directory
```

### Step 4: Rewrote git history to remove secrets
Since the secrets were in previous commits (even though they were removed from tracking), we squashed all history into a single clean commit:
```bash
git reset --soft $(git rev-list --max-parents=0 HEAD)  # Soft reset to first commit
git add .gitignore backend/ frontend/ DOCUMENTATION.md
git commit -m "Initial commit: Voice AI Platform"
git push --force origin main  # Safe because old push was rejected
```

**Prevention:**
- Always create `.gitignore` before the first commit
- Never commit `.env` files — use `.env.example` with placeholder values
- Never commit `venv/` or `node_modules/`
- If you accidentally commit secrets, you MUST rewrite history (squash or use `git filter-repo`)

---

## 8. Frontend Build Errors

### Issue: ESLint `@typescript-eslint/no-explicit-any` errors

**Error:**
```
./app/agents/page.tsx:45:7
Type error: Unexpected any. Specify a different type.  @typescript-eslint/no-explicit-any
```

**Fix:**
Added rule override in `frontend/.eslintrc.json`:
```json
{
  "extends": "next/core-web-vitals",
  "rules": {
    "@typescript-eslint/no-explicit-any": "off"
  }
}
```

---

## 9. Voice Pipeline Not Responding

### Symptom
User speaks into microphone, STT produces text, but AI never responds with voice.

### Diagnostic Steps

```bash
# 1. Test Deepgram STT
python -c "
import asyncio, websockets, json
async def test():
    url = 'wss://api.deepgram.com/v1/listen?language=en-US&sample_rate=16000&encoding=linear16&channels=1&model=nova-2'
    headers = {'Authorization': 'Token YOUR_DEEPGRAM_KEY'}
    ws = await websockets.connect(url, additional_headers=headers)
    print('STT: Connected')
    await ws.send(b'\x00' * 3200)
    await ws.send(json.dumps({'type': 'CloseStream'}))
    async for msg in ws:
        print('STT response:', json.loads(msg).get('type'))
asyncio.run(test())
"

# 2. Test LLM
python -c "
import asyncio
from app.services.llm import stream_llm_response
async def test():
    msgs = [{'role': 'system', 'content': 'Be brief.'}, {'role': 'user', 'content': 'Hello'}]
    async for chunk in stream_llm_response(msgs, model='deepseek-chat'):
        if chunk['type'] == 'text_delta': print(chunk['content'], end='')
    print()
asyncio.run(test())
"

# 3. Test TTS
python -c "
import asyncio
from app.services.elevenlabs_tts import synthesize_speech
async def test():
    total = 0
    async for chunk in synthesize_speech('Hello world'):
        total += len(chunk)
    print(f'TTS: {total} bytes')
asyncio.run(test())
"
```

### Root Cause (in our case)
The `openai==1.12.0` SDK was crashing silently due to `httpx` version incompatibility (see Issue 1c). The LLM call raised a `TypeError` which was caught by a broad `except` in the voice session, so no response was generated.

### General Checklist
1. Is the backend running? (`curl http://localhost:8000/health`)
2. Does Deepgram connect? (check backend logs for "Deepgram STT connected")
3. Does the LLM respond? (test directly with the script above)
4. Does TTS generate audio? (test directly with the script above)
5. Are there Python errors in the backend terminal?

---

## 10. Quick Diagnostic Commands

Run these from the `backend/` directory with the backend venv activated:

```bash
# Check backend health
curl -s http://localhost:8000/health

# Check if agents API works
curl -s http://localhost:8000/api/agents

# Check CORS headers
curl -s -I -X OPTIONS \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: GET" \
  http://localhost:8000/api/agents | grep access-control

# Test WebSocket connection
python -c "
import asyncio, websockets
async def test():
    ws = await websockets.connect('ws://localhost:8000/ws/voice-browser')
    msg = await asyncio.wait_for(ws.recv(), timeout=5)
    print('WS OK:', msg)
    await ws.close()
asyncio.run(test())
"

# Check installed package versions
pip show supabase openai anthropic httpx websockets | grep -E '^(Name|Version)'

# Check env file is loading
python -c "
from app.config import settings
print('SUPABASE_URL:', settings.SUPABASE_URL[:30] + '...' if settings.SUPABASE_URL else 'EMPTY')
print('OPENAI_API_KEY:', 'SET' if settings.OPENAI_API_KEY else 'EMPTY')
print('DEEPGRAM_API_KEY:', 'SET' if settings.DEEPGRAM_API_KEY else 'EMPTY')
print('ELEVENLABS_API_KEY:', 'SET' if settings.ELEVENLABS_API_KEY else 'EMPTY')
"

# Check what port 8000 is using
lsof -i :8000 | grep LISTEN

# Kill process on port 8000
kill $(lsof -t -i:8000)
```

---

## Startup Cheat Sheet

```bash
# Terminal 1: Backend
cd /path/to/trainedlogicaivoice/backend
source venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Terminal 2: Frontend
cd /path/to/trainedlogicaivoice/frontend
npm run dev

# Verify
open http://localhost:8000/docs    # Swagger UI
open http://localhost:3000          # Frontend
```
