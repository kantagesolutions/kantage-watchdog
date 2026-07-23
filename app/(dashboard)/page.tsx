"use client";
import { useState, useEffect, useCallback } from "react";
import StatusCard from "@/components/StatusCard";
import { useRouter } from "next/navigation";

interface ServiceStatus {
  service: string;
  label: string;
  status: string;
  responseTime: number | null;
  checkedAt: string | null;
  uptime: number;
}

interface Incident {
  id: string;
  service: string;
  status: string;
  startedAt: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [statuses, setStatuses] = useState<ServiceStatus[]>([]);
  const [openIncidents, setOpenIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [checking, setChecking] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/status");
      if (res.ok) {
        const data = await res.json();
        setStatuses(data.statuses || []);
        setOpenIncidents(data.openIncidents || []);
        setLastRefresh(new Date());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  async function runCheck() {
    setChecking(true);
    await fetch("/api/health-check", { method: "POST" });
    await fetchStatus();
    setChecking(false);
  }

  const anyDown = openIncidents.length > 0;

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      {anyDown && (
        <div className="bg-red-900/40 border border-red-700/60 rounded-2xl px-4 py-3 flex items-center gap-3 pulse-red">
          <span className="text-red-400 text-xl">🚨</span>
          <div>
            <p className="text-red-300 font-semibold text-sm">
              {openIncidents.length} service{openIncidents.length !== 1 ? "s" : ""} down
            </p>
            <p className="text-red-400/70 text-xs mt-0.5">
              {openIncidents.map(i => i.service).join(", ")}
            </p>
          </div>
          <button
            onClick={() => router.push(`/chat?incident=${openIncidents[0].id}`)}
            className="ml-auto text-xs bg-red-700/50 hover:bg-red-700/70 text-red-200 px-3 py-1.5 rounded-lg font-medium transition-colors"
          >
            Diagnose →
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-white font-semibold text-lg">Service Health</h2>
        <button
          onClick={runCheck}
          disabled={checking}
          className="text-xs text-teal-400 hover:text-teal-300 disabled:opacity-50 flex items-center gap-1.5"
        >
          {checking ? "⏳ Checking…" : "🔄 Check now"}
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-28 rounded-2xl bg-[#21253a] animate-pulse" />
          ))}
        </div>
      ) : statuses.length === 0 ? (
        <div className="bg-[#21253a] rounded-2xl p-6 text-center">
          <p className="text-slate-400 text-sm">No status data yet.</p>
          <p className="text-slate-500 text-xs mt-1">Configure HUB_URL, BUILDER_URL, DEPLOY_URL and run a check.</p>
          <button onClick={runCheck} disabled={checking}
            className="mt-4 px-4 py-2 rounded-lg text-sm font-medium text-white"
            style={{ background: "hsl(168,60%,26%)" }}>
            Run First Check
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {statuses.map(s => (
            <StatusCard
              key={s.service}
              service={s.service}
              label={s.label}
              status={s.status as "up" | "down" | "unknown"}
              responseTime={s.responseTime}
              checkedAt={s.checkedAt}
              uptime={s.uptime}
              incident={openIncidents.find(i => i.service === s.service)}
              onDiagnose={(incidentId) => router.push(`/chat?incident=${incidentId}`)}
            />
          ))}
        </div>
      )}

      {lastRefresh && (
        <p className="text-center text-xs text-slate-600">
          Auto-refreshes every 30s · Last: {lastRefresh.toLocaleTimeString()}
        </p>
      )}
    </div>
  );
}
