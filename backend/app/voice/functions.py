"""Tool/function execution handlers."""
import logging
import httpx
from app.database import get_supabase

logger = logging.getLogger(__name__)


async def execute_tool(call_id: str | None, function_name: str, arguments: dict) -> dict:
    db = get_supabase()
    log_data = {"function_name": function_name, "arguments": arguments, "status": "executing"}
    if call_id:
        log_data["call_id"] = call_id
    log_result = db.table("function_call_logs").insert(log_data).execute()
    log_id = log_result.data[0]["id"] if log_result.data else None

    try:
        result = await _run_function(function_name, arguments)
        if log_id:
            db.table("function_call_logs").update({"result": result, "status": "completed"}).eq("id", log_id).execute()
        return result
    except Exception as e:
        logger.error(f"Tool execution error: {function_name}: {e}")
        if log_id:
            db.table("function_call_logs").update({"status": "failed", "error_message": str(e)}).eq("id", log_id).execute()
        return {"error": str(e)}


async def _run_function(name: str, args: dict) -> dict:
    if name == "end_call":
        return {"action": "end_call", "reason": args.get("reason", "completed")}
    if name == "transfer_call":
        return {"action": "transfer_call", "to": args.get("to_number", ""), "department": args.get("department", "")}
    if name == "check_availability":
        return {"available": True, "date": args.get("date"), "slots": ["09:00", "10:00", "14:00", "15:00"]}
    if name == "book_appointment":
        return {"booked": True, "confirmation": f"Appointment for {args.get('name')} on {args.get('date')} at {args.get('time')}"}

    # Check custom functions
    db = get_supabase()
    func_result = db.table("custom_functions").select("*").eq("name", name).eq("is_active", True).execute()
    if func_result.data:
        return await _call_webhook(func_result.data[0], args)

    return {"error": f"Unknown function: {name}"}


async def _call_webhook(func: dict, args: dict) -> dict:
    url = func.get("webhook_url")
    if not url:
        return {"error": "No webhook URL configured"}

    method = func.get("method", "POST").upper()
    headers = func.get("headers") or {}
    headers.setdefault("Content-Type", "application/json")

    async with httpx.AsyncClient(timeout=30.0) as client:
        if method == "GET":
            resp = await client.get(url, params=args, headers=headers)
        else:
            resp = await client.request(method, url, json=args, headers=headers)

        if resp.status_code < 400:
            try:
                return resp.json()
            except Exception:
                return {"response": resp.text}
        return {"error": f"Webhook returned {resp.status_code}: {resp.text[:200]}"}
