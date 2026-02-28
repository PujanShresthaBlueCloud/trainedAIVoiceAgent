from fastapi import APIRouter, Request, Response
from fastapi.responses import PlainTextResponse
from app.database import get_supabase
from app.services.ngrok_service import get_public_url

router = APIRouter()


def twiml_response(twiml: str) -> Response:
    return Response(content=twiml, media_type="application/xml")


@router.post("/incoming")
async def incoming_call(request: Request):
    form = await request.form()
    call_sid = form.get("CallSid", "")
    caller = form.get("From", "")
    to_number = form.get("To", "")

    db = get_supabase()

    # Per-number agent routing: look up the called number
    agent_id = None
    if to_number:
        pn_result = (
            db.table("phone_numbers")
            .select("agent_id")
            .eq("phone_number", to_number)
            .eq("is_active", True)
            .execute()
        )
        if pn_result.data and pn_result.data[0].get("agent_id"):
            agent_id = pn_result.data[0]["agent_id"]

    # Fallback: first active agent
    if not agent_id:
        agents = db.table("agents").select("id").eq("is_active", True).limit(1).execute()
        agent_id = agents.data[0]["id"] if agents.data else None

    db.table("calls").insert({
        "agent_id": agent_id,
        "direction": "inbound",
        "caller_number": caller,
        "twilio_call_sid": call_sid,
        "status": "ringing",
    }).execute()

    public_url = get_public_url()
    ws_url = public_url.replace("https", "wss").replace("http", "ws") + "/ws/voice-twilio"

    twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Connect>
        <Stream url="{ws_url}">
            <Parameter name="callSid" value="{call_sid}" />
        </Stream>
    </Connect>
</Response>"""
    return twiml_response(twiml)


@router.post("/outbound-connect")
async def outbound_connect(request: Request):
    form = await request.form()
    call_sid = form.get("CallSid", "")

    public_url = get_public_url()
    ws_url = public_url.replace("https", "wss").replace("http", "ws") + "/ws/voice-twilio"

    twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Connect>
        <Stream url="{ws_url}">
            <Parameter name="callSid" value="{call_sid}" />
        </Stream>
    </Connect>
</Response>"""
    return twiml_response(twiml)


@router.post("/status")
async def call_status(request: Request):
    form = await request.form()
    call_sid = form.get("CallSid", "")
    call_status = form.get("CallStatus", "")
    duration = form.get("CallDuration")

    db = get_supabase()
    update_data = {"status": call_status}
    if duration:
        update_data["duration_seconds"] = int(duration)
    if call_status in ("completed", "failed", "busy", "no-answer", "canceled"):
        update_data["ended_at"] = "now()"
        update_data["end_reason"] = call_status

    db.table("calls").update(update_data).eq("twilio_call_sid", call_sid).execute()
    return PlainTextResponse("OK")
