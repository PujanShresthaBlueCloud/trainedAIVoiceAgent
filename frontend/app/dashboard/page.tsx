"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Bot, Phone, MessageSquare, Code2, ArrowUpRight } from "lucide-react";

interface Stats {
  agents: number;
  calls: number;
  prompts: number;
  functions: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({
    agents: 0,
    calls: 0,
    prompts: 0,
    functions: 0,
  });
  const [recentCalls, setRecentCalls] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [agents, calls, prompts, functions] = await Promise.all([
          api.listAgents(),
          api.listCalls(),
          api.listSystemPrompts(),
          api.listCustomFunctions(),
        ]);
        setStats({
          agents: agents.length,
          calls: calls.length,
          prompts: prompts.length,
          functions: functions.length,
        });
        setRecentCalls(calls.slice(0, 5));
      } catch (e) {
        console.error("Failed to load dashboard:", e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const statCards = [
    { label: "Agents", value: stats.agents, icon: Bot, color: "bg-indigo-600" },
    { label: "Total Calls", value: stats.calls, icon: Phone, color: "bg-green-600" },
    { label: "System Prompts", value: stats.prompts, icon: MessageSquare, color: "bg-purple-600" },
    { label: "Functions", value: stats.functions, icon: Code2, color: "bg-amber-600" },
  ];

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-400 mt-1">Overview of your voice AI platform</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="bg-gray-900 rounded-xl border border-gray-800 p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <div className={`${card.color} w-10 h-10 rounded-lg flex items-center justify-center`}>
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <ArrowUpRight className="w-4 h-4 text-gray-600" />
              </div>
              <p className="text-3xl font-bold text-white">
                {loading ? "—" : card.value}
              </p>
              <p className="text-sm text-gray-400 mt-1">{card.label}</p>
            </div>
          );
        })}
      </div>

      <div className="bg-gray-900 rounded-xl border border-gray-800">
        <div className="px-6 py-4 border-b border-gray-800">
          <h2 className="text-lg font-semibold text-white">Recent Calls</h2>
        </div>
        <div className="divide-y divide-gray-800">
          {loading ? (
            <div className="px-6 py-8 text-center text-gray-500">Loading...</div>
          ) : recentCalls.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-500">
              No calls yet. Create an agent and start a test call.
            </div>
          ) : (
            recentCalls.map((call) => (
              <div key={call.id} className="px-6 py-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">
                    {call.agents?.name || "Unknown Agent"}
                  </p>
                  <p className="text-xs text-gray-400">
                    {call.direction} &middot; {call.caller_number || "Browser"}
                  </p>
                </div>
                <div className="text-right">
                  <span
                    className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                      call.status === "completed"
                        ? "bg-green-900/50 text-green-400"
                        : call.status === "in-progress"
                        ? "bg-blue-900/50 text-blue-400"
                        : "bg-gray-800 text-gray-400"
                    }`}
                  >
                    {call.status}
                  </span>
                  <p className="text-xs text-gray-500 mt-1">
                    {call.duration_seconds ? `${call.duration_seconds}s` : "—"}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
