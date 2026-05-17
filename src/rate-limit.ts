const defaultDailyCap = 2;
const dayTtlSeconds = 86_400;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

export async function checkRateLimit(kv: KVNamespace, ip: string, rawDailyCap?: string): Promise<RateLimitResult> {
  const cap = parsePositiveInt(rawDailyCap, defaultDailyCap);
  const now = new Date();
  const key = `rl:${ip}:${utcDay(now)}`;
  const resetAt = nextUtcDay(now);
  try {
    const used = parseNonNegativeInt(await kv.get(key));
    if (used >= cap) {
      return { allowed: false, remaining: 0, resetAt };
    }
    const nextUsed = used + 1;
    // Workers KV is eventually consistent, so this GET -> PUT counter can allow
    // about one extra request during concurrent edge writes. That slop is OK for
    // this demo guard; stronger atomicity would need Durable Objects.
    await kv.put(key, String(nextUsed), { expirationTtl: dayTtlSeconds });
    return { allowed: true, remaining: Math.max(0, cap - nextUsed), resetAt };
  } catch {
    return { allowed: false, remaining: 0, resetAt };
  }
}

function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function nextUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1));
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInt(value: string | null): number {
  if (!value) return 0;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}
