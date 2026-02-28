from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.database import get_supabase
from app.config import settings
from app.services.ngrok_service import get_public_url
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
    if not settings.TWILIO_ACCOUNT_SID or not settings.TWILIO_AUTH_TOKEN:
        raise HTTPException(status_code=400, detail="Twilio credentials not configured")

    db = get_supabase()
    result = db.table("phone_numbers").select("phone_number").eq("id", phone_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Phone number not found")

    phone_number = result.data[0]["phone_number"]
    public_url = get_public_url()

    from twilio.rest import Client
    client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)

    numbers = client.incoming_phone_numbers.list(phone_number=phone_number)
    if not numbers:
        raise HTTPException(status_code=404, detail="Phone number not found in Twilio")

    numbers[0].update(
        voice_url=f"{public_url}/api/twilio/incoming",
        voice_method="POST",
        status_callback=f"{public_url}/api/twilio/status",
        status_callback_method="POST",
    )

    return {
        "configured": True,
        "phone_number": phone_number,
        "voice_url": f"{public_url}/api/twilio/incoming",
        "status_callback": f"{public_url}/api/twilio/status",
    }
