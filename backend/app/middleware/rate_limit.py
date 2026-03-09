"""Per-user/IP sliding window rate limiting middleware."""

import time
from collections import defaultdict

from starlette.types import ASGIApp, Scope, Receive, Send

from app.config import settings


class RateLimitMiddleware:
    def __init__(self, app: ASGIApp):
        self.app = app
        self._requests: dict[str, list[float]] = defaultdict(list)

    def _get_client_key(self, scope: Scope) -> str:
        """Extract user ID from scope state or fall back to client IP."""
        # Check headers for user info (set by auth)
        headers = dict(scope.get("headers", []))
        # Fall back to client IP
        client = scope.get("client")
        return client[0] if client else "unknown"

    def _is_rate_limited(self, key: str) -> bool:
        now = time.time()
        window = 60.0  # 1 minute window
        limit = settings.RATE_LIMIT_PER_MINUTE

        # Remove expired entries
        timestamps = self._requests[key]
        self._requests[key] = [t for t in timestamps if now - t < window]

        if len(self._requests[key]) >= limit:
            return True

        self._requests[key].append(now)
        return False

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        key = self._get_client_key(scope)

        if self._is_rate_limited(key):
            await send({
                "type": "http.response.start",
                "status": 429,
                "headers": [
                    (b"content-type", b"application/json"),
                    (b"retry-after", b"60"),
                ],
            })
            await send({
                "type": "http.response.body",
                "body": b'{"error": "Rate limit exceeded. Try again later."}',
            })
            return

        await self.app(scope, receive, send)
