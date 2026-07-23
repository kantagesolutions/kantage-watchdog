"use client";
import { useState, useEffect } from "react";

interface CodeChange {
  id: string;
  repo: string;
  summary: string;
  status: string;
  commitSha: string | null;
  error: string | null;
  createdAt: string;
  files: { path: string; repo: string; summary: string }[];
}

const STATUS_STYLES: Record<string, string> = {
  pending:  "bg-yellow-900/30 text-yellow-300 border-yellow-700/40",
  approved: "bg-green-900/30 text-green-300 border-green-700/40",
  dismissed:"bg-slate-700/40 text-slate-400 border-slate-600/40",
  failed:   "bg-red-900/30 text-red-300 border-red-700/40",
};

export default function ChangesPage() {
  const [changes, setChanges] = useState<CodeChange[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/changes").then(r => r.json()).then(data => {
      setChanges(Array.isArray(data) ? data : []);
      setLoading(false);
    });
  }, []);

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h2 className="text-white font-semibold text-lg mb-4">Code Changes</h2>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-20 rounded-2xl bg-[#21253a] animate-pulse" />)}
        </div>
      ) : changes.length === 0 ? (
        <div className="bg-[#21253a] rounded-2xl p-8 text-center">
          <p className="text-4xl mb-3">💾</p>
          <p className="text-slate-300 font-medium">No code changes yet</p>
          <p className="text-slate-500 text-sm mt-1">Changes proposed by the AI agent appear here</p>
        </div>
      ) : (
        <div className="space-y-3">
          {changes.map(c => (
            <div key={c.id} className="bg-[#21253a] rounded-2xl p-4 border border-[#2e3450]">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <p className="text-white text-sm font-medium line-clamp-2">{c.summary}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{c.repo} · {new Date(c.createdAt).toLocaleString()}</p>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full border flex-shrink-0 capitalize ${STATUS_STYLES[c.status] || ""}`}>
                  {c.status}
                </span>
              </div>
              <div className="space-y-1">
                {c.files?.slice(0, 4).map((f, i) => (
                  <p key={i} className="text-xs text-slate-400 font-mono truncate">{f.repo}/{f.path}</p>
                ))}
                {c.files?.length > 4 && (
                  <p className="text-xs text-slate-500">+{c.files.length - 4} more files</p>
                )}
              </div>
              {c.commitSha && (
                <p className="text-xs text-teal-500 mt-2 font-mono">commit {c.commitSha.slice(0, 7)}</p>
              )}
              {c.error && (
                <p className="text-xs text-red-400 mt-2">{c.error}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
