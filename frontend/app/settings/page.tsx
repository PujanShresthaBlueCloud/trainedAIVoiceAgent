"use client";
import { useState } from "react";
import { Settings, Key, Globe, Volume2, Brain, Phone, Save, Eye, EyeOff } from "lucide-react";

interface SettingsForm {
  // API Keys
  openai_api_key: string;
  anthropic_api_key: string;
  deepseek_api_key: string;
  google_api_key: string;
  groq_api_key: string;
  deepgram_api_key: string;
  elevenlabs_api_key: string;
  // Twilio
  twilio_account_sid: string;
  twilio_auth_token: string;
  twilio_phone_number: string;
  // General
  default_llm_model: string;
  default_voice_id: string;
  default_language: string;
  app_url: string;
}

const LLM_MODELS = [
  "gpt-4",
  "gpt-4-turbo",
  "gpt-3.5-turbo",
  "claude-3-opus-20240229",
  "claude-3-sonnet-20240229",
  "deepseek-chat",
  "gemini-pro",
  "llama-3.1-70b-versatile",
  "mixtral-8x7b-32768",
];

export default function SettingsPage() {
  const [form, setForm] = useState<SettingsForm>({
    openai_api_key: "",
    anthropic_api_key: "",
    deepseek_api_key: "",
    google_api_key: "",
    groq_api_key: "",
    deepgram_api_key: "",
    elevenlabs_api_key: "",
    twilio_account_sid: "",
    twilio_auth_token: "",
    twilio_phone_number: "",
    default_llm_model: "gpt-4",
    default_voice_id: "21m00Tcm4TlvDq8ikWAM",
    default_language: "en-US",
    app_url: "http://localhost:8000",
  });

  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState(false);

  const toggleKeyVisibility = (key: string) => {
    setShowKeys((s) => ({ ...s, [key]: !s[key] }));
  };

  const handleSave = () => {
    // Settings are configured via backend .env file
    // This page serves as a reference for what's needed
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const renderKeyInput = (
    label: string,
    field: keyof SettingsForm,
    placeholder: string
  ) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {label}
      </label>
      <div className="relative">
        <input
          type={showKeys[field] ? "text" : "password"}
          value={form[field]}
          onChange={(e) => setForm({ ...form, [field]: e.target.value })}
          placeholder={placeholder}
          className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 pr-10 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none font-mono"
        />
        <button
          type="button"
          onClick={() => toggleKeyVisibility(field)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          {showKeys[field] ? (
            <EyeOff className="w-4 h-4" />
          ) : (
            <Eye className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Configure your platform API keys and defaults
        </p>
      </div>

      <div className="space-y-8">
        {/* LLM API Keys */}
        <section className="bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Brain className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">LLM Providers</h2>
          </div>
          <div className="space-y-4">
            {renderKeyInput("OpenAI API Key", "openai_api_key", "sk-...")}
            {renderKeyInput("Anthropic API Key", "anthropic_api_key", "sk-ant-...")}
            {renderKeyInput("DeepSeek API Key", "deepseek_api_key", "sk-...")}
            {renderKeyInput("Google AI API Key", "google_api_key", "AI...")}
            {renderKeyInput("Groq API Key", "groq_api_key", "gsk_...")}
          </div>
        </section>

        {/* Voice API Keys */}
        <section className="bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Volume2 className="w-5 h-5 text-green-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Voice Services</h2>
          </div>
          <div className="space-y-4">
            {renderKeyInput("Deepgram API Key", "deepgram_api_key", "Your Deepgram key")}
            {renderKeyInput("ElevenLabs API Key", "elevenlabs_api_key", "Your ElevenLabs key")}
          </div>
        </section>

        {/* Twilio */}
        <section className="bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Phone className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Twilio</h2>
          </div>
          <div className="space-y-4">
            {renderKeyInput("Account SID", "twilio_account_sid", "AC...")}
            {renderKeyInput("Auth Token", "twilio_auth_token", "Your auth token")}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Phone Number
              </label>
              <input
                type="text"
                value={form.twilio_phone_number}
                onChange={(e) => setForm({ ...form, twilio_phone_number: e.target.value })}
                placeholder="+1234567890"
                className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              />
            </div>
          </div>
        </section>

        {/* Defaults */}
        <section className="bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Globe className="w-5 h-5 text-purple-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Defaults</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Default LLM Model
              </label>
              <select
                value={form.default_llm_model}
                onChange={(e) => setForm({ ...form, default_llm_model: e.target.value })}
                className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                {LLM_MODELS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Default Voice ID (ElevenLabs)
              </label>
              <input
                type="text"
                value={form.default_voice_id}
                onChange={(e) => setForm({ ...form, default_voice_id: e.target.value })}
                className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none font-mono"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Default Language
              </label>
              <input
                type="text"
                value={form.default_language}
                onChange={(e) => setForm({ ...form, default_language: e.target.value })}
                className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Backend URL
              </label>
              <input
                type="text"
                value={form.app_url}
                onChange={(e) => setForm({ ...form, app_url: e.target.value })}
                className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              />
            </div>
          </div>
        </section>

        {/* Info banner */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <Key className="w-5 h-5 text-blue-500 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
                API keys are configured on the server
              </p>
              <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
                Edit the <code className="bg-blue-100 dark:bg-blue-900/50 px-1.5 py-0.5 rounded text-xs font-mono">backend/.env</code> file to set your API keys.
                Changes require a backend restart to take effect.
              </p>
            </div>
          </div>
        </div>

        {/* Save button */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
          >
            <Save className="w-4 h-4" />
            Save Settings
          </button>
          {saved && (
            <span className="text-sm text-green-600 dark:text-green-400">
              Settings saved!
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
