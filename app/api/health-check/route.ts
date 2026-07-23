import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { runHealthChecks } from "@/lib/health-check";

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const incomingSecret = req.headers.get("x-cron-secret");

  const hasCronSecret = cronSecret && incomingSecret === cronSecret;

  if (!hasCronSecret) {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const triggerRepair = process.env.AUTO_REPAIR !== "false";
  const results = await runHealthChecks({ triggerRepair });
  return NextResponse.json({ ok: true, results });
}
