import { translateDocxBuffer } from '@docshift/core';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { bumpNeuronUsage, checkNeuronQuota } from './neuron-guard';
import { cfWaiProvider, createCoreProvider, isProviderName } from './provider';
import { checkRateLimit } from './rate-limit';
import { verifyTurnstile } from './turnstile';
import { MODEL_DEFAULT, MODEL_HEAVY, pickWaiModel } from './wai-router';

const maxDocxBytes = 15 * 1024 * 1024;
const timeoutMs = 55_000;
const targetLangPattern = /^[A-Za-z0-9_-]{1,50}$/;
const defaultWaiModel = MODEL_DEFAULT;

interface Env {
  AI: Ai;
  RATE_LIMIT: KVNamespace;
  WAI_MODEL?: string;
  TURNSTILE_SECRET?: string;
  DEMO_DAILY_CAP?: string;
  NEURON_DAILY_CAP?: string;
}

interface TranslateRequest {
  docx?: unknown;
  targetLang?: unknown;
  apiKey?: unknown;
  provider?: unknown;
  model?: unknown;
  glossary?: unknown;
  rules?: unknown;
}

interface TranslateDemoRequest {
  docx?: unknown;
  targetLang?: unknown;
  turnstileToken?: unknown;
}

const app = new Hono<{ Bindings: Env }>();

const allowedOrigins = [
  'https://docshift-landing.pages.dev',
  'https://akebi.pages.dev',
  'http://localhost:8788',
  'http://localhost:3000',
];

app.use(
  '*',
  cors({
    origin: (origin) => {
      if (!origin) return null;
      if (allowedOrigins.includes(origin)) return origin;
      if (/^https:\/\/[a-z0-9-]+\.docshift-landing\.pages\.dev$/.test(origin)) return origin;
      return null;
    },
    allowMethods: ['POST', 'OPTIONS'],
    allowHeaders: ['content-type'],
  }),
);

app.post('/translate', async (c) => {
  let body: TranslateRequest;
  try {
    body = (await c.req.json()) as TranslateRequest;
  } catch {
    return c.json({ error: 'invalid json' }, 400);
  }

  if (typeof body.docx !== 'string' || body.docx.length === 0) {
    return c.json({ error: 'missing docx' }, 400);
  }

  if (typeof body.targetLang !== 'string' || !targetLangPattern.test(body.targetLang)) {
    return c.json({ error: 'invalid targetLang' }, 400);
  }

  if (typeof body.apiKey !== 'string' || body.apiKey.length === 0) {
    return c.json({ error: 'missing apiKey' }, 400);
  }

  if (typeof body.provider !== 'string' || !isProviderName(body.provider)) {
    return c.json({ error: 'invalid provider' }, 400);
  }

  if (typeof body.model !== 'string' || body.model.length === 0) {
    return c.json({ error: 'missing model' }, 400);
  }

  const decoded = decodeBase64(body.docx);
  if (!decoded) {
    return c.json({ error: 'invalid base64' }, 400);
  }

  if (decoded.byteLength > maxDocxBytes) {
    return c.json({ error: 'docx too large' }, 400);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const targetLang = normalizeCoreTargetLang(body.targetLang);
    const provider = createCoreProvider(body.provider, body.model, body.apiKey, controller.signal);
    const result = await translateDocxBuffer(decoded, provider, targetLang, {
      glossary: typeof body.glossary === 'string' ? body.glossary : undefined,
      rules: typeof body.rules === 'string' ? body.rules : undefined,
    });

    return c.json({
      docx: encodeBase64(result.buffer),
      filename: filenameFor(body.targetLang),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : undefined;
    return c.json({ error: 'translation failed', detail }, 500);
  } finally {
    clearTimeout(timeout);
  }
});

app.post('/translate-demo', async (c) => {
  let body: TranslateDemoRequest;
  try {
    body = (await c.req.json()) as TranslateDemoRequest;
  } catch {
    return c.json({ error: 'invalid json' }, 400);
  }

  if (typeof body.docx !== 'string' || body.docx.length === 0) {
    return c.json({ error: 'missing docx' }, 400);
  }

  if (typeof body.targetLang !== 'string' || !targetLangPattern.test(body.targetLang)) {
    return c.json({ error: 'invalid targetLang' }, 400);
  }

  const ip = c.req.header('cf-connecting-ip') ?? '0.0.0.0';

  const { disabled, used, cap } = await checkNeuronQuota(c.env.RATE_LIMIT, c.env.NEURON_DAILY_CAP);
  if (disabled) {
    return c.json({ error: 'Demo paused for today — daily AI quota reached', used, cap }, 503);
  }

  const okToken = await verifyTurnstile(
    typeof body.turnstileToken === 'string' ? body.turnstileToken : '',
    c.env.TURNSTILE_SECRET ?? '',
    ip,
  );
  if (!okToken) {
    return c.json({ error: 'Bot check failed — try again' }, 403);
  }

  const { allowed, remaining, resetAt } = await checkRateLimit(
    c.env.RATE_LIMIT,
    ip,
    c.env.DEMO_DAILY_CAP,
  );
  if (!allowed) {
    return c.json({ error: 'Daily demo limit reached', remaining, resetAt: resetAt.toISOString() }, 429);
  }

  const decoded = decodeBase64(body.docx);
  if (!decoded) {
    return c.json({ error: 'invalid base64' }, 400);
  }

  if (decoded.byteLength > maxDocxBytes) {
    return c.json({ error: 'docx too large' }, 400);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const targetLang = normalizeCoreTargetLang(body.targetLang);
    const pinnedModel = c.env.WAI_MODEL; // env-pinned overrides router (escape hatch)
    const provider = cfWaiProvider(
      c.env.AI,
      pinnedModel && pinnedModel.length > 0 ? pinnedModel : pickWaiModel,
    );
    const result = await translateDocxBuffer(decoded, provider, targetLang);

    try {
      await bumpNeuronUsage(c.env.RATE_LIMIT, estimateNeurons(decoded.byteLength));
    } catch (error) {
      console.warn('Failed to bump demo neuron usage.', error);
    }

    return c.json({
      docx: encodeBase64(result.buffer),
      filename: filenameFor(body.targetLang),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : undefined;
    return c.json({ error: 'translation failed', detail }, 500);
  } finally {
    clearTimeout(timeout);
  }
});

function decodeBase64(value: string): ArrayBuffer | null {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) {
    return null;
  }

  try {
    const binary = atob(value);
    const buffer = new ArrayBuffer(binary.length);
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return buffer;
  } catch {
    return null;
  }
}

function encodeBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x2000; // 8KB — safe under Workers V8 stack limit for spread
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
    for (let j = 0; j < chunk.length; j += 1) {
      binary += String.fromCharCode(chunk[j]);
    }
  }
  return btoa(binary);
}

function normalizeCoreTargetLang(targetLang: string): string {
  return targetLang.toLowerCase() === 'english' ? 'en' : targetLang;
}

function filenameFor(targetLang: string): string {
  const safeLang = targetLang.toLowerCase().replace(/_/g, '-');
  return `document_${safeLang}.docx`;
}

function estimateNeurons(bytes: number): number {
  return Math.max(1, Math.ceil(bytes / 1000));
}

export default app;
