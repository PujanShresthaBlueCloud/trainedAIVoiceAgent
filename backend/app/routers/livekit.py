"""LiveKit API routes: token generation, room listing."""
import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.database import get_supabase
from app.services.livekit_service import generate_token, create_room, list_rooms
from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter()


class TokenRequest(BaseModel):
    agent_id: str
    participant_name: str = "user"


@router.post("/token")
async def get_livekit_token(req: TokenRequest):
    """Generate a LiveKit token for a browser participant.

    Creates a call record in Supabase, creates a LiveKit room with metadata,
    and returns the token + room info for the frontend to connect.
    """
    if not settings.LIVEKIT_API_KEY or not settings.LIVEKIT_API_SECRET:
        raise HTTPException(status_code=500, detail="LiveKit not configured")

    db = get_supabase()

    # Create call record
    call_result = db.table("calls").insert({
        "agent_id": req.agent_id,
        "direction": "inbound",
        "status": "in-progress",
    }).execute()

    if not call_result.data:
        raise HTTPException(status_code=500, detail="Failed to create call record")

    call_id = call_result.data[0]["id"]

    # Create room with metadata so the agent worker knows which agent/call to use
    room_name = await create_room(req.agent_id, call_id)

    # Generate participant token for the browser user
    token, _ = generate_token(req.agent_id, req.participant_name)
    # Override room name to match the created room
    from livekit.api import AccessToken, VideoGrants
    import secrets

    token_obj = (
        AccessToken(settings.LIVEKIT_API_KEY, settings.LIVEKIT_API_SECRET)
        .with_identity(f"user-{secrets.token_hex(4)}")
        .with_name(req.participant_name)
        .with_grants(VideoGrants(room_join=True, room=room_name))
    )
    token = token_obj.to_jwt()

    return {
        "token": token,
        "room_name": room_name,
        "livekit_url": settings.LIVEKIT_URL.replace("ws://", "wss://").replace("wss://localhost", "ws://localhost"),
        "call_id": call_id,
    }


@router.get("/rooms")
async def get_rooms():
    """List active LiveKit rooms."""
    if not settings.LIVEKIT_API_KEY or not settings.LIVEKIT_API_SECRET:
        raise HTTPException(status_code=500, detail="LiveKit not configured")

    rooms = await list_rooms()
    return {"rooms": rooms}
