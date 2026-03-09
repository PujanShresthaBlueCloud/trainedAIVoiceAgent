from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.types import ASGIApp, Scope, Receive, Send
import logging
import uuid

from app.auth import get_current_user
from app.config import settings
from app.routers import agents, calls, system_prompts, custom_functions, knowledge_bases, phone_numbers, livekit, chat_conversations
from app.routers import compliance
from app.middleware.security_headers import SecurityHeadersMiddleware
from app.middleware.rate_limit import RateLimitMiddleware
from app.audit import AuditMiddleware

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


app = FastAPI(title="Voice AI Platform", version="1.0.0")


# ── CORS Middleware with origin validation ──────────────────────


class CORSMiddleware:
    def __init__(self, app: ASGIApp):
        self.app = app

    def _is_origin_allowed(self, origin: str) -> bool:
        """Check if the origin is allowed based on config."""
        if settings.APP_ENV == "development":
            return True
        allowed = settings.get_allowed_origins()
        if not allowed:
            return False
        return origin in allowed

    def _cors_headers(self, origin: bytes) -> list[tuple[bytes, bytes]]:
        return [
            (b"access-control-allow-origin", origin),
            (b"access-control-allow-methods", b"GET, POST, PUT, PATCH, DELETE, OPTIONS"),
            (b"access-control-allow-headers", b"Authorization, Content-Type"),
            (b"access-control-max-age", b"86400"),
        ]

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] == "http":
            method = scope.get("method", "GET")
            headers = dict(scope.get("headers", []))
            origin = headers.get(b"origin", b"").decode("utf-8", errors="replace")

            if not origin or not self._is_origin_allowed(origin):
                if method == "OPTIONS":
                    # Reject preflight for disallowed origins
                    await send({
                        "type": "http.response.start",
                        "status": 403,
                        "headers": [(b"content-length", b"0")],
                    })
                    await send({"type": "http.response.body", "body": b""})
                    return
                # For non-preflight, just don't add CORS headers
                await self.app(scope, receive, send)
                return

            origin_bytes = origin.encode("utf-8")

            if method == "OPTIONS":
                await send({
                    "type": "http.response.start",
                    "status": 200,
                    "headers": self._cors_headers(origin_bytes) + [(b"content-length", b"0")],
                })
                await send({"type": "http.response.body", "body": b""})
                return

            async def send_with_cors(message):
                if message["type"] == "http.response.start":
                    headers = list(message.get("headers", []))
                    headers.extend(self._cors_headers(origin_bytes))
                    message["headers"] = headers
                await send(message)

            await self.app(scope, receive, send_with_cors)
            return

        await self.app(scope, receive, send)


# ── Middleware stack (outermost first) ──────────────────────────

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(AuditMiddleware)
app.add_middleware(CORSMiddleware)


# ── Routers ─────────────────────────────────────────────────────

_auth = [Depends(get_current_user)]

app.include_router(agents.router, prefix="/api/agents", tags=["agents"], dependencies=_auth)
app.include_router(calls.router, prefix="/api/calls", tags=["calls"], dependencies=_auth)
app.include_router(system_prompts.router, prefix="/api/system-prompts", tags=["system-prompts"], dependencies=_auth)
app.include_router(custom_functions.router, prefix="/api/custom-functions", tags=["custom-functions"], dependencies=_auth)
app.include_router(knowledge_bases.router, prefix="/api/knowledge-bases", tags=["knowledge-bases"], dependencies=_auth)
app.include_router(phone_numbers.router, prefix="/api/phone-numbers", tags=["phone-numbers"], dependencies=_auth)
app.include_router(livekit.router, prefix="/api/livekit", tags=["livekit"], dependencies=_auth)
app.include_router(chat_conversations.router, prefix="/api/chat-conversations", tags=["chat-conversations"], dependencies=_auth)
app.include_router(compliance.router, prefix="/api/compliance", tags=["compliance"], dependencies=_auth)


# ── Error handler — sanitized, no internal details ──────────────


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    reference = str(uuid.uuid4())[:8]
    logger.error(f"Unhandled error [{reference}]: {request.method} {request.url.path} — {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"error": "An internal error occurred", "reference": reference},
    )


# ── Public endpoints ────────────────────────────────────────────


@app.get("/")
async def root():
    return {"status": "ok", "service": "Voice AI Platform"}


@app.get("/health")
async def health():
    return {"status": "healthy"}


# ── Protected endpoints ─────────────────────────────────────────


@app.get("/api/diagnostics", dependencies=_auth)
async def diagnostics():
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


@app.post("/api/migrate", dependencies=_auth)
async def run_migration():
    from app.database import get_supabase, MIGRATION_SQL
    db = get_supabase()
    return {
        "message": "Run this SQL in Supabase SQL Editor:",
        "sql": MIGRATION_SQL,
    }
