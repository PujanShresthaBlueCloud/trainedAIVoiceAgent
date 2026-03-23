"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
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
  CheckCircle,
  AlertCircle,
  Loader2,
  Zap,
  Plus,
  X,
  Pencil,
  Play,
  Unplug,
  Send,
  RotateCcw,
  User,
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

// --- Integration Templates ---

interface IntegrationTemplate {
  id: string;
  label: string;
  color: string;
  bgColor: string;
  borderColor: string;
  placeholderUrl: string;
  defaultDescription: string;
  namePrefix: string;
}

const INTEGRATION_TEMPLATES: IntegrationTemplate[] = [
  {
    id: "n8n",
    label: "n8n Webhook",
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-50 dark:bg-orange-900/20",
    borderColor: "border-orange-200 dark:border-orange-800",
    placeholderUrl: "https://your-n8n.com/webhook/...",
    defaultDescription: "Triggers an n8n workflow via webhook",
    namePrefix: "n8n_webhook",
  },
  {
    id: "zapier",
    label: "Zapier Webhook",
    color: "text-orange-500 dark:text-orange-400",
    bgColor: "bg-amber-50 dark:bg-amber-900/20",
    borderColor: "border-amber-200 dark:border-amber-800",
    placeholderUrl: "https://hooks.zapier.com/hooks/catch/...",
    defaultDescription: "Triggers a Zapier Zap via webhook",
    namePrefix: "zapier_webhook",
  },
  {
    id: "make",
    label: "Make Webhook",
    color: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-50 dark:bg-purple-900/20",
    borderColor: "border-purple-200 dark:border-purple-800",
    placeholderUrl: "https://hook.us1.make.com/...",
    defaultDescription: "Triggers a Make (Integromat) scenario via webhook",
    namePrefix: "make_webhook",
  },
  {
    id: "custom",
    label: "Custom Webhook",
    color: "text-gray-600 dark:text-gray-400",
    bgColor: "bg-gray-50 dark:bg-gray-800/50",
    borderColor: "border-gray-200 dark:border-gray-700",
    placeholderUrl: "https://api.example.com/webhook",
    defaultDescription: "Calls a custom webhook endpoint",
    namePrefix: "custom_webhook",
  },
];

function detectPlatform(url: string | null): string {
  if (!url) return "Custom";
  const lower = url.toLowerCase();
  if (lower.includes("n8n")) return "n8n";
  if (lower.includes("hooks.zapier.com")) return "Zapier";
  if (lower.includes("make.com") || lower.includes("integromat")) return "Make";
  return "Custom";
}

function getPlatformStyle(platform: string) {
  switch (platform) {
    case "n8n":
      return "bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400";
    case "Zapier":
      return "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400";
    case "Make":
      return "bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400";
    default:
      return "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400";
  }
}

// --- Key-Value Pair Editor ---

