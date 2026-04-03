"""Data retention cleanup — redacts PII from records older than DATA_RETENTION_DAYS.

Run via: python -m app.tasks.retention
"""

import asyncio
import json
import logging
from datetime import datetime, timezone, timedelta

from app.config import settings
from app.database import get_supabase
from app.pii import redact_pii_from_transcript

logger = logging.getLogger(__name__)


def _redact_json_strings(obj) -> tuple[any, bool]:
    """Recursively redact PII from all string values in a JSON object.
    Returns (redacted_obj, was_changed).
    """
    if isinstance(obj, str):
        redacted = redact_pii_from_transcript(obj)
        return redacted, redacted != obj
    if isinstance(obj, dict):
        changed = False
        result = {}
        for k, v in obj.items():
            new_v, c = _redact_json_strings(v)
            result[k] = new_v
            if c:
                changed = True
        return result, changed
    if isinstance(obj, list):
        changed = False
        result = []
        for item in obj:
            new_item, c = _redact_json_strings(item)
            result.append(new_item)
            if c:
                changed = True
        return result, changed
    return obj, False


async def run_retention_cleanup() -> dict:
    """Redact PII from calls, transcripts, and function logs older than retention period."""
    db = get_supabase()
    cutoff = (
        datetime.now(timezone.utc) - timedelta(days=settings.DATA_RETENTION_DAYS)
    ).isoformat()

    # Find calls older than cutoff that haven't been redacted yet
    calls_result = (
        db.table("calls")
        .select("id, caller_number")
        .lt("started_at", cutoff)
        .or_("pii_redacted.is.null,pii_redacted.eq.false")
        .execute()
    )

    calls = calls_result.data or []
    if not calls:
        return {
            "status": "completed",
            "cutoff_date": cutoff,
            "redacted_calls": 0,
            "redacted_transcripts": 0,
            "redacted_function_logs": 0,
            "retention_days": settings.DATA_RETENTION_DAYS,
        }

    call_ids = [c["id"] for c in calls]
    redacted_calls = 0
    redacted_transcripts = 0
    redacted_function_logs = 0

    # ── Redact transcript entries in bulk ────────────────────────
    transcripts = (
        db.table("transcript_entries")
        .select("id, content")
        .in_("call_id", call_ids)
        .execute()
    )
    for entry in (transcripts.data or []):
        redacted_content = redact_pii_from_transcript(entry["content"])
        if redacted_content != entry["content"]:
            db.table("transcript_entries").update({
                "content": redacted_content,
            }).eq("id", entry["id"]).execute()
            redacted_transcripts += 1

    # ── Redact PII from function_call_logs arguments and results ─
    fn_logs = (
        db.table("function_call_logs")
        .select("id, arguments, result")
        .in_("call_id", call_ids)
        .execute()
    )
    for log in (fn_logs.data or []):
        update_payload = {}

        if log.get("arguments"):
            redacted_args, changed = _redact_json_strings(log["arguments"])
            if changed:
                update_payload["arguments"] = redacted_args

        if log.get("result"):
            redacted_result, changed = _redact_json_strings(log["result"])
            if changed:
                update_payload["result"] = redacted_result

        if update_payload:
            db.table("function_call_logs").update(update_payload).eq("id", log["id"]).execute()
            redacted_function_logs += 1

    # ── Null out caller_number and mark calls as redacted in bulk ─
    db.table("calls").update({
        "caller_number": None,
        "pii_redacted": True,
        "retention_expires_at": datetime.now(timezone.utc).isoformat(),
    }).in_("id", call_ids).execute()
    redacted_calls = len(call_ids)

    result = {
        "status": "completed",
        "cutoff_date": cutoff,
        "redacted_calls": redacted_calls,
        "redacted_transcripts": redacted_transcripts,
        "redacted_function_logs": redacted_function_logs,
        "retention_days": settings.DATA_RETENTION_DAYS,
    }

    logger.info(f"Retention cleanup: {result}")
    return result


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    result = asyncio.run(run_retention_cleanup())
    print(result)
