import { translateDocxBuffer } from '@docshift/core';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { cfWaiProvider, createCoreProvider, isProviderName } from './provider';

const maxDocxBytes = 15 * 1024 * 1024;
const timeoutMs = 55_000;
const targetLangPattern = /^[A-Za-z0-9_-]{1,50}$/;
const defaultWaiModel = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

interface Env {
  AI: Ai;
  WAI_MODEL?: string;
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

app.use(
  '*',
  cors({
    origin: '*',
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

  // TODO B3: verify turnstileToken
  void body.turnstileToken;

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
    const provider = cfWaiProvider(c.env.AI, c.env.WAI_MODEL ?? defaultWaiModel);
    const result = await translateDocxBuffer(decoded, provider, targetLang);

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
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
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

export default app;
