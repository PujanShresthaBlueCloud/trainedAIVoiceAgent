from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.database import get_supabase
from app.config import settings
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


class UpdatePhoneNumber(BaseModel):
    agent_id: str | None = None
    friendly_name: str | None = None
    is_active: bool | None = None


@router.get("")
async def list_phone_numbers():
    db = get_supabase()
    result = (
        db.table("phone_numbers")
        .select("*, agents(id, name)")
        .order("created_at", desc=False)
        .execute()
    )
    return result.data


@router.post("/sync")
async def sync_phone_numbers():
    if not settings.TWILIO_ACCOUNT_SID or not settings.TWILIO_AUTH_TOKEN:
        raise HTTPException(status_code=400, detail="Twilio credentials not configured")

    from twilio.rest import Client
    client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)

    incoming_numbers = client.incoming_phone_numbers.list()
    db = get_supabase()
    synced = []

    for number in incoming_numbers:
        existing = (
            db.table("phone_numbers")
            .select("id")
            .eq("phone_number", number.phone_number)
            .execute()
        )
        if existing.data:
            db.table("phone_numbers").update({
                "friendly_name": number.friendly_name,
                "updated_at": "now()",
            }).eq("phone_number", number.phone_number).execute()
            synced.append({"phone_number": number.phone_number, "action": "updated"})
        else:
            db.table("phone_numbers").insert({
                "phone_number": number.phone_number,
                "friendly_name": number.friendly_name,
            }).execute()
            synced.append({"phone_number": number.phone_number, "action": "created"})

    return {"synced": synced, "count": len(synced)}


@router.put("/{phone_id}")
async def update_phone_number(phone_id: str, data: UpdatePhoneNumber):
    db = get_supabase()
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    update["updated_at"] = "now()"
    result = db.table("phone_numbers").update(update).eq("id", phone_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Phone number not found")
    return result.data[0]


@router.post("/{phone_id}/configure")
async def configure_phone_number(phone_id: str):
    """Configure a phone number for inbound calls via LiveKit SIP.

    Note: With LiveKit SIP, inbound call routing is configured via SIP trunk
    settings in the LiveKit server, not via Twilio webhook URLs. This endpoint
    now just returns the current phone number configuration status.
    """
    db = get_supabase()
    result = db.table("phone_numbers").select("*").eq("id", phone_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Phone number not found")

    phone = result.data[0]
    return {
        "configured": True,
        "phone_number": phone["phone_number"],
        "note": "Inbound routing is handled by LiveKit SIP trunk configuration. Assign an agent_id to this phone number to route calls.",
        "agent_id": phone.get("agent_id"),
    }
