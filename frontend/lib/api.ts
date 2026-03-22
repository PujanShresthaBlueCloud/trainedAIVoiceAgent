const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

async function waitForClerk(): Promise<ClerkInstance | null> {
  if (typeof window === "undefined") return null;
  // Clerk may not be on window yet if ClerkProvider is still mounting
  for (let i = 0; i < 20; i++) {
    if (window.Clerk?.session) return window.Clerk;
    await new Promise((r) => setTimeout(r, 150));
  }
  return window.Clerk ?? null;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  try {
    const clerk = await waitForClerk();
    if (clerk?.session) {
      // skipCache forces a fresh token, avoiding "Token has expired" on short-lived JWTs
      const token = await clerk.session.getToken({ skipCache: true });
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
    }
  } catch {
    // silently ignore if token fetch fails
  }
  return headers;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const authHeaders = await getAuthHeaders();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { ...authHeaders, ...options?.headers },
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
    const headers: Record<string, string> = {};
    try {
      const clerk = await waitForClerk();
      if (clerk?.session) {
        const token = await clerk.session.getToken({ skipCache: true });
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }
      }
    } catch {
      // silently ignore
    }
    const formData = new FormData();
    formData.append("file", file);
    const res = await fetch(`${API_URL}/api/knowledge-bases/${kbId}/files`, {
      method: "POST",
      headers,
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

  // LiveKit
  getLivekitToken: (agentId: string, participantName: string = "user") =>
    request<{ token: string; room_name: string; livekit_url: string; call_id: string }>(
      "/api/livekit/token",
      {
        method: "POST",
        body: JSON.stringify({ agent_id: agentId, participant_name: participantName }),
      }
    ),
  getLivekitRooms: () => request<any>("/api/livekit/rooms"),

  // Chat Conversations
  listChatConversations: () => request<any[]>("/api/chat-conversations"),
  getChatConversation: (id: string) => request<any>(`/api/chat-conversations/${id}`),
  getChatMessages: (id: string) => request<any[]>(`/api/chat-conversations/${id}/messages`),
  createChatConversation: (data: any) =>
    request<any>("/api/chat-conversations", { method: "POST", body: JSON.stringify(data) }),
  addChatMessage: (id: string, data: any) =>
    request<any>(`/api/chat-conversations/${id}/messages`, { method: "POST", body: JSON.stringify(data) }),
  deleteChatConversation: (id: string) =>
    request<any>(`/api/chat-conversations/${id}`, { method: "DELETE" }),

  // Diagnostics
  getDiagnostics: () => request<any>("/api/diagnostics"),

  // Compliance
  getComplianceStatus: () => request<any>("/api/compliance/status"),
  getAuditLogs: (limit: number = 50) =>
    request<any[]>(`/api/compliance/audit-logs?limit=${limit}`),
  requestDataExport: (phoneNumber: string) =>
    request<any>("/api/compliance/data-export", {
      method: "POST",
      body: JSON.stringify({ phone_number: phoneNumber }),
    }),
  requestDataDeletion: (phoneNumber: string) =>
    request<any>("/api/compliance/data-deletion", {
      method: "POST",
      body: JSON.stringify({ phone_number: phoneNumber }),
    }),
  recordConsent: (data: { call_id: string; caller_number: string; consent_given: boolean }) =>
    request<any>("/api/compliance/consent", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  getConsent: (callId: string) =>
    request<any>(`/api/compliance/consent/${callId}`),
  triggerRetentionCleanup: () =>
    request<any>("/api/compliance/retention/cleanup", { method: "POST" }),
};
