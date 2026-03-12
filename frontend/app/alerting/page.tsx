"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import {
  Bell,
  Plus,
  Pencil,
  Trash2,
  X,
  AlertTriangle,
  AlertCircle,
  Info,
  Phone,
  Activity,
  Clock,
  Users,
} from "lucide-react";

interface AlertRule {
  id: string;
  name: string;
  type: "call" | "system";
  condition: string;
  threshold: string;
  severity: "critical" | "warning" | "info";
  enabled: boolean;
}

interface AlertEvent {
  id: string;
  message: string;
  severity: "critical" | "warning" | "info";
  type: "call" | "system";
  timestamp: string;
}

const DEFAULT_RULES: AlertRule[] = [
  { id: "1", name: "Failed Calls Spike", type: "call", condition: "Failed calls exceed threshold", threshold: "5", severity: "critical", enabled: true },
  { id: "2", name: "Long Call Duration", type: "call", condition: "Call duration exceeds threshold (seconds)", threshold: "1800", severity: "warning", enabled: true },
  { id: "3", name: "High Call Volume", type: "call", condition: "Total calls today exceed threshold", threshold: "100", severity: "info", enabled: true },
  { id: "4", name: "API Error Rate", type: "system", condition: "API error rate exceeds threshold (%)", threshold: "5", severity: "critical", enabled: true },
  { id: "5", name: "Rate Limit Exceeded", type: "system", condition: "Rate limit hits exceed threshold", threshold: "10", severity: "warning", enabled: true },
  { id: "6", name: "Missed Calls", type: "call", condition: "Missed calls exceed threshold", threshold: "3", severity: "warning", enabled: true },
];

const STORAGE_KEY = "alerting_rules";

function loadRules(): AlertRule[] {
  if (typeof window === "undefined") return DEFAULT_RULES;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch {
      return DEFAULT_RULES;
    }
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_RULES));
  return DEFAULT_RULES;
}

