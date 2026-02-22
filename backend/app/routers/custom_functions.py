from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from database import get_supabase

router = APIRouter()


class FunctionCreate(BaseModel):
    name: str
    description: Optional[str] = None
    parameters: Optional[dict] = {}
    webhook_url: Optional[str] = None
    method: Optional[str] = "POST"
    headers: Optional[dict] = None
    is_active: Optional[bool] = True


class FunctionUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    parameters: Optional[dict] = None
    webhook_url: Optional[str] = None
    method: Optional[str] = None
    headers: Optional[dict] = None
    is_active: Optional[bool] = None


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
    result = db.table("custom_functions").insert(data).execute()
    return result.data[0]


@router.put("/{function_id}")
async def update_function(function_id: str, func: FunctionUpdate):
    db = get_supabase()
    data = func.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")
    data["updated_at"] = "now()"
    result = db.table("custom_functions").update(data).eq("id", function_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Function not found")
    return result.data[0]


@router.delete("/{function_id}")
async def delete_function(function_id: str):
    db = get_supabase()
    db.table("custom_functions").delete().eq("id", function_id).execute()
    return {"deleted": True}
