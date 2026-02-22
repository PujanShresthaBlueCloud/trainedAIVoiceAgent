"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { CustomFunction } from "@/types";
import { Code2, Plus, Pencil, Trash2, X, Globe, Zap } from "lucide-react";

export default function CustomFunctionsPage() {
  const [functions, setFunctions] = useState<CustomFunction[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<CustomFunction | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    parameters: "{}",
    webhook_url: "",
    method: "POST",
    is_active: true,
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
    setForm({ name: "", description: "", parameters: "{}", webhook_url: "", method: "POST", is_active: true });
    setEditing(null);
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
    });
    setShowModal(true);
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

      const data = {
        name: form.name,
        description: form.description || undefined,
        parameters: params,
        webhook_url: form.webhook_url || undefined,
        method: form.method,
        is_active: form.is_active,
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

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Custom Functions</h1>
          <p className="text-gray-400 mt-1">Define webhook-backed tools for your agents</p>
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
        <div className="text-center text-gray-500 py-12">Loading...</div>
      ) : functions.length === 0 ? (
        <div className="text-center py-12 bg-gray-900 rounded-xl border border-gray-800">
          <Code2 className="w-12 h-12 mx-auto text-gray-600 mb-4" />
          <p className="text-gray-400">No custom functions yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {functions.map((fn) => (
            <div key={fn.id} className="bg-gray-900 rounded-xl border border-gray-800 p-6 hover:border-gray-700 transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-600/20 rounded-lg flex items-center justify-center">
                    <Zap className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white font-mono">{fn.name}</h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-500 uppercase font-medium">{fn.method}</span>
                      {fn.webhook_url && (
                        <span className="flex items-center gap-1 text-xs text-gray-500">
                          <Globe className="w-3 h-3" /> Webhook
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-full ${fn.is_active ? "bg-green-400" : "bg-gray-600"}`} />
                  <button onClick={() => openEdit(fn)} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(fn.id)} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-red-400 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {fn.description && <p className="text-sm text-gray-400 mb-3">{fn.description}</p>}
              <pre className="text-xs text-gray-500 bg-gray-800/50 rounded-lg p-3 max-h-24 overflow-y-auto whitespace-pre-wrap font-mono">
                {JSON.stringify(fn.parameters, null, 2)}
              </pre>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl border border-gray-800 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <h2 className="text-lg font-semibold text-white">
                {editing ? "Edit Function" : "Create Function"}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Function Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="get_weather"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Description</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-300 mb-1">Webhook URL</label>
                  <input
                    type="url"
                    value={form.webhook_url}
                    onChange={(e) => setForm({ ...form, webhook_url: e.target.value })}
                    placeholder="https://api.example.com/webhook"
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Method</label>
                  <select
                    value={form.method}
                    onChange={(e) => setForm({ ...form, method: e.target.value })}
                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-amber-500 outline-none"
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="PATCH">PATCH</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Parameters (JSON Schema)</label>
                <textarea
                  value={form.parameters}
                  onChange={(e) => setForm({ ...form, parameters: e.target.value })}
                  rows={6}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm font-mono focus:ring-2 focus:ring-amber-500 focus:border-transparent outline-none resize-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="rounded bg-gray-800 border-gray-700 text-amber-600"
                />
                <label className="text-sm text-gray-300">Active</label>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-800 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
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
