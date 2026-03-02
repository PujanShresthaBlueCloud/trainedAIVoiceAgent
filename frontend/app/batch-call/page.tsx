"use client";
import { PhoneOutgoing } from "lucide-react";

export default function BatchCallPage() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Batch Call</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Send outbound calls to multiple contacts at once</p>
      </div>
      <div className="flex flex-col items-center justify-center py-24 bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800">
        <PhoneOutgoing className="w-12 h-12 text-gray-400 dark:text-gray-600 mb-4" />
        <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-1">Coming Soon</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm text-center">
          Batch calling lets you upload a list of contacts and run automated outbound campaigns with your AI agents.
        </p>
      </div>
    </div>
  );
}
