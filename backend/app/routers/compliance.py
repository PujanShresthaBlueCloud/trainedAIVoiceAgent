"""Compliance endpoints — data export, deletion, consent, retention, audit."""

from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import settings
from app.database import get_supabase
from app.audit import log_audit_event
from app.pii import redact_pii_from_transcript

router = APIRouter()


# ── Request models ──────────────────────────────────────────────


class DataExportRequest(BaseModel):
    phone_number: str


class DataDeletionRequest(BaseModel):
    phone_number: str


class ConsentRequest(BaseModel):
    call_id: str
    caller_number: str
    consent_type: str = "call_recording"
    consent_given: bool = True
    consent_method: str = "verbal"


# ── Data Export (APP 12) ────────────────────────────────────────


@router.post("/data-export")
async def data_export(req: DataExportRequest):
    """Export all data associated with a phone number (APP 12 compliance)."""
    db = get_supabase()

    # Find all calls for this number
    calls = db.table("calls").select("*").eq("caller_number", req.phone_number).execute()

    # Get transcripts for those calls
    call_ids = [c["id"] for c in (calls.data or [])]
    transcripts = []
    for cid in call_ids:
        entries = db.table("transcript_entries").select("*").eq("call_id", cid).execute()
        transcripts.extend(entries.data or [])

    # Get function call logs
    function_logs = []
    for cid in call_ids:
        logs = db.table("function_call_logs").select("*").eq("call_id", cid).execute()
        function_logs.extend(logs.data or [])

    # Get consent records
    consent_records = []
    for cid in call_ids:
        records = db.table("consent_records").select("*").eq("call_id", cid).execute()
        consent_records.extend(records.data or [])

    await log_audit_event(
        action="data_export",
        resource_type="compliance",
        details=f"Data export for {req.phone_number}",
    )

    return {
        "phone_number": req.phone_number,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "calls": calls.data or [],
        "transcripts": transcripts,
        "function_call_logs": function_logs,
        "consent_records": consent_records,
    }


# ── Data Deletion (APP 13) ─────────────────────────────────────


@router.post("/data-deletion")
async def data_deletion(req: DataDeletionRequest):
    """Delete/redact all data for a phone number (APP 13 compliance)."""
    db = get_supabase()

    # Find all calls for this number
    calls = db.table("calls").select("id").eq("caller_number", req.phone_number).execute()
    call_ids = [c["id"] for c in (calls.data or [])]

    deleted_counts = {
        "calls": 0,
        "transcripts": 0,
        "function_logs": 0,
        "consent_records": 0,
    }

    for cid in call_ids:
        # Redact transcripts
        entries = db.table("transcript_entries").select("id").eq("call_id", cid).execute()
        for entry in (entries.data or []):
            db.table("transcript_entries").update({
                "content": "[REDACTED — data deletion request]"
            }).eq("id", entry["id"]).execute()
            deleted_counts["transcripts"] += 1

        # Delete function call logs
        db.table("function_call_logs").delete().eq("call_id", cid).execute()

        # Delete consent records
        db.table("consent_records").delete().eq("call_id", cid).execute()

    # Redact caller number and mark calls
    for cid in call_ids:
        db.table("calls").update({
            "caller_number": None,
            "pii_redacted": True,
            "summary": "[REDACTED — data deletion request]",
        }).eq("id", cid).execute()
        deleted_counts["calls"] += 1

    await log_audit_event(
        action="data_deletion",
        resource_type="compliance",
        details=f"Data deletion for {req.phone_number}, affected calls: {len(call_ids)}",
    )

    return {
        "phone_number": req.phone_number,
        "deleted_at": datetime.now(timezone.utc).isoformat(),
        "affected": deleted_counts,
    }


# ── Consent ─────────────────────────────────────────────────────


@router.post("/consent")
async def record_consent(req: ConsentRequest):
    """Record consent for call recording."""
    db = get_supabase()

    expires_at = (datetime.now(timezone.utc) + timedelta(days=settings.DATA_RETENTION_DAYS)).isoformat()

    result = db.table("consent_records").insert({
        "call_id": req.call_id,
        "caller_number": req.caller_number,
        "consent_type": req.consent_type,
        "consent_given": req.consent_given,
        "consent_method": req.consent_method,
        "recorded_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": expires_at,
    }).execute()

    return result.data[0] if result.data else {"status": "recorded"}


@router.get("/consent/{call_id}")
async def get_consent(call_id: str):
    """Check consent status for a call."""
    db = get_supabase()
    result = db.table("consent_records").select("*").eq("call_id", call_id).execute()
    if not result.data:
        return {"call_id": call_id, "consent_given": False, "records": []}
    return {
        "call_id": call_id,
        "consent_given": any(r.get("consent_given") for r in result.data),
        "records": result.data,
    }


# ── Retention Cleanup ──────────────────────────────────────────


@router.post("/retention/cleanup")
async def retention_cleanup():
    """Manual trigger for data retention cleanup."""
    from app.tasks.retention import run_retention_cleanup
    result = await run_retention_cleanup()
    return result


# ── Compliance Status ──────────────────────────────────────────


@router.get("/status")
async def compliance_status():
    """Return compliance posture checklist."""
    return {
        "checks": [
            {
                "name": "Security Headers",
                "status": "enabled",
                "description": "HSTS, CSP, X-Frame-Options, and other security headers are active",
            },
            {
                "name": "CORS Restrictions",
                "status": "enabled" if settings.APP_ENV != "development" else "development_mode",
                "description": "Origin validation is enforced in production",
            },
            {
                "name": "Rate Limiting",
                "status": "enabled",
                "description": f"Rate limited to {settings.RATE_LIMIT_PER_MINUTE} requests/minute",
            },
            {
                "name": "Audit Logging",
                "status": "enabled" if settings.AUDIT_LOG_ENABLED else "disabled",
                "description": "POST/PUT/PATCH/DELETE requests are audit-logged",
            },
            {
                "name": "PII Masking",
                "status": "enabled",
                "description": "Phone numbers masked in API responses",
            },
            {
                "name": "Data Retention Policy",
                "status": "configured",
                "description": f"Data retained for {settings.DATA_RETENTION_DAYS} days",
            },
            {
                "name": "Error Sanitization",
                "status": "enabled",
                "description": "Internal error details are not exposed to clients",
            },
            {
                "name": "JWT Validation",
                "status": "enabled",
                "description": "Clerk JWT with JWKS rotation and clock skew tolerance",
            },
            {
                "name": "Data Export (APP 12)",
                "status": "available",
                "description": "POST /api/compliance/data-export endpoint active",
            },
            {
                "name": "Data Deletion (APP 13)",
                "status": "available",
                "description": "POST /api/compliance/data-deletion endpoint active",
            },
            {
                "name": "Consent Recording",
                "status": "enabled",
                "description": "Call recording consent tracked per call",
            },
        ],
        "environment": settings.APP_ENV,
        "data_retention_days": settings.DATA_RETENTION_DAYS,
    }


# ── Audit Logs ─────────────────────────────────────────────────


@router.get("/audit-logs")
async def list_audit_logs(limit: int = 50, offset: int = 0):
    """Return recent audit log entries."""
    db = get_supabase()
    result = (
        db.table("audit_logs")
        .select("*")
        .order("timestamp", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )
    return result.data or []
