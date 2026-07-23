"use client";
import { useState, useEffect, useCallback, useRef } from "react";
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

const AUTO_REFRESH_SECONDS = 10;
const FAST_POLL_MS = 2000;
const NORMAL_POLL_MS = AUTO_REFRESH_SECONDS * 1000;

export default function DashboardPage() {
  const router = useRouter();
  const [statuses, setStatuses] = useState<ServiceStatus[]>([]);
  const [openIncidents, setOpenIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkingServices, setCheckingServices] = useState<string[]>([]);
  const [fetchError, setFetchError] = useState(false);
  const [countdown, setCountdown] = useState(AUTO_REFRESH_SECONDS);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const nextRefreshAt = useRef<number>(Date.now() + NORMAL_POLL_MS);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/status");
      if (res.ok) {
        const data = await res.json();
        setStatuses(data.statuses || []);
        setOpenIncidents(data.openIncidents || []);
        setLastRefresh(new Date());
        setFetchError(false);

        const serverChecking: boolean = data.isChecking ?? false;
        const serverCheckingServices: string[] = data.checkingServices ?? [];
        setCheckingServices(serverCheckingServices);

        if (serverChecking !== checking) {
          setChecking(serverChecking);
        }
      } else {
        setFetchError(true);
      }
    } catch {
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }, [checking]);

  const schedulePolling = useCallback((fast: boolean) => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    const ms = fast ? FAST_POLL_MS : NORMAL_POLL_MS;
    nextRefreshAt.current = Date.now() + ms;
    intervalRef.current = setInterval(async () => {
      await fetchStatus();
      nextRefreshAt.current = Date.now() + ms;
    }, ms);
  }, [fetchStatus]);

  useEffect(() => {
    fetchStatus();
    schedulePolling(false);

    countdownRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.round((nextRefreshAt.current - Date.now()) / 1000));
      setCountdown(remaining);
    }, 500);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  useEffect(() => {
    schedulePolling(checking);
  }, [checking]);

  async function runCheck() {
    setChecking(true);
    setCheckingServices(statuses.map(s => s.service));
    await fetch("/api/health-check", { method: "POST" });
    await fetchStatus();
  }

  const anyDown = openIncidents.length > 0;

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      {fetchError && (
        <div className="bg-yellow-900/30 border border-yellow-700/50 rounded-2xl px-4 py-3 flex items-center gap-3">
          <span className="text-yellow-400 text-lg">⚠️</span>
          <p className="text-yellow-300 text-sm font-medium">
            Could not reach Watchdog — showing last known data, retrying…
          </p>
        </div>
      )}

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
          data-testid="button-check-now"
        >
          {checking ? (
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
              Checking…
            </span>
          ) : "🔄 Check now"}
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
              isChecking={checkingServices.includes(s.service)}
              incident={openIncidents.find(i => i.service === s.service)}
              onDiagnose={(incidentId) => router.push(`/chat?incident=${incidentId}`)}
            />
          ))}
        </div>
      )}

      {lastRefresh && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Last updated: {lastRefresh.toLocaleTimeString()}</span>
            <span>{checking ? "Checking now…" : `Next check in ${countdown}s`}</span>
          </div>
          <div className="h-0.5 w-full rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-teal-600/60 transition-all duration-500"
              style={{
                width: checking
                  ? "100%"
                  : `${Math.max(0, (1 - countdown / AUTO_REFRESH_SECONDS) * 100)}%`
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
