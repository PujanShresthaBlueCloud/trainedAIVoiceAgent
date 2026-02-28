from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import httpx
from app.database import get_supabase

router = APIRouter()


class FunctionCreate(BaseModel):
    name: str
    description: Optional[str] = None
    parameters: Optional[dict] = {}
    webhook_url: Optional[str] = None
    method: Optional[str] = "POST"
    headers: Optional[dict] = None
    is_active: Optional[bool] = True
    timeout_seconds: Optional[int] = 30
    retry_count: Optional[int] = 0
    response_mapping: Optional[dict] = None
    speak_during_execution: Optional[str] = None
    speak_on_failure: Optional[str] = None
    query_params: Optional[dict] = None
    payload_mode: Optional[str] = None
    store_variables: Optional[dict] = None


class FunctionUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    parameters: Optional[dict] = None
    webhook_url: Optional[str] = None
    method: Optional[str] = None
    headers: Optional[dict] = None
    is_active: Optional[bool] = None
    timeout_seconds: Optional[int] = None
    retry_count: Optional[int] = None
    response_mapping: Optional[dict] = None
    speak_during_execution: Optional[str] = None
    speak_on_failure: Optional[str] = None
    query_params: Optional[dict] = None
    payload_mode: Optional[str] = None
    store_variables: Optional[dict] = None


# Base columns from the CREATE TABLE statement (always exist)
_BASE_COLUMNS = {
    "id", "name", "description", "parameters", "webhook_url", "method",
    "headers", "is_active", "created_at", "updated_at",
}


def _strip_to_base_columns(data: dict) -> dict:
    """Keep only columns guaranteed to exist in the DB."""
    return {k: v for k, v in data.items() if k in _BASE_COLUMNS}


@router.get("")
async def list_functions():
    db = get_supabase()
    result = db.table("custom_functions").select("*").order("created_at", desc=True).execute()
    return result.data


@router.get("/{function_id}")
async def get_function(function_id: str):
    db = get_supabase()
    result = db.table("custom_functions").select("*").eq("id", function_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Function not found")
    return result.data[0]


@router.post("")
async def create_function(func: FunctionCreate):
    db = get_supabase()
    data = func.model_dump(exclude_none=True)
    try:
        result = db.table("custom_functions").insert(data).execute()
    except Exception as e:
        if "PGRST204" in str(e):
            data = _strip_to_base_columns(data)
            result = db.table("custom_functions").insert(data).execute()
        else:
            raise
    return result.data[0]


@router.put("/{function_id}")
async def update_function(function_id: str, func: FunctionUpdate):
    db = get_supabase()
    data = func.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")
    data["updated_at"] = "now()"
    try:
        result = db.table("custom_functions").update(data).eq("id", function_id).execute()
    except Exception as e:
        if "PGRST204" in str(e):
            data = _strip_to_base_columns(data)
            data["updated_at"] = "now()"
            result = db.table("custom_functions").update(data).eq("id", function_id).execute()
        else:
            raise
    if not result.data:
        raise HTTPException(status_code=404, detail="Function not found")
    return result.data[0]


@router.delete("/{function_id}")
async def delete_function(function_id: str):
    db = get_supabase()
    db.table("custom_functions").delete().eq("id", function_id).execute()
    return {"deleted": True}


@router.post("/{function_id}/test")
async def test_function(function_id: str):
    db = get_supabase()
    result = db.table("custom_functions").select("*").eq("id", function_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Function not found")

    func = result.data[0]
    url = func.get("webhook_url")
    if not url:
        return {"success": False, "error": "No webhook URL configured"}

    method = func.get("method", "POST").upper()
    headers = func.get("headers") or {}
    headers.setdefault("Content-Type", "application/json")
    timeout = func.get("timeout_seconds", 30)

    test_payload = {"_test": True, "_function_name": func["name"]}

    try:
        async with httpx.AsyncClient(timeout=float(timeout)) as client:
            if method == "GET":
                resp = await client.get(url, params=test_payload, headers=headers)
            else:
                resp = await client.request(method, url, json=test_payload, headers=headers)

        try:
            body = resp.json()
        except Exception:
            body = resp.text

        return {
            "success": resp.status_code < 400,
            "status_code": resp.status_code,
            "response": body,
            "duration_ms": resp.elapsed.total_seconds() * 1000 if resp.elapsed else None,
        }
    except httpx.TimeoutException:
        return {"success": False, "error": f"Timeout after {timeout}s"}
    except Exception as e:
        return {"success": False, "error": str(e)}
