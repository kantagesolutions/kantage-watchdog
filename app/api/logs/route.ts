import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDockerLogs, getRunningContainers } from "@/lib/ssh-client";

const CONTAINER_MAP: Record<string, string[]> = {
  hub:     ["kantage-hub", "hub", "app"],
  builder: ["kantage-builder", "builder", "app"],
  deploy:  ["kantage-deploy", "deploy", "app"],
};

async function findContainerName(service: string): Promise<string | null> {
  try {
    const running = await getRunningContainers(service);
    const candidates = CONTAINER_MAP[service] || [];
    for (const name of candidates) {
      if (running.toLowerCase().includes(name.toLowerCase())) {
        const lines = running.split("\n");
        for (const line of lines) {
          if (line.toLowerCase().includes(name.toLowerCase())) {
            return line.split(/\s+/)[0] || null;
          }
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const service = searchParams.get("service");
  const lines = parseInt(searchParams.get("lines") || "150", 10);

  const services = service && ["hub", "builder", "deploy"].includes(service)
    ? [service]
    : ["hub", "builder", "deploy"];

  const results: Record<string, { containers: string; logs: string; error?: string }> = {};

  await Promise.all(
    services.map(async (svc) => {
      try {
        const containers = await getRunningContainers(svc);
        const containerName = await findContainerName(svc);
        const logs = containerName
          ? await getDockerLogs(svc, containerName, lines)
          : "(could not determine container name — check docker ps output above)";
        results[svc] = { containers, logs };
      } catch (e: any) {
        results[svc] = {
          containers: "",
          logs: "",
          error: e?.message || "SSH connection failed",
        };
      }
    })
  );

  return NextResponse.json(results);
}
