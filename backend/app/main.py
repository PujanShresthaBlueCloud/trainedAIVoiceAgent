from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import traceback

from routers import agents, calls, system_prompts, custom_functions, twilio_webhooks
from ws.browser import router as ws_browser_router
from ws.twilio import router as ws_twilio_router

app = FastAPI(title="Voice AI Platform", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(agents.router, prefix="/api/agents", tags=["agents"])
app.include_router(calls.router, prefix="/api/calls", tags=["calls"])
app.include_router(system_prompts.router, prefix="/api/system-prompts", tags=["system-prompts"])
app.include_router(custom_functions.router, prefix="/api/custom-functions", tags=["custom-functions"])
app.include_router(twilio_webhooks.router, prefix="/api/twilio", tags=["twilio"])
app.include_router(ws_browser_router)
app.include_router(ws_twilio_router)


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


@app.post("/api/migrate")
async def run_migration():
    """Run database migration to create tables in Supabase."""
    from database import get_supabase, MIGRATION_SQL
    db = get_supabase()
    # Execute migration via Supabase RPC (requires running SQL in dashboard)
    return {
        "message": "Run this SQL in Supabase SQL Editor (Dashboard → SQL Editor → New Query):",
        "sql": MIGRATION_SQL
    }