function saveRules(rules: AlertRule[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
}

const severityConfig = {
  critical: { bg: "bg-red-100 dark:bg-red-600/20", text: "text-red-700 dark:text-red-400", icon: AlertTriangle },
  warning: { bg: "bg-amber-100 dark:bg-amber-600/20", text: "text-amber-700 dark:text-amber-400", icon: AlertCircle },
  info: { bg: "bg-blue-100 dark:bg-blue-600/20", text: "text-blue-700 dark:text-blue-400", icon: Info },
};

const typeBadge = {
  call: "bg-indigo-100 dark:bg-indigo-600/20 text-indigo-700 dark:text-indigo-400",
  system: "bg-purple-100 dark:bg-purple-600/20 text-purple-700 dark:text-purple-400",
};

export default function AlertingPage() {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [alerts, setAlerts] = useState<AlertEvent[]>([]);
  const [stats, setStats] = useState({ totalToday: 0, failed: 0, avgDuration: 0, activeAgents: 0 });
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingRule, setEditingRule] = useState<AlertRule | null>(null);
  const [form, setForm] = useState({ name: "", type: "call" as "call" | "system", condition: "", threshold: "", severity: "warning" as "critical" | "warning" | "info" });

  const loadData = useCallback(async () => {
    try {
      const [calls, agents] = await Promise.all([
        api.listCalls().catch(() => []),
        api.listAgents().catch(() => []),
      ]);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayCalls = calls.filter((c: any) => new Date(c.started_at || c.created_at) >= today);
      const failedCalls = calls.filter((c: any) => c.status === "failed");
      const durations = calls.filter((c: any) => c.duration_seconds).map((c: any) => c.duration_seconds);
      const avgDur = durations.length > 0 ? Math.round(durations.reduce((a: number, b: number) => a + b, 0) / durations.length) : 0;

      setStats({
        totalToday: todayCalls.length,
        failed: failedCalls.length,
        avgDuration: avgDur,
        activeAgents: agents.filter((a: any) => a.is_active).length,
      });

      // Derive alerts from call data
      const currentRules = loadRules();
      const derivedAlerts: AlertEvent[] = [];

      // Check for failed calls
      failedCalls.forEach((c: any) => {
        const failedRule = currentRules.find((r) => r.id === "1");
        if (failedRule?.enabled) {
          derivedAlerts.push({
            id: `failed-${c.id}`,
            message: `Call ${c.id?.slice(0, 8)}... failed${c.caller_number ? ` from ${c.caller_number}` : ""}`,
            severity: "critical",
            type: "call",
            timestamp: c.ended_at || c.started_at || c.created_at,
          });
        }
      });

      // Check for long duration calls
      const longDurationRule = currentRules.find((r) => r.id === "2");
      if (longDurationRule?.enabled) {
        const threshold = parseInt(longDurationRule.threshold) || 1800;
        calls.filter((c: any) => c.duration_seconds > threshold).forEach((c: any) => {
          derivedAlerts.push({
            id: `long-${c.id}`,
            message: `Call ${c.id?.slice(0, 8)}... lasted ${Math.round(c.duration_seconds / 60)} minutes (threshold: ${Math.round(threshold / 60)}m)`,
            severity: "warning",
            type: "call",
            timestamp: c.ended_at || c.started_at || c.created_at,
          });
        });
      }

      // Check high call volume
      const volumeRule = currentRules.find((r) => r.id === "3");
      if (volumeRule?.enabled && todayCalls.length > parseInt(volumeRule.threshold)) {
        derivedAlerts.push({
          id: "volume-today",
          message: `High call volume: ${todayCalls.length} calls today (threshold: ${volumeRule.threshold})`,
          severity: "info",
          type: "call",
          timestamp: new Date().toISOString(),
        });
      }

      // Sort alerts by timestamp descending
      derivedAlerts.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setAlerts(derivedAlerts.slice(0, 50));
    } catch (e) {
      console.error("Failed to load alerting data:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setRules(loadRules());
    loadData();
  }, [loadData]);

  const toggleRule = (id: string) => {
    setRules((prev) => {
      const updated = prev.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r));
      saveRules(updated);
      return updated;
    });
  };

  const deleteRule = (id: string) => {
    if (!confirm("Delete this alert rule?")) return;
    setRules((prev) => {
      const updated = prev.filter((r) => r.id !== id);
      saveRules(updated);
      return updated;
    });
  };

  const openCreate = () => {
    setForm({ name: "", type: "call", condition: "", threshold: "", severity: "warning" });
    setEditingRule(null);
    setShowModal(true);
  };

  const openEdit = (rule: AlertRule) => {
    setForm({ name: rule.name, type: rule.type, condition: rule.condition, threshold: rule.threshold, severity: rule.severity });
    setEditingRule(rule);
    setShowModal(true);
  };

  const handleSave = () => {
    if (!form.name || !form.condition) return;
    setRules((prev) => {
      let updated: AlertRule[];
      if (editingRule) {
        updated = prev.map((r) => (r.id === editingRule.id ? { ...r, ...form } : r));
      } else {
        const newRule: AlertRule = { id: Date.now().toString(), ...form, enabled: true };
        updated = [...prev, newRule];
      }
      saveRules(updated);
      return updated;
    });
    setShowModal(false);
  };

  const formatTimestamp = (ts: string) => {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  };

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Alerting</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">Monitor system health and configure alert rules</p>
        </div>
        <button
          onClick={openCreate}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Create Rule
        </button>
      </div>

      {/* System Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Calls Today</span>
            <div className="w-8 h-8 bg-indigo-50 dark:bg-indigo-600/20 rounded-lg flex items-center justify-center">
              <Phone className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{loading ? "—" : stats.totalToday}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Failed Calls</span>
            <div className="w-8 h-8 bg-red-50 dark:bg-red-600/20 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-red-500 dark:text-red-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{loading ? "—" : stats.failed}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Avg Duration</span>
            <div className="w-8 h-8 bg-amber-50 dark:bg-amber-600/20 rounded-lg flex items-center justify-center">
              <Clock className="w-4 h-4 text-amber-500 dark:text-amber-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{loading ? "—" : formatDuration(stats.avgDuration)}</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Active Agents</span>
            <div className="w-8 h-8 bg-green-50 dark:bg-green-600/20 rounded-lg flex items-center justify-center">
              <Users className="w-4 h-4 text-green-500 dark:text-green-400" />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{loading ? "—" : stats.activeAgents}</p>
        </div>
      </div>

      {/* Alert Rules */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Alert Rules</h2>
            <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">{rules.length} rules</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-800">
                <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Rule Name</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Type</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Condition</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Severity</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Enabled</th>
                <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
              {rules.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center">
                    <Bell className="w-10 h-10 mx-auto text-gray-400 dark:text-gray-600 mb-3" />
                    <p className="text-gray-500 dark:text-gray-400 text-sm">No alert rules configured.</p>
                  </td>
                </tr>
              ) : (
                rules.map((rule) => {
                  const sev = severityConfig[rule.severity];
                  return (
                    <tr key={rule.id} className="hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors">
                      <td className="px-6 py-3.5">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{rule.name}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${typeBadge[rule.type]}`}>
                          {rule.type}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-sm text-gray-500 dark:text-gray-400">{rule.condition}</span>
                        {rule.threshold && (
                          <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">({rule.threshold})</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${sev.bg} ${sev.text}`}>
                          {rule.severity}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <button
                          onClick={() => toggleRule(rule.id)}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                            rule.enabled ? "bg-indigo-600" : "bg-gray-300 dark:bg-gray-700"
                          }`}
                        >
                          <span
                            className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                              rule.enabled ? "translate-x-[18px]" : "translate-x-[3px]"
                            }`}
                          />
                        </button>
                      </td>
                      <td className="px-6 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(rule)}
                            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                            title="Edit"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => deleteRule(rule.id)}
                            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-red-500 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Alerts */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex items-center gap-2">
          <Bell className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Recent Alerts</h2>
          {alerts.length > 0 && (
            <span className="text-xs text-gray-400 dark:text-gray-500 ml-1">{alerts.length} alerts</span>
          )}
        </div>
        <div className="divide-y divide-gray-200 dark:divide-gray-800">
          {loading ? (
            <div className="px-6 py-12 text-center text-gray-400 dark:text-gray-500 text-sm">Loading...</div>
          ) : alerts.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <Bell className="w-10 h-10 mx-auto text-gray-400 dark:text-gray-600 mb-3" />
              <p className="text-gray-500 dark:text-gray-400 text-sm">No alerts triggered. Everything looks healthy.</p>
            </div>
          ) : (
            alerts.map((alert) => {
              const sev = severityConfig[alert.severity];
              const SevIcon = sev.icon;
              return (
                <div key={alert.id} className="px-6 py-3.5 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-gray-900/50 transition-colors">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${sev.bg}`}>
                    <SevIcon className={`w-4 h-4 ${sev.text}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900 dark:text-white truncate">{alert.message}</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{formatTimestamp(alert.timestamp)}</p>
                  </div>
                  <span className={`text-xs font-medium px-2 py-1 rounded-full flex-shrink-0 ${typeBadge[alert.type]}`}>
                    {alert.type}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Create/Edit Rule Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editingRule ? "Edit Rule" : "Create Rule"}
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
                  placeholder="Alert rule name"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
                  <select
                    value={form.type}
                    onChange={(e) => setForm({ ...form, type: e.target.value as "call" | "system" })}
                    className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    <option value="call">Call</option>
                    <option value="system">System</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Severity</label>
                  <select
                    value={form.severity}
                    onChange={(e) => setForm({ ...form, severity: e.target.value as "critical" | "warning" | "info" })}
                    className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  >
                    <option value="critical">Critical</option>
                    <option value="warning">Warning</option>
                    <option value="info">Info</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Condition</label>
                <input
                  type="text"
                  value={form.condition}
                  onChange={(e) => setForm({ ...form, condition: e.target.value })}
                  className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  placeholder="e.g. Failed calls exceed threshold"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Threshold</label>
                <input
                  type="text"
                  value={form.threshold}
                  onChange={(e) => setForm({ ...form, threshold: e.target.value })}
                  className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                  placeholder="e.g. 5"
                />
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
                disabled={!form.name || !form.condition}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {editingRule ? "Save Changes" : "Create Rule"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
