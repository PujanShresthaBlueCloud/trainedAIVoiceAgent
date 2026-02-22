"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Call, TranscriptEntry, Agent } from "@/types";
import {
  PhoneOutgoing,
  PhoneIncoming,
  Monitor,
  Trash2,
  MessageSquare,
  X,
} from "lucide-react";

export default function CallsPage() {
  const [calls, setCalls] = useState<Call[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCall, setSelectedCall] = useState<Call | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [showOutbound, setShowOutbound] = useState(false);
  const [outboundForm, setOutboundForm] = useState({ agent_id: "", to_number: "" });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [callsData, agentsData] = await Promise.all([
        api.listCalls(),
        api.listAgents(),
      ]);
      setCalls(callsData);
      setAgents(agentsData);
    } catch (e) {
      console.error("Failed to load:", e);
    } finally {
      setLoading(false);
    }
  };

  const viewTranscript = async (call: Call) => {
    setSelectedCall(call);
    try {
      const data = await api.getTranscript(call.id);
      setTranscript(data);
    } catch (e) {
      console.error("Failed to load transcript:", e);
    }
  };

  const handleOutboundCall = async () => {
    if (!outboundForm.agent_id || !outboundForm.to_number) return;
    try {
      await api.makeOutboundCall(outboundForm.agent_id, outboundForm.to_number);
      setShowOutbound(false);
      setOutboundForm({ agent_id: "", to_number: "" });
      loadData();
    } catch (e) {
      console.error("Failed to make call:", e);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this call record?")) return;
    try {
      await api.deleteCall(id);
      loadData();
    } catch (e) {
      console.error("Failed to delete:", e);
    }
  };

  const directionIcon = (dir: string) => {
    switch (dir) {
      case "inbound": return <PhoneIncoming className="w-4 h-4 text-blue-400" />;
      case "outbound": return <PhoneOutgoing className="w-4 h-4 text-green-400" />;
      default: return <Monitor className="w-4 h-4 text-purple-400" />;
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "completed": return "bg-green-900/50 text-green-400";
      case "in-progress": return "bg-blue-900/50 text-blue-400";
      case "failed": return "bg-red-900/50 text-red-400";
      default: return "bg-gray-800 text-gray-400";
    }
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Calls</h1>
          <p className="text-gray-400 mt-1">Call history and outbound calls</p>
        </div>
        <button
          onClick={() => setShowOutbound(true)}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
        >
          <PhoneOutgoing className="w-4 h-4" />
          Outbound Call
        </button>
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase">Direction</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase">Agent</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase">Number</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase">Status</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase">Duration</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-400 uppercase">Time</th>
              <th className="text-right px-6 py-3 text-xs font-medium text-gray-400 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {loading ? (
              <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-500">Loading...</td></tr>
            ) : calls.length === 0 ? (
              <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-500">No calls yet</td></tr>
            ) : (
              calls.map((call) => (
                <tr key={call.id} className="hover:bg-gray-800/50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {directionIcon(call.direction)}
                      <span className="text-sm text-gray-300 capitalize">{call.direction}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-300">{call.agents?.name || "—"}</td>
                  <td className="px-6 py-4 text-sm text-gray-400">{call.caller_number || "Browser"}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${statusColor(call.status)}`}>
                      {call.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-400">{call.duration_seconds ? `${call.duration_seconds}s` : "—"}</td>
                  <td className="px-6 py-4 text-sm text-gray-400">{new Date(call.started_at).toLocaleString()}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => viewTranscript(call)} className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-white transition-colors" title="View Transcript">
                        <MessageSquare className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(call.id)} className="p-1.5 rounded-lg hover:bg-gray-700 text-gray-400 hover:text-red-400 transition-colors" title="Delete">
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

      {selectedCall && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl border border-gray-800 w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <h2 className="text-lg font-semibold text-white">Transcript</h2>
              <button onClick={() => setSelectedCall(null)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
              {transcript.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No transcript entries</p>
              ) : (
                transcript.map((entry) => (
                  <div key={entry.id} className={`flex ${entry.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-lg px-4 py-2 ${entry.role === "user" ? "bg-indigo-600/30 text-indigo-200" : "bg-gray-800 text-gray-200"}`}>
                      <p className="text-xs font-medium mb-1 opacity-70">{entry.role === "user" ? "User" : "AI"}</p>
                      <p className="text-sm">{entry.content}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {showOutbound && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 rounded-xl border border-gray-800 w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <h2 className="text-lg font-semibold text-white">Make Outbound Call</h2>
              <button onClick={() => setShowOutbound(false)} className="text-gray-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Agent</label>
                <select
                  value={outboundForm.agent_id}
                  onChange={(e) => setOutboundForm({ ...outboundForm, agent_id: e.target.value })}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="">Select an agent</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Phone Number</label>
                <input
                  type="tel"
                  value={outboundForm.to_number}
                  onChange={(e) => setOutboundForm({ ...outboundForm, to_number: e.target.value })}
                  placeholder="+1234567890"
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-800 flex justify-end gap-3">
              <button onClick={() => setShowOutbound(false)} className="px-4 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
              <button
                onClick={handleOutboundCall}
                disabled={!outboundForm.agent_id || !outboundForm.to_number}
                className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                Call Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
