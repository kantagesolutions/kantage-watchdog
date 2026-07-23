"use client";
import { useState, useEffect, useCallback } from "react";

type Settings = Record<string, string>;
type Configured = Record<string, boolean>;

interface SettingField {
  key: string;
  label: string;
  placeholder: string;
  sensitive?: boolean;
  multiline?: boolean;
  note?: string;
}

const SECTIONS: { id: string; title: string; icon: string; desc: string; fields: SettingField[] }[] = [
  {
    id: "services",
    title: "Services to Monitor",
    icon: "📡",
    desc: "URLs Watchdog will ping every minute.",
    fields: [
      { key: "HUB_URL",     label: "Hub URL",     placeholder: "https://kantage.solutions" },
      { key: "BUILDER_URL", label: "Builder URL",  placeholder: "https://builder.kantage.solutions" },
      { key: "DEPLOY_URL",  label: "Deploy URL",   placeholder: "https://deploy.kantage.solutions" },
      { key: "WATCHDOG_URL",label: "Watchdog URL", placeholder: "http://167.233.129.231" },
    ],
  },
  {
    id: "github",
    title: "GitHub",
    icon: "🐙",
    desc: "Required for the AI agent to commit fixes to your repos.",
    fields: [
      { key: "GITHUB_TOKEN",   label: "Personal Access Token", placeholder: "ghp_…", sensitive: true, note: "Needs repo scope. Get one at github.com/settings/tokens" },
      { key: "GITHUB_ORG",    label: "Organisation / Username", placeholder: "kantagesolutions" },
      { key: "HUB_REPO",      label: "Hub repo name",      placeholder: "Kantage-Hub" },
      { key: "BUILDER_REPO",  label: "Builder repo name",  placeholder: "kantage-builder" },
      { key: "DEPLOY_REPO",   label: "Deploy repo name",   placeholder: "Kantage-Deployer" },
    ],
  },
  {
    id: "ssh",
    title: "SSH Access",
    icon: "🔐",
    desc: "Lets Watchdog run commands and pull logs from your servers.",
    fields: [
      { key: "HUB_SERVER_HOST",     label: "Hub server IP / host",     placeholder: "167.233.122.233" },
      { key: "BUILDER_SERVER_HOST", label: "Builder server IP / host", placeholder: "167.233.122.233" },
      { key: "DEPLOY_SERVER_HOST",  label: "Deploy server IP / host",  placeholder: "167.233.122.233" },
      { key: "SSH_USERNAME",        label: "SSH username",             placeholder: "root" },
      { key: "WATCHDOG_SSH_KEY",    label: "Private key (PEM)",        placeholder: "-----BEGIN OPENSSH PRIVATE KEY-----\n…", sensitive: true, multiline: true, note: "Paste the full private key. Newlines are preserved." },
    ],
  },
  {
    id: "email",
    title: "Email Alerts",
    icon: "📧",
    desc: "Send incident and recovery notifications.",
    fields: [
      { key: "SMTP_HOST",  label: "SMTP host",  placeholder: "smtp.gmail.com" },
      { key: "SMTP_PORT",  label: "SMTP port",  placeholder: "587" },
      { key: "SMTP_USER",  label: "SMTP username / address", placeholder: "you@gmail.com" },
      { key: "SMTP_PASS",  label: "SMTP password / app password", placeholder: "••••••••", sensitive: true, note: "For Gmail, generate an App Password in your Google account." },
      { key: "ALERT_EMAIL", label: "Send alerts to", placeholder: "you@example.com" },
    ],
  },
  {
    id: "ai",
    title: "AI & Auto-Repair",
    icon: "🤖",
    desc: "Power the AI agent that diagnoses and fixes incidents.",
    fields: [
      { key: "ANTHROPIC_API_KEY", label: "Anthropic API key", placeholder: "sk-ant-…", sensitive: true, note: "Used for diagnosis and code generation." },
      { key: "OPENAI_API_KEY",   label: "OpenAI API key",    placeholder: "sk-…",     sensitive: true, note: "Optional fallback." },
      { key: "AUTO_REPAIR",      label: "Auto-repair",       placeholder: "true",     note: "Set to 'true' to trigger AI repair automatically on incidents, 'false' to disable." },
    ],
  },
];

