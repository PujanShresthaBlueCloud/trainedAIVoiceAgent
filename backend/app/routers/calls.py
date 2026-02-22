from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from database import get_supabase

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
    from services.twilio_service import make_outbound_call as twilio_call
    result = await twilio_call(req.agent_id, req.to_number)
    return result


@router.delete("/{call_id}")
async def delete_call(call_id: str):
    db = get_supabase()
    db.table("calls").delete().eq("id", call_id).execute()
    return {"deleted": True}
