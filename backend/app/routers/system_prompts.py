from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.database import get_supabase

router = APIRouter()


class SystemPromptCreate(BaseModel):
    name: str
    description: Optional[str] = None
    content: str
    variables: Optional[dict] = None
    category: Optional[str] = None
    is_default: Optional[bool] = False


class SystemPromptUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    content: Optional[str] = None
    variables: Optional[dict] = None
    category: Optional[str] = None
    is_default: Optional[bool] = None


@router.get("")
async def list_prompts():
    db = get_supabase()
    result = db.table("system_prompts").select("*").order("created_at", desc=True).execute()
    return result.data


@router.get("/{prompt_id}")
async def get_prompt(prompt_id: str):
    db = get_supabase()
    result = db.table("system_prompts").select("*").eq("id", prompt_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="System prompt not found")
    return result.data[0]


@router.post("")
async def create_prompt(prompt: SystemPromptCreate):
    db = get_supabase()
    data = prompt.model_dump(exclude_none=True)
    result = db.table("system_prompts").insert(data).execute()
    return result.data[0]


@router.put("/{prompt_id}")
async def update_prompt(prompt_id: str, prompt: SystemPromptUpdate):
    db = get_supabase()
    data = prompt.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")
    data["updated_at"] = "now()"
    result = db.table("system_prompts").update(data).eq("id", prompt_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="System prompt not found")
    return result.data[0]


@router.delete("/{prompt_id}")
async def delete_prompt(prompt_id: str):
    db = get_supabase()
    db.table("system_prompts").delete().eq("id", prompt_id).execute()
    return {"deleted": True}