export default function SettingsPage() {
  const [values, setValues] = useState<Settings>({});
  const [configured, setConfigured] = useState<Configured>({});
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [loading, setLoading] = useState(true);

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  };

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/settings");
      if (!res.ok) throw new Error();
      const data = await res.json();
      setValues(data.settings);
      setConfigured(data.configured);
    } catch {
      showToast("Failed to load settings", false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleChange = (key: string, val: string) => {
    setValues(prev => ({ ...prev, [key]: val }));
    setDirty(prev => new Set(prev).add(key));
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload: Settings = {};
      for (const k of dirty) payload[k] = values[k] ?? "";
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDirty(new Set());
      showToast(`Saved ${data.saved} setting${data.saved !== 1 ? "s" : ""}`, true);
      await load();
    } catch (e: any) {
      showToast(e?.message || "Save failed", false);
    } finally {
      setSaving(false);
    }
  };

  const test = async (type: string) => {
    setTesting(type);
    try {
      const res = await fetch("/api/settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const data = await res.json();
      if (data.ok) {
        showToast(type === "github" ? `Connected as @${data.login}` : "Test email sent!", true);
      } else {
        showToast(data.error || "Test failed", false);
      }
    } catch {
      showToast("Test failed", false);
    } finally {
      setTesting(null);
    }
  };

  const toggleReveal = (key: string) => {
    setRevealed(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400 text-sm">Loading settings…</div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-white font-bold text-xl">Settings</h1>
          <p className="text-slate-400 text-sm mt-0.5">Configure all secrets and connections</p>
        </div>
        <button
          onClick={save}
          disabled={saving || dirty.size === 0}
          className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
        >
          {saving ? "Saving…" : dirty.size > 0 ? `Save (${dirty.size})` : "Saved"}
        </button>
      </div>

      {SECTIONS.map(section => (
        <div key={section.id} className="bg-[#161922] border border-[#2e3450] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[#2e3450] flex items-start gap-2">
            <span className="text-lg leading-none mt-0.5">{section.icon}</span>
            <div>
              <div className="text-white font-semibold text-sm">{section.title}</div>
              <div className="text-slate-400 text-xs mt-0.5">{section.desc}</div>
            </div>
          </div>

          <div className="divide-y divide-[#2e3450]">
            {section.fields.map(field => {
              const isSensitive = !!field.sensitive;
              const isRevealed = revealed.has(field.key);
              const isConfigured = configured[field.key];
              const isDirty = dirty.has(field.key);
              const currentVal = values[field.key] ?? "";

              return (
                <div key={field.key} className="px-4 py-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <label className="text-slate-300 text-xs font-medium">{field.label}</label>
                    {isConfigured && !isDirty && (
                      <span className="text-[10px] text-teal-400 bg-teal-400/10 px-1.5 py-0.5 rounded-full">✓ set</span>
                    )}
                    {isDirty && (
                      <span className="text-[10px] text-yellow-400 bg-yellow-400/10 px-1.5 py-0.5 rounded-full">unsaved</span>
                    )}
                  </div>

                  <div className="flex gap-2">
                    {field.multiline ? (
                      <textarea
                        rows={4}
                        className="flex-1 bg-[#0f1117] border border-[#2e3450] rounded-lg px-3 py-2 text-white text-xs font-mono placeholder:text-slate-600 focus:outline-none focus:border-teal-500 resize-none"
                        placeholder={field.placeholder}
                        value={isSensitive && !isRevealed && !isDirty ? currentVal : currentVal}
                        onChange={e => handleChange(field.key, e.target.value)}
                        onFocus={() => {
                          if (isSensitive && !isDirty) {
                            handleChange(field.key, "");
                          }
                        }}
                      />
                    ) : (
                      <input
                        type={isSensitive && !isRevealed ? "password" : "text"}
                        className="flex-1 bg-[#0f1117] border border-[#2e3450] rounded-lg px-3 py-2 text-white text-xs font-mono placeholder:text-slate-600 focus:outline-none focus:border-teal-500"
                        placeholder={field.placeholder}
                        value={currentVal}
                        onChange={e => handleChange(field.key, e.target.value)}
                        onFocus={() => {
                          if (isSensitive && !isDirty) {
                            handleChange(field.key, "");
                          }
                        }}
                      />
                    )}
                    {isSensitive && !field.multiline && (
                      <button
                        onClick={() => toggleReveal(field.key)}
                        className="px-2.5 text-slate-400 hover:text-slate-200 transition-colors text-sm"
                        title={isRevealed ? "Hide" : "Reveal"}
                      >
                        {isRevealed ? "🙈" : "👁"}
                      </button>
                    )}
                  </div>

                  {field.note && (
                    <p className="text-slate-500 text-[11px] mt-1.5">{field.note}</p>
                  )}
                </div>
              );
            })}
          </div>

          {section.id === "github" && (
            <div className="px-4 py-3 border-t border-[#2e3450]">
              <button
                onClick={() => test("github")}
                disabled={testing === "github"}
                className="text-xs text-teal-400 hover:text-teal-300 disabled:opacity-50 transition-colors"
              >
                {testing === "github" ? "Testing…" : "⚡ Test GitHub connection"}
              </button>
            </div>
          )}

          {section.id === "email" && (
            <div className="px-4 py-3 border-t border-[#2e3450]">
              <button
                onClick={() => test("email")}
                disabled={testing === "email"}
                className="text-xs text-teal-400 hover:text-teal-300 disabled:opacity-50 transition-colors"
              >
                {testing === "email" ? "Sending…" : "⚡ Send test email"}
              </button>
            </div>
          )}
        </div>
      ))}

      <div className="pb-4 text-center text-slate-600 text-xs">
        Settings are stored in the database and take effect within 60 seconds.
      </div>

      {toast && (
        <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 px-4 py-3 rounded-xl shadow-xl text-sm font-medium z-50 ${
          toast.ok ? "bg-teal-700 text-white" : "bg-red-800 text-white"
        }`}>
          {toast.ok ? "✓ " : "✗ "}{toast.msg}
        </div>
      )}
    </div>
  );
}
