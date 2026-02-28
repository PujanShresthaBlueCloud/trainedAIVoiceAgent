"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Agent } from "@/types";
import {
  RefreshCw,
  Settings2,
  Check,
  Loader2,
} from "lucide-react";

interface PhoneNumber {
  id: string;
  phone_number: string;
  agent_id: string | null;
  friendly_name: string | null;
  is_active: boolean;
  agents?: { id: string; name: string } | null;
  created_at: string;
  updated_at: string;
}

export default function PhoneNumbersPage() {
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [configuringId, setConfiguringId] = useState<string | null>(null);
  const [configuredIds, setConfiguredIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [pnData, agentsData] = await Promise.all([
        api.listPhoneNumbers(),
        api.listAgents(),
      ]);
      setPhoneNumbers(pnData);
      setAgents(agentsData);
    } catch (e) {
      console.error("Failed to load:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await api.syncPhoneNumbers();
      await loadData();
    } catch (e) {
      console.error("Failed to sync:", e);
    } finally {
      setSyncing(false);
    }
  };

  const handleAgentChange = async (phoneId: string, agentId: string) => {
    try {
      await api.updatePhoneNumber(phoneId, {
        agent_id: agentId || null,
      });
      await loadData();
    } catch (e) {
      console.error("Failed to update:", e);
    }
  };

  const handleConfigure = async (phoneId: string) => {
    setConfiguringId(phoneId);
    try {
      await api.configurePhoneNumber(phoneId);
      setConfiguredIds((prev) => new Set(prev).add(phoneId));
    } catch (e) {
      console.error("Failed to configure:", e);
    } finally {
      setConfiguringId(null);
    }
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Phone Numbers</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            Manage Twilio phone numbers and assign agents
          </p>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Syncing..." : "Sync from Twilio"}
        </button>
      </div>

      <div className="bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-800">
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Number</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Friendly Name</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Agent</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
              <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-400 dark:text-gray-500">Loading...</td>
              </tr>
            ) : phoneNumbers.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-400 dark:text-gray-500">
                  No phone numbers. Click &quot;Sync from Twilio&quot; to import your numbers.
                </td>
              </tr>
            ) : (
              phoneNumbers.map((pn) => (
                <tr key={pn.id} className="hover:bg-gray-100/50 dark:hover:bg-gray-800/50">
                  <td className="px-6 py-4 text-sm font-mono text-gray-900 dark:text-white">{pn.phone_number}</td>
                  <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">{pn.friendly_name || "—"}</td>
                  <td className="px-6 py-4">
                    <select
                      value={pn.agent_id || ""}
                      onChange={(e) => handleAgentChange(pn.id, e.target.value)}
                      className="bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-2 py-1.5 text-sm text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">No agent assigned</option>
                      {agents.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                      pn.is_active
                        ? "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400"
                        : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                    }`}>
                      {pn.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleConfigure(pn.id)}
                      disabled={configuringId === pn.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
                    >
                      {configuringId === pn.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : configuredIds.has(pn.id) ? (
                        <Check className="w-4 h-4 text-green-500" />
                      ) : (
                        <Settings2 className="w-4 h-4" />
                      )}
                      {configuringId === pn.id ? "Configuring..." : configuredIds.has(pn.id) ? "Configured" : "Configure Webhook"}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <h3 className="text-sm font-medium text-blue-800 dark:text-blue-300 mb-1">How it works</h3>
        <ul className="text-sm text-blue-700 dark:text-blue-400 space-y-1 list-disc list-inside">
          <li><strong>Sync from Twilio</strong> imports your Twilio phone numbers into this platform.</li>
          <li><strong>Assign an agent</strong> to each number to control which AI agent answers calls to that number.</li>
          <li><strong>Configure Webhook</strong> updates the Twilio number&apos;s voice URL to point to this server (via ngrok).</li>
        </ul>
      </div>
    </div>
  );
}
