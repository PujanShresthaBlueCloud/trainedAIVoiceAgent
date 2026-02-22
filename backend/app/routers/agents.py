from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from database import get_supabase

router = APIRouter()


class AgentCreate(BaseModel):
    name: str
    description: Optional[str] = None
    system_prompt: Optional[str] = "You are a helpful voice AI assistant."
    voice_id: Optional[str] = "21m00Tcm4TlvDq8ikWAM"
    language: Optional[str] = "en-US"
    llm_model: Optional[str] = "gpt-4"
    tools_enabled: Optional[list] = []
    is_active: Optional[bool] = True
    metadata: Optional[dict] = None


class AgentUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    system_prompt: Optional[str] = None
    voice_id: Optional[str] = None
    language: Optional[str] = None
    llm_model: Optional[str] = None
    tools_enabled: Optional[list] = None
    is_active: Optional[bool] = None
    metadata: Optional[dict] = None


@router.get("")
async def list_agents():
    db = get_supabase()
    result = db.table("agents").select("*").order("created_at", desc=True).execute()
    return result.data


@router.get("/{agent_id}")
async def get_agent(agent_id: str):
    db = get_supabase()
    result = db.table("agents").select("*").eq("id", agent_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Agent not found")
    return result.data[0]


@router.post("")
async def create_agent(agent: AgentCreate):
    db = get_supabase()
    data = agent.model_dump(exclude_none=True)
    result = db.table("agents").insert(data).execute()
    return result.data[0]


@router.put("/{agent_id}")
async def update_agent(agent_id: str, agent: AgentUpdate):
    db = get_supabase()
    data = agent.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")
    data["updated_at"] = "now()"
    result = db.table("agents").update(data).eq("id", agent_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Agent not found")
    return result.data[0]


@router.delete("/{agent_id}")
async def delete_agent(agent_id: str):
    db = get_supabase()
    db.table("agents").delete().eq("id", agent_id).execute()
    return {"deleted": True}
