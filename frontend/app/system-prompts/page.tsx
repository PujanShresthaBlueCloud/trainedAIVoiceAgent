"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { SystemPrompt } from "@/types";
import { MessageSquare, Plus, Pencil, Trash2, X, Star } from "lucide-react";

export default function SystemPromptsPage() {
  const [prompts, setPrompts] = useState<SystemPrompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<SystemPrompt | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    content: "",
    category: "",
    is_default: false,
  });

  const loadPrompts = async () => {
    try {
      const data = await api.listSystemPrompts();
      setPrompts(data);
    } catch (e) {
      console.error("Failed to load:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPrompts();
  }, []);

  const resetForm = () => {
    setForm({ name: "", description: "", content: "", category: "", is_default: false });
    setEditing(null);
  };

  const openCreate = () => {
    resetForm();
    setShowModal(true);
  };

  const openEdit = (prompt: SystemPrompt) => {
    setEditing(prompt);
    setForm({
      name: prompt.name,
      description: prompt.description || "",
      content: prompt.content,
      category: prompt.category || "",
      is_default: prompt.is_default,
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    try {
      if (editing) {
        await api.updateSystemPrompt(editing.id, form);
      } else {
        await api.createSystemPrompt(form);
      }
      setShowModal(false);
      resetForm();
      loadPrompts();
    } catch (e) {
      console.error("Failed to save:", e);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this system prompt?")) return;
    try {
      await api.deleteSystemPrompt(id);
      loadPrompts();
    } catch (e) {
      console.error("Failed to delete:", e);
    }
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">System Prompts</h1>
          <p className="text-gray-400 mt-1">Reusable system prompts for your agents</p>
        </div>
        <button
          onClick={openCreate}
          className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Prompt
        </button>
      </div>

      {loading ? (
        <div className="text-center text-gray-500 py-12">Loading...</div>
      ) : prompts.length === 0 ? (
        <div className="text-center py-12 bg-gray-900 rounded-xl border border-gray-800">
          <MessageSquare className="w-12 h-12 mx-auto text-gray-600 mb-4" />
          <p className="text-gray-400">No system prompts yet</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {prompts.map((prompt) => (
            <div key={prompt.id} className="bg-gray-900 rounded-xl border border-gray-800 p-6 hover:border-gray-700 transition-colors">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-600/20 rounded-lg flex items-center justify-center">
                    <MessageSquare className="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-white">{prompt.name}</h3>
                      {prompt.is_default && <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />}
                    </div>
                    {prompt.category && (
                      <span className="text-xs text-gray-500">{prompt.category}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => openEdit(prompt)} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(prompt.id)} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-red-400 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {prompt.description && (
                <p className="text-sm text-gray-400 mb-3">{prompt.description}</p>
              )}
              <pre className="text-xs text-gray-500 bg-gray-800/50 rounded-lg p-3 max-h-32 overflow-y-auto whitespace-pre-wrap">
                {prompt.content}
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
                {editing ? "Edit Prompt" : "Create Prompt"}
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
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Description</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Category</label>
                <input
                  type="text"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="e.g. customer-service, sales"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Content</label>
                <textarea
                  value={form.content}
                  onChange={(e) => setForm({ ...form, content: e.target.value })}
                  rows={8}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none resize-none font-mono"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.is_default}
                  onChange={(e) => setForm({ ...form, is_default: e.target.checked })}
                  className="rounded bg-gray-800 border-gray-700 text-purple-600"
                />
                <label className="text-sm text-gray-300">Set as default</label>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-800 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
              <button
                onClick={handleSave}
                disabled={!form.name || !form.content}
                className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {editing ? "Save Changes" : "Create Prompt"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
