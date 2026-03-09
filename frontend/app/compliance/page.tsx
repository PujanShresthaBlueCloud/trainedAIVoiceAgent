"use client";

import { useState, useEffect } from "react";
import {
  ShieldCheck,
  Download,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Info,
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
}

export default function CompliancePage() {
  const [checks, setChecks] = useState<ComplianceCheck[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [actionResult, setActionResult] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [status, logs] = await Promise.all([
        api.getComplianceStatus(),
        api.getAuditLogs(),
      ]);
      setChecks(status.checks || []);
      setAuditLogs(logs || []);
    } catch (err) {
      console.error("Failed to load compliance data:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDataExport() {
    if (!phoneNumber.trim()) return;
    setActionLoading(true);
    setActionResult(null);
    try {
      const result = await api.requestDataExport(phoneNumber.trim());
      const callCount = result.calls?.length || 0;
      const transcriptCount = result.transcripts?.length || 0;
      setActionResult(
        `Export complete: ${callCount} calls, ${transcriptCount} transcript entries`
      );
      // Trigger download of the data as JSON
      const blob = new Blob([JSON.stringify(result, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `data-export-${phoneNumber.trim()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setActionResult(`Export failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDataDeletion() {
    if (!phoneNumber.trim()) return;
    if (
      !confirm(
        `Are you sure you want to delete all data for ${phoneNumber}? This action cannot be undone.`
      )
    )
      return;
    setActionLoading(true);
    setActionResult(null);
    try {
      const result = await api.requestDataDeletion(phoneNumber.trim());
      setActionResult(
        `Deletion complete: ${result.affected?.calls || 0} calls redacted`
      );
    } catch (err: any) {
      setActionResult(`Deletion failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRetentionCleanup() {
    setActionLoading(true);
    setActionResult(null);
    try {
      const result = await api.triggerRetentionCleanup();
      setActionResult(
        `Cleanup complete: ${result.redacted_calls || 0} calls, ${result.redacted_transcripts || 0} transcripts redacted`
      );
    } catch (err: any) {
      setActionResult(`Cleanup failed: ${err.message}`);
    } finally {
      setActionLoading(false);
    }
  }

  function statusIcon(status: string) {
    if (status === "enabled" || status === "configured" || status === "available") {
      return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    }
    if (status === "development_mode") {
      return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
    }
    return <Info className="w-4 h-4 text-gray-400" />;
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
              Australian Privacy Act, My Health Records Act, ASD Essential Eight
            </p>
          </div>
        </div>
        <button
          onClick={loadData}
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
            <div
              key={check.name}
              className="flex items-center justify-between px-5 py-3"
            >
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
              <span
                className={`text-xs font-medium px-2 py-1 rounded-full ${
                  check.status === "enabled" || check.status === "configured" || check.status === "available"
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : check.status === "development_mode"
                      ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                      : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                }`}
              >
                {check.status.replace("_", " ")}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Data Actions */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
            Data Subject Actions
          </h2>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex gap-3">
            <input
              type="text"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="Enter phone number (e.g. +61412345678)"
              className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="flex gap-3">
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
            <div className="p-3 text-sm bg-gray-50 dark:bg-gray-800 rounded-lg text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700">
              {actionResult}
            </div>
          )}
        </div>
      </div>

      {/* Audit Logs */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-200 dark:border-gray-800">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
            Recent Audit Logs
          </h2>
        </div>
        {auditLogs.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
            No audit log entries yet
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800/50">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-gray-500 dark:text-gray-400">
                    Timestamp
                  </th>
                  <th className="text-left px-4 py-2 font-medium text-gray-500 dark:text-gray-400">
                    Action
                  </th>
                  <th className="text-left px-4 py-2 font-medium text-gray-500 dark:text-gray-400">
                    Resource
                  </th>
                  <th className="text-left px-4 py-2 font-medium text-gray-500 dark:text-gray-400">
                    IP Address
                  </th>
                  <th className="text-left px-4 py-2 font-medium text-gray-500 dark:text-gray-400">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-gray-900 dark:text-white font-mono text-xs">
                      {log.action}
                    </td>
                    <td className="px-4 py-2 text-gray-600 dark:text-gray-400">
                      {log.resource_type}
                      {log.resource_id ? `/${log.resource_id}` : ""}
                    </td>
                    <td className="px-4 py-2 text-gray-500 dark:text-gray-400 font-mono text-xs">
                      {log.ip_address}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          log.status_code && log.status_code < 400
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : log.status_code && log.status_code < 500
                              ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                              : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                        }`}
                      >
                        {log.status_code || "—"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
