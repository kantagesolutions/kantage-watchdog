"use client";
import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import DiffCard, { PendingApproval } from "@/components/DiffCard";

interface FileChange {
  path: string;
  repo: string;
  before: string;
  after: string;
  summary: string;
}

interface TrailEvent {
  type: "tool_call" | "tool_result";
  name: string;
  input?: Record<string, unknown>;
  output?: string;
  error?: boolean;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  hasCode: boolean;
  createdAt: string;
  changeId?: string;
  trail?: TrailEvent[];
  streaming?: boolean;
}

interface ChangeState {
  changeId: string;
  changes: FileChange[];
  approvals: PendingApproval[];
  status: "pending" | "approved" | "dismissed" | "failed";
  prUrl?: string;
}

interface Session {
  id: string;
  title: string;
  updatedAt: string;
}

const TOOL_LABELS: Record<string, string> = {
  read_file: "Reading file",
  list_files: "Listing files",
  get_docker_logs: "Getting Docker logs",
  run_ssh_command: "Running SSH command",
  restart_container: "Queuing restart",
  propose_code_changes: "Preparing code changes",
};

function TrailItem({ event }: { event: TrailEvent }) {
  const [expanded, setExpanded] = useState(false);
  const isCall = event.type === "tool_call";
  const label = TOOL_LABELS[event.name] || event.name;

  const detail = isCall
    ? Object.entries(event.input || {}).map(([k, v]) => `${k}: ${String(v)}`).join(" · ")
    : event.output || "";

  return (
    <div className={`flex items-start gap-2 text-xs py-1 ${isCall ? "text-slate-400" : event.error ? "text-red-400" : "text-slate-500"}`}>
      <span className="mt-0.5 flex-shrink-0">
        {isCall ? "⚙" : event.error ? "✗" : "✓"}
      </span>
      <div className="min-w-0">
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-left hover:text-slate-300 transition-colors"
        >
          <span className="font-medium">{label}</span>
          {detail && <span className="ml-1 opacity-60 truncate">{detail.slice(0, 60)}{detail.length > 60 ? "…" : ""}</span>}
        </button>
        {expanded && detail && (
          <pre className="mt-1 text-[10px] bg-[#161922] rounded p-2 overflow-x-auto whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
            {detail}
          </pre>
        )}
      </div>
    </div>
  );
}

function TrailPanel({ events }: { events: TrailEvent[] }) {
  if (events.length === 0) return null;
  return (
    <div className="mt-2 rounded-xl bg-[#161922] border border-[#2e3450] px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-slate-600 font-semibold mb-1.5">Investigation trail</p>
      <div className="divide-y divide-[#2e3450]/50">
        {events.map((e, i) => <TrailItem key={i} event={e} />)}
      </div>
    </div>
  );
}

