"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { CustomFunction } from "@/types";
import { Code2, Plus, Pencil, Trash2, X, Globe, Zap, Play, Loader2, Clock, RotateCcw, MessageSquare } from "lucide-react";

// --- JSON Schema Examples ---
const JSON_EXAMPLES = [
  {
    label: "example 1",
    schema: {
      type: "object",
      properties: { query: { type: "string", description: "Search query" } },
      required: ["query"],
    },
  },
  {
    label: "example 2",
    schema: {
      type: "object",
      properties: {
        date: { type: "string" },
        time: { type: "string" },
        name: { type: "string" },
      },
      required: ["date", "time", "name"],
    },
  },
  {
    label: "example 3",
    schema: {
      type: "object",
      properties: {
        endpoint: { type: "string" },
        method: { type: "string", enum: ["GET", "POST"] },
        body: { type: "object" },
      },
      required: ["endpoint"],
    },
  },
];

// --- KeyValuePairEditor ---
interface KVPair {
  key: string;
  value: string;
}

function KeyValuePairEditor({
  pairs,
  onChange,
  keyPlaceholder = "Key",
  valuePlaceholder = "Value",
}: {
  pairs: KVPair[];
  onChange: (pairs: KVPair[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}) {
  const updatePair = (index: number, field: "key" | "value", val: string) => {
    const updated = [...pairs];
    updated[index] = { ...updated[index], [field]: val };
    onChange(updated);
  };

  const removePair = (index: number) => {
    onChange(pairs.filter((_, i) => i !== index));
  };

  const addPair = () => {
    onChange([...pairs, { key: "", value: "" }]);
  };

  return (
    <div className="space-y-2">
      {pairs.map((pair, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="text"
            value={pair.key}
            onChange={(e) => updatePair(i, "key", e.target.value)}
            placeholder={keyPlaceholder}
            className="flex-1 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
          />
          <input
            type="text"
            value={pair.value}
            onChange={(e) => updatePair(i, "value", e.target.value)}
            placeholder={valuePlaceholder}
            className="flex-1 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
          />
          <button
            onClick={() => removePair(i)}
            className="p-2 text-gray-400 hover:text-red-400 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      <button
        onClick={addPair}
        className="text-sm text-amber-600 hover:text-amber-500 font-medium flex items-center gap-1"
      >
        <Plus className="w-3 h-3" /> New key value pair
      </button>
    </div>
  );
}

// --- Helpers ---
function kvPairsToRecord(pairs: KVPair[]): Record<string, string> | undefined {
  const filtered = pairs.filter((p) => p.key.trim());
  if (filtered.length === 0) return undefined;
  return Object.fromEntries(filtered.map((p) => [p.key, p.value]));
}

function recordToKvPairs(record: Record<string, string> | null | undefined): KVPair[] {
  if (!record) return [];
  return Object.entries(record).map(([key, value]) => ({ key, value: String(value) }));
}

export default function CustomFunctionsPage() {
  const [functions, setFunctions] = useState<CustomFunction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<CustomFunction | null>(null);
  const [testResult, setTestResult] = useState<any>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [paramsTab, setParamsTab] = useState<"json" | "form">("json");

  const [form, setForm] = useState({
    name: "",
    description: "",
    parameters: "{}",
    webhook_url: "",
    method: "POST",
    is_active: true,
    timeout_ms: 120000,
    retry_count: 0,
    response_mapping: "",
    speak_during_execution: "",
    speak_on_failure: "",
    headers: [] as KVPair[],
    query_params: [] as KVPair[],
    store_variables: [] as KVPair[],
    payload_mode: "args_only" as "args_only" | "full_context",
    speak_after: true,
  });

  const loadFunctions = async () => {
    try {
      const data = await api.listCustomFunctions();
      setFunctions(data);
    } catch (e) {
      console.error("Failed to load:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFunctions();
  }, []);

  const resetForm = () => {
    setForm({
      name: "",
      description: "",
      parameters: "{}",
      webhook_url: "",
      method: "POST",
      is_active: true,
      timeout_ms: 120000,
      retry_count: 0,
      response_mapping: "",
      speak_during_execution: "",
      speak_on_failure: "",
      headers: [],
      query_params: [],
      store_variables: [],
      payload_mode: "args_only",
      speak_after: true,
    });
    setEditing(null);
    setTestResult(null);
    setParamsTab("json");
  };

  const openCreate = () => {
    resetForm();
    setShowModal(true);
  };

  const openEdit = (fn: CustomFunction) => {
    setEditing(fn);
    setForm({
      name: fn.name,
      description: fn.description || "",
      parameters: JSON.stringify(fn.parameters, null, 2),
      webhook_url: fn.webhook_url || "",
      method: fn.method,
      is_active: fn.is_active,
      timeout_ms: (fn.timeout_seconds ?? 120) * 1000,
      retry_count: fn.retry_count ?? 0,
      response_mapping: fn.response_mapping ? JSON.stringify(fn.response_mapping, null, 2) : "",
      speak_during_execution: fn.speak_during_execution || "",
      speak_on_failure: fn.speak_on_failure || "",
      headers: recordToKvPairs(fn.headers as Record<string, string> | null),
      query_params: recordToKvPairs(fn.query_params),
      store_variables: recordToKvPairs(fn.store_variables),
      payload_mode: (fn.payload_mode as "args_only" | "full_context") || "args_only",
      speak_after: true,
    });
    setTestResult(null);
    setParamsTab("json");
    setShowModal(true);
  };

  const handleFormatJson = () => {
    try {
      const parsed = JSON.parse(form.parameters);
      setForm({ ...form, parameters: JSON.stringify(parsed, null, 2) });
    } catch {
      alert("Invalid JSON — cannot format");
    }
  };

  const handleSave = async () => {
    try {
      let params = {};
      try {
        params = JSON.parse(form.parameters);
      } catch {
        alert("Invalid JSON in parameters");
        return;
      }

      let respMapping = undefined;
      if (form.response_mapping.trim()) {
        try {
          respMapping = JSON.parse(form.response_mapping);
        } catch {
          alert("Invalid JSON in response mapping");
          return;
        }
      }

      const data: Record<string, any> = {
        name: form.name,
        description: form.description || undefined,
        parameters: params,
        webhook_url: form.webhook_url || undefined,
        method: form.method,
        is_active: form.is_active,
        timeout_seconds: Math.ceil(form.timeout_ms / 1000),
        retry_count: form.retry_count,
        response_mapping: respMapping,
        speak_during_execution: form.speak_during_execution || undefined,
        speak_on_failure: form.speak_on_failure || undefined,
        headers: kvPairsToRecord(form.headers),
        query_params: kvPairsToRecord(form.query_params),
        store_variables: kvPairsToRecord(form.store_variables),
        payload_mode: form.payload_mode,
      };

      if (editing) {
        await api.updateCustomFunction(editing.id, data);
      } else {
        await api.createCustomFunction(data);
      }
      setShowModal(false);
      resetForm();
      loadFunctions();
    } catch (e) {
      console.error("Failed to save:", e);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this function?")) return;
    try {
      await api.deleteCustomFunction(id);
      loadFunctions();
    } catch (e) {
      console.error("Failed to delete:", e);
    }
  };

  const handleTest = async (id: string) => {
    setTesting(id);
    setTestResult(null);
    try {
      const result = await api.testCustomFunction(id);
      setTestResult(result);
    } catch (e: any) {
      setTestResult({ success: false, error: e.message });
    } finally {
      setTesting(null);
    }
  };

  // --- Shared input class ---
  const inputClass =
    "w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none";

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Custom Functions</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Define webhook-backed tools for your agents</p>
        </div>
        <button
          onClick={openCreate}
          className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Function
        </button>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 dark:text-gray-500 py-12">Loading...</div>
      ) : functions.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
          <Code2 className="w-12 h-12 mx-auto text-gray-600 mb-4" />
          <p className="text-gray-500 dark:text-gray-400">No custom functions yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {functions.map((fn) => (
            <div key={fn.id} className="bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 hover:border-gray-300 dark:hover:border-gray-700 transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-50 dark:bg-amber-600/20 rounded-lg flex items-center justify-center">
                    <Zap className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white font-mono">{fn.name}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-400 dark:text-gray-500 uppercase font-medium">{fn.method}</span>
                      {fn.webhook_url && (
                        <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                          <Globe className="w-3 h-3" /> Webhook
                        </span>
                      )}
                      {fn.timeout_seconds !== 30 && (
                        <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                          <Clock className="w-3 h-3" /> {fn.timeout_seconds}s
                        </span>
                      )}
                      {fn.retry_count > 0 && (
                        <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                          <RotateCcw className="w-3 h-3" /> {fn.retry_count}x
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-full ${fn.is_active ? "bg-green-400" : "bg-gray-600"}`} />
                  <button
                    onClick={() => handleTest(fn.id)}
                    disabled={testing === fn.id}
                    className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-green-400 transition-colors"
                    title="Test webhook"
                  >
                    {testing === fn.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  </button>
                  <button onClick={() => openEdit(fn)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(fn.id)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-red-400 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {fn.description && <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">{fn.description}</p>}
              {fn.speak_during_execution && (
                <p className="text-xs text-blue-400 mb-2 flex items-center gap-1">
                  <MessageSquare className="w-3 h-3" /> Speaks: &quot;{fn.speak_during_execution}&quot;
                </p>
              )}
              <pre className="text-xs text-gray-400 dark:text-gray-500 bg-gray-100/50 dark:bg-gray-800/50 rounded-lg p-3 max-h-24 overflow-y-auto whitespace-pre-wrap font-mono">
                {JSON.stringify(fn.parameters, null, 2)}
              </pre>

              {testResult && testing === null && (
                <div className={`mt-3 p-3 rounded-lg text-xs font-mono ${
                  testResult.success ? "bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400" : "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400"
                }`}>
                  {testResult.success ? `OK ${testResult.status_code}` : `FAIL: ${testResult.error}`}
                  {testResult.duration_ms && ` (${Math.round(testResult.duration_ms)}ms)`}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ======== CREATE / EDIT MODAL ======== */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editing ? "Edit Function" : "Create Function"}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 py-4 space-y-5">
              {/* 1. Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Enter the name of the custom function"
                  className={`${inputClass} font-mono`}
                />
              </div>

              {/* 2. Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Enter the description of the custom function"
                  className={inputClass}
                />
              </div>

              {/* 3. API Endpoint: method dropdown + URL */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">API Endpoint</label>
                <div className="flex gap-2">
                  <select
                    value={form.method}
                    onChange={(e) => setForm({ ...form, method: e.target.value })}
                    className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                  >
                    <option value="POST">POST</option>
                    <option value="GET">GET</option>
                    <option value="PUT">PUT</option>
                    <option value="PATCH">PATCH</option>
                    <option value="DELETE">DELETE</option>
                  </select>
                  <input
                    type="url"
                    value={form.webhook_url}
                    onChange={(e) => setForm({ ...form, webhook_url: e.target.value })}
                    placeholder="https://api.example.com/webhook"
                    className={`${inputClass} flex-1`}
                  />
                </div>
              </div>

              {/* 4. Timeout (ms) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Timeout (ms)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1000}
                    max={600000}
                    step={1000}
                    value={form.timeout_ms}
                    onChange={(e) => setForm({ ...form, timeout_ms: parseInt(e.target.value) || 120000 })}
                    className={inputClass}
                  />
                  <span className="text-xs text-gray-400 whitespace-nowrap">milliseconds</span>
                </div>
              </div>

              {/* 5. Headers */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Headers</label>
                <KeyValuePairEditor
                  pairs={form.headers}
                  onChange={(headers) => setForm({ ...form, headers })}
                  keyPlaceholder="Header name"
                  valuePlaceholder="Header value"
                />
              </div>

              {/* 6. Query Parameters */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Query Parameters</label>
                <KeyValuePairEditor
                  pairs={form.query_params}
                  onChange={(query_params) => setForm({ ...form, query_params })}
                  keyPlaceholder="Param name"
                  valuePlaceholder="Param value"
                />
              </div>

              {/* 7. Parameters (Optional) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Parameters (Optional)</label>
                <p className="text-xs text-gray-400 mb-2">JSON schema that defines the format in which the LLM will return.</p>

                {/* Tabs: JSON / Form */}
                <div className="flex items-center gap-4 mb-2">
                  <div className="flex border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
                    <button
                      onClick={() => setParamsTab("json")}
                      className={`px-3 py-1 text-xs font-medium transition-colors ${
                        paramsTab === "json"
                          ? "bg-amber-600 text-white"
                          : "bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-gray-900 dark:hover:text-white"
                      }`}
                    >
                      JSON
                    </button>
                    <button
                      onClick={() => setParamsTab("form")}
                      className={`px-3 py-1 text-xs font-medium transition-colors ${
                        paramsTab === "form"
                          ? "bg-amber-600 text-white"
                          : "bg-gray-100 dark:bg-gray-800 text-gray-500 hover:text-gray-900 dark:hover:text-white"
                      }`}
                    >
                      Form
                    </button>
                  </div>

                  {/* Payload mode toggle */}
                  <button
                    onClick={() =>
                      setForm({
                        ...form,
                        payload_mode: form.payload_mode === "args_only" ? "full_context" : "args_only",
                      })
                    }
                    className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-amber-500 hover:text-amber-500 transition-colors"
                  >
                    Payload: {form.payload_mode === "args_only" ? "args only" : "full context"}
                  </button>
                </div>

                {paramsTab === "json" ? (
                  <>
                    <textarea
                      value={form.parameters}
                      onChange={(e) => setForm({ ...form, parameters: e.target.value })}
                      rows={6}
                      placeholder="Enter JSON Schema here..."
                      className={`${inputClass} font-mono resize-none`}
                    />
                    <div className="flex items-center gap-2 mt-2">
                      {JSON_EXAMPLES.map((ex) => (
                        <button
                          key={ex.label}
                          onClick={() =>
                            setForm({ ...form, parameters: JSON.stringify(ex.schema, null, 2) })
                          }
                          className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-amber-500 hover:text-amber-500 transition-colors"
                        >
                          {ex.label}
                        </button>
                      ))}
                      <button
                        onClick={handleFormatJson}
                        className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-amber-500 hover:text-amber-500 transition-colors ml-auto"
                      >
                        Format JSON
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg p-4 text-sm text-gray-400">
                    Form builder coming soon. Use the JSON tab for now.
                  </div>
                )}
              </div>

              {/* 8. Store Fields as Variables */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Store Fields as Variables</label>
                <p className="text-xs text-gray-400 mb-2">Extract response fields into variables. Key = variable name, Value = dot-notation path (e.g. data.user.id)</p>
                <KeyValuePairEditor
                  pairs={form.store_variables}
                  onChange={(store_variables) => setForm({ ...form, store_variables })}
                  keyPlaceholder="Variable name"
                  valuePlaceholder="$.path.to.field"
                />
              </div>

              {/* 9. Speak During Execution */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Speak During Execution</label>
                <input
                  type="text"
                  value={form.speak_during_execution}
                  onChange={(e) => setForm({ ...form, speak_during_execution: e.target.value })}
                  placeholder="One moment, let me look that up for you..."
                  className={inputClass}
                />
                <p className="text-xs text-gray-400 mt-1">
                  If the function takes longer than 2 seconds, this text will be spoken to fill the silence.
                </p>
              </div>

              {/* 10. Speak After Execution */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.speak_after}
                  onChange={(e) => setForm({ ...form, speak_after: e.target.checked })}
                  className="rounded bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-amber-600"
                />
                <div>
                  <label className="text-sm text-gray-700 dark:text-gray-300 font-medium">Speak After Execution</label>
                  <p className="text-xs text-gray-400">Unselect if you want to run the function silently</p>
                </div>
              </div>

              {/* Response Mapping (kept for backwards compat) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Response Mapping (JSON)</label>
                <textarea
                  value={form.response_mapping}
                  onChange={(e) => setForm({ ...form, response_mapping: e.target.value })}
                  rows={3}
                  placeholder='{"status": "$.data.status", "message": "$.result.message"}'
                  className={`${inputClass} font-mono resize-none`}
                />
                <p className="text-xs text-gray-400 mt-1">Map response fields using dot-notation paths</p>
              </div>

              {/* Active toggle */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="rounded bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-amber-600"
                />
                <label className="text-sm text-gray-700 dark:text-gray-300">Active</label>
              </div>

              {/* Test webhook */}
              {editing && (
                <div>
                  <button
                    onClick={() => handleTest(editing.id)}
                    disabled={testing !== null}
                    className="w-full bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                    Test Webhook
                  </button>
                  {testResult && (
                    <div className={`mt-3 p-3 rounded-lg text-xs font-mono max-h-40 overflow-y-auto ${
                      testResult.success ? "bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400" : "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400"
                    }`}>
                      <div className="font-bold mb-1">
                        {testResult.success ? `OK ${testResult.status_code}` : "FAILED"}
                        {testResult.duration_ms && ` (${Math.round(testResult.duration_ms)}ms)`}
                      </div>
                      <pre className="whitespace-pre-wrap">
                        {testResult.error || JSON.stringify(testResult.response, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-800 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">Cancel</button>
              <button
                onClick={handleSave}
                disabled={!form.name}
                className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {editing ? "Save Changes" : "Create Function"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
