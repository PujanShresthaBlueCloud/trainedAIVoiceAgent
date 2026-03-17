"""LiveKit service: token generation, room creation, SIP participant."""
import json
import logging
import secrets
from livekit.api import AccessToken, VideoGrants, LiveKitAPI, CreateRoomRequest, SIPParticipantInfo

from app.config import settings

logger = logging.getLogger(__name__)


def _api_url() -> str:
    """Convert ws(s):// URL to http(s):// for API calls."""
    url = settings.LIVEKIT_URL
    if url.startswith("wss://"):
        return url.replace("wss://", "https://")
    if url.startswith("ws://"):
        return url.replace("ws://", "http://")
    return url


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
        url=_api_url(),
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
        url=_api_url(),
        api_key=settings.LIVEKIT_API_KEY,
        api_secret=settings.LIVEKIT_API_SECRET,
    ) as api:
        from livekit.api import CreateSIPParticipantRequest

        await api.sip.create_sip_participant(
            CreateSIPParticipantRequest(
                sip_trunk_id=settings.LIVEKIT_TRUNK_ID,
                sip_call_to=phone_number,
                room_name=room_name,
                participant_identity=f"phone-{phone_number}",
                participant_name=phone_number,
            )
        )

    logger.info(f"SIP participant created: {phone_number} in room {room_name}")


async def transfer_sip_participant(room_name: str, participant_identity: str, transfer_to: str, play_dialtone: bool = True) -> None:
    """Transfer a SIP call participant to a new phone number/SIP URI."""
    async with LiveKitAPI(
        url=_api_url(),
        api_key=settings.LIVEKIT_API_KEY,
        api_secret=settings.LIVEKIT_API_SECRET,
    ) as api:
        from livekit.api import TransferSIPParticipantRequest
        await api.sip.transfer_sip_participant(
            TransferSIPParticipantRequest(
                room_name=room_name,
                participant_identity=participant_identity,
                transfer_to=f"tel:{transfer_to}" if not transfer_to.startswith("tel:") else transfer_to,
                play_dialtone=play_dialtone,
            )
        )
    logger.info(f"SIP transfer: {participant_identity} → {transfer_to} in room {room_name}")


async def create_sip_participant_with_headers(
    room_name: str,
    phone_number: str,
    identity: str = "",
    sip_headers: dict | None = None,
) -> None:
    """Dial out to a phone number and add them to the room, with optional SIP headers."""
    async with LiveKitAPI(
        url=_api_url(),
        api_key=settings.LIVEKIT_API_KEY,
        api_secret=settings.LIVEKIT_API_SECRET,
    ) as api:
        from livekit.api import CreateSIPParticipantRequest
        req = CreateSIPParticipantRequest(
            sip_trunk_id=settings.LIVEKIT_TRUNK_ID,
            sip_call_to=phone_number,
            room_name=room_name,
            participant_identity=identity or f"transfer-{phone_number}",
            participant_name="Human Agent",
        )
        if sip_headers:
            req.sip_headers.update(sip_headers)
        await api.sip.create_sip_participant(req)
    logger.info(f"Warm transfer SIP participant created: {phone_number} in room {room_name}")


async def list_rooms() -> list[dict]:
    """List active LiveKit rooms."""
    async with LiveKitAPI(
        url=_api_url(),
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
