export interface Agent {
  id: string;
  name: string;
  description: string | null;
  system_prompt: string;
  voice_id: string;
  language: string;
  llm_model: string;
  tools_enabled: string[];
  is_active: boolean;
  metadata: Record<string, any> | null;
  knowledge_base_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Call {
  id: string;
  agent_id: string | null;
  direction: string;
  caller_number: string | null;
  twilio_call_sid: string | null;
  status: string;
  end_reason: string | null;
  duration_seconds: number | null;
  summary: string | null;
  started_at: string;
  ended_at: string | null;
  metadata: Record<string, any> | null;
  agents?: { name: string } | null;
}

export interface TranscriptEntry {
  id: string;
  call_id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface SystemPrompt {
  id: string;
  name: string;
  description: string | null;
  content: string;
  variables: Record<string, any> | null;
  category: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface CustomFunction {
  id: string;
  name: string;
  description: string | null;
  parameters: Record<string, any>;
  webhook_url: string | null;
  method: string;
  headers: Record<string, any> | null;
  is_active: boolean;
  timeout_seconds: number;
  retry_count: number;
  response_mapping: Record<string, string> | null;
  speak_during_execution: string | null;
  speak_on_failure: string | null;
  query_params: Record<string, string> | null;
  payload_mode: string;
  store_variables: Record<string, string> | null;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeBase {
  id: string;
  name: string;
  description: string | null;
  provider: string;
  config: Record<string, any>;
  is_active: boolean;
  file_count?: number;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeBaseFile {
  id: string;
  knowledge_base_id: string;
  filename: string;
  file_type: string | null;
  file_size: number | null;
  chunk_count: number;
  status: string;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}
