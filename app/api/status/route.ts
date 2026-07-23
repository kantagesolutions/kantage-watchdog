import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getLatestStatus } from "@/lib/health-check";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [statuses, openIncidents] = await Promise.all([
    getLatestStatus(),
    prisma.incident.findMany({ where: { status: "open" }, orderBy: { startedAt: "desc" } }),
  ]);

  return NextResponse.json({ statuses, openIncidents });
}
