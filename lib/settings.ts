import { prisma } from "./prisma";

type CacheEntry = { value: string; expires: number };
const cache = new Map<string, CacheEntry>();
const TTL = 60_000;

export async function getSetting(key: string, fallback = ""): Promise<string> {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expires > now) return hit.value;

  try {
    const row = await prisma.setting.findUnique({ where: { key } });
    const value = row?.value ?? process.env[key] ?? fallback;
    cache.set(key, { value, expires: now + TTL });
    return value;
  } catch {
    return process.env[key] ?? fallback;
  }
}

export async function setSetting(key: string, value: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    create: { key, value },
    update: { value },
  });
  cache.set(key, { value, expires: Date.now() + TTL });
}

export async function setSettings(pairs: Record<string, string>): Promise<void> {
  await Promise.all(Object.entries(pairs).map(([k, v]) => setSetting(k, v)));
}

export async function getAllSettings(keys: string[]): Promise<Record<string, string>> {
  const rows = await prisma.setting.findMany({ where: { key: { in: keys } } });
  const dbMap = Object.fromEntries(rows.map(r => [r.key, r.value]));
  const result: Record<string, string> = {};
  for (const k of keys) {
    result[k] = dbMap[k] ?? process.env[k] ?? "";
  }
  return result;
}

export function clearSettingCache(key?: string) {
  if (key) cache.delete(key);
  else cache.clear();
}