function KeyValueEditor({
  label,
  description,
  pairs,
  onChange,
}: {
  label: string;
  description?: string;
  pairs: { key: string; value: string }[];
  onChange: (pairs: { key: string; value: string }[]) => void;
}) {
  const addPair = () => onChange([...pairs, { key: "", value: "" }]);
  const removePair = (idx: number) => onChange(pairs.filter((_, i) => i !== idx));
  const updatePair = (idx: number, field: "key" | "value", val: string) => {
    const next = [...pairs];
    next[idx] = { ...next[idx], [field]: val };
    onChange(next);
  };

  return (
    <div>
      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
        {label}
      </label>
      {description && (
        <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-2">{description}</p>
      )}
      <div className="space-y-2">
        {pairs.map((pair, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <input
              type="text"
              value={pair.key}
              onChange={(e) => updatePair(idx, "key", e.target.value)}
              placeholder="Key"
              className="flex-1 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 dark:text-white font-mono focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
            />
            <input
              type="text"
              value={pair.value}
              onChange={(e) => updatePair(idx, "value", e.target.value)}
              placeholder="Value"
              className="flex-1 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 dark:text-white font-mono focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
            />
            <button
              onClick={() => removePair(idx)}
              className="p-1 text-gray-400 hover:text-red-500 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={addPair}
        className="mt-2 flex items-center gap-1 text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
      >
        <Plus className="w-3 h-3" />
        New key value pair
      </button>
    </div>
  );
}

// --- Parameter Form Row ---

interface ParamRow {
  name: string;
  description: string;
  type: string;
  required: boolean;
}

function schemaToRows(schema: any): ParamRow[] {
  if (!schema || schema.type !== "object" || !schema.properties) return [];
  const requiredSet = new Set<string>(schema.required || []);
  return Object.entries(schema.properties).map(([name, prop]: [string, any]) => ({
    name,
    description: prop.description || "",
    type: prop.type || "string",
    required: requiredSet.has(name),
  }));
}

function rowsToSchema(rows: ParamRow[]): any {
  const properties: Record<string, any> = {};
  const required: string[] = [];
  for (const row of rows) {
    if (!row.name.trim()) continue;
    properties[row.name.trim()] = {
      type: row.type,
      ...(row.description ? { description: row.description } : {}),
    };
    if (row.required) required.push(row.name.trim());
  }
  return {
    type: "object",
    properties,
    ...(required.length > 0 ? { required } : {}),
  };
}

// --- Quick Create Modal ---

interface QuickCreateModalProps {
  template: IntegrationTemplate | null;
  editingFunction: CustomFunction | null;
  existingNames: string[];
  onSave: (data: any, existingId?: string) => Promise<void>;
  onClose: () => void;
  onTest: (id: string) => void;
  testingId: string | null;
  testResult: { success: boolean; message: string; time?: number } | null;
}

function QuickCreateModal({
  template,
  editingFunction,
  existingNames,
  onSave,
  onClose,
  onTest,
  testingId,
  testResult,
}: QuickCreateModalProps) {
  const isEditing = !!editingFunction;
  const tpl = template || INTEGRATION_TEMPLATES[3];

  // Basic fields
  const [fnName, setFnName] = useState(
    editingFunction?.name || `${tpl.namePrefix}_${Date.now().toString(36).slice(-4)}`
  );
  const [fnDescription, setFnDescription] = useState(
    editingFunction?.description || tpl.defaultDescription
  );
  const [webhookUrl, setWebhookUrl] = useState(editingFunction?.webhook_url || "");
  const [method, setMethod] = useState(editingFunction?.method || "POST");

  // Timeout in ms (stored as seconds in DB)
  const [timeoutMs, setTimeoutMs] = useState(
    editingFunction ? editingFunction.timeout_seconds * 1000 : 120000
  );

  // Headers
  const [headers, setHeaders] = useState<{ key: string; value: string }[]>(() => {
    const h = editingFunction?.headers;
    if (h && typeof h === "object") {
      return Object.entries(h).map(([key, value]) => ({ key, value: String(value) }));
    }
    return [];
  });

  // Query params
  const [queryParams, setQueryParams] = useState<{ key: string; value: string }[]>(() => {
    const q = editingFunction?.query_params;
    if (q && typeof q === "object") {
      return Object.entries(q).map(([key, value]) => ({ key, value: String(value) }));
    }
    return [];
  });

  // Parameters — JSON vs Form view
  const [paramView, setParamView] = useState<"json" | "form">("form");
  const [paramJson, setParamJson] = useState(() => {
    if (editingFunction) return JSON.stringify(editingFunction.parameters, null, 2);
    return JSON.stringify({ type: "object", properties: {} }, null, 2);
  });
  const [paramRows, setParamRows] = useState<ParamRow[]>(() => {
    if (editingFunction) return schemaToRows(editingFunction.parameters);
    return [];
  });
  const [payloadMode, setPayloadMode] = useState(editingFunction?.payload_mode || "args_only");

  // Store variables
  const [storeVars, setStoreVars] = useState<{ key: string; value: string }[]>(() => {
    const s = editingFunction?.store_variables;
    if (s && typeof s === "object") {
      return Object.entries(s).map(([key, value]) => ({ key, value: String(value) }));
    }
    return [];
  });

  // Speak during execution
  const [speakDuring, setSpeakDuring] = useState(editingFunction?.speak_during_execution || "");

  // Speak after execution (toggle)
  const [speakAfter, setSpeakAfter] = useState(
    editingFunction ? editingFunction.speak_on_failure !== "__silent__" : true
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Sync between JSON and Form views
  const switchToForm = () => {
    try {
      const parsed = JSON.parse(paramJson);
      setParamRows(schemaToRows(parsed));
      setParamView("form");
    } catch {
      setError("Fix JSON errors before switching to Form view");
    }
  };
  const switchToJson = () => {
    const schema = rowsToSchema(paramRows);
    setParamJson(JSON.stringify(schema, null, 2));
    setParamView("json");
  };

  const addParamRow = () =>
    setParamRows((prev) => [...prev, { name: "", description: "", type: "string", required: false }]);
  const removeParamRow = (idx: number) => setParamRows((prev) => prev.filter((_, i) => i !== idx));
  const updateParamRow = (idx: number, field: keyof ParamRow, val: any) => {
    setParamRows((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: val };
      return next;
    });
  };

  // Build payload from all fields
  const buildPayload = (): any | null => {
    setError("");
    if (!fnName.trim()) { setError("Function name is required"); return null; }
    if (!webhookUrl.trim()) { setError("Webhook URL is required"); return null; }
    if (!isEditing && existingNames.includes(fnName.trim())) {
      setError("A function with this name already exists");
      return null;
    }

    let parsedParams: any;
    if (paramView === "json") {
      try { parsedParams = JSON.parse(paramJson); } catch {
        setError("Parameters must be valid JSON");
        return null;
      }
    } else {
      parsedParams = rowsToSchema(paramRows);
    }

    const headersObj: Record<string, string> = {};
    for (const h of headers) {
      if (h.key.trim()) headersObj[h.key.trim()] = h.value;
    }

    const queryObj: Record<string, string> = {};
    for (const q of queryParams) {
      if (q.key.trim()) queryObj[q.key.trim()] = q.value;
    }

    const storeObj: Record<string, string> = {};
    for (const s of storeVars) {
      if (s.key.trim()) storeObj[s.key.trim()] = s.value;
    }

    return {
      name: fnName.trim(),
      description: fnDescription.trim(),
      webhook_url: webhookUrl.trim(),
      method,
      timeout_seconds: Math.round(timeoutMs / 1000),
      headers: Object.keys(headersObj).length > 0 ? headersObj : null,
      query_params: Object.keys(queryObj).length > 0 ? queryObj : null,
      parameters: parsedParams,
      payload_mode: payloadMode,
      store_variables: Object.keys(storeObj).length > 0 ? storeObj : null,
      speak_during_execution: speakDuring.trim() || null,
      speak_on_failure: speakAfter ? null : "__silent__",
      is_active: true,
    };
  };

  const handleSave = async () => {
    const payload = buildPayload();
    if (!payload) return;
    setSaving(true);
    try {
      await onSave(payload, editingFunction?.id);
    } catch (e: any) {
      setError(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none";
  const labelCls = "block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1";

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-2xl max-h-[92vh] flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Zap className={`w-4 h-4 ${tpl.color}`} />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              {isEditing ? "Edit Function" : `New ${tpl.label}`}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Name */}
          <div>
            <label className={labelCls}>Name</label>
            <input
              type="text"
              value={fnName}
              onChange={(e) => setFnName(e.target.value.replace(/\s+/g, "_").toLowerCase())}
              className={`${inputCls} font-mono`}
              placeholder="my_webhook_function"
            />
          </div>

          {/* Description */}
          <div>
            <label className={labelCls}>Description</label>
            <input
              type="text"
              value={fnDescription}
              onChange={(e) => setFnDescription(e.target.value)}
              className={inputCls}
              placeholder="Enter the description of the custom function"
            />
          </div>

          {/* API Endpoint: Method + URL */}
          <div>
            <label className={labelCls}>API Endpoint</label>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-1.5">
              The API Endpoint is the address of the service you are connecting to
            </p>
            <div className="flex gap-2">
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-24 flex-shrink-0 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-2.5 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none font-medium"
              >
                <option value="POST">POST</option>
                <option value="GET">GET</option>
                <option value="PUT">PUT</option>
                <option value="PATCH">PATCH</option>
                <option value="DELETE">DELETE</option>
              </select>
              <input
                type="url"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                className={`${inputCls} font-mono text-xs`}
                placeholder={tpl.placeholderUrl}
              />
            </div>
          </div>

          {/* Timeout */}
          <div>
            <label className={labelCls}>Timeout (ms)</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={timeoutMs}
                onChange={(e) => setTimeoutMs(Number(e.target.value) || 0)}
                min={1000}
                max={600000}
                step={1000}
                className={`${inputCls} w-40 font-mono`}
              />
              <span className="text-xs text-gray-400">milliseconds</span>
            </div>
          </div>

          {/* Headers */}
          <KeyValueEditor
            label="Headers"
            description="Specify the HTTP headers required for your API request."
            pairs={headers}
            onChange={setHeaders}
          />

          {/* Query Parameters */}
          <KeyValueEditor
            label="Query Parameters"
            description="Query string parameters to append to the URL."
            pairs={queryParams}
            onChange={setQueryParams}
          />

          {/* Parameters */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className={labelCls + " mb-0"}>Parameters (Optional)</label>
              <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
                <button
                  onClick={paramView === "form" ? switchToJson : undefined}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
                    paramView === "json"
                      ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-700"
                  }`}
                >
                  JSON
                </button>
                <button
                  onClick={paramView === "json" ? switchToForm : undefined}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors ${
                    paramView === "form"
                      ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                      : "text-gray-500 dark:text-gray-400 hover:text-gray-700"
                  }`}
                >
                  Form
                </button>
              </div>
            </div>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-2">
              JSON schema that defines the format in which the LLM will return. Please refer to the docs.
            </p>

            {/* Payload mode */}
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[11px] text-gray-500 dark:text-gray-400">Payload:</span>
              <select
                value={payloadMode}
                onChange={(e) => setPayloadMode(e.target.value)}
                className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-2 py-1 text-[11px] text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="args_only">args only</option>
                <option value="full">full</option>
              </select>
            </div>

            {paramView === "json" ? (
              <textarea
                value={paramJson}
                onChange={(e) => setParamJson(e.target.value)}
                rows={8}
                className={`${inputCls} font-mono text-xs resize-y`}
              />
            ) : (
              <div className="space-y-2">
                {paramRows.length > 0 && (
                  <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    <div className="grid grid-cols-[1fr_1.5fr_80px_50px_32px] gap-0 bg-gray-50 dark:bg-gray-800/50 px-3 py-1.5 text-[10px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      <span>Parameter Name</span>
                      <span>Description</span>
                      <span>Type</span>
                      <span className="text-center">Req</span>
                      <span />
                    </div>
                    {paramRows.map((row, idx) => (
                      <div
                        key={idx}
                        className="grid grid-cols-[1fr_1.5fr_80px_50px_32px] gap-0 items-center px-3 py-1.5 border-t border-gray-100 dark:border-gray-800"
                      >
                        <input
                          type="text"
                          value={row.name}
                          onChange={(e) =>
                            updateParamRow(idx, "name", e.target.value.replace(/\s+/g, "_"))
                          }
                          placeholder="name"
                          className="bg-transparent text-xs text-gray-900 dark:text-white font-mono outline-none mr-2"
                        />
                        <input
                          type="text"
                          value={row.description}
                          onChange={(e) => updateParamRow(idx, "description", e.target.value)}
                          placeholder="Description"
                          className="bg-transparent text-xs text-gray-500 dark:text-gray-400 outline-none mr-2"
                        />
                        <select
                          value={row.type}
                          onChange={(e) => updateParamRow(idx, "type", e.target.value)}
                          className="bg-transparent text-xs text-gray-700 dark:text-gray-300 outline-none"
                        >
                          <option value="string">string</option>
                          <option value="number">number</option>
                          <option value="boolean">boolean</option>
                          <option value="integer">integer</option>
                          <option value="array">array</option>
                          <option value="object">object</option>
                        </select>
                        <div className="flex justify-center">
                          <input
                            type="checkbox"
                            checked={row.required}
                            onChange={(e) => updateParamRow(idx, "required", e.target.checked)}
                            className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                          />
                        </div>
                        <button
                          onClick={() => removeParamRow(idx)}
                          className="p-0.5 text-gray-400 hover:text-red-500 transition-colors justify-self-center"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  onClick={addParamRow}
                  className="flex items-center gap-1 text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  Add
                </button>
              </div>
            )}
          </div>

          {/* Store Variables */}
          <KeyValueEditor
            label="Store Fields as Variables"
            description="Extract values from tool response and store as dynamic variables."
            pairs={storeVars}
            onChange={setStoreVars}
          />

          {/* Speak During Execution */}
          <div>
            <label className={labelCls}>Speak During Execution</label>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-1.5">
              If the function takes over 2 seconds, the agent can say something like: &quot;Let me check that for you.&quot;
            </p>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 font-medium">
                Static Sentence
              </span>
            </div>
            <input
              type="text"
              value={speakDuring}
              onChange={(e) => setSpeakDuring(e.target.value)}
              className={inputCls}
              placeholder="I am finalising your booking now, just a sec."
            />
          </div>

          {/* Speak After Execution */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
                Speak After Execution
              </p>
              <p className="text-[11px] text-gray-400 dark:text-gray-500">
                Unselect if you want to run the function silently, such as uploading the call result to the server silently.
              </p>
            </div>
            <button
              role="switch"
              aria-checked={speakAfter}
              aria-label="Speak After Execution"
              onClick={() => setSpeakAfter(!speakAfter)}
              className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ml-4 ${
                speakAfter ? "bg-indigo-600" : "bg-gray-300 dark:bg-gray-600"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
                  speakAfter ? "translate-x-5" : ""
                }`}
              />
            </button>
          </div>

          {/* Error display */}
          {error && (
            <div className="flex items-center gap-2 text-xs text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
              <AlertCircle className="w-3 h-3 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Test result */}
          {isEditing && testResult && (
            <div
              className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${
                testResult.success
                  ? "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20"
                  : "text-red-500 bg-red-50 dark:bg-red-900/20"
              }`}
            >
              {testResult.success ? (
                <CheckCircle className="w-3 h-3 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-3 h-3 flex-shrink-0" />
              )}
              {testResult.message}
              {testResult.time != null && (
                <span className="ml-auto text-gray-400">{testResult.time}ms</span>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 rounded-b-xl flex-shrink-0">
          <div>
            {isEditing && (
              <button
                onClick={() => onTest(editingFunction!.id)}
                disabled={!!testingId}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {testingId === editingFunction!.id ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Play className="w-3 h-3" />
                )}
                Test
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Save className="w-3 h-3" />
              )}
              {isEditing ? "Update" : "Save & Connect"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Toast Notification ---

interface ToastState {
  message: string;
  type: "success" | "error";
  visible: boolean;
}

function Toast({ toast, onDismiss }: { toast: ToastState; onDismiss: () => void }) {
  useEffect(() => {
    if (toast.visible) {
      const timer = setTimeout(onDismiss, 3000);
      return () => clearTimeout(timer);
    }
  }, [toast.visible, onDismiss]);

  if (!toast.visible) return null;

  return (
    <div className="fixed top-4 right-4 z-50 animate-in fade-in slide-in-from-top-2">
      <div
        className={`flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg border text-sm font-medium ${
          toast.type === "success"
            ? "bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-800 text-green-700 dark:text-green-400"
            : "bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400"
        }`}
      >
        {toast.type === "success" ? (
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
        ) : (
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
        )}
        {toast.message}
      </div>
    </div>
  );
}

// --- Collapsible Section ---

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

// --- MCP Modal ---

interface MCPModalProps {
  initial: { name: string; url: string; timeout: number; headers: { key: string; value: string }[]; queryParams: { key: string; value: string }[] } | null;
  onSave: (server: { name: string; url: string; timeout: number; headers: { key: string; value: string }[]; queryParams: { key: string; value: string }[] }) => void;
  onClose: () => void;
}

function MCPModal({ initial, onSave, onClose }: MCPModalProps) {
  const [mcpName, setMcpName] = useState(initial?.name || "");
  const [mcpUrl, setMcpUrl] = useState(initial?.url || "");
  const [mcpTimeout, setMcpTimeout] = useState(initial?.timeout ?? 10000);
  const [mcpHeaders, setMcpHeaders] = useState<{ key: string; value: string }[]>(initial?.headers || []);
  const [mcpQueryParams, setMcpQueryParams] = useState<{ key: string; value: string }[]>(initial?.queryParams || []);
  const [error, setError] = useState("");

  const handleSave = () => {
    if (!mcpName.trim()) { setError("Name is required"); return; }
    if (!mcpUrl.trim()) { setError("URL is required"); return; }
    onSave({ name: mcpName.trim(), url: mcpUrl.trim(), timeout: mcpTimeout, headers: mcpHeaders, queryParams: mcpQueryParams });
  };

  const inputCls = "w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none";
  const labelCls = "block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1";

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-lg max-h-[90vh] flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Unplug className="w-4 h-4 text-indigo-500" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              {initial ? "Edit MCP Server" : "Add MCP Server"}
            </h3>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label className={labelCls}>Enter the name of the MCP</label>
            <input type="text" value={mcpName} onChange={(e) => setMcpName(e.target.value)} className={inputCls} placeholder="my-mcp-server" />
          </div>
          <div>
            <label className={labelCls}>Enter the URL of the MCP</label>
            <input type="url" value={mcpUrl} onChange={(e) => setMcpUrl(e.target.value)} className={`${inputCls} font-mono text-xs`} placeholder="https://mcp.example.com/sse" />
          </div>
          <div>
            <label className={labelCls}>Timeout (ms)</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={mcpTimeout}
                onChange={(e) => setMcpTimeout(Number(e.target.value) || 10000)}
                min={1000}
                max={300000}
                step={1000}
                className={`${inputCls} w-36 font-mono`}
              />
              <span className="text-xs text-gray-400">milliseconds</span>
            </div>
          </div>
          <KeyValueEditor label="Headers" description="Specify the HTTP headers required for your MCP connection request." pairs={mcpHeaders} onChange={setMcpHeaders} />
          <KeyValueEditor label="Query Parameters" description="Query string parameters to append to the URL." pairs={mcpQueryParams} onChange={setMcpQueryParams} />
          {error && (
            <div className="flex items-center gap-2 text-xs text-red-500 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
              <AlertCircle className="w-3 h-3 flex-shrink-0" />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 rounded-b-xl flex-shrink-0">
          <button onClick={onClose} className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors">
            <Save className="w-3 h-3" />
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// --- Toggle Switch ---

function ToggleSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors ${
        checked ? "bg-indigo-600" : "bg-gray-300 dark:bg-gray-600"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${
          checked ? "translate-x-5" : ""
        }`}
      />
    </button>
  );
}

// --- Main Page ---

export default function AgentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const agentId = params.id as string;

  // Data state
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [customFunctions, setCustomFunctions] = useState<CustomFunction[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [calls, setCalls] = useState<Call[]>([]);
  const [callsLoading, setCallsLoading] = useState(true);
  const [callSearch, setCallSearch] = useState("");
  const [testTab, setTestTab] = useState<"audio" | "chat">("audio");

  // Quick-create modal state
  const [showQuickCreate, setShowQuickCreate] = useState(false);
  const [quickCreateTemplate, setQuickCreateTemplate] = useState<IntegrationTemplate | null>(null);
  const [editingFunction, setEditingFunction] = useState<CustomFunction | null>(null);
  const [testingFnId, setTestingFnId] = useState<string | null>(null);
  const [testedFnId, setTestedFnId] = useState<string | null>(null);
  const [testFnResult, setTestFnResult] = useState<{ success: boolean; message: string; time?: number } | null>(null);

  // Chat state
  const [chatMessages, setChatMessages] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatStreaming, setChatStreaming] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const [chatConversationId, setChatConversationId] = useState<string | null>(null);

  // Toast
  const [toast, setToast] = useState<ToastState>({ message: "", type: "success", visible: false });
  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type, visible: true });
  }, []);
  const dismissToast = useCallback(() => {
    setToast((t) => ({ ...t, visible: false }));
  }, []);

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
  const [cartesiaVoiceId, setCartesiaVoiceId] = useState("");

  // Transfer call config
  const [transferDescription, setTransferDescription] = useState("Transfer the call to a human agent");
  const [transferDestType, setTransferDestType] = useState<"static" | "dynamic">("static");
  const [transferRoutingText, setTransferRoutingText] = useState("");
  const [transferType, setTransferType] = useState<"cold" | "warm" | "agentic_warm">("cold");
  const [transferCallerId, setTransferCallerId] = useState<"agent" | "user">("agent");
  const [transferDuringType, setTransferDuringType] = useState<"music" | "ringtone">("ringtone");
  const [transferRingDuration, setTransferRingDuration] = useState(30);
  const [transferNavigateIVR, setTransferNavigateIVR] = useState(false);
  const [transferHasQueue, setTransferHasQueue] = useState(false);
  const [transferWaitTime, setTransferWaitTime] = useState(10);
  const [transferWhisperEnabled, setTransferWhisperEnabled] = useState(false);
  const [transferWhisperMessage, setTransferWhisperMessage] = useState("");
  const [transferThreeWayEnabled, setTransferThreeWayEnabled] = useState(false);
  const [transferThreeWayMessage, setTransferThreeWayMessage] = useState("");
  const [transferSIPHeaders, setTransferSIPHeaders] = useState<{ key: string; value: string }[]>([]);
  const [transferTalkWhileWaiting, setTransferTalkWhileWaiting] = useState(false);
  const [transferTalkMessage, setTransferTalkMessage] = useState("");

  // Post-call data extraction
  interface ExtractionField { name: string; description: string; type: string; }
  interface MCPServer { name: string; url: string; timeout: number; headers: { key: string; value: string }[]; queryParams: { key: string; value: string }[]; }
  const [extractionEnabled, setExtractionEnabled] = useState(false);
  const [extractionFields, setExtractionFields] = useState<ExtractionField[]>([]);
  const [extractionWebhook, setExtractionWebhook] = useState("");

  // Realtime transcription settings
  const [denoisingMode, setDenoisingMode] = useState<"remove_noise" | "remove_noise_background_speech" | "no_denoising">("no_denoising");
  const [transcriptionMode, setTranscriptionMode] = useState<"speed" | "accuracy" | "custom">("speed");
  const [vocabularySpecialization, setVocabularySpecialization] = useState<"general" | "medical">("general");
  const [boostedKeywords, setBoostedKeywords] = useState("");

  // Webhook settings
  const WEBHOOK_EVENTS = ["call_started", "call_ended", "transcript_ready", "extraction_completed", "call_failed"] as const;
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookTimeout, setWebhookTimeout] = useState(5);
  const [webhookEvents, setWebhookEvents] = useState<string[]>([]);
  const [webhookTesting, setWebhookTesting] = useState(false);
  const [webhookTestResult, setWebhookTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  // MCP servers
  const [mcpServers, setMcpServers] = useState<MCPServer[]>([]);
  const [showMCPModal, setShowMCPModal] = useState(false);
  const [editingMCPIdx, setEditingMCPIdx] = useState<number | null>(null);

  // Speech synthesis settings
  const [ttsSpeed, setTtsSpeed] = useState("normal");
  const [ttsEmotion, setTtsEmotion] = useState<string[]>([]);
  const [allowInterruptions, setAllowInterruptions] = useState(true);
  const [minEndpointingDelay, setMinEndpointingDelay] = useState(0.3);
  const [maxEndpointingDelay, setMaxEndpointingDelay] = useState(1.5);

  // Dirty tracking — snapshot of last-saved form values
  const [savedSnapshot, setSavedSnapshot] = useState<string>("");
  const currentSnapshot = useMemo(
    () =>
      JSON.stringify({
        name,
        description,
        systemPrompt,
        voiceId,
        language,
        llmModel,
        toolsEnabled,
        isActive,
        knowledgeBaseId,
        welcomeMessage,
        pauseBeforeSpeaking,
        aiSpeaksFirst,
        dynamicMessage,
        cartesiaVoiceId,
        ttsSpeed,
        ttsEmotion,
        allowInterruptions,
        minEndpointingDelay,
        maxEndpointingDelay,
        extractionEnabled,
        extractionFields,
        extractionWebhook,
        transferDescription, transferDestType, transferRoutingText, transferType,
        transferCallerId, transferDuringType, transferRingDuration, transferNavigateIVR,
        transferHasQueue, transferWaitTime, transferWhisperEnabled, transferWhisperMessage,
        transferThreeWayEnabled, transferThreeWayMessage, transferSIPHeaders,
        transferTalkWhileWaiting, transferTalkMessage,
        mcpServers,
        webhookUrl, webhookTimeout, webhookEvents,
        denoisingMode, transcriptionMode, vocabularySpecialization, boostedKeywords,
      }),
    [
      name, description, systemPrompt, voiceId, language, llmModel,
      toolsEnabled, isActive, knowledgeBaseId, welcomeMessage,
      pauseBeforeSpeaking, aiSpeaksFirst, dynamicMessage, cartesiaVoiceId,
      ttsSpeed, ttsEmotion, allowInterruptions, minEndpointingDelay, maxEndpointingDelay,
      extractionEnabled, extractionFields, extractionWebhook,
      transferDescription, transferDestType, transferRoutingText, transferType,
      transferCallerId, transferDuringType, transferRingDuration, transferNavigateIVR,
      transferHasQueue, transferWaitTime, transferWhisperEnabled, transferWhisperMessage,
      transferThreeWayEnabled, transferThreeWayMessage, transferSIPHeaders,
      transferTalkWhileWaiting, transferTalkMessage,
      mcpServers, webhookUrl, webhookTimeout, webhookEvents,
      denoisingMode, transcriptionMode, vocabularySpecialization, boostedKeywords,
    ]
  );
  const isDirty = savedSnapshot !== "" && currentSnapshot !== savedSnapshot;

  // Available LLM models — include agent's current model if not in default list
  const availableModels = useMemo(() => {
    if (llmModel && !LLM_MODELS.includes(llmModel)) {
      return [llmModel, ...LLM_MODELS];
    }
    return LLM_MODELS;
  }, [llmModel]);

  // Warn before navigating away with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  // --- Populate form from agent data ---
  const populateForm = useCallback((data: Agent) => {
    setName(data.name);
    setDescription(data.description || "");
    setSystemPrompt(data.system_prompt);
    setVoiceId(data.voice_id);
    setLanguage(data.language);
    setLlmModel(data.llm_model);
    setToolsEnabled(data.tools_enabled || []);
    setIsActive(data.is_active);
    setKnowledgeBaseId(data.knowledge_base_id || "");
    const meta = data.metadata || {};
    setWelcomeMessage(meta.welcome_message || "");
    setPauseBeforeSpeaking(meta.pause_before_speaking ?? 0);
    setAiSpeaksFirst(meta.ai_speaks_first ?? false);
    setDynamicMessage(meta.dynamic_message ?? false);
    setCartesiaVoiceId(meta.cartesia_voice_id || "");
    setTtsSpeed(meta.tts_speed || "normal");
    setTtsEmotion(meta.tts_emotion || []);
    setAllowInterruptions(meta.allow_interruptions ?? true);
    setMinEndpointingDelay(meta.min_endpointing_delay ?? 0.3);
    setMaxEndpointingDelay(meta.max_endpointing_delay ?? 1.5);
    const exc = meta.post_call_extraction || {};
    setExtractionEnabled(exc.enabled ?? false);
    setExtractionFields(exc.fields || []);
    setExtractionWebhook(exc.webhook_url || "");
    const tc = meta.transfer_call_config || {};
    setTransferDescription(tc.description || "Transfer the call to a human agent");
    setTransferDestType(tc.destination_type || "static");
    setTransferRoutingText(tc.routing_text || "");
    setTransferType(tc.transfer_type || "cold");
    setTransferCallerId(tc.caller_id || "agent");
    setTransferDuringType(tc.during_type || "ringtone");
    setTransferRingDuration(tc.ring_duration ?? 30);
    setTransferNavigateIVR(tc.navigate_ivr ?? false);
    setTransferHasQueue(tc.has_queue ?? false);
    setTransferWaitTime(tc.wait_time ?? 10);
    setTransferWhisperEnabled(tc.whisper_enabled ?? false);
    setTransferWhisperMessage(tc.whisper_message || "");
    setTransferThreeWayEnabled(tc.three_way_enabled ?? false);
    setTransferThreeWayMessage(tc.three_way_message || "");
    setTransferSIPHeaders(tc.sip_headers || []);
    setTransferTalkWhileWaiting(tc.talk_while_waiting ?? false);
    setTransferTalkMessage(tc.talk_message || "");
    setMcpServers(meta.mcp_servers || []);
    const ts = meta.transcription_settings || {};
    setDenoisingMode(ts.denoising_mode || "no_denoising");
    setTranscriptionMode(ts.transcription_mode || "speed");
    setVocabularySpecialization(ts.vocabulary || "general");
    setBoostedKeywords((ts.boosted_keywords || []).join(", "));
    const wh = meta.webhook_settings || {};
    setWebhookUrl(wh.url || "");
    setWebhookTimeout(wh.timeout_seconds ?? 5);
    setWebhookEvents(wh.events || []);
  }, []);

  const snapshotForm = useCallback((data: Agent) => {
    const meta = data.metadata || {};
    setSavedSnapshot(
      JSON.stringify({
        name: data.name,
        description: data.description || "",
        systemPrompt: data.system_prompt,
        voiceId: data.voice_id,
        language: data.language,
        llmModel: data.llm_model,
        toolsEnabled: data.tools_enabled || [],
        isActive: data.is_active,
        knowledgeBaseId: data.knowledge_base_id || "",
        welcomeMessage: meta.welcome_message || "",
        pauseBeforeSpeaking: meta.pause_before_speaking ?? 0,
        aiSpeaksFirst: meta.ai_speaks_first ?? false,
        dynamicMessage: meta.dynamic_message ?? false,
        cartesiaVoiceId: meta.cartesia_voice_id || "",
        ttsSpeed: meta.tts_speed || "normal",
        ttsEmotion: meta.tts_emotion || [],
        allowInterruptions: meta.allow_interruptions ?? true,
        minEndpointingDelay: meta.min_endpointing_delay ?? 0.3,
        maxEndpointingDelay: meta.max_endpointing_delay ?? 1.5,
        extractionEnabled: (meta.post_call_extraction || {}).enabled ?? false,
        extractionFields: (meta.post_call_extraction || {}).fields || [],
        extractionWebhook: (meta.post_call_extraction || {}).webhook_url || "",
        transferDescription: (meta.transfer_call_config || {}).description || "Transfer the call to a human agent",
        transferDestType: (meta.transfer_call_config || {}).destination_type || "static",
        transferRoutingText: (meta.transfer_call_config || {}).routing_text || "",
        transferType: (meta.transfer_call_config || {}).transfer_type || "cold",
        transferCallerId: (meta.transfer_call_config || {}).caller_id || "agent",
        transferDuringType: (meta.transfer_call_config || {}).during_type || "ringtone",
        transferRingDuration: (meta.transfer_call_config || {}).ring_duration ?? 30,
        transferNavigateIVR: (meta.transfer_call_config || {}).navigate_ivr ?? false,
        transferHasQueue: (meta.transfer_call_config || {}).has_queue ?? false,
        transferWaitTime: (meta.transfer_call_config || {}).wait_time ?? 10,
        transferWhisperEnabled: (meta.transfer_call_config || {}).whisper_enabled ?? false,
        transferWhisperMessage: (meta.transfer_call_config || {}).whisper_message || "",
        transferThreeWayEnabled: (meta.transfer_call_config || {}).three_way_enabled ?? false,
        transferThreeWayMessage: (meta.transfer_call_config || {}).three_way_message || "",
        transferSIPHeaders: (meta.transfer_call_config || {}).sip_headers || [],
        transferTalkWhileWaiting: (meta.transfer_call_config || {}).talk_while_waiting ?? false,
        transferTalkMessage: (meta.transfer_call_config || {}).talk_message || "",
        mcpServers: meta.mcp_servers || [],
        denoisingMode: (meta.transcription_settings || {}).denoising_mode || "no_denoising",
        transcriptionMode: (meta.transcription_settings || {}).transcription_mode || "speed",
        vocabularySpecialization: (meta.transcription_settings || {}).vocabulary || "general",
        boostedKeywords: ((meta.transcription_settings || {}).boosted_keywords || []).join(", "),
        webhookUrl: (meta.webhook_settings || {}).url || "",
        webhookTimeout: (meta.webhook_settings || {}).timeout_seconds ?? 5,
        webhookEvents: (meta.webhook_settings || {}).events || [],
      })
    );
  }, []);

  // --- Data loaders ---
  const loadAgent = useCallback(async () => {
    try {
      setLoadError(null);
      const data = await api.getAgent(agentId);
      setAgent(data);
      populateForm(data);
      snapshotForm(data);
    } catch (e: any) {
      console.error("Failed to load agent:", e);
      setLoadError(e.message || "Failed to load agent");
    } finally {
      setLoading(false);
    }
  }, [agentId, populateForm, snapshotForm]);

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
    setCallsLoading(true);
    try {
      const data = await api.listCalls();
      setCalls(data.filter((c: Call) => c.agent_id === agentId));
    } catch (e) {
      console.error("Failed to load calls:", e);
    } finally {
      setCallsLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    loadAgent();
    loadExtras();
    loadCalls();
  }, [loadAgent, loadExtras, loadCalls]);

  // Poll calls while on audio test tab to pick up new calls after testing
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (testTab === "audio") {
      pollIntervalRef.current = setInterval(() => {
        loadCalls();
      }, 10000);
    }
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [testTab, loadCalls]);

  // --- Actions ---
  const handleSave = async () => {
    if (!name.trim()) {
      showToast("Agent name is required", "error");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim(),
        system_prompt: systemPrompt,
        voice_id: voiceId,
        language,
        llm_model: llmModel,
        tools_enabled: toolsEnabled,
        is_active: isActive,
        knowledge_base_id: knowledgeBaseId || null,
        metadata: {
          ...(agent?.metadata || {}),
          welcome_message: welcomeMessage.trim() || undefined,
          pause_before_speaking: pauseBeforeSpeaking,
          ai_speaks_first: aiSpeaksFirst,
          dynamic_message: dynamicMessage,
          cartesia_voice_id: cartesiaVoiceId.trim() || undefined,
          tts_speed: ttsSpeed,
          tts_emotion: ttsEmotion.length > 0 ? ttsEmotion : undefined,
          allow_interruptions: allowInterruptions,
          min_endpointing_delay: minEndpointingDelay,
          max_endpointing_delay: maxEndpointingDelay,
          post_call_extraction: {
            enabled: extractionEnabled,
            fields: extractionFields.filter((f) => f.name.trim()),
            webhook_url: extractionWebhook.trim() || undefined,
          },
          transfer_call_config: {
            description: transferDescription.trim(),
            destination_type: transferDestType,
            routing_text: transferRoutingText.trim(),
            transfer_type: transferType,
            caller_id: transferCallerId,
            during_type: transferDuringType,
            ring_duration: transferRingDuration,
            navigate_ivr: transferNavigateIVR,
            has_queue: transferHasQueue,
            wait_time: transferWaitTime,
            whisper_enabled: transferWhisperEnabled,
            whisper_message: transferWhisperMessage.trim(),
            three_way_enabled: transferThreeWayEnabled,
            three_way_message: transferThreeWayMessage.trim(),
            sip_headers: transferSIPHeaders.filter((h) => h.key.trim()),
            talk_while_waiting: transferTalkWhileWaiting,
            talk_message: transferTalkMessage.trim(),
          },
          mcp_servers: mcpServers,
          transcription_settings: {
            denoising_mode: denoisingMode,
            transcription_mode: transcriptionMode,
            vocabulary: vocabularySpecialization,
            boosted_keywords: boostedKeywords
              .split(",")
              .map((k) => k.trim())
              .filter(Boolean),
          },
          webhook_settings: {
            url: webhookUrl.trim() || undefined,
            timeout_seconds: webhookTimeout,
            events: webhookEvents,
          },
        },
      };
      await api.updateAgent(agentId, payload);
      // Re-fetch to get the canonical server state
      const refreshed = await api.getAgent(agentId);
      setAgent(refreshed);
      populateForm(refreshed);
      snapshotForm(refreshed);
      showToast("Agent saved successfully", "success");
    } catch (e: any) {
      console.error("Failed to save agent:", e);
      showToast(e.message || "Failed to save agent", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this agent? This cannot be undone.")) return;
    setDeleting(true);
    try {
      await api.deleteAgent(agentId);
      router.push("/agents");
    } catch (e: any) {
      console.error("Failed to delete agent:", e);
      showToast(e.message || "Failed to delete agent", "error");
      setDeleting(false);
    }
  };

  const toggleTool = (tool: string) => {
    setToolsEnabled((prev) =>
      prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool]
    );
  };

  // --- Integration helpers ---
  const openQuickCreate = (template: IntegrationTemplate) => {
    setQuickCreateTemplate(template);
    setEditingFunction(null);
    setTestFnResult(null);
    setShowQuickCreate(true);
  };

  const openEditFunction = (fn: CustomFunction) => {
    setEditingFunction(fn);
    setQuickCreateTemplate(
      INTEGRATION_TEMPLATES.find(
        (t) => t.id === detectPlatform(fn.webhook_url).toLowerCase()
      ) || INTEGRATION_TEMPLATES[3]
    );
    setTestFnResult(null);
    setShowQuickCreate(true);
  };

  const handleQuickCreateSave = async (data: any, existingId?: string) => {
    if (existingId) {
      await api.updateCustomFunction(existingId, data);
    } else {
      await api.createCustomFunction(data);
    }
    // Re-fetch custom functions
    const funcs = await api.listCustomFunctions();
    const activeFuncs = funcs.filter((f: CustomFunction) => f.is_active);
    setCustomFunctions(activeFuncs);
    // Auto-enable newly created function on this agent
    if (!existingId) {
      setToolsEnabled((prev) =>
        prev.includes(data.name) ? prev : [...prev, data.name]
      );
    }
    setShowQuickCreate(false);
    showToast(
      existingId ? "Function updated" : "Function created & connected",
      "success"
    );
  };

  const handleTestFunction = async (id: string) => {
    setTestingFnId(id);
    setTestedFnId(id);
    setTestFnResult(null);
    const start = Date.now();
    try {
      await api.testCustomFunction(id);
      setTestFnResult({
        success: true,
        message: "Webhook responded successfully",
        time: Date.now() - start,
      });
    } catch (e: any) {
      setTestFnResult({
        success: false,
        message: e.message || "Webhook test failed",
        time: Date.now() - start,
      });
    } finally {
      setTestingFnId(null);
    }
  };

  const handleRemoveFunction = (fnName: string) => {
    setToolsEnabled((prev) => prev.filter((t) => t !== fnName));
  };

  // --- Chat helpers ---
  const scrollChatToBottom = useCallback(() => {
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, []);

  const handleSendChat = async () => {
    const text = chatInput.trim();
    if (!text || chatStreaming) return;

    const userMsg = { role: "user" as const, content: text };
    const updatedMessages = [...chatMessages, userMsg];
    setChatMessages(updatedMessages);
    setChatInput("");
    setChatStreaming(true);
    scrollChatToBottom();

    // Add empty assistant message to stream into
    setChatMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    // Persist: create conversation on first message, then save user message
    let convId = chatConversationId;
    try {
      if (!convId) {
        const conv = await api.createChatConversation({ agent_id: agentId, title: text.slice(0, 80) });
        convId = conv.id;
        setChatConversationId(conv.id);
      }
      await api.addChatMessage(convId!, { role: "user", content: text });
    } catch (e) {
      console.error("Failed to persist user message:", e);
    }

    try {
      // Build tool definitions from enabled custom functions
      const tools = connectedFunctions.map((fn) => ({
        id: fn.id,
        name: fn.name,
        description: fn.description || "",
        parameters: fn.parameters || { type: "object", properties: {} },
        webhook_url: fn.webhook_url,
        method: fn.method,
        headers: fn.headers,
        timeout_seconds: fn.timeout_seconds,
        payload_mode: fn.payload_mode,
      }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updatedMessages,
          systemPrompt: systemPrompt,
          model: llmModel,
          tools,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Chat request failed" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("No response stream");

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (data === "[DONE]") break;
          try {
            const parsed = JSON.parse(data);
            if (parsed.content) {
              setChatMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last && last.role === "assistant") {
                  next[next.length - 1] = { ...last, content: last.content + parsed.content };
                }
                return next;
              });
              scrollChatToBottom();
            }
            if (parsed.tool_call) {
              const argsStr = JSON.stringify(parsed.tool_call.arguments, null, 2);
              setChatMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last && last.role === "assistant") {
                  const toolInfo = `\n\n> Calling **${parsed.tool_call.name}**\n> \`\`\`json\n> ${argsStr.split("\n").join("\n> ")}\n> \`\`\`\n> Waiting for response...`;
                  next[next.length - 1] = { ...last, content: last.content + toolInfo };
                }
                return next;
              });
              scrollChatToBottom();
            }
            if (parsed.tool_result) {
              let resultPreview = parsed.tool_result.result;
              try {
                const parsed2 = JSON.parse(resultPreview);
                resultPreview = JSON.stringify(parsed2, null, 2);
              } catch { /* keep as-is */ }
              if (resultPreview.length > 300) resultPreview = resultPreview.slice(0, 300) + "...";
              setChatMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last && last.role === "assistant") {
                  // Replace "Waiting for response..." with actual result
                  const content = last.content.replace(
                    /> Waiting for response\.\.\.$/,
                    `> Result received`
                  );
                  next[next.length - 1] = { ...last, content };
                }
                return next;
              });
              scrollChatToBottom();
            }
          } catch {
            // skip malformed chunks
          }
        }
      }
    } catch (e: any) {
      setChatMessages((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        if (last && last.role === "assistant" && !last.content) {
          next[next.length - 1] = { ...last, content: `Error: ${e.message}` };
        } else {
          next.push({ role: "assistant", content: `Error: ${e.message}` });
        }
        return next;
      });
    } finally {
      setChatStreaming(false);
      scrollChatToBottom();
      // Persist assistant message
      if (convId) {
        setChatMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === "assistant" && last.content) {
            api.addChatMessage(convId!, { role: "assistant", content: last.content }).catch(console.error);
          }
          return prev;
        });
      }
    }
  };

  const handleChatKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendChat();
    }
  };

  const resetChat = () => {
    setChatMessages([]);
    setChatInput("");
    setChatConversationId(null);
  };

  // Derived: split custom functions into connected vs available
  const connectedFunctions = useMemo(
    () => customFunctions.filter((fn) => toolsEnabled.includes(fn.name)),
    [customFunctions, toolsEnabled]
  );
  const availableFunctions = useMemo(
    () => customFunctions.filter((fn) => !toolsEnabled.includes(fn.name)),
    [customFunctions, toolsEnabled]
  );

  // --- Derived data ---
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
    return new Date(dateStr).toLocaleString();
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "\u2014";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  // --- Render: Loading ---
  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen gap-3">
        <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />
        <span className="text-gray-400 dark:text-gray-500">Loading agent...</span>
      </div>
    );
  }

  // --- Render: Error / Not found ---
  if (loadError || !agent) {
    return (
      <div className="flex flex-col items-center justify-center h-screen gap-4">
        <Bot className="w-12 h-12 text-gray-400" />
        <p className="text-gray-500 dark:text-gray-400">
          {loadError || "Agent not found"}
        </p>
        <Link href="/agents" className="text-indigo-600 hover:text-indigo-500 text-sm font-medium">
          Back to Agents
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      <Toast toast={toast} onDismiss={dismissToast} />

      {/* Quick Create Modal */}
      {showQuickCreate && (
        <QuickCreateModal
          template={quickCreateTemplate}
          editingFunction={editingFunction}
          existingNames={customFunctions.map((f) => f.name)}
          onSave={handleQuickCreateSave}
          onClose={() => setShowQuickCreate(false)}
          onTest={handleTestFunction}
          testingId={testingFnId}
          testResult={testFnResult}
        />
      )}

      {showMCPModal && (
        <MCPModal
          initial={editingMCPIdx !== null ? mcpServers[editingMCPIdx] : null}
          onSave={(srv) => {
            if (editingMCPIdx !== null) {
              setMcpServers((prev) => prev.map((s, i) => i === editingMCPIdx ? srv : s));
            } else {
              setMcpServers((prev) => [...prev, srv]);
            }
            setShowMCPModal(false);
            setEditingMCPIdx(null);
          }}
          onClose={() => { setShowMCPModal(false); setEditingMCPIdx(null); }}
        />
      )}

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
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-gray-900 dark:text-white truncate">{name || "Untitled Agent"}</h1>
                {isDirty && (
                  <span className="flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 font-medium">
                    Unsaved changes
                  </span>
                )}
              </div>
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
                  {"\u2014"}
                </span>
                <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                  <Clock className="w-3 h-3" />
                  {"\u2014"}
                </span>
                <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500">
                  <Hash className="w-3 h-3" />
                  {"\u2014"}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="px-3 py-2 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
              title="Delete agent"
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !name.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
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
                  Agent Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className={`w-full bg-gray-100 dark:bg-gray-800 border rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none ${
                    !name.trim() ? "border-red-300 dark:border-red-700" : "border-gray-300 dark:border-gray-700"
                  }`}
                />
                {!name.trim() && (
                  <p className="text-xs text-red-500 mt-1">Agent name is required</p>
                )}
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
                    {availableModels.map((m) => (
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Voice ID (Cartesia)
                  </label>
                  <input
                    type="text"
                    value={cartesiaVoiceId}
                    onChange={(e) => setCartesiaVoiceId(e.target.value)}
                    placeholder="e.g. f786b574-daa5-4673-aa0c-cbe3e8534c02"
                    className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none font-mono text-xs"
                  />
                  <p className="text-xs text-gray-400 mt-1">Used for voice calls (TTS). Leave blank for default voice.</p>
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
                  <p className="text-xs text-gray-400 mt-1">Optional. Used if ElevenLabs TTS is configured.</p>
                </div>
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
                <ToggleSwitch
                  checked={aiSpeaksFirst}
                  onChange={setAiSpeaksFirst}
                  label="AI Speaks First"
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Dynamic Message</p>
                  <p className="text-xs text-gray-400">Generate welcome message dynamically via LLM</p>
                </div>
                <ToggleSwitch
                  checked={dynamicMessage}
                  onChange={setDynamicMessage}
                  label="Dynamic Message"
                />
              </div>
            </CollapsibleSection>

            {/* 3. Speech Settings */}
            <CollapsibleSection title="Speech Settings" defaultOpen>
              {/* Speaking Speed */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Speaking Speed
                </label>
                <select
                  value={ttsSpeed}
                  onChange={(e) => setTtsSpeed(e.target.value)}
                  className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="slowest">Slowest</option>
                  <option value="slow">Slow</option>
                  <option value="normal">Normal</option>
                  <option value="fast">Fast</option>
                  <option value="fastest">Fastest</option>
                </select>
                <p className="text-xs text-gray-400 mt-1">Controls how fast the agent speaks (Cartesia TTS).</p>
              </div>

              {/* Emotion */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Voice Emotion
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: "positivity:high", label: "Positive (High)" },
                    { value: "positivity:low", label: "Positive (Low)" },
                    { value: "curiosity", label: "Curious" },
                    { value: "surprise:high", label: "Surprised" },
                    { value: "sadness:low", label: "Calm/Sad" },
                    { value: "anger:low", label: "Assertive" },
                  ].map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() =>
                        setTtsEmotion((prev) =>
                          prev.includes(value)
                            ? prev.filter((e) => e !== value)
                            : [...prev, value]
                        )
                      }
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        ttsEmotion.includes(value)
                          ? "bg-indigo-600 text-white"
                          : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-1">Select one or more emotions to blend into the voice.</p>
              </div>

              {/* Allow Interruptions */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Allow Interruptions</p>
                  <p className="text-xs text-gray-400">Caller can interrupt the agent while it is speaking</p>
                </div>
                <ToggleSwitch
                  checked={allowInterruptions}
                  onChange={setAllowInterruptions}
                  label="Allow Interruptions"
                />
              </div>

              {/* Endpointing Delays */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Min Endpointing Delay: {minEndpointingDelay.toFixed(1)}s
                  </label>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.1"
                    value={minEndpointingDelay}
                    onChange={(e) => setMinEndpointingDelay(parseFloat(e.target.value))}
                    className="w-full accent-indigo-600"
                  />
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>0.1s</span>
                    <span>1.0s</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Minimum pause before agent responds.</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Max Endpointing Delay: {maxEndpointingDelay.toFixed(1)}s
                  </label>
                  <input
                    type="range"
                    min="0.5"
                    max="3.0"
                    step="0.1"
                    value={maxEndpointingDelay}
                    onChange={(e) => setMaxEndpointingDelay(parseFloat(e.target.value))}
                    className="w-full accent-indigo-600"
                  />
                  <div className="flex justify-between text-xs text-gray-400">
                    <span>0.5s</span>
                    <span>3.0s</span>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">Maximum wait before cutting off silence.</p>
                </div>
              </div>
            </CollapsibleSection>

            {/* 4. Functions */}
            <CollapsibleSection title="Functions" defaultOpen>
              {/* Built-in Tools */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Built-in Tools
                </label>
                <div className="flex flex-wrap gap-2 mb-2">
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

                {/* transfer_call inline settings — shown when enabled */}
                {toolsEnabled.includes("transfer_call") && (
                  <div className="mt-3 border border-indigo-200 dark:border-indigo-800 rounded-xl bg-indigo-50/40 dark:bg-indigo-900/10 p-4 space-y-4">
                    <p className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 uppercase tracking-wide">transfer_call settings</p>

                    {/* Description */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Description</label>
                      <input
                        type="text"
                        value={transferDescription}
                        onChange={(e) => setTransferDescription(e.target.value)}
                        className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                    </div>

                    {/* Transfer To */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Transfer To</label>
                      <div className="flex gap-2 mb-2">
                        {[
                          { value: "static", label: "Static Destination" },
                          { value: "dynamic", label: "Dynamic Routing" },
                        ].map(({ value, label }) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setTransferDestType(value as "static" | "dynamic")}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                              transferDestType === value
                                ? "bg-indigo-600 text-white"
                                : "bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                      <textarea
                        value={transferRoutingText}
                        onChange={(e) => setTransferRoutingText(e.target.value)}
                        rows={3}
                        placeholder={
                          transferDestType === "static"
                            ? "e.g. +61451044727"
                            : "e.g. If the user wants to reach Kritu or General enquiry, transfer to +61451044727; if education-related, transfer to +61401086115; if URGENT or migration, transfer to +61438894563"
                        }
                        className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-y"
                      />
                      <p className="text-[11px] text-gray-400 mt-1">
                        {transferDestType === "static"
                          ? "Single E.164 number the call always transfers to."
                          : "AI reads the routing rules and picks the correct number based on the conversation."}
                      </p>
                    </div>

                    {/* Transfer Type */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">How should the AI handle the transfer?</label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { value: "cold", label: "Cold Transfer", sub: "AI transfers immediately" },
                          { value: "warm", label: "Warm Transfer", sub: "AI gives a one-way brief to the agent" },
                          { value: "agentic_warm", label: "Agentic Warm", sub: "AI has a 2-way conversation with agent, then bridges" },
                        ].map(({ value, label, sub }) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setTransferType(value as "cold" | "warm" | "agentic_warm")}
                            className={`flex flex-col items-start px-3 py-2.5 rounded-lg border text-left transition-colors ${
                              transferType === value
                                ? "bg-indigo-50 dark:bg-indigo-900/30 border-indigo-400 dark:border-indigo-600"
                                : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                            }`}
                          >
                            <span className={`text-xs font-medium ${transferType === value ? "text-indigo-700 dark:text-indigo-300" : "text-gray-700 dark:text-gray-300"}`}>{label}</span>
                            <span className="text-[11px] text-gray-400 mt-0.5">{sub}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Caller ID */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Displayed Caller ID</label>
                      <div className="flex gap-2">
                        {[{ value: "agent", label: "Agent's Number" }, { value: "user", label: "User's Number" }].map(({ value, label }) => (
                          <button key={value} type="button" onClick={() => setTransferCallerId(value as "agent" | "user")}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${transferCallerId === value ? "bg-indigo-600 text-white" : "bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"}`}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* During Transfer */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">During Transfer Call</label>
                        <div className="flex gap-2">
                          {[{ value: "music", label: "On-hold Music" }, { value: "ringtone", label: "Ringtone" }].map(({ value, label }) => (
                            <button key={value} type="button" onClick={() => setTransferDuringType(value as "music" | "ringtone")}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${transferDuringType === value ? "bg-indigo-600 text-white" : "bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"}`}>
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                          Transfer Ring Duration: {transferRingDuration}s
                        </label>
                        <input type="range" min="5" max="90" step="5" value={transferRingDuration}
                          onChange={(e) => setTransferRingDuration(Number(e.target.value))}
                          className="w-full accent-indigo-600" />
                        <div className="flex justify-between text-[11px] text-gray-400"><span>5s</span><span>90s</span></div>
                      </div>
                    </div>

                    {/* Navigate IVR */}
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Navigate IVR</p>
                        <p className="text-[11px] text-gray-400">AI navigates automated phone menus before reaching the agent</p>
                      </div>
                      <ToggleSwitch checked={transferNavigateIVR} onChange={setTransferNavigateIVR} label="Navigate IVR" />
                    </div>

                    {/* Agent Connection */}
                    <div className="border-t border-indigo-200 dark:border-indigo-800 pt-4 space-y-4">
                      <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">During Agent Connection</p>

                      {/* Has Queue */}
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Internal Queue / Hold System</p>
                          <p className="text-[11px] text-gray-400">Is there a queue before an agent answers?</p>
                        </div>
                        <div className="flex gap-2">
                          {[{ v: true, l: "Yes" }, { v: false, l: "No" }].map(({ v, l }) => (
                            <button key={String(v)} type="button" onClick={() => setTransferHasQueue(v)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${transferHasQueue === v ? "bg-indigo-600 text-white" : "bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"}`}>
                              {l}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Wait Time */}
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                          Wait Time for Agent Answer: {transferWaitTime}s
                        </label>
                        <input type="range" min="5" max="60" step="5" value={transferWaitTime}
                          onChange={(e) => setTransferWaitTime(Number(e.target.value))}
                          className="w-full accent-indigo-600" />
                        <div className="flex justify-between text-[11px] text-gray-400"><span>Short</span><span>Long</span></div>
                      </div>

                      {/* Whisper Debrief */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Whisper Debrief Message</p>
                            <p className="text-[11px] text-gray-400">Spoken only to the transfer agent — caller cannot hear</p>
                          </div>
                          <ToggleSwitch checked={transferWhisperEnabled} onChange={setTransferWhisperEnabled} label="Whisper" />
                        </div>
                        {transferWhisperEnabled && (
                          <textarea rows={2} value={transferWhisperMessage}
                            onChange={(e) => setTransferWhisperMessage(e.target.value)}
                            placeholder="Say hello to the agent and summarize the user problem to him"
                            className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-y" />
                        )}
                      </div>

                      {/* Three-Way Debrief */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <div>
                            <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Three-Way Debrief Message</p>
                            <p className="text-[11px] text-gray-400">Public handoff message — both parties can hear</p>
                          </div>
                          <ToggleSwitch checked={transferThreeWayEnabled} onChange={setTransferThreeWayEnabled} label="Three-Way" />
                        </div>
                        {transferThreeWayEnabled && (
                          <textarea rows={2} value={transferThreeWayMessage}
                            onChange={(e) => setTransferThreeWayMessage(e.target.value)}
                            placeholder="Say hello to the agent and summarize the user problem to him"
                            className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-y" />
                        )}
                      </div>
                    </div>

                    {/* Custom SIP Headers */}
                    <div className="border-t border-indigo-200 dark:border-indigo-800 pt-4">
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Custom SIP Headers</label>
                      <p className="text-[11px] text-gray-400 mb-2">Add key/value pairs for call routing, metadata, or carrier integration.</p>
                      <div className="space-y-2">
                        {transferSIPHeaders.map((h, idx) => (
                          <div key={idx} className="flex items-center gap-2">
                            <input type="text" value={h.key}
                              onChange={(e) => { const n = [...transferSIPHeaders]; n[idx] = { ...n[idx], key: e.target.value }; setTransferSIPHeaders(n); }}
                              placeholder="X-Header-Name"
                              className="flex-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none" />
                            <input type="text" value={h.value}
                              onChange={(e) => { const n = [...transferSIPHeaders]; n[idx] = { ...n[idx], value: e.target.value }; setTransferSIPHeaders(n); }}
                              placeholder="value"
                              className="flex-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none" />
                            <button type="button" onClick={() => setTransferSIPHeaders((p) => p.filter((_, i) => i !== idx))}
                              className="p-1 text-gray-400 hover:text-red-500 transition-colors">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                      <button type="button" onClick={() => setTransferSIPHeaders((p) => [...p, { key: "", value: "" }])}
                        className="mt-2 flex items-center gap-1 text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 transition-colors">
                        <Plus className="w-3 h-3" /> Add
                      </button>
                    </div>

                    {/* Talk While Waiting */}
                    <div className="border-t border-indigo-200 dark:border-indigo-800 pt-4">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Talk While Waiting</p>
                          <p className="text-[11px] text-gray-400">Say a short phrase to fill the silence while connecting</p>
                        </div>
                        <ToggleSwitch checked={transferTalkWhileWaiting} onChange={setTransferTalkWhileWaiting} label="Talk While Waiting" />
                      </div>
                      {transferTalkWhileWaiting && (
                        <input type="text" value={transferTalkMessage}
                          onChange={(e) => setTransferTalkMessage(e.target.value)}
                          placeholder="Please hold while I connect you to an agent."
                          className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Integration Templates */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Integrations
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {INTEGRATION_TEMPLATES.map((tpl) => (
                    <button
                      key={tpl.id}
                      onClick={() => openQuickCreate(tpl)}
                      className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-lg border text-xs font-medium transition-all hover:shadow-sm ${tpl.bgColor} ${tpl.borderColor} ${tpl.color} hover:scale-[1.02]`}
                    >
                      <Plus className="w-4 h-4" />
                      <span>{tpl.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Connected Functions */}
              {connectedFunctions.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Connected Functions
                  </label>
                  <div className="space-y-2">
                    {connectedFunctions.map((fn) => {
                      const platform = detectPlatform(fn.webhook_url);
                      return (
                        <div
                          key={fn.id}
                          className="border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 bg-white dark:bg-gray-900/50"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 min-w-0">
                              <Zap className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                              <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                {fn.name}
                              </span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex-shrink-0">
                                {fn.method}
                              </span>
                              <span className="w-2 h-2 rounded-full bg-green-400 flex-shrink-0" title="Active" />
                            </div>
                          </div>
                          <div className="flex items-center gap-2 mt-1.5 ml-[22px]">
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${getPlatformStyle(platform)}`}
                            >
                              {platform}
                            </span>
                            {fn.webhook_url && (
                              <span className="text-[11px] text-gray-400 dark:text-gray-500 font-mono truncate max-w-[200px]">
                                {fn.webhook_url}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 mt-2 ml-[22px]">
                            <button
                              onClick={() => handleTestFunction(fn.id)}
                              disabled={!!testingFnId}
                              className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors disabled:opacity-50"
                            >
                              {testingFnId === fn.id ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <Play className="w-3 h-3" />
                              )}
                              Test
                            </button>
                            <button
                              onClick={() => openEditFunction(fn)}
                              className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors"
                            >
                              <Pencil className="w-3 h-3" />
                              Edit
                            </button>
                            <button
                              onClick={() => handleRemoveFunction(fn.name)}
                              className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                            >
                              <Unplug className="w-3 h-3" />
                              Remove
                            </button>
                          </div>
                          {testFnResult && testedFnId === fn.id && testingFnId === null && (
                            <div
                              className={`flex items-center gap-2 mt-2 ml-[22px] text-[11px] px-2 py-1.5 rounded ${
                                testFnResult.success
                                  ? "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20"
                                  : "text-red-500 bg-red-50 dark:bg-red-900/20"
                              }`}
                            >
                              {testFnResult.success ? (
                                <CheckCircle className="w-3 h-3 flex-shrink-0" />
                              ) : (
                                <AlertCircle className="w-3 h-3 flex-shrink-0" />
                              )}
                              {testFnResult.message}
                              {testFnResult.time != null && (
                                <span className="ml-auto text-gray-400">{testFnResult.time}ms</span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Available Functions (not connected) */}
              {availableFunctions.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Available Functions (not connected)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {availableFunctions.map((fn) => (
                      <button
                        key={fn.name}
                        onClick={() => toggleTool(fn.name)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-amber-50 dark:bg-amber-600/10 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-600/20"
                        title={fn.description || fn.name}
                      >
                        <Plus className="w-3 h-3" />
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

            {/* 5-11. Placeholder sections */}
            <CollapsibleSection title="Realtime Transcription Settings">
              <div className="space-y-6">

                {/* Denoising Mode */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Denoising Mode</label>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">Filter out unwanted background noise or speech.</p>
                  <div className="space-y-2">
                    {[
                      { value: "remove_noise", label: "Remove noise" },
                      { value: "remove_noise_background_speech", label: "Remove noise + background speech" },
                      { value: "no_denoising", label: "No denoising" },
                    ].map((opt) => (
                      <label key={opt.value} className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="radio"
                          name="denoisingMode"
                          value={opt.value}
                          checked={denoisingMode === opt.value}
                          onChange={() => setDenoisingMode(opt.value as any)}
                          className="accent-indigo-600"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="border-t border-gray-200 dark:border-gray-800" />

                {/* Transcription Mode */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Transcription Mode</label>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">Balance between speed and accuracy.</p>
                  <div className="space-y-2">
                    {[
                      { value: "speed", label: "Optimize for speed", sub: "Low latency, ideal for real-time conversation" },
                      { value: "accuracy", label: "Optimize for accuracy", sub: "Higher accuracy, slightly more latency" },
                      { value: "custom", label: "Custom Settings", sub: "Fine-tune STT parameters manually" },
                    ].map((opt) => (
                      <label key={opt.value} className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="radio"
                          name="transcriptionMode"
                          value={opt.value}
                          checked={transcriptionMode === opt.value}
                          onChange={() => setTranscriptionMode(opt.value as any)}
                          className="accent-indigo-600 mt-0.5"
                        />
                        <div>
                          <span className="text-sm text-gray-700 dark:text-gray-300">{opt.label}</span>
                          <p className="text-xs text-gray-400 dark:text-gray-500">{opt.sub}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="border-t border-gray-200 dark:border-gray-800" />

                {/* Vocabulary Specialization */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Vocabulary Specialization</label>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">Choose the vocabulary set to use for transcription.</p>
                  <div className="space-y-2">
                    {[
                      { value: "general", label: "General", sub: "Works well across most industries" },
                      { value: "medical", label: "Medical", sub: "Optimized for healthcare terms" },
                    ].map((opt) => (
                      <label key={opt.value} className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="radio"
                          name="vocabularySpecialization"
                          value={opt.value}
                          checked={vocabularySpecialization === opt.value}
                          onChange={() => setVocabularySpecialization(opt.value as any)}
                          className="accent-indigo-600 mt-0.5"
                        />
                        <div>
                          <span className="text-sm text-gray-700 dark:text-gray-300">{opt.label}</span>
                          <p className="text-xs text-gray-400 dark:text-gray-500">{opt.sub}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="border-t border-gray-200 dark:border-gray-800" />

                {/* Boosted Keywords */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Boosted Keywords</label>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
                    Provide a customized list of keywords to expand the model's vocabulary. Split by comma.
                  </p>
                  <input
                    type="text"
                    value={boostedKeywords}
                    onChange={(e) => setBoostedKeywords(e.target.value)}
                    placeholder="Example: HubSpot, Salesforce, Medicare"
                    className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  />
                  {boostedKeywords.trim() && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {boostedKeywords.split(",").map((k) => k.trim()).filter(Boolean).map((kw) => (
                        <span key={kw} className="px-2 py-0.5 text-[11px] font-medium bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full border border-indigo-200 dark:border-indigo-800">
                          {kw}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            </CollapsibleSection>

            {false && <CollapsibleSection title="Transfer Call Settings">
              {/* Name & Description */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Function Name</label>
                  <input
                    type="text"
                    value="transfer_call"
                    readOnly
                    className="w-full bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-400 text-sm font-mono cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Description</label>
                  <input
                    type="text"
                    value={transferDescription}
                    onChange={(e) => setTransferDescription(e.target.value)}
                    className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>

              {/* Transfer To */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Transfer To</label>
                <div className="flex gap-2 mb-3">
                  {[
                    { value: "static", label: "Static Destination" },
                    { value: "dynamic", label: "Dynamic Routing" },
                  ].map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setTransferDestType(value as "static" | "dynamic")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        transferDestType === value
                          ? "bg-indigo-600 text-white"
                          : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <textarea
                  value={transferRoutingText}
                  onChange={(e) => setTransferRoutingText(e.target.value)}
                  rows={3}
                  placeholder={
                    transferDestType === "static"
                      ? "e.g. +61451044727"
                      : "e.g. If the user wants to reach Kritu or General enquiry, transfer to +61451044727; if education-related, transfer to +61401086115; if URGENT or migration, transfer to +61438894563"
                  }
                  className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-y"
                />
                <p className="text-xs text-gray-400 mt-1">
                  {transferDestType === "static"
                    ? "Single E.164 number the call always transfers to."
                    : "AI reads the routing rules and picks the correct number based on the conversation."}
                </p>
              </div>

              {/* Transfer Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">How should the AI handle the transfer?</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { value: "cold", label: "Cold Transfer", sub: "AI transfers immediately" },
                    { value: "warm", label: "Warm Transfer", sub: "AI gives a one-way brief to the agent" },
                    { value: "agentic_warm", label: "Agentic Warm", sub: "AI has a 2-way conversation with agent, then bridges" },
                  ].map(({ value, label, sub }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setTransferType(value as "cold" | "warm" | "agentic_warm")}
                      className={`flex flex-col items-start px-3 py-2.5 rounded-lg border text-left transition-colors ${
                        transferType === value
                          ? "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-400 dark:border-indigo-600"
                          : "bg-gray-50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                      }`}
                    >
                      <span className={`text-xs font-medium ${transferType === value ? "text-indigo-700 dark:text-indigo-300" : "text-gray-700 dark:text-gray-300"}`}>{label}</span>
                      <span className="text-[11px] text-gray-400 mt-0.5">{sub}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Caller ID */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Displayed Caller ID</label>
                <div className="flex gap-2">
                  {[
                    { value: "agent", label: "Agent's Number" },
                    { value: "user", label: "User's Number" },
                  ].map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setTransferCallerId(value as "agent" | "user")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        transferCallerId === value
                          ? "bg-indigo-600 text-white"
                          : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* During Transfer */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">During Transfer Call</label>
                  <div className="flex gap-2">
                    {[
                      { value: "music", label: "On-hold Music" },
                      { value: "ringtone", label: "Ringtone" },
                    ].map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setTransferDuringType(value as "music" | "ringtone")}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          transferDuringType === value
                            ? "bg-indigo-600 text-white"
                            : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Transfer Ring Duration: {transferRingDuration}s
                  </label>
                  <input
                    type="range" min="5" max="90" step="5"
                    value={transferRingDuration}
                    onChange={(e) => setTransferRingDuration(Number(e.target.value))}
                    className="w-full accent-indigo-600"
                  />
                  <div className="flex justify-between text-xs text-gray-400"><span>5s</span><span>90s</span></div>
                </div>
              </div>

              {/* Navigate IVR */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Navigate IVR</p>
                  <p className="text-xs text-gray-400">AI navigates automated phone menus before reaching the agent</p>
                </div>
                <ToggleSwitch checked={transferNavigateIVR} onChange={setTransferNavigateIVR} label="Navigate IVR" />
              </div>

              {/* Agent Connection */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">During Agent Connection</p>

                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Internal Queue / Hold System</p>
                    <p className="text-xs text-gray-400">Is there a queue before an agent answers?</p>
                  </div>
                  <div className="flex gap-2">
                    {[{ v: true, l: "Yes" }, { v: false, l: "No" }].map(({ v, l }) => (
                      <button
                        key={String(v)}
                        type="button"
                        onClick={() => setTransferHasQueue(v)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          transferHasQueue === v
                            ? "bg-indigo-600 text-white"
                            : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                        }`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Wait Time for Agent Answer: {transferWaitTime}s
                  </label>
                  <input
                    type="range" min="5" max="60" step="5"
                    value={transferWaitTime}
                    onChange={(e) => setTransferWaitTime(Number(e.target.value))}
                    className="w-full accent-indigo-600"
                  />
                  <div className="flex justify-between text-xs text-gray-400"><span>Short</span><span>Long</span></div>
                </div>

                {/* Whisper Debrief */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 mr-4">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Whisper Debrief Message</p>
                    <p className="text-xs text-gray-400">Spoken only to the transfer agent — the caller cannot hear it</p>
                  </div>
                  <ToggleSwitch checked={transferWhisperEnabled} onChange={setTransferWhisperEnabled} label="Whisper" />
                </div>
                {transferWhisperEnabled && (
                  <textarea
                    value={transferWhisperMessage}
                    onChange={(e) => setTransferWhisperMessage(e.target.value)}
                    rows={2}
                    placeholder="Say hello to the agent and summarize the user problem to him"
                    className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-y mb-3"
                  />
                )}

                {/* Three-Way Debrief */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 mr-4">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Three-Way Debrief Message</p>
                    <p className="text-xs text-gray-400">Public handoff message — both parties can hear</p>
                  </div>
                  <ToggleSwitch checked={transferThreeWayEnabled} onChange={setTransferThreeWayEnabled} label="Three-Way" />
                </div>
                {transferThreeWayEnabled && (
                  <textarea
                    value={transferThreeWayMessage}
                    onChange={(e) => setTransferThreeWayMessage(e.target.value)}
                    rows={2}
                    placeholder="Say hello to the agent and summarize the user problem to him"
                    className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-y mb-3"
                  />
                )}
              </div>

              {/* Custom SIP Headers */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Custom SIP Headers</label>
                <p className="text-xs text-gray-400 mb-2">Add key/value pairs for call routing, metadata, or carrier integration.</p>
                <div className="space-y-2">
                  {transferSIPHeaders.map((h, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={h.key}
                        onChange={(e) => {
                          const next = [...transferSIPHeaders];
                          next[idx] = { ...next[idx], key: e.target.value };
                          setTransferSIPHeaders(next);
                        }}
                        placeholder="X-Header-Name"
                        className="flex-1 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 dark:text-white font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                      <input
                        type="text"
                        value={h.value}
                        onChange={(e) => {
                          const next = [...transferSIPHeaders];
                          next[idx] = { ...next[idx], value: e.target.value };
                          setTransferSIPHeaders(next);
                        }}
                        placeholder="value"
                        className="flex-1 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 dark:text-white font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setTransferSIPHeaders((prev) => prev.filter((_, i) => i !== idx))}
                        className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setTransferSIPHeaders((prev) => [...prev, { key: "", value: "" }])}
                  className="mt-2 flex items-center gap-1 text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 transition-colors"
                >
                  <Plus className="w-3 h-3" /> Add
                </button>
              </div>

              {/* Talk While Waiting */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 mr-4">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Talk While Waiting</p>
                    <p className="text-xs text-gray-400">Say a short phrase to fill the silence while connecting</p>
                  </div>
                  <ToggleSwitch checked={transferTalkWhileWaiting} onChange={setTransferTalkWhileWaiting} label="Talk While Waiting" />
                </div>
                {transferTalkWhileWaiting && (
                  <input
                    type="text"
                    value={transferTalkMessage}
                    onChange={(e) => setTransferTalkMessage(e.target.value)}
                    placeholder="Please hold while I connect you to an agent."
                    className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                )}
              </div>
            </CollapsibleSection>}

            <CollapsibleSection title="Post-Call Data Extraction">
              {/* Enable toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Enable Extraction</p>
                  <p className="text-xs text-gray-400">After each call, automatically extract structured data from the transcript using AI</p>
                </div>
                <ToggleSwitch
                  checked={extractionEnabled}
                  onChange={setExtractionEnabled}
                  label="Enable Extraction"
                />
              </div>

              {extractionEnabled && (
                <>
                  {/* Field list */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Fields to Extract
                    </label>
                    <div className="space-y-2">
                      {extractionFields.map((field, idx) => (
                        <div key={idx} className="flex items-start gap-2">
                          <input
                            type="text"
                            value={field.name}
                            onChange={(e) => {
                              const next = [...extractionFields];
                              next[idx] = { ...next[idx], name: e.target.value };
                              setExtractionFields(next);
                            }}
                            placeholder="field_name"
                            className="w-32 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 dark:text-white font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
                          />
                          <select
                            value={field.type}
                            onChange={(e) => {
                              const next = [...extractionFields];
                              next[idx] = { ...next[idx], type: e.target.value };
                              setExtractionFields(next);
                            }}
                            className="w-24 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                          >
                            <option value="string">string</option>
                            <option value="boolean">boolean</option>
                            <option value="number">number</option>
                          </select>
                          <input
                            type="text"
                            value={field.description}
                            onChange={(e) => {
                              const next = [...extractionFields];
                              next[idx] = { ...next[idx], description: e.target.value };
                              setExtractionFields(next);
                            }}
                            placeholder="Description of what to extract"
                            className="flex-1 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-2.5 py-1.5 text-xs text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => setExtractionFields((prev) => prev.filter((_, i) => i !== idx))}
                            className="p-1 text-gray-400 hover:text-red-500 transition-colors mt-0.5"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>

                    {/* Preset templates */}
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {[
                        { name: "customer_name", description: "Full name of the customer", type: "string" },
                        { name: "customer_email", description: "Email address of the customer", type: "string" },
                        { name: "appointment_booked", description: "Whether an appointment was scheduled", type: "boolean" },
                        { name: "call_outcome", description: "Brief summary of what was resolved or agreed upon", type: "string" },
                        { name: "sentiment", description: "Overall caller sentiment: positive, neutral, or negative", type: "string" },
                        { name: "follow_up_required", description: "Whether a follow-up action is needed", type: "boolean" },
                      ].map((preset) => (
                        <button
                          key={preset.name}
                          type="button"
                          onClick={() => {
                            if (!extractionFields.find((f) => f.name === preset.name)) {
                              setExtractionFields((prev) => [...prev, preset]);
                            }
                          }}
                          disabled={!!extractionFields.find((f) => f.name === preset.name)}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-medium border border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          + {preset.name}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => setExtractionFields((prev) => [...prev, { name: "", description: "", type: "string" }])}
                      className="mt-2 flex items-center gap-1 text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                      Add custom field
                    </button>
                  </div>

                  {/* Webhook */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Webhook URL <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={extractionWebhook}
                      onChange={(e) => setExtractionWebhook(e.target.value)}
                      placeholder="https://your-server.com/webhook/post-call"
                      className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none font-mono text-xs"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Extracted data will be POSTed as JSON to this URL after each call.
                    </p>
                  </div>
                </>
              )}
            </CollapsibleSection>

            <CollapsibleSection title="Security & Fallback Settings">
              <PlaceholderSection label="Configure security and fallback behavior" />
            </CollapsibleSection>

            <CollapsibleSection title="Webhook Settings">
              <div className="space-y-5">
                {/* Webhook URL */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Agent Level Webhook URL
                  </label>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
                    Webhook URL to receive events from this agent.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={webhookUrl}
                      onChange={(e) => { setWebhookUrl(e.target.value); setWebhookTestResult(null); }}
                      placeholder="https://your-server.com/webhook/agent"
                      className="flex-1 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white font-mono focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                    />
                    <button
                      type="button"
                      disabled={!webhookUrl.trim() || webhookTesting}
                      onClick={async () => {
                        setWebhookTesting(true);
                        setWebhookTestResult(null);
                        try {
                          const res = await fetch(webhookUrl.trim(), {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ event: "test", agent_id: agentId, timestamp: new Date().toISOString() }),
                            signal: AbortSignal.timeout(webhookTimeout * 1000),
                          });
                          setWebhookTestResult({ ok: res.ok, message: res.ok ? `Success (${res.status})` : `Failed (${res.status})` });
                        } catch (e: any) {
                          setWebhookTestResult({ ok: false, message: e.message || "Request failed" });
                        } finally {
                          setWebhookTesting(false);
                        }
                      }}
                      className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors disabled:opacity-40"
                    >
                      {webhookTesting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                      Test
                    </button>
                  </div>
                  {webhookTestResult && (
                    <div className={`mt-2 flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${webhookTestResult.ok ? "bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400" : "bg-red-50 dark:bg-red-900/20 text-red-500"}`}>
                      {webhookTestResult.ok ? <CheckCircle className="w-3 h-3 flex-shrink-0" /> : <AlertCircle className="w-3 h-3 flex-shrink-0" />}
                      {webhookTestResult.message}
                    </div>
                  )}
                </div>

                {/* Timeout slider */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Webhook Timeout</label>
                    <span className="text-sm font-mono text-gray-900 dark:text-white">{webhookTimeout}s</span>
                  </div>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
                    Set the maximum time to wait for a webhook response before timing out.
                  </p>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-400">1s</span>
                    <input
                      type="range"
                      min={1}
                      max={30}
                      step={1}
                      value={webhookTimeout}
                      onChange={(e) => setWebhookTimeout(Number(e.target.value))}
                      className="flex-1 accent-indigo-600"
                    />
                    <span className="text-xs text-gray-400">30s</span>
                  </div>
                </div>

                {/* Webhook Events */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Webhook Events
                  </label>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
                    Choose which events this webhook should receive.
                  </p>
                  <div className="space-y-2">
                    {WEBHOOK_EVENTS.map((evt) => (
                      <label key={evt} className="flex items-center gap-3 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={webhookEvents.includes(evt)}
                          onChange={(e) => setWebhookEvents((prev) =>
                            e.target.checked ? [...prev, evt] : prev.filter((v) => v !== evt)
                          )}
                          className="w-4 h-4 rounded accent-indigo-600"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300 font-mono">{evt}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="MCPs">
              <div className="space-y-3">
                {mcpServers.length === 0 ? (
                  <p className="text-sm text-gray-400 dark:text-gray-500 py-2">No MCP servers configured yet.</p>
                ) : (
                  <div className="space-y-2">
                    {mcpServers.map((srv, idx) => (
                      <div key={idx} className="flex items-center justify-between px-3 py-2.5 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-lg">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{srv.name}</p>
                          <p className="text-[11px] text-gray-400 dark:text-gray-500 font-mono truncate">{srv.url}</p>
                          <p className="text-[11px] text-gray-400 dark:text-gray-500">{srv.timeout}ms</p>
                        </div>
                        <div className="flex items-center gap-1 ml-3 flex-shrink-0">
                          <button
                            type="button"
                            onClick={() => { setEditingMCPIdx(idx); setShowMCPModal(true); }}
                            className="p-1.5 text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setMcpServers((prev) => prev.filter((_, i) => i !== idx))}
                            className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => { setEditingMCPIdx(null); setShowMCPModal(true); }}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 border border-dashed border-indigo-300 dark:border-indigo-700 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors w-full justify-center"
                >
                  <Plus className="w-4 h-4" />
                  Add MCP
                </button>
              </div>
            </CollapsibleSection>

            {/* Active toggle */}
            <div className="flex items-center gap-3 pt-2">
              <ToggleSwitch
                checked={isActive}
                onChange={setIsActive}
                label="Agent active status"
              />
              <label className="text-sm text-gray-700 dark:text-gray-300">Active</label>
            </div>
          </div>
        </div>

        {/* Right Panel — Test & History */}
        <div className="w-[40%] flex flex-col min-h-0">
          {/* Tab Bar */}
          <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-800">
            <div className="flex">
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
          </div>

          {testTab === "audio" ? (
            <>
              {/* Audio Test Panel */}
              <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-800 p-4">
                <div className="space-y-3">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Test your agent with a live voice call. Make sure your microphone is connected.
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    Please note call transfer is not supported in Webcall.
                  </p>
                  <VoiceCallButton agentId={agentId} size="lg" />
                </div>
              </div>

              {/* Call History */}
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
                  {callsLoading ? (
                    <div className="flex items-center justify-center py-12 gap-2 text-gray-400 dark:text-gray-500">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm">Loading calls...</span>
                    </div>
                  ) : filteredCalls.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-gray-500">
                      <Phone className="w-8 h-8 mb-2 opacity-50" />
                      <p className="text-sm">{calls.length === 0 ? "No calls yet" : "No matching calls"}</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-200 dark:divide-gray-800">
                      {filteredCalls.map((call) => (
                        <Link
                          key={call.id}
                          href="/calls"
                          className="block px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span
                                  className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                    call.status === "completed"
                                      ? "bg-green-400"
                                      : call.status === "in_progress" || call.status === "in-progress"
                                      ? "bg-yellow-400"
                                      : "bg-gray-400"
                                  }`}
                                />
                                <span className="text-sm text-gray-900 dark:text-white">
                                  {call.direction === "inbound" ? "Inbound" : "Outbound"} Call
                                </span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                  call.status === "completed"
                                    ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                                    : call.status === "in_progress" || call.status === "in-progress"
                                    ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400"
                                    : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
                                }`}>
                                  {call.status}
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
            </>
          ) : (
            /* Chat Panel — full height */
            <div className="flex-1 flex flex-col min-h-0">
              {/* Chat header */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-indigo-500" />
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    {llmModel}
                  </span>
                  {chatMessages.length > 0 && (
                    <span className="text-[10px] text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded-full">
                      {chatMessages.filter((m) => m.role === "user").length} messages
                    </span>
                  )}
                </div>
                {chatMessages.length > 0 && (
                  <button
                    onClick={resetChat}
                    disabled={chatStreaming}
                    className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors disabled:opacity-50"
                    title="Reset conversation"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Reset
                  </button>
                )}
              </div>

              {/* Messages area */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
                {chatMessages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500">
                    <MessageSquare className="w-10 h-10 mb-3 opacity-40" />
                    <p className="text-sm font-medium">Test your agent with text</p>
                    <p className="text-xs mt-1 text-center max-w-[220px]">
                      Send a message to see how your agent responds using the current system prompt and model.
                    </p>
                  </div>
                ) : (
                  chatMessages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      {msg.role === "assistant" && (
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center mt-0.5">
                          <Bot className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                        </div>
                      )}
                      <div
                        className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed ${
                          msg.role === "user"
                            ? "bg-indigo-600 text-white rounded-br-sm"
                            : "bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-bl-sm"
                        }`}
                      >
                        {msg.content || (
                          <span className="inline-flex items-center gap-1 text-gray-400">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Thinking...
                          </span>
                        )}
                      </div>
                      {msg.role === "user" && (
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center mt-0.5">
                          <User className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
                        </div>
                      )}
                    </div>
                  ))
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Chat input */}
              <div className="flex-shrink-0 border-t border-gray-200 dark:border-gray-800 p-3">
                <div className="flex items-end gap-2">
                  <textarea
                    ref={chatInputRef}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={handleChatKeyDown}
                    placeholder="Type a message... (Enter to send, Shift+Enter for new line)"
                    rows={1}
                    className="flex-1 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl px-3.5 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none resize-none max-h-32"
                    style={{ minHeight: "40px" }}
                    onInput={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = "40px";
                      target.style.height = Math.min(target.scrollHeight, 128) + "px";
                    }}
                  />
                  <button
                    onClick={handleSendChat}
                    disabled={!chatInput.trim() || chatStreaming}
                    className="flex-shrink-0 w-10 h-10 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white rounded-xl flex items-center justify-center transition-colors"
                  >
                    {chatStreaming ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
