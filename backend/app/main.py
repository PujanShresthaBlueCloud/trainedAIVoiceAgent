from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.types import ASGIApp, Scope, Receive, Send
import logging
import traceback

from app.routers import agents, calls, system_prompts, custom_functions, knowledge_bases, phone_numbers, livekit

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
        if scope["type"] == "http":
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
app.include_router(knowledge_bases.router, prefix="/api/knowledge-bases", tags=["knowledge-bases"])
app.include_router(phone_numbers.router, prefix="/api/phone-numbers", tags=["phone-numbers"])
app.include_router(livekit.router, prefix="/api/livekit", tags=["livekit"])


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    tb = traceback.format_exc()
    print(f"ERROR: {request.method} {request.url.path} — {exc}\n{tb}")
    return JSONResponse(
        status_code=500,
        content={"error": str(exc), "type": type(exc).__name__},
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "*",
        },
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
        "livekit": bool(settings.LIVEKIT_API_KEY and settings.LIVEKIT_API_SECRET),
    }


@app.post("/api/migrate")
async def run_migration():
    from app.database import get_supabase, MIGRATION_SQL
    db = get_supabase()
    return {
        "message": "Run this SQL in Supabase SQL Editor:",
        "sql": MIGRATION_SQL,
    }
