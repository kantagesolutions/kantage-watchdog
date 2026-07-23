"use client";
import { useState } from "react";

interface FileChange {
  path: string;
  repo: string;
  before: string;
  after: string;
  summary: string;
}

export interface PendingApproval {
  id: string;
  action: string;
  service: string;
  container?: string;
  command?: string;
  label: string;
  executedAt?: string;
}

interface Props {
  changeId: string;
  changes: FileChange[];
  approvals?: PendingApproval[];
  status: "pending" | "approved" | "dismissed" | "failed";
  prUrl?: string;
  onApprove: () => void;
  onDismiss: () => void;
  onRunAction?: (approval: PendingApproval) => void;
  approving: boolean;
  runningAction?: string | null;
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

function ApprovalCard({
  approval,
  onRun,
  running,
}: {
  approval: PendingApproval;
  onRun: () => void;
  running: boolean;
}) {
  const executed = !!approval.executedAt;
  return (
    <div className={`rounded-xl border p-3 ${executed ? "bg-green-950/20 border-green-700/40" : "bg-amber-950/30 border-amber-700/40"}`}>
      <div className="flex items-start gap-2 mb-2">
        <span className="text-sm mt-0.5">{executed ? "✅" : "⚠️"}</span>
        <div>
          <p className={`text-xs font-semibold ${executed ? "text-green-300" : "text-amber-200"}`}>
            {executed ? "Action executed" : "Action requires approval"}
          </p>
          <p className={`text-xs mt-0.5 ${executed ? "text-green-400/80" : "text-amber-300/80"}`}>{approval.label}</p>
          {executed && (
            <p className="text-green-500/60 text-xs mt-0.5">Ran at {new Date(approval.executedAt!).toLocaleTimeString()}</p>
          )}
        </div>
      </div>
      {!executed && (
        <button
          onClick={onRun}
          disabled={running}
          className="w-full py-2 rounded-lg bg-amber-700 hover:bg-amber-600 text-white text-xs font-semibold transition-colors disabled:opacity-50"
          data-testid={`button-run-action-${approval.id}`}
        >
          {running ? "Running…" : "▶ Run it"}
        </button>
      )}
    </div>
  );
}

export default function DiffCard({
  changes,
  approvals = [],
  status,
  prUrl,
  onApprove,
  onDismiss,
  onRunAction,
  approving,
  runningAction,
}: Props) {
  const isPending = status === "pending";
  const hasCode = changes.length > 0;
  const hasApprovals = approvals.length > 0;

  const totalItems = changes.length + approvals.length;

  return (
    <div className="mt-3 rounded-2xl bg-[#1a1d27] border border-[#2e3450] overflow-hidden">
      <div className="px-4 py-3 border-b border-[#2e3450] flex items-center gap-2">
        <span className="text-sm">📝</span>
        <span className="text-sm font-medium text-white">
          {hasCode && `${changes.length} file${changes.length !== 1 ? "s" : ""}`}
          {hasCode && hasApprovals && " + "}
          {hasApprovals && `${approvals.length} action${approvals.length !== 1 ? "s" : ""}`}
          {!hasCode && !hasApprovals && "No changes"}
        </span>
        {!isPending && (
          <span className={`ml-auto text-xs px-2 py-0.5 rounded-full capitalize ${
            status === "approved" ? "bg-green-900/40 text-green-300" :
            status === "dismissed" ? "bg-slate-700 text-slate-400" :
            "bg-red-900/40 text-red-300"
          }`}>{status}</span>
        )}
        {status === "approved" && prUrl && (
          <a
            href={prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-xs text-teal-400 hover:text-teal-300 underline"
          >
            View PR ↗
          </a>
        )}
      </div>

      {hasApprovals && (
        <div className="p-3 space-y-2 border-b border-[#2e3450]">
          {approvals.map((a) => (
            <ApprovalCard
              key={a.id}
              approval={a}
              onRun={() => onRunAction?.(a)}
              running={runningAction === a.id}
            />
          ))}
        </div>
      )}

      {hasCode && (
        <div className="p-3 space-y-2">
          {changes.map((c, i) => (
            <div key={i}>
              <p className="text-xs text-slate-400 mb-1.5">{c.summary}</p>
              <DiffBlock path={`${c.repo}/${c.path}`} before={c.before} after={c.after} />
            </div>
          ))}
        </div>
      )}

      {isPending && hasCode && (
        <div className="p-3 pt-0 space-y-2">
          <button
            onClick={onApprove}
            disabled={approving}
            className="w-full py-3 rounded-xl font-semibold text-white text-sm transition-all active:scale-[0.98] disabled:opacity-60"
            style={{ background: "hsl(168,60%,26%)" }}
          >
            {approving ? "Creating PR…" : "✅ Open PR on GitHub"}
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

      {isPending && !hasCode && hasApprovals && (
        <div className="p-3 pt-0">
          <button
            onClick={onDismiss}
            className="w-full py-2.5 rounded-xl font-medium text-slate-400 text-sm border border-[#2e3450] hover:border-slate-500 transition-all"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
