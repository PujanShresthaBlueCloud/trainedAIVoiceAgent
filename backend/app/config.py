from pathlib import Path
from pydantic_settings import BaseSettings

# Find .env relative to this file's location (backend/.env)
_ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


class Settings(BaseSettings):
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""
    DEEPGRAM_API_KEY: str = ""
    ELEVENLABS_API_KEY: str = ""
    ELEVENLABS_VOICE_ID: str = "21m00Tcm4TlvDq8ikWAM"
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4"
    ANTHROPIC_API_KEY: str = ""
    DEEPSEEK_API_KEY: str = ""
    GOOGLE_API_KEY: str = ""
    GROQ_API_KEY: str = ""
    TWILIO_ACCOUNT_SID: str = ""
    TWILIO_AUTH_TOKEN: str = ""
    TWILIO_PHONE_NUMBER: str = ""
    APP_URL: str = "http://localhost:8000"
    NGROK_AUTHTOKEN: str = ""

    # Knowledge Base / RAG
    PINECONE_API_KEY: str = ""
    EMBEDDING_MODEL: str = "text-embedding-3-small"
    CHUNK_SIZE: int = 500
    CHUNK_OVERLAP: int = 50
    RAG_TOP_K: int = 5

    model_config = {"env_file": str(_ENV_FILE), "extra": "ignore"}


settings = Settings()
