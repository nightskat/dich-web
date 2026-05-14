import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { translateDocxBuffer } from '@docshift/core';
import { makeFetchProvider } from './provider';

const app = new Hono();
app.use('*', secureHeaders());
app.use('*', cors({
  origin: '*',
  allowMethods: ['POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}));

app.post('/translate', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400);
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return c.json({ error: 'invalid JSON body type' }, 400);
  }
  const record = body as Record<string, unknown>;
  const { docx, targetLang, apiKey, provider: providerName, glossary, rules } = record;

  if (typeof docx !== 'string' || !docx) return c.json({ error: 'missing or invalid docx' }, 400);
  if (typeof targetLang !== 'string' || !targetLang) return c.json({ error: 'missing or invalid targetLang' }, 400);
  if (typeof apiKey !== 'string' || !apiKey) return c.json({ error: 'missing or invalid apiKey' }, 400);
  if (providerName !== undefined && typeof providerName !== 'string') return c.json({ error: 'invalid provider' }, 400);
  if (glossary !== undefined && typeof glossary !== 'string') return c.json({ error: 'invalid glossary' }, 400);
  if (rules !== undefined && typeof rules !== 'string') return c.json({ error: 'invalid rules' }, 400);

  // Sanitize targetLang to prevent path traversal/XSS in returned filename
  const sanitizedTargetLang = targetLang.replace(/[^a-zA-Z0-9-_]/g, '').substring(0, 50);
  if (!sanitizedTargetLang) return c.json({ error: 'invalid targetLang format' }, 400);

  let input: ArrayBuffer;
  try {
    const bin = atob(docx);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    input = bytes.buffer;
  } catch {
    return c.json({ error: 'docx must be valid base64' }, 400);
  }

  const provider = makeFetchProvider(providerName ?? 'openrouter', apiKey);
  try {
    const { buffer } = await translateDocxBuffer(input, provider, targetLang, { glossary, rules });
    const bytes = new Uint8Array(buffer);
    const b64 = btoa(Array.from(bytes, b => String.fromCharCode(b)).join(''));
    return c.json({ docx: b64, filename: `document_${sanitizedTargetLang.toLowerCase()}.docx` });
  } catch (err) {
    // Avoid logging full error object which might leak API keys or input buffer
    console.error('Translation failed:', err instanceof Error ? err.message : 'Unknown error');
    return c.json({ error: 'translation failed' }, 500);
  }
});

export default app;
