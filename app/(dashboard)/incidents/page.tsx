"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface Incident {
  id: string;
  service: string;
  status: string;
  startedAt: string;
  resolvedAt: string | null;
  duration: number | null;
  rootCause: string | null;
  chatSessions: { id: string }[];
}

const SERVICE_LABELS: Record<string, string> = {
  hub: "Kantage Hub",
  builder: "Kantage Builder",
  deploy: "Kantage Deploy",
};

function durationStr(secs: number | null): string {
  if (!secs) return "—";
  if (secs < 60) return `${secs}s`;
  if (secs < 3600) return `${Math.round(secs / 60)}m`;
  return `${(secs / 3600).toFixed(1)}h`;
}

export default function IncidentsPage() {
  const router = useRouter();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/incidents").then(r => r.json()).then(data => {
      setIncidents(Array.isArray(data) ? data : []);
      setLoading(false);
    });
  }, []);

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h2 className="text-white font-semibold text-lg mb-4">Incidents</h2>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="h-20 rounded-2xl bg-[#21253a] animate-pulse" />)}
        </div>
      ) : incidents.length === 0 ? (
        <div className="bg-[#21253a] rounded-2xl p-8 text-center">
          <p className="text-4xl mb-3">✅</p>
          <p className="text-slate-300 font-medium">No incidents recorded</p>
          <p className="text-slate-500 text-sm mt-1">All services have been healthy</p>
        </div>
      ) : (
        <div className="space-y-2">
          {incidents.map(inc => (
            <div key={inc.id} className="bg-[#21253a] rounded-2xl p-4 border border-[#2e3450]">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${inc.status === "open" ? "bg-red-400" : "bg-green-400"}`} />
                  <div>
                    <p className="font-medium text-white text-sm">{SERVICE_LABELS[inc.service] || inc.service}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {new Date(inc.startedAt).toLocaleString()}
                      {inc.resolvedAt && ` → ${new Date(inc.resolvedAt).toLocaleTimeString()}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {inc.status === "open" && (
                    <span className="text-xs bg-red-900/40 text-red-300 px-2 py-1 rounded-full border border-red-700/40">Open</span>
                  )}
                  {inc.status === "resolved" && (
                    <span className="text-xs bg-green-900/30 text-green-300 px-2 py-1 rounded-full border border-green-700/30">
                      Resolved · {durationStr(inc.duration)}
                    </span>
                  )}
                  <button
                    onClick={() => router.push(`/chat?incident=${inc.id}`)}
                    className="text-xs text-teal-400 hover:text-teal-300 px-2 py-1 rounded-lg border border-teal-800/40 hover:border-teal-700/60 transition-colors"
                  >
                    Chat →
                  </button>
                </div>
              </div>
              {inc.rootCause && (
                <p className="text-xs text-slate-400 mt-2 pl-4">{inc.rootCause}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
