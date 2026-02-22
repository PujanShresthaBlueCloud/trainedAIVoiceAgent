"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Agent } from "@/types";
import TestCallSection from "@/components/TestCallSection";
import { Bot, Plus, Pencil, Trash2, X, Phone } from "lucide-react";

const LLM_MODELS = [
  "gpt-4",
  "gpt-4-turbo",
  "gpt-3.5-turbo",
  "claude-3-opus-20240229",
  "claude-3-sonnet-20240229",
  "deepseek-chat",
  "gemini-pro",
  "llama-3.1-70b-versatile",
  "mixtral-8x7b-32768",
];

const AVAILABLE_TOOLS = [
  "end_call",
  "transfer_call",
  "check_availability",
  "book_appointment",
];

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Agent | null>(null);
  const [testAgent, setTestAgent] = useState<Agent | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    system_prompt: "You are a helpful voice AI assistant.",
    voice_id: "21m00Tcm4TlvDq8ikWAM",
    language: "en-US",
    llm_model: "gpt-4",
    tools_enabled: [] as string[],
    is_active: true,
  });

  const loadAgents = async () => {
    try {
      const data = await api.listAgents();
      setAgents(data);
    } catch (e) {
      console.error("Failed to load agents:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAgents();
  }, []);

  const resetForm = () => {
    setForm({
      name: "",
      description: "",
      system_prompt: "You are a helpful voice AI assistant.",
      voice_id: "21m00Tcm4TlvDq8ikWAM",
      language: "en-US",
      llm_model: "gpt-4",
      tools_enabled: [],
      is_active: true,
    });
    setEditing(null);
  };

  const openCreate = () => {
    resetForm();
    setShowModal(true);
  };

  const openEdit = (agent: Agent) => {
    setEditing(agent);
    setForm({
      name: agent.name,
      description: agent.description || "",
      system_prompt: agent.system_prompt,
      voice_id: agent.voice_id,
      language: agent.language,
      llm_model: agent.llm_model,
      tools_enabled: agent.tools_enabled || [],
      is_active: agent.is_active,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    try {
      if (editing) {
        await api.updateAgent(editing.id, form);
      } else {
        await api.createAgent(form);
      }
      setShowModal(false);
      resetForm();
      loadAgents();
    } catch (e) {
      console.error("Failed to save agent:", e);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this agent?")) return;
    try {
      await api.deleteAgent(id);
      loadAgents();
    } catch (e) {
      console.error("Failed to delete:", e);
    }
  };

  const toggleTool = (tool: string) => {
    setForm((f) => ({
      ...f,
      tools_enabled: f.tools_enabled.includes(tool)
        ? f.tools_enabled.filter((t) => t !== tool)
        : [...f.tools_enabled, tool],
    }));
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Agents</h1>
          <p className="text-gray-400 mt-1">Create and manage your voice AI agents</p>
        </div>
        <button
          onClick={openCreate}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Agent
        </button>
      </div>

      {testAgent && (
        <div className="mb-8">
          <TestCallSection agentId={testAgent.id} agentName={testAgent.name} />
          <button
            onClick={() => setTestAgent(null)}
            className="mt-2 text-sm text-gray-400 hover:text-white"
          >
            Close test call
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-center text-gray-500 py-12">Loading agents...</div>
      ) : agents.length === 0 ? (
        <div className="text-center py-12 bg-gray-900 rounded-xl border border-gray-800">
          <Bot className="w-12 h-12 mx-auto text-gray-600 mb-4" />
          <p className="text-gray-400">No agents yet. Create your first one!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className="bg-gray-900 rounded-xl border border-gray-800 p-6 hover:border-gray-700 transition-colors"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-600/20 rounded-lg flex items-center justify-center">
                    <Bot className="w-5 h-5 text-indigo-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">{agent.name}</h3>
                    <p className="text-xs text-gray-500">{agent.llm_model}</p>
                  </div>
                </div>
                <span
                  className={`w-2 h-2 rounded-full ${
                    agent.is_active ? "bg-green-400" : "bg-gray-600"
                  }`}
                />
              </div>

              {agent.description && (
                <p className="text-sm text-gray-400 mb-3 line-clamp-2">{agent.description}</p>
              )}

              <div className="flex flex-wrap gap-1 mb-4">
                {(agent.tools_enabled || []).map((tool) => (
                  <span key={tool} className="px-2 py-0.5 bg-gray-800 rounded text-xs text-gray-400">
                    {tool}
                  </span>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setTestAgent(agent)}
                  className="flex-1 bg-green-600/20 hover:bg-green-600/30 text-green-400 px-3 py-1.5 rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Phone className="w-3.5 h-3.5" />
                  Test Call
                </button>
                <button
                  onClick={() => openEdit(agent)}
                  className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDelete(agent.id)}
                  className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl border border-gray-800 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <h2 className="text-lg font-semibold text-white">
                {editing ? "Edit Agent" : "Create Agent"}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  placeholder="My AI Agent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Description</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  placeholder="A brief description..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">System Prompt</label>
                <textarea
                  value={form.system_prompt}
                  onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
                  rows={4}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">LLM Model</label>
                  <select
                    value={form.llm_model}
                    onChange={(e) => setForm({ ...form, llm_model: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    {LLM_MODELS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Language</label>
                  <input
                    type="text"
                    value={form.language}
                    onChange={(e) => setForm({ ...form, language: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Voice ID (ElevenLabs)</label>
                <input
                  type="text"
                  value={form.voice_id}
                  onChange={(e) => setForm({ ...form, voice_id: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Tools</label>
                <div className="flex flex-wrap gap-2">
                  {AVAILABLE_TOOLS.map((tool) => (
                    <button
                      key={tool}
                      onClick={() => toggleTool(tool)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        form.tools_enabled.includes(tool)
                          ? "bg-indigo-600 text-white"
                          : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                      }`}
                    >
                      {tool}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="rounded bg-gray-800 border-gray-700 text-indigo-600"
                />
                <label className="text-sm text-gray-300">Active</label>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-800 flex justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!form.name}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {editing ? "Save Changes" : "Create Agent"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
