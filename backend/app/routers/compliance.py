"""Compliance endpoints — data export, deletion, consent, retention, audit."""

import re
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, field_validator

from app.config import settings
from app.database import get_supabase
from app.audit import log_audit_event
from app.pii import redact_pii_from_transcript

router = APIRouter()


# ── Helpers ─────────────────────────────────────────────────────

def _normalize_phone(phone: str) -> list[str]:
    """Return candidate phone number variants for DB lookup.

    Supabase stores numbers in E.164 (+61...) or local (04xx...) format.
    We generate both variants so a lookup succeeds regardless of which
    format was stored.
    """
    phone = re.sub(r"[\s\-()]", "", phone.strip())
    variants = {phone}

    # Convert Australian local → E.164
    if re.match(r"^04\d{8}$", phone):
        variants.add("+61" + phone[1:])
    elif re.match(r"^0[2-9]\d{8}$", phone):
        variants.add("+61" + phone[1:])

    # Convert E.164 Australian → local
    if re.match(r"^\+614\d{8}$", phone):
        variants.add("0" + phone[3:])
    elif re.match(r"^\+61[2-9]\d{8}$", phone):
        variants.add("0" + phone[3:])

    return list(variants)


def _get_call_ids_for_phone(db, phone: str) -> list[str]:
    """Return all call IDs matching any variant of the given phone number."""
    variants = _normalize_phone(phone)
    all_ids: list[str] = []
    for variant in variants:
        result = db.table("calls").select("id").eq("caller_number", variant).execute()
        all_ids.extend(c["id"] for c in (result.data or []))
    return list(set(all_ids))  # deduplicate


# ── Request models ───────────────────────────────────────────────


class DataExportRequest(BaseModel):
    phone_number: str

    @field_validator("phone_number")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("phone_number is required")
        digits = re.sub(r"[\s\-+()]", "", v)
        if len(digits) < 7:
            raise ValueError("phone_number is too short")
        return v


