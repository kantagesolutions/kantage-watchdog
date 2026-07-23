import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { changeId } = await req.json();
  if (!changeId) return NextResponse.json({ error: "changeId required" }, { status: 400 });

  await prisma.codeChange.update({
    where: { id: changeId },
    data: { status: "dismissed" },
  });

  return NextResponse.json({ ok: true });
}
