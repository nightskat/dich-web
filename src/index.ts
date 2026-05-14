import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { translateDocxBuffer } from '@docshift/core';
import { makeFetchProvider } from './provider';

const app = new Hono();
app.use('*', cors({ origin: '*', allowMethods: ['POST', 'OPTIONS'], allowHeaders: ['Content-Type'] }));

app.post('/translate', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400);
  }
  const { docx, targetLang, apiKey, provider: providerName, glossary, rules } = body as Record<string, string>;
  if (!docx) return c.json({ error: 'missing docx' }, 400);
  if (!targetLang) return c.json({ error: 'missing targetLang' }, 400);
  if (!apiKey) return c.json({ error: 'missing apiKey' }, 400);

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
    const b64 = btoa(String.fromCharCode(...bytes));
    return c.json({ docx: b64, filename: `document_${targetLang.toLowerCase()}.docx` });
  } catch (err) {
    console.error(err);
    return c.json({ error: 'translation failed' }, 500);
  }
});

export default app;