function ChatUI() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const incidentId = searchParams.get("incident");
  const initialSessionId = searchParams.get("session");

  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId);
  const [sessionTitle, setSessionTitle] = useState<string>("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [changeMap, setChangeMap] = useState<Record<string, ChangeState>>({});
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [approving, setApproving] = useState<string | null>(null);
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [deletingSession, setDeletingSession] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const autoSentRef = useRef(false);

  const loadSessions = useCallback(async () => {
    const res = await fetch("/api/chat");
    if (res.ok) setSessions(await res.json());
  }, []);

  const loadSession = useCallback(async (sid: string) => {
    const res = await fetch(`/api/chat?sessionId=${sid}`);
    if (!res.ok) return;
    const data = await res.json();
    setSessionTitle(data.title || "");

    const cmap: Record<string, ChangeState> = {};
    for (const ch of data.codeChanges || []) {
      const payload = ch.files as { changes?: any[]; approvals?: any[] } | null;
      const changes = Array.isArray(payload) ? payload : (payload?.changes || []);
      const approvals = payload?.approvals || [];
      const prUrl = ch.prUrl || undefined;
      cmap[ch.id] = { changeId: ch.id, changes, approvals, status: ch.status, prUrl };
    }
    setChangeMap(cmap);

    const msgs: Message[] = (data.messages || []).map((m: any) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      hasCode: m.hasCode,
      createdAt: m.createdAt,
    }));

    const changesList = data.codeChanges || [];
    const codeMessages = msgs.filter(m => m.hasCode);
    codeMessages.forEach((m, i) => {
      if (changesList[i]) m.changeId = changesList[i].id;
    });

    setMessages(msgs);
  }, []);

  const sendMessage = useCallback(async (text: string, sid: string | null = sessionId) => {
    if (!text.trim() || sending) return null;
    setSending(true);

    const userMsg: Message = {
      id: "u-" + Date.now(),
      role: "user",
      content: text,
      hasCode: false,
      createdAt: new Date().toISOString(),
    };
    const placeholderId = "thinking-" + Date.now();
    const placeholder: Message = {
      id: placeholderId,
      role: "assistant",
      content: "",
      hasCode: false,
      createdAt: new Date().toISOString(),
      trail: [],
      streaming: true,
    };
    setMessages(prev => [...prev, userMsg, placeholder]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, sessionId: sid, incidentId }),
      });

      if (!res.ok || !res.body) {
        const errData = await res.json().catch(() => ({}));
        setMessages(prev => prev.map(m => m.id === placeholderId
          ? { ...m, content: `Error: ${errData.error || "Could not reach the agent"}`, streaming: false }
          : m
        ));
        return null;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let newSid = sid;
      let finalReply = "";
      let finalChanges: FileChange[] = [];
      let finalApprovals: PendingApproval[] = [];
      let metaReceived = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;
          const raw = part.slice(6).trim();
          if (!raw) continue;

          let event: any;
          try { event = JSON.parse(raw); } catch { continue; }

          if (event.type === "token") {
            finalReply += event.text;
            setMessages(prev => prev.map(m => m.id === placeholderId
              ? { ...m, content: finalReply }
              : m
            ));
          } else if (event.type === "tool_call" || event.type === "tool_result") {
            const trailEvent: TrailEvent = event.type === "tool_call"
              ? { type: "tool_call", name: event.name, input: event.input || {} }
              : { type: "tool_result", name: event.name, output: event.output || "", error: event.error };
            setMessages(prev => prev.map(m => m.id === placeholderId
              ? { ...m, trail: [...(m.trail || []), trailEvent] }
              : m
            ));
          } else if (event.type === "done") {
            finalChanges = event.changes || [];
            finalApprovals = event.approvals || [];
          } else if (event.type === "meta") {
            metaReceived = true;
            if (!sid && event.sessionId) {
              newSid = event.sessionId;
              setSessionId(event.sessionId);
              setSessionTitle(text.slice(0, 60));
              router.replace(`/chat?session=${event.sessionId}`, { scroll: false });
              loadSessions();
            }

            const hasCode = finalChanges.length > 0;
            const hasApprovals = finalApprovals.length > 0;

            setMessages(prev => prev.map(m => m.id === placeholderId
              ? {
                  ...m,
                  id: event.messageId || placeholderId,
                  content: finalReply || "(Investigation complete — see trail above)",
                  hasCode: hasCode || hasApprovals,
                  changeId: event.codeChangeId || undefined,
                  streaming: false,
                }
              : m
            ));

            if (event.codeChangeId && (hasCode || hasApprovals)) {
              setChangeMap(prev => ({
                ...prev,
                [event.codeChangeId]: {
                  changeId: event.codeChangeId,
                  changes: finalChanges,
                  approvals: finalApprovals,
                  status: "pending",
                },
              }));
            }
          } else if (event.type === "error") {
            setMessages(prev => prev.map(m => m.id === placeholderId
              ? { ...m, content: `Error: ${event.message}`, streaming: false }
              : m
            ));
          }
        }
      }

      if (!metaReceived) {
        setMessages(prev => prev.map(m => m.id === placeholderId
          ? { ...m, content: finalReply || "Done.", streaming: false }
          : m
        ));
      }

      return newSid;
    } catch (e: any) {
      setMessages(prev => prev.map(m => m.id === placeholderId
        ? { ...m, content: "Error: could not reach the server. Try again.", streaming: false }
        : m
      ));
      return null;
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [sending, sessionId, incidentId, router, loadSessions]);

  useEffect(() => {
    loadSessions();
    if (sessionId) {
      loadSession(sessionId);
    } else if (incidentId && !autoSentRef.current) {
      autoSentRef.current = true;
      const msg = `A service is down — incident ID: ${incidentId}. Please investigate and suggest a fix. Check the relevant logs and identify the root cause.`;
      sendMessage(msg, null);
    }
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text) return;
    setInput("");
    await sendMessage(text);
  }

  async function approve(changeId: string) {
    setApproving(changeId);
    const res = await fetch("/api/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ changeId }),
    });
    const data = await res.json();
    const prUrl = data.prUrl;
    setChangeMap(prev => ({
      ...prev,
      [changeId]: { ...prev[changeId], status: res.ok ? "approved" : "failed", prUrl },
    }));
    if (res.ok) {
      const sysMsg: Message = {
        id: "sys-" + Date.now(),
        role: "assistant",
        content: prUrl
          ? `✅ PR opened on GitHub. Review and merge to apply the fix.\n\n🔗 ${prUrl}`
          : `✅ Changes committed. ${data.message || ""}`,
        hasCode: false,
        createdAt: new Date().toISOString(),
      };
      setMessages(prev => [...prev, sysMsg]);
    } else {
      const errMsg: Message = {
        id: "err-" + Date.now(),
        role: "assistant",
        content: `❌ Failed to create PR: ${data.error || "Unknown error"}`,
        hasCode: false,
        createdAt: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errMsg]);
    }
    setApproving(null);
  }

  async function dismiss(changeId: string) {
    await fetch("/api/dismiss", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ changeId }),
    });
    setChangeMap(prev => ({ ...prev, [changeId]: { ...prev[changeId], status: "dismissed" } }));
  }

  async function runAction(approval: PendingApproval, changeId: string) {
    setRunningAction(approval.id);
    try {
      const res = await fetch("/api/approve-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ changeId, approvalId: approval.id }),
      });
      const data = await res.json();
      const resultMsg: Message = {
        id: "action-" + Date.now(),
        role: "assistant",
        content: res.ok
          ? (data.resultSummary || `✅ Action completed: ${approval.label}\n\nOutput:\n\`\`\`\n${data.output || "(no output)"}\n\`\`\``)
          : `❌ Action failed (${res.status}): ${data.error || "Unknown error"}`,
        hasCode: false,
        createdAt: new Date().toISOString(),
      };
      setMessages(prev => [...prev, resultMsg]);
      if (res.ok) {
        // Mark approval consumed locally so the button disables immediately
        setChangeMap(prev => {
          const ch = prev[changeId];
          if (!ch) return prev;
          const updatedApprovals = (ch.approvals || []).map(a =>
            a.id === approval.id ? { ...a, executedAt: new Date().toISOString() } : a
          );
          return { ...prev, [changeId]: { ...ch, approvals: updatedApprovals } };
        });
      }
    } catch {
      const errMsg: Message = {
        id: "action-err-" + Date.now(),
        role: "assistant",
        content: `❌ Could not execute action: ${approval.label}`,
        hasCode: false,
        createdAt: new Date().toISOString(),
      };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setRunningAction(null);
    }
  }

  async function deleteSession(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (!confirm("Delete this conversation?")) return;
    setDeletingSession(id);
    try {
      await fetch(`/api/sessions?id=${id}`, { method: "DELETE" });
      setSessions(prev => prev.filter(s => s.id !== id));
      if (id === sessionId) {
        setSessionId(null);
        setMessages([]);
        setChangeMap({});
        setSessionTitle("");
        autoSentRef.current = false;
        router.replace("/chat");
      }
    } finally {
      setDeletingSession(null);
    }
  }

  function startNew() {
    setSessionId(null);
    setMessages([]);
    setChangeMap({});
    setSessionTitle("");
    autoSentRef.current = false;
    router.replace("/chat");
    setShowSidebar(false);
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {showSidebar && (
        <div className="fixed inset-0 z-50 flex" onClick={() => setShowSidebar(false)}>
          <div className="w-72 bg-[#161922] border-r border-[#2e3450] h-full overflow-y-auto p-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <p className="font-semibold text-white text-sm">Conversations</p>
              <button onClick={() => setShowSidebar(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <button
              onClick={startNew}
              className="w-full py-2 rounded-lg border border-dashed border-[#2e3450] text-slate-400 text-sm mb-3 hover:border-teal-700 hover:text-teal-400 transition-colors"
            >
              + New Chat
            </button>
            {sessions.map(s => (
              <div
                key={s.id}
                className={`group relative flex items-center rounded-lg mb-1 transition-colors ${
                  s.id === sessionId ? "bg-teal-900/40 border border-teal-700/40" : "hover:bg-[#21253a]"
                }`}
              >
                <button
                  onClick={() => { setSessionId(s.id); loadSession(s.id); router.replace(`/chat?session=${s.id}`, { scroll: false }); setShowSidebar(false); }}
                  className="flex-1 text-left px-3 py-2.5 text-sm min-w-0"
                >
                  <p className={`line-clamp-1 ${s.id === sessionId ? "text-teal-200" : "text-slate-300"}`}>{s.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{new Date(s.updatedAt).toLocaleDateString()}</p>
                </button>
                <button
                  onClick={(e) => deleteSession(s.id, e)}
                  disabled={deletingSession === s.id}
                  title="Delete conversation"
                  className="opacity-0 group-hover:opacity-100 flex-shrink-0 mr-2 p-1 rounded text-slate-500 hover:text-red-400 hover:bg-red-900/20 transition-all disabled:opacity-30"
                >
                  {deletingSession === s.id ? (
                    <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  )}
                </button>
              </div>
            ))}
          </div>
          <div className="flex-1 bg-black/40" />
        </div>
      )}

      <div className="flex items-center gap-3 px-4 py-2 border-b border-[#2e3450]">
        <button onClick={() => setShowSidebar(true)} className="text-slate-400 hover:text-white p-1" title="Conversations">
          ☰
        </button>
        <p className="text-sm text-slate-300 truncate flex-1">
          {sessionTitle || (sessionId ? "Chat" : "New conversation")}
        </p>
        <button
          onClick={startNew}
          className="text-xs text-slate-500 hover:text-slate-300 px-2 py-1 rounded-lg border border-transparent hover:border-[#2e3450] transition-colors"
        >
          + New
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && !sending && (
          <div className="text-center pt-8">
            <p className="text-4xl mb-3">🛡️</p>
            <p className="text-slate-300 font-medium">Watchdog AI Agent</p>
            <p className="text-slate-500 text-sm mt-1 max-w-xs mx-auto">
              I investigate live server issues using Docker logs, SSH, and your codebase. Describe a problem to get started.
            </p>
            <div className="mt-6 space-y-2 text-left max-w-sm mx-auto">
              {[
                "Hub is returning 502 — check the logs and diagnose",
                "Builder containers keep restarting — investigate why",
                "Check disk space and memory on the Deploy server",
                "The Deploy API returns 500 on new app provisioning — fix it",
              ].map(s => (
                <button
                  key={s}
                  onClick={() => setInput(s)}
                  className="w-full text-left text-xs text-slate-400 bg-[#21253a] border border-[#2e3450] rounded-xl px-3 py-2.5 hover:border-teal-700/50 hover:text-slate-200 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => {
          const isUser = msg.role === "user";
          const isStreaming = msg.streaming;
          const change = msg.changeId ? changeMap[msg.changeId] : undefined;

          return (
            <div key={msg.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
              <div className={`${isUser ? "max-w-[85%]" : "w-full max-w-full"}`}>
                {!isUser && (
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-sm">🛡️</span>
                    <span className="text-xs text-slate-500 font-medium">Watchdog</span>
                    {isStreaming && (
                      <span className="flex items-center gap-1 text-xs text-teal-500">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />
                        thinking
                      </span>
                    )}
                  </div>
                )}

                {!isUser && msg.trail && msg.trail.length > 0 && (
                  <TrailPanel events={msg.trail} />
                )}

                {(msg.content || isStreaming) && (
                  <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed mt-2 ${
                    isUser
                      ? "bg-teal-800 text-white rounded-tr-sm"
                      : "bg-[#21253a] text-slate-200 rounded-tl-sm"
                  }`}>
                    <p className="whitespace-pre-wrap">
                      {msg.content}
                      {isStreaming && !msg.content && (
                        <span className="inline-flex gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: "0ms" }} />
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: "150ms" }} />
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" style={{ animationDelay: "300ms" }} />
                        </span>
                      )}
                      {isStreaming && msg.content && <span className="animate-pulse">▍</span>}
                    </p>
                  </div>
                )}

                {change && (
                  <DiffCard
                    changeId={change.changeId}
                    changes={change.changes}
                    approvals={change.approvals}
                    status={change.status}
                    prUrl={change.prUrl}
                    onApprove={() => approve(change.changeId)}
                    onDismiss={() => dismiss(change.changeId)}
                    onRunAction={(approval) => runAction(approval, change.changeId)}
                    approving={approving === change.changeId}
                    runningAction={runningAction}
                  />
                )}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="px-4 py-3 border-t border-[#2e3450] bg-[#0f1117]">
        <div className="flex items-end gap-2 max-w-2xl mx-auto">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Describe a problem or ask for a fix…"
            rows={1}
            disabled={sending}
            className="flex-1 resize-none bg-[#21253a] border border-[#2e3450] rounded-xl px-4 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-teal-700 max-h-32 overflow-y-auto disabled:opacity-60"
            style={{ minHeight: "48px" }}
          />
          <button
            onClick={send}
            disabled={sending || !input.trim()}
            className="w-12 h-12 rounded-xl flex items-center justify-center text-white transition-all active:scale-95 disabled:opacity-40 flex-shrink-0"
            style={{ background: "hsl(168,60%,26%)" }}
          >
            {sending ? (
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            )}
          </button>
        </div>
        <p className="text-center text-[10px] text-slate-600 mt-2">
          Agent will check Docker logs, SSH, and your codebase before proposing fixes · Changes require PR review
        </p>
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400 text-sm">Loading…</div>
      </div>
    }>
      <ChatUI />
    </Suspense>
  );
}
