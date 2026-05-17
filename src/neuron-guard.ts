const defaultNeuronDailyCap = 8_000;
const dayTtlSeconds = 86_400;

export interface NeuronQuotaResult {
  disabled: boolean;
  used: number;
  cap: number;
}

export async function checkNeuronQuota(kv: KVNamespace, rawDailyCap?: string): Promise<NeuronQuotaResult> {
  const cap = parsePositiveInt(rawDailyCap, defaultNeuronDailyCap);
  try {
    const used = parseNonNegativeInt(await kv.get(todayKey()));
    return { disabled: used >= cap, used, cap };
  } catch {
    return { disabled: false, used: 0, cap };
  }
}

export async function bumpNeuronUsage(kv: KVNamespace, estimated: number): Promise<void> {
  const key = todayKey();
  const current = parseNonNegativeInt(await kv.get(key));
  const next = current + Math.max(0, Math.ceil(estimated));
  await kv.put(key, String(next), { expirationTtl: dayTtlSeconds });
}

function todayKey(): string {
  return `neurons:${new Date().toISOString().slice(0, 10)}`;
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
