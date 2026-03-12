"use client";
import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Agent, CustomFunction, KnowledgeBase } from "@/types";
import Link from "next/link";
import {
  Bot,
  Plus,
  Pencil,
  Trash2,
  X,
  Phone,
  Search,
  Folder,
  FolderOpen,
  ChevronLeft,
  ChevronRight,
  Import,
} from "lucide-react";

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

const BUILT_IN_TOOLS = [
  "end_call",
  "transfer_call",
  "check_availability",
  "book_appointment",
];

const AGENT_TYPES = ["Single Prompt", "Multi Prompt"] as const;

const ITEMS_PER_PAGE = 10;

export default function AgentsPage() {
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Agent | null>(null);
  const [customFunctions, setCustomFunctions] = useState<CustomFunction[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [form, setForm] = useState({
    name: "",
    description: "",
    system_prompt: "You are a helpful voice AI assistant.",
    voice_id: "21m00Tcm4TlvDq8ikWAM",
    language: "en-US",
    llm_model: "gpt-4",
    tools_enabled: [] as string[],
    is_active: true,
    knowledge_base_id: "" as string,
    folder: "",
    agent_type: "Single Prompt" as string,
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

  const loadExtras = async () => {
    try {
      const [funcs, kbs] = await Promise.all([
        api.listCustomFunctions(),
        api.listKnowledgeBases(),
      ]);
      setCustomFunctions(funcs.filter((f: CustomFunction) => f.is_active));
      setKnowledgeBases(kbs.filter((kb: KnowledgeBase) => kb.is_active));
    } catch (e) {
      console.error("Failed to load extras:", e);
    }
  };

  useEffect(() => {
    loadAgents();
    loadExtras();
  }, []);

  // Derive folders from agents
  const folders = useMemo(() => {
    const folderSet = new Set<string>();
    agents.forEach((a) => {
      const folder = a.metadata?.folder;
      if (folder) folderSet.add(folder);
    });
    return Array.from(folderSet).sort();
  }, [agents]);

  // Derive transfer agents
  const transferAgents = useMemo(() => {
    return agents.filter((a) => (a.tools_enabled || []).includes("transfer_call"));
  }, [agents]);

  // Filter agents
  const filteredAgents = useMemo(() => {
    let result = agents;
    if (selectedFolder) {
      result = result.filter((a) => a.metadata?.folder === selectedFolder);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          (a.description || "").toLowerCase().includes(q) ||
          a.llm_model.toLowerCase().includes(q)
      );
    }
    return result;
  }, [agents, selectedFolder, searchQuery]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredAgents.length / ITEMS_PER_PAGE));
  const paginatedAgents = filteredAgents.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedFolder, searchQuery]);

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
      knowledge_base_id: "",
      folder: "",
      agent_type: "Single Prompt",
    });
    setEditing(null);
  };

  const openCreate = () => {
    resetForm();
    setShowModal(true);
  };

  const openEdit = (agent: Agent) => {
    router.push(`/agents/${agent.id}`);
  };

  const handleSave = async () => {
    try {
      const payload = {
        name: form.name,
        description: form.description,
        system_prompt: form.system_prompt,
        voice_id: form.voice_id,
        language: form.language,
        llm_model: form.llm_model,
        tools_enabled: form.tools_enabled,
        is_active: form.is_active,
        knowledge_base_id: form.knowledge_base_id || undefined,
        metadata: {
          ...(editing?.metadata || {}),
          folder: form.folder || undefined,
          agent_type: form.agent_type,
        },
      };
      if (editing) {
        await api.updateAgent(editing.id, payload);
      } else {
        await api.createAgent(payload);
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

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  };

  return (
    <div className="flex h-screen">
      {/* Left Panel - Folders */}
      <div className="w-56 flex-shrink-0 border-r border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-950/50 flex flex-col">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Folders</p>
        </div>
        <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
          <button
            onClick={() => setSelectedFolder(null)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
              selectedFolder === null
                ? "bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-white font-medium"
                : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/60"
            }`}
          >
            <FolderOpen className="w-4 h-4" />
            All Agents
            <span className="ml-auto text-xs text-gray-400">{agents.length}</span>
          </button>
          {folders.map((folder) => {
            const count = agents.filter((a) => a.metadata?.folder === folder).length;
            return (
              <button
                key={folder}
                onClick={() => setSelectedFolder(folder)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                  selectedFolder === folder
                    ? "bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-white font-medium"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800/60"
                }`}
              >
                <Folder className="w-4 h-4" />
                <span className="truncate">{folder}</span>
                <span className="ml-auto text-xs text-gray-400">{count}</span>
              </button>
            );
          })}
        </div>

        {/* Transfer Agents Section */}
        {transferAgents.length > 0 && (
          <div className="border-t border-gray-200 dark:border-gray-800">
            <div className="px-4 py-3">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Transfer Agents</p>
            </div>
            <div className="px-2 pb-2 space-y-0.5">
              {transferAgents.map((a) => (
                <div key={a.id} className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400">
                  <Phone className="w-3.5 h-3.5" />
                  <span className="truncate">{a.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right Panel - Table */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Agents</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Create and manage your voice AI agents
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search agents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-3 py-2 w-56 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              />
            </div>
            <button className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center gap-2">
              <Import className="w-4 h-4" />
              Import
            </button>
            <button
              onClick={openCreate}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Create Agent
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-gray-50 dark:bg-gray-900/80 backdrop-blur-sm z-10">
              <tr className="border-b border-gray-200 dark:border-gray-800">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Agent Name</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Agent Type</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Voice</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Phone</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Edited</th>
                <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-400 dark:text-gray-500">
                    Loading agents...
                  </td>
                </tr>
              ) : paginatedAgents.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <Bot className="w-10 h-10 mx-auto text-gray-400 dark:text-gray-600 mb-3" />
                    <p className="text-gray-500 dark:text-gray-400 text-sm">
                      {agents.length === 0
                        ? "No agents yet. Create your first one!"
                        : "No agents match your search."}
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedAgents.map((agent) => (
                  <tr
                    key={agent.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors"
                  >
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-indigo-50 dark:bg-indigo-600/20 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Bot className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                        </div>
                        <div className="min-w-0">
                          <Link href={`/agents/${agent.id}`} className="text-sm font-medium text-gray-900 dark:text-white truncate hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors block">{agent.name}</Link>
                          <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{agent.llm_model}</p>
                        </div>
                        {!agent.is_active && (
                          <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                            Inactive
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-sm text-gray-600 dark:text-gray-300">
                        {agent.metadata?.agent_type || "Single Prompt"}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-sm text-gray-500 dark:text-gray-400 font-mono text-xs">
                        {agent.voice_id ? agent.voice_id.slice(0, 8) + "..." : "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-sm text-gray-500 dark:text-gray-400">—</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {formatDate(agent.updated_at)}
                      </span>
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(agent)}
                          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(agent.id)}
                          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-red-500 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {filteredAgents.length > ITEMS_PER_PAGE && (
          <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between bg-white dark:bg-gray-950">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filteredAgents.length)} of {filteredAgents.length}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-gray-600 dark:text-gray-300 min-w-[80px] text-center">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editing ? "Edit Agent" : "Create Agent"}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  placeholder="My AI Agent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  placeholder="A brief description..."
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Folder</label>
                  <input
                    type="text"
                    value={form.folder}
                    onChange={(e) => setForm({ ...form, folder: e.target.value })}
                    className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                    placeholder="e.g. Sales, Support"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Agent Type</label>
                  <select
                    value={form.agent_type}
                    onChange={(e) => setForm({ ...form, agent_type: e.target.value })}
                    className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    {AGENT_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">System Prompt</label>
                <textarea
                  value={form.system_prompt}
                  onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
                  rows={4}
                  className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">LLM Model</label>
                  <select
                    value={form.llm_model}
                    onChange={(e) => setForm({ ...form, llm_model: e.target.value })}
                    className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    {LLM_MODELS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Language</label>
                  <input
                    type="text"
                    value={form.language}
                    onChange={(e) => setForm({ ...form, language: e.target.value })}
                    className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Voice ID (ElevenLabs)</label>
                <input
                  type="text"
                  value={form.voice_id}
                  onChange={(e) => setForm({ ...form, voice_id: e.target.value })}
                  className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                />
              </div>

              {/* Tools - Built-in */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Built-in Tools</label>
                <div className="flex flex-wrap gap-2">
                  {BUILT_IN_TOOLS.map((tool) => (
                    <button
                      key={tool}
                      onClick={() => toggleTool(tool)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        form.tools_enabled.includes(tool)
                          ? "bg-indigo-600 text-white"
                          : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                      }`}
                    >
                      {tool}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tools - Custom Functions */}
              {customFunctions.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Custom Functions</label>
                  <div className="flex flex-wrap gap-2">
                    {customFunctions.map((fn) => (
                      <button
                        key={fn.name}
                        onClick={() => toggleTool(fn.name)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          form.tools_enabled.includes(fn.name)
                            ? "bg-amber-600 text-white"
                            : "bg-amber-50 dark:bg-amber-600/10 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-600/20"
                        }`}
                        title={fn.description || fn.name}
                      >
                        {fn.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Knowledge Base selector */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Knowledge Base</label>
                <select
                  value={form.knowledge_base_id}
                  onChange={(e) => setForm({ ...form, knowledge_base_id: e.target.value })}
                  className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="">None</option>
                  {knowledgeBases.map((kb) => (
                    <option key={kb.id} value={kb.id}>{kb.name} ({kb.provider})</option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">Enables RAG — agent will search the knowledge base for relevant context</p>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="rounded bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-indigo-600"
                />
                <label className="text-sm text-gray-700 dark:text-gray-300">Active</label>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-800 flex justify-end gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
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
