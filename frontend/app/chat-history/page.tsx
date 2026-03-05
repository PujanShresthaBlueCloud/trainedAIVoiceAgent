"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ChatConversation, ChatMessage } from "@/types";
import {
  MessageSquare,
  Trash2,
  X,
  Search,
  Bot,
  User,
} from "lucide-react";

export default function ChatHistoryPage() {
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedConversation, setSelectedConversation] = useState<ChatConversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  useEffect(() => {
    loadConversations();
  }, []);

  const loadConversations = async () => {
    try {
      const data = await api.listChatConversations();
      setConversations(data);
    } catch (e) {
      console.error("Failed to load conversations:", e);
    } finally {
      setLoading(false);
    }
  };

  const viewMessages = async (conv: ChatConversation) => {
    setSelectedConversation(conv);
    setMessagesLoading(true);
    try {
      const data = await api.getChatMessages(conv.id);
      setMessages(data);
    } catch (e) {
      console.error("Failed to load messages:", e);
    } finally {
      setMessagesLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this conversation?")) return;
    try {
      await api.deleteChatConversation(id);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (selectedConversation?.id === id) setSelectedConversation(null);
    } catch (e) {
      console.error("Failed to delete:", e);
    }
  };

  const filtered = conversations.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (c.title?.toLowerCase().includes(q)) ||
      (c.agents?.name?.toLowerCase().includes(q))
    );
  });

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Chat History</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">View and search past chat conversations</p>
      </div>

      {/* Search */}
      <div className="mb-4 relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search by title or agent name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
        />
      </div>

      {/* Table */}
      <div className="bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-800">
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Agent</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Title / Preview</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Messages</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Date</th>
              <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
            {loading ? (
              <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-400 dark:text-gray-500">Loading...</td></tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-16 text-center">
                  <MessageSquare className="w-10 h-10 text-gray-400 dark:text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-400 dark:text-gray-500">
                    {search ? "No conversations match your search" : "No chat conversations yet"}
                  </p>
                  {!search && (
                    <p className="text-xs text-gray-400 dark:text-gray-600 mt-1">
                      Start a chat from any agent&apos;s detail page to see it here.
                    </p>
                  )}
                </td>
              </tr>
            ) : (
              filtered.map((conv) => (
                <tr key={conv.id} className="hover:bg-gray-100/50 dark:hover:bg-gray-800/50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Bot className="w-4 h-4 text-indigo-400" />
                      <span className="text-sm text-gray-700 dark:text-gray-300">{conv.agents?.name || "—"}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300 max-w-xs truncate">
                    {conv.title || "Untitled conversation"}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{conv.message_count}</td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{new Date(conv.created_at).toLocaleString()}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => viewMessages(conv)}
                        className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                        title="View Messages"
                      >
                        <MessageSquare className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(conv.id)}
                        className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 hover:text-red-400 transition-colors"
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

      {/* Messages Modal */}
      {selectedConversation && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {selectedConversation.title || "Chat"}
                </h2>
                {selectedConversation.agents?.name && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Agent: {selectedConversation.agents.name}
                  </p>
                )}
              </div>
              <button
                onClick={() => setSelectedConversation(null)}
                className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {messagesLoading ? (
                <p className="text-gray-400 dark:text-gray-500 text-center py-8">Loading messages...</p>
              ) : messages.length === 0 ? (
                <p className="text-gray-400 dark:text-gray-500 text-center py-8">No messages</p>
              ) : (
                messages.map((msg) => (
                  <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[80%] rounded-lg px-4 py-2 ${
                        msg.role === "user"
                          ? "bg-indigo-600/30 text-indigo-200"
                          : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200"
                      }`}
                    >
                      <p className="text-xs font-medium mb-1 opacity-70 flex items-center gap-1">
                        {msg.role === "user" ? (
                          <><User className="w-3 h-3" /> You</>
                        ) : (
                          <><Bot className="w-3 h-3" /> AI</>
                        )}
                      </p>
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
