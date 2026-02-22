from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from voice.session_twilio import TwilioVoiceSession
import logging

logger = logging.getLogger(__name__)
router = APIRouter()


@router.websocket("/ws/voice-twilio")
async def voice_twilio_ws(websocket: WebSocket):
    await websocket.accept()
    logger.info("Twilio WS connected")
    session = TwilioVoiceSession(websocket)
    try:
        await session.run()
    except WebSocketDisconnect:
        logger.info("Twilio WS disconnected")
    except Exception as e:
        logger.error(f"Twilio WS error: {e}")
    finally:
        try:
            await websocket.close()
        except Exception:
            pass
