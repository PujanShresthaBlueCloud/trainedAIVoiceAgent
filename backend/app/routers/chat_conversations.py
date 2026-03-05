from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.database import get_supabase

router = APIRouter()


class CreateConversationRequest(BaseModel):
    agent_id: str | None = None
    title: str | None = None


class AddMessageRequest(BaseModel):
    role: str
    content: str


@router.get("")
async def list_conversations():
    db = get_supabase()
    result = (
        db.table("chat_conversations")
        .select("*, agents(name)")
        .order("updated_at", desc=True)
        .limit(100)
        .execute()
    )
    return result.data


@router.get("/{conversation_id}")
async def get_conversation(conversation_id: str):
    db = get_supabase()
    result = (
        db.table("chat_conversations")
        .select("*, agents(name)")
        .eq("id", conversation_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return result.data[0]


@router.get("/{conversation_id}/messages")
async def get_messages(conversation_id: str):
    db = get_supabase()
    result = (
        db.table("chat_messages")
        .select("*")
        .eq("conversation_id", conversation_id)
        .order("created_at", desc=False)
        .execute()
    )
    return result.data


@router.post("")
async def create_conversation(req: CreateConversationRequest):
    db = get_supabase()
    data: dict = {}
    if req.agent_id:
        data["agent_id"] = req.agent_id
    if req.title:
        data["title"] = req.title
    result = db.table("chat_conversations").insert(data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create conversation")
    return result.data[0]


@router.post("/{conversation_id}/messages")
async def add_message(conversation_id: str, req: AddMessageRequest):
    db = get_supabase()
    msg_result = (
        db.table("chat_messages")
        .insert({
            "conversation_id": conversation_id,
            "role": req.role,
            "content": req.content,
        })
        .execute()
    )
    if not msg_result.data:
        raise HTTPException(status_code=500, detail="Failed to add message")

    # Update conversation message_count and updated_at
    conv = (
        db.table("chat_conversations")
        .select("message_count")
        .eq("id", conversation_id)
        .execute()
    )
    current_count = conv.data[0]["message_count"] if conv.data else 0
    db.table("chat_conversations").update({
        "message_count": current_count + 1,
        "updated_at": "now()",
    }).eq("id", conversation_id).execute()

    return msg_result.data[0]


@router.delete("/{conversation_id}")
async def delete_conversation(conversation_id: str):
    db = get_supabase()
    db.table("chat_conversations").delete().eq("id", conversation_id).execute()
    return {"deleted": True}
