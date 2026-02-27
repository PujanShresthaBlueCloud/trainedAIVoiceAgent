"""Knowledge base CRUD + file management router."""
from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import Optional
import logging
from app.database import get_supabase

router = APIRouter()
logger = logging.getLogger(__name__)

ALLOWED_FILE_TYPES = {".pdf", ".txt", ".docx", ".csv"}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB


class KBCreate(BaseModel):
    name: str
    description: Optional[str] = None
    provider: str = "pinecone"
    config: Optional[dict] = {}
    is_active: Optional[bool] = True


class KBUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    provider: Optional[str] = None
    config: Optional[dict] = None
    is_active: Optional[bool] = None


@router.get("")
async def list_knowledge_bases():
    db = get_supabase()
    try:
        result = db.table("knowledge_bases").select("*").order("created_at", desc=True).execute()
    except Exception as e:
        logger.warning(f"knowledge_bases table may not exist yet: {e}")
        return []

    # Attach file counts
    kbs = result.data or []
    for kb in kbs:
        try:
            files_result = db.table("knowledge_base_files").select("id", count="exact").eq("knowledge_base_id", kb["id"]).execute()
            kb["file_count"] = files_result.count if hasattr(files_result, "count") and files_result.count is not None else len(files_result.data or [])
        except Exception:
            kb["file_count"] = 0

    return kbs


@router.get("/{kb_id}")
async def get_knowledge_base(kb_id: str):
    db = get_supabase()
    result = db.table("knowledge_bases").select("*").eq("id", kb_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    return result.data[0]


@router.post("")
async def create_knowledge_base(kb: KBCreate):
    db = get_supabase()
    data = kb.model_dump(exclude_none=True)
    result = db.table("knowledge_bases").insert(data).execute()
    return result.data[0]


@router.put("/{kb_id}")
async def update_knowledge_base(kb_id: str, kb: KBUpdate):
    db = get_supabase()
    data = kb.model_dump(exclude_none=True)
    if not data:
        raise HTTPException(status_code=400, detail="No fields to update")
    data["updated_at"] = "now()"
    result = db.table("knowledge_bases").update(data).eq("id", kb_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    return result.data[0]


@router.delete("/{kb_id}")
async def delete_knowledge_base(kb_id: str):
    db = get_supabase()

    # Get KB config for vector cleanup
    kb_result = db.table("knowledge_bases").select("*").eq("id", kb_id).execute()
    if kb_result.data:
        kb = kb_result.data[0]
        try:
            from app.services.vector_db import get_provider
            provider = get_provider(kb["provider"], kb.get("config", {}))
            namespace = kb.get("config", {}).get("namespace")
            await provider.delete(delete_all=True, namespace=namespace)
            logger.info(f"Cleaned up vectors for KB {kb_id}")
        except Exception as e:
            logger.error(f"Failed to clean up vectors for KB {kb_id}: {e}")

    db.table("knowledge_base_files").delete().eq("knowledge_base_id", kb_id).execute()
    db.table("knowledge_bases").delete().eq("id", kb_id).execute()
    return {"deleted": True}


# --- File management ---

@router.get("/{kb_id}/files")
async def list_files(kb_id: str):
    db = get_supabase()
    result = db.table("knowledge_base_files").select("*").eq("knowledge_base_id", kb_id).order("created_at", desc=True).execute()
    return result.data


@router.post("/{kb_id}/files")
async def upload_file(kb_id: str, file: UploadFile = File(...)):
    db = get_supabase()

    # Verify KB exists
    kb_result = db.table("knowledge_bases").select("*").eq("id", kb_id).execute()
    if not kb_result.data:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    kb = kb_result.data[0]

    # Validate file type
    filename = file.filename or "unknown"
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext not in ALLOWED_FILE_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {ext}. Allowed: {', '.join(ALLOWED_FILE_TYPES)}")

    # Read file content
    content = await file.read()
    file_size = len(content)
    if file_size > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail=f"File too large. Max: {MAX_FILE_SIZE // (1024*1024)}MB")

    # Create file record
    file_record = db.table("knowledge_base_files").insert({
        "knowledge_base_id": kb_id,
        "filename": filename,
        "file_type": ext.lstrip("."),
        "file_size": file_size,
        "status": "processing",
    }).execute()

    file_id = file_record.data[0]["id"]

    # Process: parse → chunk → embed → upsert
    try:
        from app.services.vector_db import get_provider
        from app.services.document_processor import process_and_upsert

        provider = get_provider(kb["provider"], kb.get("config", {}))
        namespace = kb.get("config", {}).get("namespace")
        chunk_count = await process_and_upsert(content, filename, file_id, provider, namespace=namespace)

        db.table("knowledge_base_files").update({
            "status": "completed",
            "chunk_count": chunk_count,
            "updated_at": "now()",
        }).eq("id", file_id).execute()

        return {**file_record.data[0], "status": "completed", "chunk_count": chunk_count}
    except Exception as e:
        logger.error(f"File processing error for {filename}: {e}", exc_info=True)
        db.table("knowledge_base_files").update({
            "status": "failed",
            "error_message": str(e),
            "updated_at": "now()",
        }).eq("id", file_id).execute()
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")


@router.delete("/{kb_id}/files/{file_id}")
async def delete_file(kb_id: str, file_id: str):
    db = get_supabase()

    # Get KB for vector cleanup
    kb_result = db.table("knowledge_bases").select("*").eq("id", kb_id).execute()
    if kb_result.data:
        kb = kb_result.data[0]
        # Get chunk count to know how many vector IDs to delete
        file_result = db.table("knowledge_base_files").select("chunk_count").eq("id", file_id).execute()
        if file_result.data:
            chunk_count = file_result.data[0].get("chunk_count", 0) or 0
            if chunk_count > 0:
                try:
                    from app.services.vector_db import get_provider
                    provider = get_provider(kb["provider"], kb.get("config", {}))
                    namespace = kb.get("config", {}).get("namespace")
                    vector_ids = [f"{file_id}_{i}" for i in range(chunk_count)]
                    await provider.delete(ids=vector_ids, namespace=namespace)
                    logger.info(f"Deleted {chunk_count} vectors for file {file_id}")
                except Exception as e:
                    logger.error(f"Failed to delete vectors for file {file_id}: {e}")

    db.table("knowledge_base_files").delete().eq("id", file_id).execute()
    return {"deleted": True}
