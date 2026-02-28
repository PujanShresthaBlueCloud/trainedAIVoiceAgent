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
  // Agents
  listAgents: () => request<any[]>("/api/agents"),
  getAgent: (id: string) => request<any>(`/api/agents/${id}`),
  createAgent: (data: any) =>
    request<any>("/api/agents", { method: "POST", body: JSON.stringify(data) }),
  updateAgent: (id: string, data: any) =>
    request<any>(`/api/agents/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteAgent: (id: string) =>
    request<any>(`/api/agents/${id}`, { method: "DELETE" }),

  // Calls
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

  // System Prompts
  listSystemPrompts: () => request<any[]>("/api/system-prompts"),
  createSystemPrompt: (data: any) =>
    request<any>("/api/system-prompts", { method: "POST", body: JSON.stringify(data) }),
  updateSystemPrompt: (id: string, data: any) =>
    request<any>(`/api/system-prompts/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteSystemPrompt: (id: string) =>
    request<any>(`/api/system-prompts/${id}`, { method: "DELETE" }),

  // Custom Functions
  listCustomFunctions: () => request<any[]>("/api/custom-functions"),
  createCustomFunction: (data: any) =>
    request<any>("/api/custom-functions", { method: "POST", body: JSON.stringify(data) }),
  updateCustomFunction: (id: string, data: any) =>
    request<any>(`/api/custom-functions/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteCustomFunction: (id: string) =>
    request<any>(`/api/custom-functions/${id}`, { method: "DELETE" }),
  testCustomFunction: (id: string) =>
    request<any>(`/api/custom-functions/${id}/test`, { method: "POST" }),

  // Knowledge Bases
  listKnowledgeBases: () => request<any[]>("/api/knowledge-bases"),
  getKnowledgeBase: (id: string) => request<any>(`/api/knowledge-bases/${id}`),
  createKnowledgeBase: (data: any) =>
    request<any>("/api/knowledge-bases", { method: "POST", body: JSON.stringify(data) }),
  updateKnowledgeBase: (id: string, data: any) =>
    request<any>(`/api/knowledge-bases/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteKnowledgeBase: (id: string) =>
    request<any>(`/api/knowledge-bases/${id}`, { method: "DELETE" }),

  // Knowledge Base Files
  listKBFiles: (kbId: string) => request<any[]>(`/api/knowledge-bases/${kbId}/files`),
  uploadKBFile: async (kbId: string, file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${API_URL}/api/knowledge-bases/${kbId}/files`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API Error ${res.status}: ${text}`);
    }
    return res.json();
  },
  deleteKBFile: (kbId: string, fileId: string) =>
    request<any>(`/api/knowledge-bases/${kbId}/files/${fileId}`, { method: "DELETE" }),

  // Phone Numbers
  listPhoneNumbers: () => request<any[]>("/api/phone-numbers"),
  syncPhoneNumbers: () =>
    request<any>("/api/phone-numbers/sync", { method: "POST" }),
  updatePhoneNumber: (id: string, data: any) =>
    request<any>(`/api/phone-numbers/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  configurePhoneNumber: (id: string) =>
    request<any>(`/api/phone-numbers/${id}/configure`, { method: "POST" }),

  // Diagnostics
  getDiagnostics: () => request<any>("/api/diagnostics"),
};
