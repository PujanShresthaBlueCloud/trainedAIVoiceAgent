"use client";
import { Phone, PhoneOff, Mic, MicOff, Loader2 } from "lucide-react";
import { useVoiceSession } from "@/lib/useVoiceSession";

interface VoiceCallButtonProps {
  agentId?: string;
  size?: "sm" | "md" | "lg";
}

export default function VoiceCallButton({
  agentId,
  size = "md",
}: VoiceCallButtonProps) {
  const { isConnected, isRecording, transcript, error, status, connect, disconnect } =
    useVoiceSession(agentId);

  const sizeClasses = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base",
  };

  const isConnecting = status === "connecting" || status === "requesting_mic";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {!isConnected && !isConnecting ? (
          <button
            onClick={connect}
            className={`${sizeClasses[size]} bg-green-600 hover:bg-green-700 text-white rounded-lg flex items-center gap-2 font-medium transition-colors`}
          >
            <Phone className="w-4 h-4" />
            Start Call
          </button>
        ) : isConnecting ? (
          <button
            disabled
            className={`${sizeClasses[size]} bg-yellow-600 text-white rounded-lg flex items-center gap-2 font-medium opacity-80 cursor-wait`}
          >
            <Loader2 className="w-4 h-4 animate-spin" />
            {status === "requesting_mic" ? "Requesting mic..." : "Connecting..."}
          </button>
        ) : (
          <button
            onClick={disconnect}
            className={`${sizeClasses[size]} bg-red-600 hover:bg-red-700 text-white rounded-lg flex items-center gap-2 font-medium transition-colors`}
          >
            <PhoneOff className="w-4 h-4" />
            End Call
          </button>
        )}

        {isConnected && (
          <span className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400">
            {isRecording ? (
              <>
                <Mic className="w-4 h-4 text-green-400 animate-pulse" />
                Listening...
              </>
            ) : (
              <>
                <MicOff className="w-4 h-4 text-gray-500" />
                Muted
              </>
            )}
          </span>
        )}
      </div>

      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
          <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        </div>
      )}

      {transcript.length > 0 && (
        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 max-h-60 overflow-y-auto space-y-2 border border-gray-200 dark:border-gray-800">
          {transcript
            .filter((t) => t.is_final)
            .map((entry, i) => (
              <div key={i} className="text-sm">
                <span
                  className={`font-medium ${
                    entry.role === "user" ? "text-blue-600 dark:text-blue-400" : "text-green-600 dark:text-green-400"
                  }`}
                >
                  {entry.role === "user" ? "You" : "AI"}:
                </span>{" "}
                <span className="text-gray-700 dark:text-gray-300">{entry.content}</span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
