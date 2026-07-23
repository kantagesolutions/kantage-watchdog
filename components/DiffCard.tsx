"use client";
import { useState } from "react";

interface FileChange {
  path: string;
  repo: string;
  before: string;
  after: string;
  summary: string;
}

interface Props {
  changeId: string;
  changes: FileChange[];
  status: "pending" | "approved" | "dismissed" | "failed";
  onApprove: () => void;
  onDismiss: () => void;
  approving: boolean;
}

function DiffBlock({ before, after, path }: { before: string; after: string; path: string }) {
  const [expanded, setExpanded] = useState(false);
  const lines_before = (before || "").split("\n");
  const lines_after = (after || "").split("\n");

  return (
    <div className="rounded-xl overflow-hidden border border-[#2e3450] text-xs">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-3 py-2 bg-[#1a1d27] hover:bg-[#21253a] transition-colors text-left"
      >
        <span className="font-mono text-slate-300 truncate">{path}</span>
        <span className="text-slate-500 ml-2 flex-shrink-0">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="max-h-64 overflow-y-auto">
          <div className="p-2 bg-red-950/20 border-b border-[#2e3450]">
            <p className="text-red-400 text-[10px] uppercase tracking-wide mb-1 font-semibold">Before</p>
            <pre className="text-red-300/80 overflow-x-auto text-[10px] leading-relaxed whitespace-pre-wrap break-all">
              {lines_before.slice(0, 40).join("\n")}
              {lines_before.length > 40 && `\n… (${lines_before.length - 40} more lines)`}
            </pre>
          </div>
          <div className="p-2 bg-green-950/20">
            <p className="text-green-400 text-[10px] uppercase tracking-wide mb-1 font-semibold">After</p>
            <pre className="text-green-300/80 overflow-x-auto text-[10px] leading-relaxed whitespace-pre-wrap break-all">
              {lines_after.slice(0, 40).join("\n")}
              {lines_after.length > 40 && `\n… (${lines_after.length - 40} more lines)`}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DiffCard({ changes, status, onApprove, onDismiss, approving }: Props) {
  const isPending = status === "pending";

  return (
    <div className="mt-3 rounded-2xl bg-[#1a1d27] border border-[#2e3450] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#2e3450] flex items-center gap-2">
        <span className="text-sm">📝</span>
        <span className="text-sm font-medium text-white">
          {changes.length} file{changes.length !== 1 ? "s" : ""} changed
        </span>
        {!isPending && (
          <span className={`ml-auto text-xs px-2 py-0.5 rounded-full capitalize ${
            status === "approved" ? "bg-green-900/40 text-green-300" :
            status === "dismissed" ? "bg-slate-700 text-slate-400" :
            "bg-red-900/40 text-red-300"
          }`}>{status}</span>
        )}
      </div>

      <div className="p-3 space-y-2">
        {changes.map((c, i) => (
          <div key={i}>
            <p className="text-xs text-slate-400 mb-1.5">{c.summary}</p>
            <DiffBlock path={`${c.repo}/${c.path}`} before={c.before} after={c.after} />
          </div>
        ))}
      </div>

      {isPending && (
        <div className="p-3 pt-0 space-y-2">
          <button
            onClick={onApprove}
            disabled={approving}
            className="w-full py-3 rounded-xl font-semibold text-white text-sm transition-all active:scale-[0.98] disabled:opacity-60"
            style={{ background: "hsl(168,60%,26%)" }}
          >
            {approving ? "Committing…" : "✅ Approve & Push to GitHub"}
          </button>
          <button
            onClick={onDismiss}
            disabled={approving}
            className="w-full py-2.5 rounded-xl font-medium text-slate-400 text-sm border border-[#2e3450] hover:border-slate-500 transition-all active:scale-[0.98] disabled:opacity-60"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
