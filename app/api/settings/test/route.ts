import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { testGitHubConnection } from "@/lib/github-client";
import { sendTestEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { type } = await req.json();

  if (type === "github") {
    const result = await testGitHubConnection();
    return NextResponse.json(result);
  }

  if (type === "email") {
    const result = await sendTestEmail();
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "Unknown test type" }, { status: 400 });
}
