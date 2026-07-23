import { prisma } from "./prisma";
import { sendIncidentAlert, sendRecoveryAlert } from "./email";
import { getSetting } from "./settings";

export interface ServiceConfig {
  key: string;
  label: string;
  url: string;
}

async function getServices(): Promise<ServiceConfig[]> {
  const [hub, builder, deploy] = await Promise.all([
    getSetting("HUB_URL"),
    getSetting("BUILDER_URL"),
    getSetting("DEPLOY_URL"),
  ]);
  return [
    { key: "hub",     label: "Kantage Hub",    url: hub },
    { key: "builder", label: "Kantage Builder", url: builder },
    { key: "deploy",  label: "Kantage Deploy",  url: deploy },
  ];
}

export async function probeService(svc: ServiceConfig): Promise<{
  service: string; status: "up" | "down"; responseTime: number | null; statusCode: number | null; error: string | null;
}> {
  if (!svc.url) {
    return { service: svc.key, status: "down", responseTime: null, statusCode: null, error: "URL not configured" };
  }

  const start = Date.now();
  try {
    const res = await fetch(svc.url, { signal: AbortSignal.timeout(10000), cache: "no-store" });
    const rt = Date.now() - start;
    return {
      service: svc.key,
      status: res.ok || res.status < 500 ? "up" : "down",
      responseTime: rt,
      statusCode: res.status,
      error: null,
    };
  } catch (e: any) {
    return {
      service: svc.key,
      status: "down",
      responseTime: Date.now() - start,
      statusCode: null,
      error: e?.message || "Unreachable",
    };
  }
}

export async function runHealthChecks(opts?: { triggerRepair?: boolean }): Promise<{ service: string; status: string; responseTime: number | null; error: string | null }[]> {
  const services = await getServices();
  const results = await Promise.all(services.map(probeService));

  for (const r of results) {
    await prisma.probeResult.create({
      data: {
        service: r.service,
        status: r.status,
        responseTime: r.responseTime ?? undefined,
        statusCode: r.statusCode ?? undefined,
        error: r.error ?? undefined,
      },
    });

    const openIncident = await prisma.incident.findFirst({
      where: { service: r.service, status: "open" },
      orderBy: { startedAt: "desc" },
    });

    if (r.status === "down" && !openIncident) {
      const incident = await prisma.incident.create({
        data: { service: r.service, status: "open" },
      });
      const svcLabel = services.find(s => s.key === r.service)?.label || r.service;
      await sendIncidentAlert(svcLabel, r.error || "Service unreachable", incident.id).catch(() => {});

      if (opts?.triggerRepair) {
        import("./repair-mode").then(({ triggerRepairMode }) => {
          triggerRepairMode(incident.id, r.service).catch(() => {});
        }).catch(() => {});
      }
    }

    if (r.status === "up" && openIncident) {
      const now = new Date();
      const duration = Math.round((now.getTime() - openIncident.startedAt.getTime()) / 1000);
      await prisma.incident.update({
        where: { id: openIncident.id },
        data: { status: "resolved", resolvedAt: now, duration },
      });
      const svcLabel = services.find(s => s.key === r.service)?.label || r.service;
      await sendRecoveryAlert(svcLabel, duration).catch(() => {});
    }
  }

  return results;
}

export async function getLatestStatus(): Promise<{
  service: string; label: string; status: string; responseTime: number | null; checkedAt: Date | null; uptime: number;
}[]> {
  const services = await getServices();
  return Promise.all(
    services.map(async (svc) => {
      const latest = await prisma.probeResult.findFirst({
        where: { service: svc.key },
        orderBy: { checkedAt: "desc" },
      });
      const last24h = await prisma.probeResult.findMany({
        where: { service: svc.key, checkedAt: { gte: new Date(Date.now() - 86400000) } },
        select: { status: true },
      });
      const upCount = last24h.filter(p => p.status === "up").length;
      const uptime = last24h.length > 0 ? Math.round((upCount / last24h.length) * 100) : 100;

      return {
        service: svc.key,
        label: svc.label,
        status: latest?.status || "unknown",
        responseTime: latest?.responseTime || null,
        checkedAt: latest?.checkedAt || null,
        uptime,
      };
    })
  );
}
