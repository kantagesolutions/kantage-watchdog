import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const incidents = await prisma.incident.findMany({
    orderBy: { startedAt: "desc" },
    take: 50,
    include: { chatSessions: { select: { id: true } } },
  });
  return NextResponse.json(incidents);
}
