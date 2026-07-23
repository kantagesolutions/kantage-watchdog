import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { restartContainer } from "@/lib/ssh-client";
import { PendingApproval } from "@/lib/ai-agent";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { changeId, approvalId } = body as { changeId?: string; approvalId?: string };

  if (!changeId || !approvalId) {
    return NextResponse.json({ error: "changeId and approvalId are required" }, { status: 400 });
  }

  const change = await prisma.codeChange.findUnique({
    where: { id: changeId },
    include: { session: true },
  });
  if (!change) return NextResponse.json({ error: "Change not found" }, { status: 404 });
  if (change.status !== "pending") return NextResponse.json({ error: "Change is not pending" }, { status: 400 });

  const userId = session.user?.email || "admin";
  if (change.session.userId && change.session.userId !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const payload = change.files as { changes?: any[]; approvals?: PendingApproval[] } | null;
  const approvals: PendingApproval[] = payload?.approvals || [];
  const approvalIndex = approvals.findIndex(a => a.id === approvalId);

  if (approvalIndex === -1) {
    return NextResponse.json({ error: "Approval not found in this change" }, { status: 404 });
  }

  const approval = approvals[approvalIndex];

  // Prevent repeated execution of the same approval
  if (approval.executedAt) {
    return NextResponse.json(
      { error: `This action was already executed at ${approval.executedAt}. Refresh the page to see the latest state.` },
      { status: 409 }
    );
  }

  if (approval.action !== "restart_container" && approval.action !== "rebuild_container") {
    return NextResponse.json({ error: `Action type "${approval.action}" is not executable` }, { status: 400 });
  }

  if (!approval.container) {
    return NextResponse.json({ error: "No container specified in stored approval" }, { status: 400 });
  }

  try {
    const output = await restartContainer(approval.service, approval.container);
    const executedAt = new Date().toISOString();

    // Mark this approval as consumed so it cannot be re-executed
    const updatedApprovals = approvals.map((a, i) =>
      i === approvalIndex ? { ...a, executedAt } : a
    );
    const updatedFiles = { ...(payload as object), approvals: updatedApprovals };
    await prisma.codeChange.update({
      where: { id: changeId },
      data: { files: JSON.parse(JSON.stringify(updatedFiles)) },
    });

    // Record the action result as an assistant message so the conversation resumes
    // with full context of what was executed
    const resultSummary = `**Action executed:** ${approval.label}\n**Output:**\n\`\`\`\n${output || "(done)"}\n\`\`\`\n\nThe ${approval.container} container on ${approval.service} has been restarted. Monitor the service to confirm recovery.`;
    await prisma.chatMessage.create({
      data: {
        sessionId: change.session.id,
        role: "assistant",
        content: resultSummary,
      },
    });

    return NextResponse.json({ ok: true, output: output || "(done)", resultSummary });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Action failed" }, { status: 500 });
  }
}
