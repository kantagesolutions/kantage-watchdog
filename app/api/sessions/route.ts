import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (id) {
    const chatSession = await prisma.chatSession.findUnique({
      where: { id },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        codeChanges: { orderBy: { createdAt: "desc" } },
        incident: { select: { id: true, service: true, status: true, startedAt: true } },
      },
    });
    if (!chatSession) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(chatSession);
  }

  const sessions = await prisma.chatSession.findMany({
    orderBy: { updatedAt: "desc" },
    take: 50,
    include: {
      messages: { take: 1, orderBy: { createdAt: "desc" }, select: { content: true, createdAt: true } },
      _count: { select: { messages: true, codeChanges: true } },
    },
  });
  return NextResponse.json(sessions);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { title, incidentId } = await req.json().catch(() => ({}));

  const chatSession = await prisma.chatSession.create({
    data: {
      title: title || "New conversation",
      incidentId: incidentId || null,
    },
    include: { messages: true },
  });

  return NextResponse.json(chatSession);
}

export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await prisma.chatSession.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
