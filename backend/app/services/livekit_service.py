"""LiveKit service: token generation, room creation, SIP participant."""
import json
import logging
import secrets
from livekit.api import AccessToken, VideoGrants, LiveKitAPI, CreateRoomRequest, SIPParticipantInfo

from app.config import settings

logger = logging.getLogger(__name__)


def generate_token(agent_id: str, participant_name: str = "user") -> tuple[str, str]:
    """Generate a LiveKit JWT token for a participant joining an agent room.

    Returns (token, room_name).
    """
    room_name = f"agent-{agent_id}-{secrets.token_hex(4)}"

    token = (
        AccessToken(settings.LIVEKIT_API_KEY, settings.LIVEKIT_API_SECRET)
        .with_identity(f"user-{secrets.token_hex(4)}")
        .with_name(participant_name)
        .with_grants(VideoGrants(room_join=True, room=room_name))
    )

    return token.to_jwt(), room_name


async def create_room(agent_id: str, call_id: str) -> str:
    """Create a LiveKit room with agent metadata. Returns room_name."""
    room_name = f"agent-{agent_id}-{secrets.token_hex(4)}"
    metadata = json.dumps({"agent_id": agent_id, "call_id": call_id})

    async with LiveKitAPI(
        url=settings.LIVEKIT_URL,
        api_key=settings.LIVEKIT_API_KEY,
        api_secret=settings.LIVEKIT_API_SECRET,
    ) as api:
        await api.room.create_room(
            CreateRoomRequest(name=room_name, metadata=metadata, empty_timeout=300)
        )

    logger.info(f"Created LiveKit room: {room_name}")
    return room_name


async def create_sip_participant(room_name: str, phone_number: str, agent_id: str):
    """Dial out to a phone number via LiveKit SIP and add them to the room."""
    async with LiveKitAPI(
        url=settings.LIVEKIT_URL,
        api_key=settings.LIVEKIT_API_KEY,
        api_secret=settings.LIVEKIT_API_SECRET,
    ) as api:
        from livekit.api import CreateSIPParticipantRequest

        await api.sip.create_sip_participant(
            CreateSIPParticipantRequest(
                sip_trunk_id="",  # configure via LiveKit SIP trunk settings
                sip_call_to=phone_number,
                room_name=room_name,
                participant_identity=f"phone-{phone_number}",
                participant_name=phone_number,
            )
        )

    logger.info(f"SIP participant created: {phone_number} in room {room_name}")


async def list_rooms() -> list[dict]:
    """List active LiveKit rooms."""
    async with LiveKitAPI(
        url=settings.LIVEKIT_URL,
        api_key=settings.LIVEKIT_API_KEY,
        api_secret=settings.LIVEKIT_API_SECRET,
    ) as api:
        from livekit.api import ListRoomsRequest

        response = await api.room.list_rooms(ListRoomsRequest())
        return [
            {
                "name": room.name,
                "num_participants": room.num_participants,
                "metadata": room.metadata,
                "creation_time": room.creation_time,
            }
            for room in response.rooms
        ]
