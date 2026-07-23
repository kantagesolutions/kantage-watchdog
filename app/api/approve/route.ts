import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { commitFiles } from "@/lib/github-client";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { changeId } = await req.json();
  if (!changeId) return NextResponse.json({ error: "changeId required" }, { status: 400 });

  const change = await prisma.codeChange.findUnique({ where: { id: changeId } });
  if (!change) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (change.status !== "pending") return NextResponse.json({ error: "Already processed" }, { status: 400 });

  const files = change.files as { repo: string; path: string; after: string }[];

  const byRepo: Record<string, { path: string; content: string }[]> = {};
  for (const f of files) {
    if (!byRepo[f.repo]) byRepo[f.repo] = [];
    byRepo[f.repo].push({ path: f.path, content: f.after });
  }

  let commitSha = "";
  try {
    for (const [repo, repoFiles] of Object.entries(byRepo)) {
      commitSha = await commitFiles(repo, repoFiles, `fix: ${change.summary} [watchdog]`);
    }

    await prisma.codeChange.update({
      where: { id: changeId },
      data: { status: "approved", commitSha },
    });

    return NextResponse.json({ ok: true, commitSha, message: "Changes committed to GitHub. Redeploy will trigger automatically if webhooks are configured." });
  } catch (e: any) {
    await prisma.codeChange.update({ where: { id: changeId }, data: { status: "failed", error: e?.message } });
    return NextResponse.json({ error: e?.message || "Commit failed" }, { status: 500 });
  }
}
