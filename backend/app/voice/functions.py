"""Tool/function execution handlers."""
import asyncio
import logging
import httpx
from app.database import get_supabase

logger = logging.getLogger(__name__)


async def execute_tool(call_id: str | None, function_name: str, arguments: dict, call_context: dict | None = None) -> dict:
    db = get_supabase()
    log_data = {"function_name": function_name, "arguments": arguments, "status": "executing"}
    if call_id:
        log_data["call_id"] = call_id
    log_result = db.table("function_call_logs").insert(log_data).execute()
    log_id = log_result.data[0]["id"] if log_result.data else None

    try:
        result = await _run_function(function_name, arguments, call_context)
        if log_id:
            db.table("function_call_logs").update({"result": result, "status": "completed"}).eq("id", log_id).execute()
        return result
    except Exception as e:
        logger.error(f"Tool execution error: {function_name}: {e}")
        if log_id:
            db.table("function_call_logs").update({"status": "failed", "error_message": str(e)}).eq("id", log_id).execute()
        return {"error": str(e)}


async def _run_function(name: str, args: dict, call_context: dict | None = None) -> dict:
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
        return await _call_webhook(func_result.data[0], args, call_context)

    return {"error": f"Unknown function: {name}"}


def _apply_response_mapping(data: dict, mapping: dict) -> dict:
    """Extract fields from response using dot-notation paths like $.data.status"""
    extracted = {}
    for key, path in mapping.items():
        if not isinstance(path, str):
            continue
        parts = path.lstrip("$").lstrip(".").split(".")
        current = data
        try:
            for part in parts:
                if isinstance(current, dict):
                    current = current[part]
                elif isinstance(current, list) and part.isdigit():
                    current = current[int(part)]
                else:
                    current = None
                    break
            extracted[key] = current
        except (KeyError, IndexError, TypeError):
            extracted[key] = None
    return extracted


async def _call_webhook(func: dict, args: dict, call_context: dict | None = None) -> dict:
    url = func.get("webhook_url")
    if not url:
        return {"error": "No webhook URL configured"}

    method = func.get("method", "POST").upper()
    headers = func.get("headers") or {}
    headers.setdefault("Content-Type", "application/json")
    timeout = func.get("timeout_seconds", 30)
    retries = func.get("retry_count", 0)
    response_mapping = func.get("response_mapping")
    speak_on_failure = func.get("speak_on_failure")

    # Inject call context into request body
    body = {**args}
    if call_context:
        body["_call_context"] = call_context

    last_error = None
    for attempt in range(retries + 1):
        try:
            async with httpx.AsyncClient(timeout=float(timeout)) as client:
                if method == "GET":
                    resp = await client.get(url, params=args, headers=headers)
                else:
                    resp = await client.request(method, url, json=body, headers=headers)

                if resp.status_code < 400:
                    try:
                        data = resp.json()
                    except Exception:
                        data = {"response": resp.text}

                    # Apply response mapping if configured
                    if response_mapping and isinstance(data, dict):
                        mapped = _apply_response_mapping(data, response_mapping)
                        data = {"_raw": data, **mapped}

                    return data if isinstance(data, dict) else {"response": data}

                last_error = f"Webhook returned {resp.status_code}: {resp.text[:200]}"
        except httpx.TimeoutException:
            last_error = f"Timeout after {timeout}s"
        except Exception as e:
            last_error = str(e)

        if attempt < retries:
            await asyncio.sleep(1.0 * (attempt + 1))

    result = {"error": last_error}
    if speak_on_failure:
        result["_speak_on_failure"] = speak_on_failure
    return result
