import logging
from twilio.rest import Client
from config import settings
from database import get_supabase

logger = logging.getLogger(__name__)


def get_twilio_client() -> Client:
    return Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)


async def make_outbound_call(agent_id: str, to_number: str) -> dict:
    client = get_twilio_client()
    db = get_supabase()

    agent_result = db.table("agents").select("*").eq("id", agent_id).execute()
    if not agent_result.data:
        raise ValueError(f"Agent {agent_id} not found")

    call = client.calls.create(
        to=to_number,
        from_=settings.TWILIO_PHONE_NUMBER,
        url=f"{settings.APP_URL}/api/twilio/outbound-connect",
        status_callback=f"{settings.APP_URL}/api/twilio/status",
        status_callback_event=["initiated", "ringing", "answered", "completed"],
    )

    call_record = db.table("calls").insert({
        "agent_id": agent_id,
        "direction": "outbound",
        "caller_number": to_number,
        "twilio_call_sid": call.sid,
        "status": "initiated",
    }).execute()

    return {"call_id": call_record.data[0]["id"], "twilio_call_sid": call.sid, "status": "initiated"}
