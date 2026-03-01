from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.database import get_supabase

router = APIRouter()


class OutboundCallRequest(BaseModel):
    agent_id: str
    to_number: str


@router.get("")
async def list_calls():
    db = get_supabase()
    result = (
        db.table("calls")
        .select("*, agents(name)")
        .order("started_at", desc=True)
        .limit(100)
        .execute()
    )
    return result.data


@router.get("/{call_id}")
async def get_call(call_id: str):
    db = get_supabase()
    result = db.table("calls").select("*, agents(name)").eq("id", call_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Call not found")
    return result.data[0]


@router.get("/{call_id}/transcript")
async def get_transcript(call_id: str):
    db = get_supabase()
    result = (
        db.table("transcript_entries")
        .select("*")
        .eq("call_id", call_id)
        .order("timestamp", desc=False)
        .execute()
    )
    return result.data


@router.post("/outbound")
async def make_outbound_call(req: OutboundCallRequest):
    from app.services.livekit_service import create_room, create_sip_participant

    db = get_supabase()

    # Create call record
    call_result = db.table("calls").insert({
        "agent_id": req.agent_id,
        "direction": "outbound",
        "caller_number": req.to_number,
        "status": "queued",
    }).execute()

    if not call_result.data:
        raise HTTPException(status_code=500, detail="Failed to create call record")

    call_id = call_result.data[0]["id"]

    # Create LiveKit room with agent metadata
    room_name = await create_room(req.agent_id, call_id)

    # Dial out via LiveKit SIP
    await create_sip_participant(room_name, req.to_number, req.agent_id)

    return {"call_id": call_id, "room_name": room_name, "status": "queued"}


@router.delete("/{call_id}")
async def delete_call(call_id: str):
    db = get_supabase()
    db.table("calls").delete().eq("id", call_id).execute()
    return {"deleted": True}
