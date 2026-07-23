"use client";
import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import DiffCard from "@/components/DiffCard";

interface FileChange {
  path: string;
  repo: string;
  before: string;
  after: string;
  summary: string;
}

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  hasCode: boolean;
  createdAt: string;
  changeId?: string;
}

interface ChangeState {
  changeId: string;
  changes: FileChange[];
  status: "pending" | "approved" | "dismissed" | "failed";
}

interface Session {
  id: string;
  title: string;
  updatedAt: string;
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
      cmap[ch.id] = { changeId: ch.id, changes: ch.files || [], status: ch.status };
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
      content: "Thinking…",
      hasCode: false,
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, userMsg, placeholder]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, sessionId: sid, incidentId }),
      });
      const data = await res.json();

      let newSid = sid;
      if (!sid && data.sessionId) {
        newSid = data.sessionId;
        setSessionId(data.sessionId);
        setSessionTitle(text.slice(0, 60));
        router.replace(`/chat?session=${data.sessionId}`, { scroll: false });
        loadSessions();
      }

      setMessages(prev => prev.map(m => {
        if (m.id !== placeholderId) return m;
        return {
          ...m,
          id: data.messageId || placeholderId,
          content: data.reply || "Error: empty response",
          hasCode: (data.changes?.length || 0) > 0,
          changeId: data.codeChangeId || undefined,
        };
      }));

      if (data.codeChangeId && data.changes?.length > 0) {
        setChangeMap(prev => ({
          ...prev,
          [data.codeChangeId]: { changeId: data.codeChangeId, changes: data.changes, status: "pending" },
        }));
      }

      return newSid;
    } catch {
      setMessages(prev => prev.map(m => m.id === placeholderId
        ? { ...m, content: "Error: could not reach the server. Try again." }
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
    setChangeMap(prev => ({
      ...prev,
      [changeId]: { ...prev[changeId], status: res.ok ? "approved" : "failed" },
    }));
    if (res.ok) {
      const sysMsg: Message = {
        id: "sys-" + Date.now(),
        role: "assistant",
        content: `✅ Changes pushed to GitHub. Commit: \`${data.commitSha?.slice(0, 7) || "done"}\`. ${data.message || ""}`,
        hasCode: false,
        createdAt: new Date().toISOString(),
      };
      setMessages(prev => [...prev, sysMsg]);
    } else {
      const errMsg: Message = {
        id: "err-" + Date.now(),
        role: "assistant",
        content: `❌ Push failed: ${data.error || "Unknown error"}`,
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
              <button
                key={s.id}
                onClick={() => { setSessionId(s.id); loadSession(s.id); router.replace(`/chat?session=${s.id}`, { scroll: false }); setShowSidebar(false); }}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm mb-1 transition-colors ${
                  s.id === sessionId ? "bg-teal-900/40 text-teal-200 border border-teal-700/40" : "text-slate-300 hover:bg-[#21253a]"
                }`}
              >
                <p className="line-clamp-1">{s.title}</p>
                <p className="text-xs text-slate-500 mt-0.5">{new Date(s.updatedAt).toLocaleDateString()}</p>
              </button>
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
            <p className="text-4xl mb-3">🤖</p>
            <p className="text-slate-300 font-medium">Watchdog AI Agent</p>
            <p className="text-slate-500 text-sm mt-1 max-w-xs mx-auto">
              Describe a problem or ask me to fix something across Hub, Builder, or Deploy.
            </p>
            <div className="mt-6 space-y-2 text-left max-w-sm mx-auto">
              {[
                "The Builder dashboard loads slowly — can you optimize it?",
                "Check the Deploy API logs and fix the most recent error",
                "The Hub mobile layout on the Clients tab is broken",
                "Add better error messages to the Deploy API responses",
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
          const isThinking = msg.content === "Thinking…";
          const change = msg.changeId ? changeMap[msg.changeId] : undefined;

          return (
            <div key={msg.id} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
              <div className={`${isUser ? "max-w-[85%]" : "w-full max-w-full"}`}>
                {!isUser && (
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-sm">🛡️</span>
                    <span className="text-xs text-slate-500 font-medium">Watchdog</span>
                  </div>
                )}
                <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  isUser
                    ? "bg-teal-800 text-white rounded-tr-sm"
                    : "bg-[#21253a] text-slate-200 rounded-tl-sm"
                } ${isThinking ? "animate-pulse" : ""}`}>
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>

                {change && (
                  <DiffCard
                    changeId={change.changeId}
                    changes={change.changes}
                    status={change.status}
                    onApprove={() => approve(change.changeId)}
                    onDismiss={() => dismiss(change.changeId)}
                    approving={approving === change.changeId}
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
