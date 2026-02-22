"use client";
import VoiceCallButton from "./VoiceCallButton";
import { Phone } from "lucide-react";

interface TestCallSectionProps {
  agentId: string;
  agentName: string;
}

export default function TestCallSection({
  agentId,
  agentName,
}: TestCallSectionProps) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-6">
      <div className="flex items-center gap-2 mb-4">
        <Phone className="w-5 h-5 text-indigo-400" />
        <h3 className="text-lg font-semibold text-white">
          Test Call — {agentName}
        </h3>
      </div>
      <p className="text-sm text-gray-400 mb-4">
        Start a browser-based voice call to test this agent. Make sure your
        microphone is connected.
      </p>
      <VoiceCallButton agentId={agentId} size="lg" />
    </div>
  );
}
