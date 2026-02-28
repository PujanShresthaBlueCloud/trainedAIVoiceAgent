from supabase import create_client, Client
from app.config import settings

_client: Client | None = None


def get_supabase() -> Client:
    global _client
    if _client is None:
        _client = create_client(settings.SUPABASE_URL, settings.SUPABASE_KEY)
    return _client


MIGRATION_SQL = """
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS agents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    system_prompt TEXT DEFAULT 'You are a helpful voice AI assistant.',
    voice_id TEXT DEFAULT '21m00Tcm4TlvDq8ikWAM',
    language TEXT DEFAULT 'en-US',
    llm_model TEXT DEFAULT 'gpt-4',
    tools_enabled JSONB DEFAULT '[]'::jsonb,
    is_active BOOLEAN DEFAULT true,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS calls (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    direction TEXT DEFAULT 'inbound',
    caller_number TEXT,
    twilio_call_sid TEXT UNIQUE,
    status TEXT DEFAULT 'queued',
    end_reason TEXT,
    duration_seconds INT,
    summary TEXT,
    started_at TIMESTAMPTZ DEFAULT now(),
    ended_at TIMESTAMPTZ,
    metadata JSONB
);

CREATE TABLE IF NOT EXISTS transcript_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    call_id UUID REFERENCES calls(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS function_call_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    call_id UUID REFERENCES calls(id) ON DELETE CASCADE,
    function_name TEXT NOT NULL,
    arguments JSONB,
    result JSONB,
    status TEXT DEFAULT 'pending',
    error_message TEXT,
    executed_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS system_prompts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    content TEXT NOT NULL,
    variables JSONB,
    category TEXT,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS custom_functions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    parameters JSONB DEFAULT '{}'::jsonb,
    webhook_url TEXT,
    method TEXT DEFAULT 'POST',
    headers JSONB,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calls_agent_id ON calls(agent_id);
CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status);
CREATE INDEX IF NOT EXISTS idx_transcript_entries_call_id ON transcript_entries(call_id);
CREATE INDEX IF NOT EXISTS idx_function_call_logs_call_id ON function_call_logs(call_id);

-- Enhanced custom functions columns
ALTER TABLE custom_functions ADD COLUMN IF NOT EXISTS timeout_seconds INTEGER DEFAULT 30;
ALTER TABLE custom_functions ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;
ALTER TABLE custom_functions ADD COLUMN IF NOT EXISTS response_mapping JSONB;
ALTER TABLE custom_functions ADD COLUMN IF NOT EXISTS speak_during_execution TEXT;
ALTER TABLE custom_functions ADD COLUMN IF NOT EXISTS speak_on_failure TEXT;

-- Knowledge bases
CREATE TABLE IF NOT EXISTS knowledge_bases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    provider TEXT NOT NULL DEFAULT 'pinecone',
    config JSONB DEFAULT '{}'::jsonb,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS knowledge_base_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    knowledge_base_id UUID REFERENCES knowledge_bases(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    file_type TEXT,
    file_size INTEGER,
    chunk_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending',
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE agents ADD COLUMN IF NOT EXISTS knowledge_base_id UUID REFERENCES knowledge_bases(id);

CREATE INDEX IF NOT EXISTS idx_kb_files_kb_id ON knowledge_base_files(knowledge_base_id);

-- New custom function columns for query params, payload mode, and store variables
ALTER TABLE custom_functions ADD COLUMN IF NOT EXISTS query_params JSONB;
ALTER TABLE custom_functions ADD COLUMN IF NOT EXISTS payload_mode TEXT DEFAULT 'args_only';
ALTER TABLE custom_functions ADD COLUMN IF NOT EXISTS store_variables JSONB;
"""
