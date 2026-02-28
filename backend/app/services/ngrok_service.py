import logging
from app.config import settings

logger = logging.getLogger(__name__)

_public_url: str | None = None
_tunnel = None


def start_tunnel():
    global _public_url, _tunnel

    if not settings.NGROK_AUTHTOKEN:
        logger.info("NGROK_AUTHTOKEN not set — skipping ngrok tunnel")
        return

    try:
        from pyngrok import ngrok, conf

        conf.get_default().auth_token = settings.NGROK_AUTHTOKEN
        _tunnel = ngrok.connect(8000, "http")
        _public_url = _tunnel.public_url
        logger.info(f"ngrok tunnel started: {_public_url}")
    except Exception as e:
        logger.error(f"Failed to start ngrok tunnel: {e}")


def get_public_url() -> str:
    return _public_url or settings.APP_URL


def stop_tunnel():
    global _public_url, _tunnel

    if _tunnel:
        try:
            from pyngrok import ngrok
            ngrok.disconnect(_tunnel.public_url)
            logger.info("ngrok tunnel stopped")
        except Exception as e:
            logger.error(f"Failed to stop ngrok tunnel: {e}")
    _public_url = None
    _tunnel = None
