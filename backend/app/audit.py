"""Audit logging utility and ASGI middleware for compliance tracking."""

import logging
import uuid
from datetime import datetime, timezone

from starlette.types import ASGIApp, Scope, Receive, Send

from app.config import settings

logger = logging.getLogger(__name__)

# Methods that trigger audit logging
AUDITED_METHODS = {"POST", "PUT", "PATCH", "DELETE"}


async def log_audit_event(
    action: str,
    resource_type: str = "",
    resource_id: str = "",
    user_id: str = "",
    user_email: str = "",
    ip_address: str = "",
    user_agent: str = "",
    request_method: str = "",
    request_path: str = "",
    status_code: int = 0,
    details: str = "",
) -> None:
    """Fire-and-forget insert to audit_logs table."""
    if not settings.AUDIT_LOG_ENABLED:
        return

    try:
        from app.database import get_supabase
        db = get_supabase()
        db.table("audit_logs").insert({
            "id": str(uuid.uuid4()),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "user_id": user_id,
            "user_email": user_email,
            "action": action,
            "resource_type": resource_type,
            "resource_id": resource_id,
            "ip_address": ip_address,
            "user_agent": user_agent,
            "request_method": request_method,
            "request_path": request_path,
            "status_code": status_code,
            "details": details,
        }).execute()
    except Exception as e:
        logger.error(f"Failed to write audit log: {e}")


def _get_header(headers: list[tuple[bytes, bytes]], name: bytes) -> str:
    for key, value in headers:
        if key.lower() == name:
            return value.decode("utf-8", errors="replace")
    return ""


def _extract_user_from_scope(scope: Scope) -> tuple[str, str]:
    """Try to extract user_id and email from scope state (set by auth dependency)."""
    state = scope.get("state", {})
    return state.get("user_id", ""), state.get("user_email", "")


class AuditMiddleware:
    """ASGI middleware that auto-logs POST/PUT/PATCH/DELETE requests."""

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        method = scope.get("method", "GET")
        if method not in AUDITED_METHODS:
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        headers = scope.get("headers", [])
        client = scope.get("client", ("", 0))
        ip_address = client[0] if client else ""
        user_agent = _get_header(headers, b"user-agent")

        captured_status = 0

        async def send_with_audit(message):
            nonlocal captured_status
            if message["type"] == "http.response.start":
                captured_status = message.get("status", 0)
            await send(message)

        await self.app(scope, receive, send_with_audit)

        # After response is sent, log the event
        # Extract resource info from path
        parts = [p for p in path.split("/") if p]
        resource_type = parts[1] if len(parts) > 1 else ""
        resource_id = parts[2] if len(parts) > 2 else ""

        action = f"{method} {path}"

        try:
            await log_audit_event(
                action=action,
                resource_type=resource_type,
                resource_id=resource_id,
                ip_address=ip_address,
                user_agent=user_agent,
                request_method=method,
                request_path=path,
                status_code=captured_status,
            )
        except Exception as e:
            logger.error(f"Audit middleware error: {e}")
