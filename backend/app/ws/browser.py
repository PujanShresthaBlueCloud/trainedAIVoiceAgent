from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from app.voice.session_browser import BrowserVoiceSession
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/ws/voice-browser")
async def voice_browser_ws(websocket: WebSocket, agent_id: str = Query(default=None)):
    await websocket.accept()
    logger.info(f"Browser WS connected: agent_id={agent_id}")
    session = BrowserVoiceSession(websocket, agent_id=agent_id)
    try:
        await session.run()
    except WebSocketDisconnect:
        logger.info("Browser WS disconnected")
    except Exception as e:
        logger.error(f"Browser WS error: {e}")
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
