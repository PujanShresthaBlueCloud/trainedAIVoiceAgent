from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.database import get_supabase
from app.pii import mask_phone_number

router = APIRouter()


def _mask_call(call: dict) -> dict:
    """Mask PII fields in a call record before returning."""
    if call.get("caller_number"):
        call["caller_number"] = mask_phone_number(call["caller_number"])
    return call


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
    return [_mask_call(c) for c in result.data]


@router.get("/{call_id}")
async def get_call(call_id: str):
    db = get_supabase()
    result = db.table("calls").select("*, agents(name)").eq("id", call_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Call not found")
    return _mask_call(result.data[0])


@router.get("/{call_id}/transcript")
async def get_transcript(call_id: str):
    db = get_supabase()

    transcript = (
        db.table("transcript_entries")
        .select("*")
        .eq("call_id", call_id)
        .order("timestamp", desc=False)
        .execute()
    ).data or []

    tool_calls = (
        db.table("function_call_logs")
        .select("*")
        .eq("call_id", call_id)
        .order("executed_at", desc=False)
        .execute()
    ).data or []

    # Normalize tool calls into the same shape as transcript entries
    tool_items = [
        {
            "role": "tool",
            "content": tc.get("function_name", ""),
            "arguments": tc.get("arguments"),
            "result": tc.get("result"),
            "status": tc.get("status", "completed"),
            "error_message": tc.get("error_message"),
            "timestamp": tc.get("executed_at"),
        }
        for tc in tool_calls
    ]

    # Merge and sort by timestamp
    merged = transcript + tool_items
    merged.sort(key=lambda x: x.get("timestamp") or "")

    return merged


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
