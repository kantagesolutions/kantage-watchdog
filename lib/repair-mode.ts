import { prisma } from "./prisma";
import { runAgent } from "./ai-agent";
import { getDockerLogs, getRunningContainers } from "./ssh-client";

const CONTAINER_GUESSES: Record<string, string[]> = {
  hub:     ["kantage-hub", "hub", "app"],
  builder: ["kantage-builder", "builder", "app"],
  deploy:  ["kantage-deploy", "deploy", "app"],
};

async function gatherLogs(service: string): Promise<string> {
  const parts: string[] = [];
  try {
    const containers = await getRunningContainers(service);
    parts.push(`=== Running containers on ${service} ===\n${containers}`);

    const lines = containers.split("\n");
    for (const guess of CONTAINER_GUESSES[service] || []) {
      const match = lines.find(l => l.toLowerCase().includes(guess.toLowerCase()));
      if (match) {
        const containerName = match.split(/\s+/)[0];
        const logs = await getDockerLogs(service, containerName, 80);
        parts.push(`=== Docker logs (${containerName}) ===\n${logs}`);
        break;
      }
    }
  } catch (e: any) {
    parts.push(`=== SSH unavailable for ${service} ===\n${e?.message || "Could not connect"}`);
  }
  return parts.join("\n\n");
}

export async function triggerRepairMode(incidentId: string, service: string): Promise<void> {
  try {
    const logs = await gatherLogs(service);

    const chatSession = await prisma.chatSession.create({
      data: {
        title: `🚨 Auto-repair: ${service} is down`,
        incidentId,
      },
    });

    const seedMessage = `🚨 AUTOMATED INCIDENT ALERT: ${service} is down.

Incident ID: ${incidentId}
Service: ${service}

${logs}

Investigate the root cause from the logs above. Identify the most likely fix and propose code changes if applicable. Summarize what you see in the logs first.`;

    await prisma.chatMessage.create({
      data: { sessionId: chatSession.id, role: "user", content: seedMessage },
    });

    const agentResult = await runAgent(seedMessage, [], logs);

    const hasCode = agentResult.changes.length > 0;
    await prisma.chatMessage.create({
      data: {
        sessionId: chatSession.id,
        role: "assistant",
        content: agentResult.reply,
        hasCode,
      },
    });

    if (hasCode) {
      await prisma.codeChange.create({
        data: {
          sessionId: chatSession.id,
          repo: agentResult.changes[0]?.repo || service,
          summary: agentResult.changes.map(c => c.summary).join("; "),
          files: JSON.parse(JSON.stringify(agentResult.changes)),
          status: "pending",
        },
      });
    }
  } catch (e: any) {
    console.error(`[repair-mode] Failed for incident ${incidentId}:`, e?.message);
  }
}
