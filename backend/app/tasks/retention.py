"""Data retention cleanup — redacts PII from records older than DATA_RETENTION_DAYS.

Run via: python -m app.tasks.retention
"""

import asyncio
import logging
from datetime import datetime, timezone, timedelta

from app.config import settings
from app.database import get_supabase
from app.pii import redact_pii_from_transcript

logger = logging.getLogger(__name__)


async def run_retention_cleanup() -> dict:
    """Redact PII from calls and transcripts older than the retention period."""
    db = get_supabase()
    cutoff = (datetime.now(timezone.utc) - timedelta(days=settings.DATA_RETENTION_DAYS)).isoformat()

    # Find calls older than cutoff that haven't been redacted yet
    calls_result = (
        db.table("calls")
        .select("id, caller_number")
        .lt("started_at", cutoff)
        .or_("pii_redacted.is.null,pii_redacted.eq.false")
        .execute()
    )

    calls = calls_result.data or []
    redacted_calls = 0
    redacted_transcripts = 0

    for call in calls:
        call_id = call["id"]

        # Redact transcript entries
        transcripts = (
            db.table("transcript_entries")
            .select("id, content")
            .eq("call_id", call_id)
            .execute()
        )
        for entry in (transcripts.data or []):
            redacted_content = redact_pii_from_transcript(entry["content"])
            if redacted_content != entry["content"]:
                db.table("transcript_entries").update({
                    "content": redacted_content,
                }).eq("id", entry["id"]).execute()
                redacted_transcripts += 1

        # Null out caller_number and mark as redacted
        db.table("calls").update({
            "caller_number": None,
            "pii_redacted": True,
            "retention_expires_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", call_id).execute()
        redacted_calls += 1

    result = {
        "status": "completed",
        "cutoff_date": cutoff,
        "redacted_calls": redacted_calls,
        "redacted_transcripts": redacted_transcripts,
        "retention_days": settings.DATA_RETENTION_DAYS,
    }

    logger.info(f"Retention cleanup: {result}")
    return result


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    result = asyncio.run(run_retention_cleanup())
    print(result)
