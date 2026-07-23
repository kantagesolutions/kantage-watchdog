import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAllSettings, setSettings } from "@/lib/settings";
import { ALL_SETTING_KEYS } from "@/lib/setting-keys";

const SENSITIVE = new Set([
  "GITHUB_TOKEN", "WATCHDOG_SSH_KEY", "SMTP_PASS",
  "ANTHROPIC_API_KEY", "OPENAI_API_KEY",
]);

function mask(key: string, val: string): string {
  if (!val) return "";
  if (!SENSITIVE.has(key)) return val;
  if (val.length <= 8) return "••••••••";
  return "••••••" + val.slice(-4);
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = await getAllSettings(ALL_SETTING_KEYS);

  const masked: Record<string, string> = {};
  const configured: Record<string, boolean> = {};
  for (const k of ALL_SETTING_KEYS) {
    masked[k] = mask(k, raw[k]);
    configured[k] = !!raw[k];
  }

  return NextResponse.json({ settings: masked, configured });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as Record<string, string>;

  const toSave: Record<string, string> = {};
  for (const [k, v] of Object.entries(body)) {
    if (!ALL_SETTING_KEYS.includes(k)) continue;
    if (typeof v !== "string") continue;
    if (SENSITIVE.has(k) && v.startsWith("••••")) continue;
    toSave[k] = v;
  }

  if (Object.keys(toSave).length === 0) {
    return NextResponse.json({ ok: true, saved: 0 });
  }

  await setSettings(toSave);
  return NextResponse.json({ ok: true, saved: Object.keys(toSave).length });
}
