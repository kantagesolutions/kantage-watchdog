"use client";

interface Props {
  service: string;
  label: string;
  status: "up" | "down" | "unknown";
  responseTime: number | null;
  checkedAt: string | null;
  uptime: number;
  incident?: { id: string } | undefined;
  onDiagnose: (incidentId: string) => void;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "never";
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`;
  return `${Math.round(diff / 3600000)}h ago`;
}

export default function StatusCard({ label, status, responseTime, checkedAt, uptime, incident, onDiagnose }: Props) {
  const isUp = status === "up";
  const isDown = status === "down";

  return (
    <div className={`rounded-2xl p-4 border transition-all ${
      isDown
        ? "bg-red-950/30 border-red-700/50"
        : isUp
        ? "bg-[#21253a] border-[#2e3450]"
        : "bg-[#21253a] border-[#2e3450]"
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full flex-shrink-0 ${
            isDown ? "bg-red-500 pulse-red" : isUp ? "bg-green-400" : "bg-slate-500"
          }`} />
          <div>
            <p className="font-semibold text-white text-base">{label}</p>
            <p className="text-xs text-slate-400 mt-0.5">Checked {timeAgo(checkedAt)}</p>
          </div>
        </div>

        <div className="text-right">
          <span className={`text-sm font-bold uppercase tracking-wide ${
            isDown ? "text-red-400" : isUp ? "text-green-400" : "text-slate-400"
          }`}>
            {status === "unknown" ? "—" : status}
          </span>
          {responseTime !== null && (
            <p className="text-xs text-slate-400 mt-0.5">{responseTime}ms</p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
        <div className="flex items-center gap-1.5">
          <div className="h-1.5 w-24 rounded-full bg-slate-700 overflow-hidden">
            <div
              className={`h-full rounded-full ${uptime >= 99 ? "bg-green-400" : uptime >= 95 ? "bg-yellow-400" : "bg-red-400"}`}
              style={{ width: `${uptime}%` }}
            />
          </div>
          <span className="text-xs text-slate-400">{uptime}% 24h</span>
        </div>

        {isDown && incident && (
          <button
            onClick={() => onDiagnose(incident.id)}
            className="text-xs bg-red-800/50 hover:bg-red-800/70 text-red-200 px-3 py-1.5 rounded-lg font-medium transition-colors active:scale-95"
          >
            🤖 Diagnose
          </button>
        )}
      </div>
    </div>
  );
}
