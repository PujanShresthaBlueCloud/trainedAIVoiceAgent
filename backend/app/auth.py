import base64
import json
import logging
import time
from typing import Any

import httpx
import jwt
from fastapi import HTTPException, Request

from app.config import settings

logger = logging.getLogger(__name__)

_jwks_cache: dict[str, Any] | None = None
_jwks_cache_time: float = 0.0
_JWKS_CACHE_TTL = 6 * 3600  # 6 hours


def _get_clerk_frontend_api() -> str:
    """Extract Clerk frontend API domain from the publishable key."""
    pk = settings.CLERK_PUBLISHABLE_KEY
    if not pk:
        raise RuntimeError("CLERK_PUBLISHABLE_KEY is not set")
    # The publishable key format: pk_test_<base64-encoded-domain>
    # Remove the pk_test_ or pk_live_ prefix
    parts = pk.split("_", 2)
    if len(parts) < 3:
        raise RuntimeError("Invalid CLERK_PUBLISHABLE_KEY format")
    encoded = parts[2]
    # Add padding if needed
    padding = 4 - len(encoded) % 4
    if padding != 4:
        encoded += "=" * padding
    decoded = base64.b64decode(encoded).decode("utf-8")
    # Remove trailing $ if present
    return decoded.rstrip("$")


async def _fetch_jwks() -> dict[str, Any]:
    global _jwks_cache, _jwks_cache_time
    if _jwks_cache is not None and (time.time() - _jwks_cache_time) < _JWKS_CACHE_TTL:
        return _jwks_cache

    domain = _get_clerk_frontend_api()
    jwks_url = f"https://{domain}/.well-known/jwks.json"
    logger.info(f"Fetching JWKS from {jwks_url}")

    async with httpx.AsyncClient() as client:
        resp = await client.get(jwks_url, timeout=10)
        resp.raise_for_status()
        _jwks_cache = resp.json()
        _jwks_cache_time = time.time()
        return _jwks_cache


async def get_current_user(request: Request) -> dict[str, Any]:
    """FastAPI dependency that verifies the Clerk JWT and returns user info."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = auth_header.split(" ", 1)[1]

    try:
        jwks_data = await _fetch_jwks()
        # Get the signing key from JWKS
        unverified_header = jwt.get_unverified_header(token)
        kid = unverified_header.get("kid")

        signing_key = None
        for key in jwks_data.get("keys", []):
            if key.get("kid") == kid:
                signing_key = jwt.algorithms.RSAAlgorithm.from_jwk(json.dumps(key))
                break

        if signing_key is None:
            # Invalidate cache and retry once
            global _jwks_cache, _jwks_cache_time
            _jwks_cache = None
            _jwks_cache_time = 0.0
            jwks_data = await _fetch_jwks()
            for key in jwks_data.get("keys", []):
                if key.get("kid") == kid:
                    signing_key = jwt.algorithms.RSAAlgorithm.from_jwk(json.dumps(key))
                    break

        if signing_key is None:
            raise HTTPException(status_code=401, detail="Unable to find signing key")

        payload = jwt.decode(
            token,
            signing_key,
            algorithms=["RS256"],
            options={"verify_aud": False},
            leeway=30,  # 30s clock skew tolerance
        )

        return {
            "sub": payload.get("sub"),
            "email": payload.get("email"),
        }

    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")
    except httpx.HTTPError as e:
        logger.error(f"Failed to fetch JWKS: {e}")
        raise HTTPException(status_code=401, detail="Failed to verify token")