class DataDeletionRequest(BaseModel):
    phone_number: str

    @field_validator("phone_number")
    @classmethod
    def validate_phone(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("phone_number is required")
        digits = re.sub(r"[\s\-+()]", "", v)
        if len(digits) < 7:
            raise ValueError("phone_number is too short")
        return v


class ConsentRequest(BaseModel):
    call_id: str
    caller_number: str
    consent_type: str = "call_recording"
    consent_given: bool = True
    consent_method: str = "verbal"


# ── Data Export (APP 12) ─────────────────────────────────────────


@router.post("/data-export")
async def data_export(req: DataExportRequest, request: Request):
    """Export all data associated with a phone number (APP 12 compliance)."""
    db = get_supabase()

    call_ids = _get_call_ids_for_phone(db, req.phone_number)

    calls_data: list[dict] = []
    transcripts: list[dict] = []
    function_logs: list[dict] = []
    consent_records: list[dict] = []

    if call_ids:
        # Batch fetch — one query per table
        calls_result = db.table("calls").select("*").in_("id", call_ids).execute()
        calls_data = calls_result.data or []

        transcripts_result = (
            db.table("transcript_entries").select("*").in_("call_id", call_ids).execute()
        )
        transcripts = transcripts_result.data or []

        logs_result = (
            db.table("function_call_logs").select("*").in_("call_id", call_ids).execute()
        )
        function_logs = logs_result.data or []

        consent_result = (
            db.table("consent_records").select("*").in_("call_id", call_ids).execute()
        )
        consent_records = consent_result.data or []

    ip = request.client.host if request.client else ""
    await log_audit_event(
        action="data_export",
        resource_type="compliance",
        details=f"Data export for {req.phone_number} — {len(call_ids)} call(s)",
        ip_address=ip,
        request_method="POST",
        request_path="/api/compliance/data-export",
        status_code=200,
    )

    return {
        "phone_number": req.phone_number,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "call_count": len(calls_data),
        "calls": calls_data,
        "transcripts": transcripts,
        "function_call_logs": function_logs,
        "consent_records": consent_records,
    }


# ── Data Deletion (APP 13) ───────────────────────────────────────


@router.post("/data-deletion")
async def data_deletion(req: DataDeletionRequest, request: Request):
    """Delete/redact all data for a phone number (APP 13 compliance)."""
    db = get_supabase()

    call_ids = _get_call_ids_for_phone(db, req.phone_number)

    deleted_counts = {
        "calls": 0,
        "transcripts": 0,
        "function_logs": 0,
        "consent_records": 0,
    }

    if call_ids:
        # Redact all transcript entries in one update per batch
        transcripts_result = (
            db.table("transcript_entries").select("id").in_("call_id", call_ids).execute()
        )
        transcript_ids = [e["id"] for e in (transcripts_result.data or [])]
        if transcript_ids:
            db.table("transcript_entries").update({
                "content": "[REDACTED — data deletion request]"
            }).in_("id", transcript_ids).execute()
            deleted_counts["transcripts"] = len(transcript_ids)

        # Delete function call logs in bulk
        logs_result = (
            db.table("function_call_logs").select("id").in_("call_id", call_ids).execute()
        )
        log_ids = [e["id"] for e in (logs_result.data or [])]
        if log_ids:
            db.table("function_call_logs").delete().in_("id", log_ids).execute()
            deleted_counts["function_logs"] = len(log_ids)

        # Delete consent records in bulk
        consent_result = (
            db.table("consent_records").select("id").in_("call_id", call_ids).execute()
        )
        consent_ids = [e["id"] for e in (consent_result.data or [])]
        if consent_ids:
            db.table("consent_records").delete().in_("id", consent_ids).execute()
            deleted_counts["consent_records"] = len(consent_ids)

        # Redact caller number and mark calls as deleted in bulk
        db.table("calls").update({
            "caller_number": None,
            "pii_redacted": True,
            "summary": "[REDACTED — data deletion request]",
        }).in_("id", call_ids).execute()
        deleted_counts["calls"] = len(call_ids)

    ip = request.client.host if request.client else ""
    await log_audit_event(
        action="data_deletion",
        resource_type="compliance",
        details=(
            f"Data deletion for {req.phone_number} — "
            f"{deleted_counts['calls']} call(s), "
            f"{deleted_counts['transcripts']} transcript(s), "
            f"{deleted_counts['function_logs']} function log(s)"
        ),
        ip_address=ip,
        request_method="POST",
        request_path="/api/compliance/data-deletion",
        status_code=200,
    )

    return {
        "phone_number": req.phone_number,
        "deleted_at": datetime.now(timezone.utc).isoformat(),
        "affected": deleted_counts,
    }


# ── Consent ──────────────────────────────────────────────────────


@router.post("/consent")
async def record_consent(req: ConsentRequest):
    """Record consent for call recording."""
    db = get_supabase()

    expires_at = (
        datetime.now(timezone.utc) + timedelta(days=settings.DATA_RETENTION_DAYS)
    ).isoformat()

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


# ── Retention Cleanup ────────────────────────────────────────────


@router.post("/retention/cleanup")
async def retention_cleanup():
    """Manual trigger for data retention cleanup."""
    from app.tasks.retention import run_retention_cleanup
    result = await run_retention_cleanup()
    return result


# ── Compliance Status ────────────────────────────────────────────


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
                "description": "POST/PUT/PATCH/DELETE requests are audit-logged with IP address",
            },
            {
                "name": "PII Masking",
                "status": "enabled",
                "description": "Phone numbers masked in API responses",
            },
            {
                "name": "Data Retention Policy",
                "status": "configured",
                "description": f"Data retained for {settings.DATA_RETENTION_DAYS} days, then PII is redacted",
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
                "description": "POST /api/compliance/data-export — bulk fetch with phone normalization",
            },
            {
                "name": "Data Deletion (APP 13)",
                "status": "available",
                "description": "POST /api/compliance/data-deletion — bulk redaction with phone normalization",
            },
            {
                "name": "Consent Recording",
                "status": "enabled",
                "description": "Call recording consent tracked per call with expiry",
            },
        ],
        "environment": settings.APP_ENV,
        "data_retention_days": settings.DATA_RETENTION_DAYS,
    }


# ── Audit Logs ───────────────────────────────────────────────────


@router.get("/audit-logs")
async def list_audit_logs(
    limit: int = 50,
    offset: int = 0,
    action: str = "",
    resource_type: str = "",
):
    """Return recent audit log entries with optional filtering."""
    db = get_supabase()

    query = db.table("audit_logs").select("*").order("timestamp", desc=True)

    if action:
        query = query.ilike("action", f"%{action}%")
    if resource_type:
        query = query.eq("resource_type", resource_type)

    result = query.range(offset, offset + limit - 1).execute()
    return result.data or []
