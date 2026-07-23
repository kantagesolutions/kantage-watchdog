import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { runCommand, getDockerLogs, getRunningContainers } from "@/lib/ssh-client";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { service?: string; command?: string; action?: string; container?: string; lines?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { service, command, action, container, lines } = body;

  if (!service || !["hub", "builder", "deploy"].includes(service)) {
    return NextResponse.json({ error: "service must be hub, builder, or deploy" }, { status: 400 });
  }

  try {
    if (action === "containers") {
      const output = await getRunningContainers(service);
      return NextResponse.json({ ok: true, output });
    }

    if (action === "logs") {
      if (!container) return NextResponse.json({ error: "container required for logs action" }, { status: 400 });
      const output = await getDockerLogs(service, container, lines || 100);
      return NextResponse.json({ ok: true, output });
    }

    if (command) {
      const BLOCKED = [";", "&&", "||", "`", "$(", "rm -rf", "dd if=", "> /dev"];
      for (const b of BLOCKED) {
        if (command.includes(b)) {
          return NextResponse.json({ error: `Command contains blocked pattern: ${b}` }, { status: 400 });
        }
      }
      const result = await runCommand(service, command);
      return NextResponse.json({ ok: result.code === 0, output: result.stdout + (result.stderr ? "\n" + result.stderr : ""), code: result.code });
    }

    return NextResponse.json({ error: "Provide action or command" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "SSH error" }, { status: 500 });
  }
}
