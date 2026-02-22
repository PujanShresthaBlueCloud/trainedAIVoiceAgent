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
  created_at: string;
  updated_at: string;
}
