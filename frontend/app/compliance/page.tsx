"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ShieldCheck,
  Download,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Info,
  Search,
  ChevronDown,
} from "lucide-react";
import { api } from "@/lib/api";

interface ComplianceCheck {
  name: string;
  status: string;
  description: string;
}

interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: string;
  resource_type: string;
  resource_id: string;
  ip_address: string;
  request_method: string;
  request_path: string;
  status_code: number;
  details: string;
}

const PAGE_SIZE = 50;

export default function CompliancePage() {
  const [checks, setChecks] = useState<ComplianceCheck[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [auditLoading, setAuditLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [auditOffset, setAuditOffset] = useState(0);
  const [auditSearch, setAuditSearch] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [actionResult, setActionResult] = useState<{ text: string; ok: boolean } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const loadChecks = useCallback(async () => {
    try {
      const status = await api.getComplianceStatus();
      setChecks(status.checks || []);
    } catch (err) {
      console.error("Failed to load compliance status:", err);
    }
  }, []);

  const loadAuditLogs = useCallback(async (offset = 0, replace = true) => {
    setAuditLoading(true);
    try {
      const logs = await api.getAuditLogs(PAGE_SIZE + 1, offset);
      const page = logs.slice(0, PAGE_SIZE);
      setHasMore(logs.length > PAGE_SIZE);
      setAuditLogs((prev) => (replace ? page : [...prev, ...page]));
      setAuditOffset(offset + page.length);
    } catch (err) {
      console.error("Failed to load audit logs:", err);
    } finally {
      setAuditLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([loadChecks(), loadAuditLogs(0, true)]).finally(() =>
      setLoading(false)
    );
  }, [loadChecks, loadAuditLogs]);

  const filteredLogs = auditSearch.trim()
    ? auditLogs.filter((l) => {
        const q = auditSearch.toLowerCase();
        return (
          l.action?.toLowerCase().includes(q) ||
          l.resource_type?.toLowerCase().includes(q) ||
          l.ip_address?.toLowerCase().includes(q) ||
          l.request_path?.toLowerCase().includes(q) ||
          l.details?.toLowerCase().includes(q)
        );
      })
    : auditLogs;

  async function handleDataExport() {
    if (!phoneNumber.trim()) return;
    setActionLoading(true);
    setActionResult(null);
    try {
      const result = await api.requestDataExport(phoneNumber.trim());
      const callCount = result.call_count ?? result.calls?.length ?? 0;
      const transcriptCount = result.transcripts?.length ?? 0;
      setActionResult({
        text: `Export complete: ${callCount} call(s), ${transcriptCount} transcript entries`,
        ok: true,
      });
      const blob = new Blob([JSON.stringify(result, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `data-export-${phoneNumber.trim().replace(/\+/g, "")}.json`;
      a.click();
      URL.revokeObjectURL(url);
      await loadAuditLogs(0, true);
    } catch (err: any) {
      setActionResult({ text: `Export failed: ${err.message}`, ok: false });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDataDeletion() {
    if (!phoneNumber.trim()) return;
    if (
      !confirm(
        `Are you sure you want to permanently delete all data for ${phoneNumber}?\n\nThis action cannot be undone.`
      )
    )
      return;
    setActionLoading(true);
    setActionResult(null);
    try {
      const result = await api.requestDataDeletion(phoneNumber.trim());
      const a = result.affected || {};
      setActionResult({
        text: `Deletion complete: ${a.calls ?? 0} call(s), ${a.transcripts ?? 0} transcript(s), ${a.function_logs ?? 0} function log(s) redacted`,
        ok: true,
      });
      await loadAuditLogs(0, true);
    } catch (err: any) {
      setActionResult({ text: `Deletion failed: ${err.message}`, ok: false });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRetentionCleanup() {
    setActionLoading(true);
    setActionResult(null);
    try {
      const result = await api.triggerRetentionCleanup();
      setActionResult({
        text: `Cleanup complete: ${result.redacted_calls ?? 0} call(s), ${result.redacted_transcripts ?? 0} transcript(s), ${result.redacted_function_logs ?? 0} function log(s) redacted`,
        ok: true,
      });
      await loadAuditLogs(0, true);
    } catch (err: any) {
      setActionResult({ text: `Cleanup failed: ${err.message}`, ok: false });
    } finally {
      setActionLoading(false);
    }
  }

  function statusIcon(status: string) {
    if (["enabled", "configured", "available"].includes(status))
      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    if (status === "development_mode")
      return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
    if (status === "disabled")
      return <AlertTriangle className="w-4 h-4 text-red-500" />;
    return <Info className="w-4 h-4 text-gray-400" />;
  }

  function statusBadge(status: string) {
    if (["enabled", "configured", "available"].includes(status))
      return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    if (status === "development_mode")
      return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
    if (status === "disabled")
      return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
              Compliance Dashboard
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Australian Privacy Act · My Health Records Act · ASD Essential Eight
            </p>
          </div>
        </div>
        <button
          onClick={() => { loadChecks(); loadAuditLogs(0, true); }}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-300"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Compliance Checklist */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
            Compliance Posture
          </h2>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {checks.map((check) => (
            <div key={check.name} className="flex items-center justify-between px-5 py-3">
              <div className="flex items-center gap-3">
                {statusIcon(check.status)}
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {check.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {check.description}
                  </p>
                </div>
              </div>
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusBadge(check.status)}`}>
                {check.status.replace(/_/g, " ")}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Data Subject Actions */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
            Data Subject Actions
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Supports E.164 (+61412345678) and local (0412345678) formats
          </p>
        </div>
        <div className="p-5 space-y-4">
          <input
            type="text"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="Enter phone number (e.g. +61412345678 or 0412345678)"
            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleDataExport}
              disabled={actionLoading || !phoneNumber.trim()}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Download className="w-4 h-4" />
              Export Data (APP 12)
            </button>
            <button
              onClick={handleDataDeletion}
              disabled={actionLoading || !phoneNumber.trim()}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete Data (APP 13)
            </button>
            <button
              onClick={handleRetentionCleanup}
              disabled={actionLoading}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${actionLoading ? "animate-spin" : ""}`} />
              Run Retention Cleanup
            </button>
          </div>
          {actionResult && (
            <div
              className={`p-3 text-sm rounded-lg border ${
                actionResult.ok
                  ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-800 dark:text-green-300"
                  : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-800 dark:text-red-300"
              }`}
            >
              {actionResult.text}
            </div>
          )}
        </div>
      </div>

      {/* Audit Logs */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
            Audit Logs
            <span className="ml-2 text-xs text-gray-400 font-normal">
              {filteredLogs.length}{auditSearch ? " matching" : ""}
            </span>
          </h2>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              value={auditSearch}
              onChange={(e) => setAuditSearch(e.target.value)}
              placeholder="Search logs..."
              className="pl-8 pr-3 py-1.5 w-48 text-xs bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
        </div>

        {auditLoading && auditLogs.length === 0 ? (
          <div className="flex items-center justify-center py-12 gap-2 text-gray-400">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span className="text-sm">Loading...</span>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            {auditSearch ? "No matching audit log entries" : "No audit log entries yet"}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800/50">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">Timestamp</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-500 dark:text-gray-400">Action</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-500 dark:text-gray-400">Resource</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-500 dark:text-gray-400">IP Address</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-500 dark:text-gray-400">Status</th>
                    <th className="text-left px-4 py-2 font-medium text-gray-500 dark:text-gray-400">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                      <td className="px-4 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap text-xs">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-gray-900 dark:text-white font-mono text-xs">
                        {log.action}
                      </td>
                      <td className="px-4 py-2 text-gray-600 dark:text-gray-400 text-xs">
                        {log.resource_type}
                        {log.resource_id ? `/${log.resource_id}` : ""}
                      </td>
                      <td className="px-4 py-2 text-gray-500 dark:text-gray-400 font-mono text-xs">
                        {log.ip_address || "—"}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                            !log.status_code || log.status_code < 400
                              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                              : log.status_code < 500
                              ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                              : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                          }`}
                        >
                          {log.status_code || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-gray-500 dark:text-gray-400 text-xs max-w-xs truncate">
                        {log.details || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {hasMore && !auditSearch && (
              <div className="px-5 py-3 border-t border-gray-100 dark:border-gray-800">
                <button
                  onClick={() => loadAuditLogs(auditOffset, false)}
                  disabled={auditLoading}
                  className="flex items-center gap-2 text-sm text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-50"
                >
                  <ChevronDown className="w-4 h-4" />
                  {auditLoading ? "Loading..." : "Load more"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
