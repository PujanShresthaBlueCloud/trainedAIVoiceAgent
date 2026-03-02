"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Agent, Call, CustomFunction, KnowledgeBase } from "@/types";
import VoiceCallButton from "@/components/VoiceCallButton";
import {
  ArrowLeft,
  Save,
  Trash2,
  ChevronDown,
  ChevronRight,
  Bot,
  Cpu,
  DollarSign,
  Clock,
  Hash,
  Search,
  Phone,
  MessageSquare,
  History,
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

interface SectionProps {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function CollapsibleSection({ title, defaultOpen = false, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-900/50 hover:bg-gray-100 dark:hover:bg-gray-800/50 transition-colors"
      >
        <span className="text-sm font-medium text-gray-900 dark:text-white">{title}</span>
        {open ? (
          <ChevronDown className="w-4 h-4 text-gray-400" />
        ) : (
          <ChevronRight className="w-4 h-4 text-gray-400" />
        )}
      </button>
      {open && <div className="px-4 py-4 space-y-4">{children}</div>}
    </div>
  );
}

function PlaceholderSection({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center py-6 text-sm text-gray-400 dark:text-gray-500">
      {label} — Coming Soon
    </div>
  );
}

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.id as string;

  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [customFunctions, setCustomFunctions] = useState<CustomFunction[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [calls, setCalls] = useState<Call[]>([]);
  const [callSearch, setCallSearch] = useState("");
  const [testTab, setTestTab] = useState<"audio" | "chat">("audio");

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const [language, setLanguage] = useState("");
  const [llmModel, setLlmModel] = useState("");
  const [toolsEnabled, setToolsEnabled] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [knowledgeBaseId, setKnowledgeBaseId] = useState("");

  // Metadata fields
  const [welcomeMessage, setWelcomeMessage] = useState("");
  const [pauseBeforeSpeaking, setPauseBeforeSpeaking] = useState(0);
  const [aiSpeaksFirst, setAiSpeaksFirst] = useState(false);
  const [dynamicMessage, setDynamicMessage] = useState(false);

  const loadAgent = useCallback(async () => {
    try {
      const data = await api.getAgent(agentId);
      setAgent(data);
      setName(data.name);
      setDescription(data.description || "");
      setSystemPrompt(data.system_prompt);
      setVoiceId(data.voice_id);
      setLanguage(data.language);
      setLlmModel(data.llm_model);
      setToolsEnabled(data.tools_enabled || []);
      setIsActive(data.is_active);
      setKnowledgeBaseId(data.knowledge_base_id || "");
      // Metadata fields
      const meta = data.metadata || {};
      setWelcomeMessage(meta.welcome_message || "");
      setPauseBeforeSpeaking(meta.pause_before_speaking ?? 0);
      setAiSpeaksFirst(meta.ai_speaks_first ?? false);
      setDynamicMessage(meta.dynamic_message ?? false);
    } catch (e) {
      console.error("Failed to load agent:", e);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  const loadExtras = useCallback(async () => {
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
  }, []);

  const loadCalls = useCallback(async () => {
    try {
      const data = await api.listCalls();
      setCalls(data.filter((c: Call) => c.agent_id === agentId));
    } catch (e) {
      console.error("Failed to load calls:", e);
    }
  }, [agentId]);

  useEffect(() => {
    loadAgent();
    loadExtras();
    loadCalls();
  }, [loadAgent, loadExtras, loadCalls]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        name,
        description,
        system_prompt: systemPrompt,
        voice_id: voiceId,
        language,
        llm_model: llmModel,
        tools_enabled: toolsEnabled,
        is_active: isActive,
        knowledge_base_id: knowledgeBaseId || undefined,
        metadata: {
          ...(agent?.metadata || {}),
          welcome_message: welcomeMessage || undefined,
          pause_before_speaking: pauseBeforeSpeaking,
          ai_speaks_first: aiSpeaksFirst,
          dynamic_message: dynamicMessage,
        },
      };
      const updated = await api.updateAgent(agentId, payload);
      setAgent(updated);
    } catch (e) {
      console.error("Failed to save agent:", e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this agent? This cannot be undone.")) return;
    try {
      await api.deleteAgent(agentId);
      router.push("/agents");
    } catch (e) {
      console.error("Failed to delete agent:", e);
    }
  };

  const toggleTool = (tool: string) => {
    setToolsEnabled((prev) =>
      prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool]
    );
  };

  const filteredCalls = useMemo(() => {
    if (!callSearch.trim()) return calls;
    const q = callSearch.toLowerCase();
    return calls.filter(
      (c) =>
        (c.status || "").toLowerCase().includes(q) ||
        (c.caller_number || "").toLowerCase().includes(q) ||
        (c.summary || "").toLowerCase().includes(q)
    );
  }, [calls, callSearch]);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString();
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "—";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-gray-400 dark:text-gray-500">Loading agent...</div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <Bot className="w-12 h-12 text-gray-400" />
        <p className="text-gray-500 dark:text-gray-400">Agent not found</p>
        <Link href="/agents" className="text-indigo-600 hover:text-indigo-500 text-sm font-medium">
          Back to Agents
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header Bar */}
      <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4 min-w-0">
            <Link
              href="/agents"
              className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-gray-900 dark:text-white truncate">{name}</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs font-mono text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded">
                  {agentId.slice(0, 8)}...
                </span>
                <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                  <Cpu className="w-3 h-3" />
                  {llmModel}
                </span>
                <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                  <DollarSign className="w-3 h-3" />
                  —
                </span>
                <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                  <Clock className="w-3 h-3" />
                  —
                </span>
                <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                  <Hash className="w-3 h-3" />
                  —
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDelete}
              className="px-3 py-2 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !name}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
            >
              <Save className="w-4 h-4" />
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>

      {/* Two-Panel Layout */}
      <div className="flex-1 flex min-h-0">
        {/* Left Panel — Config */}
        <div className="w-[60%] border-r border-gray-200 dark:border-gray-800 overflow-y-auto">
          <div className="p-6 space-y-4">
            {/* Name & Description */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Agent Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  placeholder="A brief description..."
                />
              </div>
            </div>

            {/* 1. Model & Voice */}
            <CollapsibleSection title="Model & Voice" defaultOpen>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    LLM Model
                  </label>
                  <select
                    value={llmModel}
                    onChange={(e) => setLlmModel(e.target.value)}
                    className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    {LLM_MODELS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Language
                  </label>
                  <input
                    type="text"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Voice ID (ElevenLabs)
                </label>
                <input
                  type="text"
                  value={voiceId}
                  onChange={(e) => setVoiceId(e.target.value)}
                  className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none font-mono text-xs"
                />
              </div>
            </CollapsibleSection>

            {/* 2. Prompt */}
            <CollapsibleSection title="Prompt" defaultOpen>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  System Prompt
                </label>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  rows={10}
                  className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-y font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Welcome Message
                </label>
                <input
                  type="text"
                  value={welcomeMessage}
                  onChange={(e) => setWelcomeMessage(e.target.value)}
                  className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  placeholder="Hello! How can I help you today?"
                />
                <p className="text-xs text-gray-400 mt-1">First message the AI says when a call starts</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Pause Before Speaking: {pauseBeforeSpeaking.toFixed(1)}s
                </label>
                <input
                  type="range"
                  min="0"
                  max="5"
                  step="0.1"
                  value={pauseBeforeSpeaking}
                  onChange={(e) => setPauseBeforeSpeaking(parseFloat(e.target.value))}
                  className="w-full accent-indigo-600"
                />
                <div className="flex justify-between text-xs text-gray-400">
                  <span>0s</span>
                  <span>5s</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">AI Speaks First</p>
                  <p className="text-xs text-gray-400">Agent initiates the conversation</p>
                </div>
                <button
                  onClick={() => setAiSpeaksFirst(!aiSpeaksFirst)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    aiSpeaksFirst ? "bg-indigo-600" : "bg-gray-300 dark:bg-gray-600"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                      aiSpeaksFirst ? "translate-x-5" : ""
                    }`}
                  />
                </button>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Dynamic Message</p>
                  <p className="text-xs text-gray-400">Generate welcome message dynamically via LLM</p>
                </div>
                <button
                  onClick={() => setDynamicMessage(!dynamicMessage)}
                  className={`relative w-11 h-6 rounded-full transition-colors ${
                    dynamicMessage ? "bg-indigo-600" : "bg-gray-300 dark:bg-gray-600"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                      dynamicMessage ? "translate-x-5" : ""
                    }`}
                  />
                </button>
              </div>
            </CollapsibleSection>

            {/* 3. Functions */}
            <CollapsibleSection title="Functions" defaultOpen>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Built-in Tools
                </label>
                <div className="flex flex-wrap gap-2">
                  {BUILT_IN_TOOLS.map((tool) => (
                    <button
                      key={tool}
                      onClick={() => toggleTool(tool)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        toolsEnabled.includes(tool)
                          ? "bg-indigo-600 text-white"
                          : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                      }`}
                    >
                      {tool}
                    </button>
                  ))}
                </div>
              </div>
              {customFunctions.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Custom Functions
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {customFunctions.map((fn) => (
                      <button
                        key={fn.name}
                        onClick={() => toggleTool(fn.name)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          toolsEnabled.includes(fn.name)
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
            </CollapsibleSection>

            {/* 4. Knowledge Base */}
            <CollapsibleSection title="Knowledge Base">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Knowledge Base
                </label>
                <select
                  value={knowledgeBaseId}
                  onChange={(e) => setKnowledgeBaseId(e.target.value)}
                  className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="">None</option>
                  {knowledgeBases.map((kb) => (
                    <option key={kb.id} value={kb.id}>
                      {kb.name} ({kb.provider})
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  Enables RAG — agent will search the knowledge base for relevant context
                </p>
              </div>
            </CollapsibleSection>

            {/* 5–11. Placeholder sections */}
            <CollapsibleSection title="Speech Settings">
              <PlaceholderSection label="Configure speech synthesis settings" />
            </CollapsibleSection>

            <CollapsibleSection title="Realtime Transcription Settings">
              <PlaceholderSection label="Configure realtime transcription" />
            </CollapsibleSection>

            <CollapsibleSection title="Call Settings">
              <PlaceholderSection label="Configure call behavior" />
            </CollapsibleSection>

            <CollapsibleSection title="Post-Call Data Extraction">
              <PlaceholderSection label="Configure post-call data extraction" />
            </CollapsibleSection>

            <CollapsibleSection title="Security & Fallback Settings">
              <PlaceholderSection label="Configure security and fallback behavior" />
            </CollapsibleSection>

            <CollapsibleSection title="Webhook Settings">
              <PlaceholderSection label="Configure webhook endpoints" />
            </CollapsibleSection>

            <CollapsibleSection title="MCPs">
              <PlaceholderSection label="Configure Model Context Protocol servers" />
            </CollapsibleSection>

            {/* Active toggle */}
            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-indigo-600"
              />
              <label className="text-sm text-gray-700 dark:text-gray-300">Active</label>
            </div>
          </div>
        </div>

        {/* Right Panel — Test & History */}
        <div className="w-[40%] flex flex-col min-h-0">
          {/* Test Panel */}
          <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-800">
            <div className="flex border-b border-gray-200 dark:border-gray-800">
              <button
                onClick={() => setTestTab("audio")}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  testTab === "audio"
                    ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                    : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                }`}
              >
                <Phone className="w-4 h-4" />
                Test Audio
              </button>
              <button
                onClick={() => setTestTab("chat")}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  testTab === "chat"
                    ? "border-indigo-600 text-indigo-600 dark:text-indigo-400"
                    : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                }`}
              >
                <MessageSquare className="w-4 h-4" />
                Test Chat
              </button>
            </div>
            <div className="p-4">
              {testTab === "audio" ? (
                <div className="space-y-3">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Test your agent with a live voice call. Make sure your microphone is connected.
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    Please note call transfer is not supported in Webcall.
                  </p>
                  <VoiceCallButton agentId={agentId} size="lg" />
                </div>
              ) : (
                <div className="flex items-center justify-center py-8 text-sm text-gray-400 dark:text-gray-500">
                  Text-based testing — Coming Soon
                </div>
              )}
            </div>
          </div>

          {/* History */}
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  Call History
                </span>
                <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
                  {calls.length}
                </span>
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={callSearch}
                  onChange={(e) => setCallSearch(e.target.value)}
                  className="pl-8 pr-3 py-1.5 w-40 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {filteredCalls.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-gray-500">
                  <Phone className="w-8 h-8 mb-2 opacity-50" />
                  <p className="text-sm">No calls yet</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-200 dark:divide-gray-800">
                  {filteredCalls.map((call) => (
                    <Link
                      key={call.id}
                      href={`/calls`}
                      className="block px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                call.status === "completed"
                                  ? "bg-green-400"
                                  : call.status === "in_progress"
                                  ? "bg-yellow-400"
                                  : "bg-gray-400"
                              }`}
                            />
                            <span className="text-sm text-gray-900 dark:text-white">
                              {call.direction === "inbound" ? "Inbound" : "Outbound"} Call
                            </span>
                          </div>
                          {call.summary && (
                            <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5 ml-4">
                              {call.summary}
                            </p>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0 ml-3">
                          <p className="text-xs text-gray-400">
                            {formatDuration(call.duration_seconds)}
                          </p>
                          <p className="text-xs text-gray-400 dark:text-gray-500">
                            {formatDate(call.started_at)}
                          </p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
