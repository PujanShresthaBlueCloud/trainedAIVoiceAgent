from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect, Query
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp, Scope, Receive, Send
import logging
import traceback

from app.routers import agents, calls, system_prompts, custom_functions, twilio_webhooks
from app.voice.session_browser import BrowserVoiceSession

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

app = FastAPI(title="Voice AI Platform", version="1.0.0")


# Manual CORS that does NOT touch WebSocket connections
class CORSMiddleware:
    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] == "websocket":
            await self.app(scope, receive, send)
            return

        if scope["type"] == "http":
            headers_list = scope.get("headers", [])
            method = scope.get("method", "GET")

            # Handle preflight
            if method == "OPTIONS":
                async def send_preflight(message):
                    if message["type"] == "http.response.start":
                        message["headers"] = [
                            (b"access-control-allow-origin", b"*"),
                            (b"access-control-allow-methods", b"GET, POST, PUT, PATCH, DELETE, OPTIONS"),
                            (b"access-control-allow-headers", b"*"),
                            (b"access-control-max-age", b"86400"),
                            (b"content-length", b"0"),
                        ]
                        message["status"] = 200
                    await send(message)

                await self.app(scope, receive, send_preflight)
                return

            # Add CORS headers to normal responses
            async def send_with_cors(message):
                if message["type"] == "http.response.start":
                    headers = list(message.get("headers", []))
                    headers.append((b"access-control-allow-origin", b"*"))
                    headers.append((b"access-control-allow-methods", b"GET, POST, PUT, PATCH, DELETE, OPTIONS"))
                    headers.append((b"access-control-allow-headers", b"*"))
                    message["headers"] = headers
                await send(message)

            await self.app(scope, receive, send_with_cors)
            return

        await self.app(scope, receive, send)


app.add_middleware(CORSMiddleware)

app.include_router(agents.router, prefix="/api/agents", tags=["agents"])
app.include_router(calls.router, prefix="/api/calls", tags=["calls"])
app.include_router(system_prompts.router, prefix="/api/system-prompts", tags=["system-prompts"])
app.include_router(custom_functions.router, prefix="/api/custom-functions", tags=["custom-functions"])
app.include_router(twilio_webhooks.router, prefix="/api/twilio", tags=["twilio"])


# WebSocket endpoint directly on app — no router indirection
@app.websocket("/ws/voice-browser")
async def voice_browser_ws(websocket: WebSocket, agent_id: str = Query(default=None)):
    await websocket.accept()
    logger.info(f"Browser WS connected: agent_id={agent_id}")
    session = BrowserVoiceSession(websocket, agent_id=agent_id)
    try:
        await session.run()
    except WebSocketDisconnect:
        logger.info("Browser WS disconnected")
    except Exception as e:
        logger.error(f"Browser WS error: {e}", exc_info=True)
    finally:
        try:
            await websocket.close()
        except Exception:
            pass


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    tb = traceback.format_exc()
    print(f"ERROR: {request.method} {request.url.path} — {exc}\n{tb}")
    return JSONResponse(
        status_code=500,
        content={"error": str(exc), "type": type(exc).__name__},
    )


@app.get("/")
async def root():
    return {"status": "ok", "service": "Voice AI Platform"}


@app.get("/health")
async def health():
    return {"status": "healthy"}


@app.get("/api/diagnostics")
async def diagnostics():
    from app.config import settings
    return {
        "supabase": bool(settings.SUPABASE_URL and settings.SUPABASE_KEY),
        "deepgram": bool(settings.DEEPGRAM_API_KEY),
        "elevenlabs": bool(settings.ELEVENLABS_API_KEY),
        "openai": bool(settings.OPENAI_API_KEY),
        "anthropic": bool(settings.ANTHROPIC_API_KEY),
        "deepseek": bool(settings.DEEPSEEK_API_KEY),
        "google": bool(settings.GOOGLE_API_KEY),
        "groq": bool(settings.GROQ_API_KEY),
        "twilio": bool(settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN),
    }


@app.post("/api/migrate")
async def run_migration():
    from app.database import get_supabase, MIGRATION_SQL
    db = get_supabase()
    return {
        "message": "Run this SQL in Supabase SQL Editor:",
        "sql": MIGRATION_SQL,
    }
