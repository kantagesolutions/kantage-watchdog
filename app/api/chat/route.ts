import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runAgent } from "@/lib/ai-agent";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { message, sessionId, incidentId, contextLogs } = await req.json();
  if (!message?.trim()) return NextResponse.json({ error: "Message required" }, { status: 400 });

  let chatSession = sessionId
    ? await prisma.chatSession.findUnique({ where: { id: sessionId }, include: { messages: { orderBy: { createdAt: "asc" }, take: 30 } } })
    : null;

  if (!chatSession) {
    chatSession = await prisma.chatSession.create({
      data: {
        title: message.slice(0, 60),
        incidentId: incidentId || null,
        messages: { create: [] },
      },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
  }

  // Build incident context so the agent knows which service is affected
  let incidentContext = "";
  const resolvedIncidentId = incidentId || chatSession.incidentId;
  if (resolvedIncidentId) {
    const incident = await prisma.incident.findUnique({ where: { id: resolvedIncidentId } });
    if (incident) {
      const serviceUrl = incident.service;
      const serviceName =
        serviceUrl.includes("kantage.solutions") && !serviceUrl.includes("builder") && !serviceUrl.includes("deploy")
          ? "Kantage Hub"
          : serviceUrl.includes("builder")
          ? "Kantage Builder"
          : serviceUrl.includes("deploy")
          ? "Kantage Deploy"
          : serviceUrl;

      const recentProbes = await prisma.probeResult.findMany({
        where: { service: serviceUrl, status: "down" },
        orderBy: { checkedAt: "desc" },
        take: 5,
      });
      const probeDetails = recentProbes
        .map(p => `  - ${p.checkedAt.toISOString()} | HTTP ${p.statusCode ?? "N/A"} | ${p.error ?? "no error detail"}`)
        .join("\n");

      incidentContext =
        `[INCIDENT CONTEXT]\n` +
        `Service: ${serviceName} (${serviceUrl})\n` +
        `Incident ID: ${incident.id}\n` +
        `Status: ${incident.status}\n` +
        `Started: ${incident.startedAt.toISOString()}\n` +
        (incident.rootCause ? `Root cause: ${incident.rootCause}\n` : "") +
        (probeDetails ? `Recent failures:\n${probeDetails}\n` : "") +
        `[END INCIDENT CONTEXT]\n\n`;
    }
  }

  await prisma.chatMessage.create({
    data: { sessionId: chatSession.id, role: "user", content: message },
  });

  const history = chatSession.messages.map(m => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  const enrichedContext = [incidentContext, contextLogs].filter(Boolean).join("\n");
  const agentResult = await runAgent(message, history, enrichedContext || undefined);

  const hasCode = agentResult.changes.length > 0;
  const assistantMsg = await prisma.chatMessage.create({
    data: { sessionId: chatSession.id, role: "assistant", content: agentResult.reply, hasCode },
  });

  let codeChangeId: string | null = null;
  if (hasCode) {
    const change = await prisma.codeChange.create({
      data: {
        sessionId: chatSession.id,
        repo: agentResult.changes[0]?.repo || "hub",
        summary: agentResult.changes.map(c => c.summary).join("; "),
        files: JSON.parse(JSON.stringify(agentResult.changes)),
        status: "pending",
      },
    });
    codeChangeId = change.id;
  }

  return NextResponse.json({
    sessionId: chatSession.id,
    messageId: assistantMsg.id,
    reply: agentResult.reply,
    changes: agentResult.changes,
    codeChangeId,
  });
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");

  if (sessionId) {
    const chatSession = await prisma.chatSession.findUnique({
      where: { id: sessionId },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        codeChanges: { orderBy: { createdAt: "desc" } },
      },
    });
    if (!chatSession) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(chatSession);
  }

  const sessions = await prisma.chatSession.findMany({
    orderBy: { updatedAt: "desc" },
    take: 30,
    include: { messages: { take: 1, orderBy: { createdAt: "desc" } } },
  });
  return NextResponse.json(sessions);
}
