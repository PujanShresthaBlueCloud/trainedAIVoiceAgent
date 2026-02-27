"use client";
import { useEffect, useState, useRef } from "react";
import { api } from "@/lib/api";
import { KnowledgeBase, KnowledgeBaseFile } from "@/types";
import {
  Database, Plus, Pencil, Trash2, X, Upload, FileText, Loader2,
  ChevronDown, ChevronRight, AlertCircle, CheckCircle2,
} from "lucide-react";

const PROVIDERS = [
  { value: "pinecone", label: "Pinecone", fields: ["api_key", "index_name", "host", "namespace"] },
];

export default function KnowledgeBasePage() {
  const [kbs, setKBs] = useState<KnowledgeBase[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<KnowledgeBase | null>(null);
  const [expandedKB, setExpandedKB] = useState<string | null>(null);
  const [files, setFiles] = useState<Record<string, KnowledgeBaseFile[]>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    name: "",
    description: "",
    provider: "pinecone",
    config: {} as Record<string, string>,
    is_active: true,
  });

  const loadKBs = async () => {
    try {
      const data = await api.listKnowledgeBases();
      setKBs(data);
    } catch (e) {
      console.error("Failed to load:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKBs();
  }, []);

  const loadFiles = async (kbId: string) => {
    try {
      const data = await api.listKBFiles(kbId);
      setFiles((f) => ({ ...f, [kbId]: data }));
    } catch (e) {
      console.error("Failed to load files:", e);
    }
  };

  const toggleExpand = (kbId: string) => {
    if (expandedKB === kbId) {
      setExpandedKB(null);
    } else {
      setExpandedKB(kbId);
      loadFiles(kbId);
    }
  };

  const resetForm = () => {
    setForm({ name: "", description: "", provider: "pinecone", config: {}, is_active: true });
    setEditing(null);
  };

  const openCreate = () => {
    resetForm();
    setShowModal(true);
  };

  const openEdit = (kb: KnowledgeBase) => {
    setEditing(kb);
    const config: Record<string, string> = {};
    if (kb.config) {
      Object.entries(kb.config).forEach(([k, v]) => {
        config[k] = String(v);
      });
    }
    setForm({
      name: kb.name,
      description: kb.description || "",
      provider: kb.provider,
      config,
      is_active: kb.is_active,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    try {
      const data = {
        name: form.name,
        description: form.description || undefined,
        provider: form.provider,
        config: form.config,
        is_active: form.is_active,
      };
      if (editing) {
        await api.updateKnowledgeBase(editing.id, data);
      } else {
        await api.createKnowledgeBase(data);
      }
      setShowModal(false);
      resetForm();
      loadKBs();
    } catch (e) {
      console.error("Failed to save:", e);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this knowledge base? All files and vectors will be removed.")) return;
    try {
      await api.deleteKnowledgeBase(id);
      loadKBs();
    } catch (e) {
      console.error("Failed to delete:", e);
    }
  };

  const handleFileUpload = async (kbId: string, file: File) => {
    setUploading(kbId);
    try {
      await api.uploadKBFile(kbId, file);
      loadFiles(kbId);
      loadKBs();
    } catch (e) {
      console.error("Upload failed:", e);
      alert("File upload failed: " + (e as Error).message);
    } finally {
      setUploading(null);
    }
  };

  const handleDeleteFile = async (kbId: string, fileId: string) => {
    if (!confirm("Delete this file?")) return;
    try {
      await api.deleteKBFile(kbId, fileId);
      loadFiles(kbId);
      loadKBs();
    } catch (e) {
      console.error("Failed to delete file:", e);
    }
  };

  const currentProvider = PROVIDERS.find((p) => p.value === form.provider);

  const updateConfig = (key: string, value: string) => {
    setForm((f) => ({ ...f, config: { ...f.config, [key]: value } }));
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Knowledge Base</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Manage document collections for RAG-powered voice agents</p>
        </div>
        <button
          onClick={openCreate}
          className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Knowledge Base
        </button>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 dark:text-gray-500 py-12">Loading...</div>
      ) : kbs.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
          <Database className="w-12 h-12 mx-auto text-gray-600 mb-4" />
          <p className="text-gray-500 dark:text-gray-400">No knowledge bases yet</p>
        </div>
      ) : (
        <div className="space-y-4">
          {kbs.map((kb) => (
            <div key={kb.id} className="bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              {/* KB Header */}
              <div className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3 cursor-pointer" onClick={() => toggleExpand(kb.id)}>
                    {expandedKB === kb.id ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                    <div className="w-10 h-10 bg-purple-50 dark:bg-purple-600/20 rounded-lg flex items-center justify-center">
                      <Database className="w-5 h-5 text-purple-400" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 dark:text-white">{kb.name}</h3>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-gray-400 dark:text-gray-500 uppercase font-medium">{kb.provider}</span>
                        <span className="text-xs text-gray-400 dark:text-gray-500">{kb.file_count || 0} files</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className={`w-2 h-2 rounded-full ${kb.is_active ? "bg-green-400" : "bg-gray-600"}`} />
                    <button onClick={() => openEdit(kb)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button onClick={() => handleDelete(kb.id)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-red-400 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                {kb.description && <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 ml-11">{kb.description}</p>}
              </div>

              {/* Expanded: Files */}
              {expandedKB === kb.id && (
                <div className="border-t border-gray-200 dark:border-gray-800 px-6 py-4">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Files</h4>
                    <div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.txt,.docx,.csv"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleFileUpload(kb.id, f);
                          e.target.value = "";
                        }}
                      />
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading === kb.id}
                        className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
                      >
                        {uploading === kb.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                        Upload File
                      </button>
                    </div>
                  </div>

                  {(files[kb.id] || []).length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">No files uploaded yet</p>
                  ) : (
                    <div className="space-y-2">
                      {(files[kb.id] || []).map((file) => (
                        <div key={file.id} className="flex items-center justify-between bg-gray-100/50 dark:bg-gray-800/50 rounded-lg px-4 py-3">
                          <div className="flex items-center gap-3">
                            <FileText className="w-4 h-4 text-gray-400" />
                            <div>
                              <p className="text-sm text-gray-900 dark:text-white font-medium">{file.filename}</p>
                              <div className="flex items-center gap-3 text-xs text-gray-400">
                                <span>{formatFileSize(file.file_size)}</span>
                                <span>{file.chunk_count} chunks</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {file.status === "completed" && <CheckCircle2 className="w-4 h-4 text-green-400" />}
                            {file.status === "processing" && <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />}
                            {file.status === "failed" && (
                              <span title={file.error_message || "Failed"}>
                                <AlertCircle className="w-4 h-4 text-red-400" />
                              </span>
                            )}
                            <button
                              onClick={() => handleDeleteFile(kb.id, file.id)}
                              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-red-400 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editing ? "Edit Knowledge Base" : "Create Knowledge Base"}
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
                  placeholder="Product Documentation"
                  className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Provider</label>
                <select
                  value={form.provider}
                  onChange={(e) => setForm({ ...form, provider: e.target.value, config: {} })}
                  className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-purple-500 outline-none"
                >
                  {PROVIDERS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>

              {/* Dynamic config fields */}
              {currentProvider && (
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Configuration</label>
                  {currentProvider.fields.map((field) => (
                    <div key={field}>
                      <label className="block text-xs text-gray-400 mb-1">{field}</label>
                      <input
                        type={field.includes("key") ? "password" : "text"}
                        value={form.config[field] || ""}
                        onChange={(e) => updateConfig(field, e.target.value)}
                        placeholder={field}
                        className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm font-mono focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                      />
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="rounded bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-purple-600"
                />
                <label className="text-sm text-gray-700 dark:text-gray-300">Active</label>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-800 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">Cancel</button>
              <button
                onClick={handleSave}
                disabled={!form.name}
                className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {editing ? "Save Changes" : "Create Knowledge Base"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
