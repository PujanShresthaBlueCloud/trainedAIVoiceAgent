const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API Error ${res.status}: ${text}`);
  }
  return res.json();
}

export const api = {
  listAgents: () => request<any[]>("/api/agents"),
  getAgent: (id: string) => request<any>(`/api/agents/${id}`),
  createAgent: (data: any) =>
    request<any>("/api/agents", { method: "POST", body: JSON.stringify(data) }),
  updateAgent: (id: string, data: any) =>
    request<any>(`/api/agents/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteAgent: (id: string) =>
    request<any>(`/api/agents/${id}`, { method: "DELETE" }),

  listCalls: () => request<any[]>("/api/calls"),
  getCall: (id: string) => request<any>(`/api/calls/${id}`),
  getTranscript: (id: string) => request<any[]>(`/api/calls/${id}/transcript`),
  makeOutboundCall: (agentId: string, toNumber: string) =>
    request<any>("/api/calls/outbound", {
      method: "POST",
      body: JSON.stringify({ agent_id: agentId, to_number: toNumber }),
    }),
  deleteCall: (id: string) =>
    request<any>(`/api/calls/${id}`, { method: "DELETE" }),

  listSystemPrompts: () => request<any[]>("/api/system-prompts"),
  createSystemPrompt: (data: any) =>
    request<any>("/api/system-prompts", { method: "POST", body: JSON.stringify(data) }),
  updateSystemPrompt: (id: string, data: any) =>
    request<any>(`/api/system-prompts/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteSystemPrompt: (id: string) =>
    request<any>(`/api/system-prompts/${id}`, { method: "DELETE" }),

  listCustomFunctions: () => request<any[]>("/api/custom-functions"),
  createCustomFunction: (data: any) =>
    request<any>("/api/custom-functions", { method: "POST", body: JSON.stringify(data) }),
  updateCustomFunction: (id: string, data: any) =>
    request<any>(`/api/custom-functions/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteCustomFunction: (id: string) =>
    request<any>(`/api/custom-functions/${id}`, { method: "DELETE" }),
};
