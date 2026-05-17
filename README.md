# dich-web

Cloudflare Worker REST API for translating `.docx` files through `@docshift/core`.

The primary `/translate` API is stateless and BYOK: callers send their own LLM
API key in the request body. The demo-only `/translate-demo` route uses Workers
AI plus KV and Turnstile guards.

## Install

```bash
npm install
```

`@docshift/core` is a sibling file dependency:

```json
"@docshift/core": "file:../docshift-core/packages/core"
```

Make sure `../docshift-core/packages/core` has built `dist/` before installing.

## Develop

```bash
npm run dev
```

## Build Check

```bash
npm run build
```

This runs `wrangler deploy --dry-run`.

## Deploy

```bash
npm run deploy
```

## Request Example

```bash
curl -X POST http://localhost:8787/translate \
  -H 'content-type: application/json' \
  -d '{
    "docx": "<base64-docx>",
    "targetLang": "English",
    "apiKey": "sk-...",
    "provider": "openrouter",
    "model": "google/gemini-2.0-flash-exp:free",
    "glossary": "Akebi = Akebi",
    "rules": "Preserve tone and document structure."
  }'
```

Success response:

```json
{ "docx": "<base64-docx>", "filename": "document_english.docx" }
```

Validation errors return `400`; translation failures return `500`.

## Deployment requirements

The `/translate-demo` route uses Cloudflare Workers AI and demo-only abuse guards.
Before deploying it, create and configure these resources:

```bash
wrangler kv namespace create RATE_LIMIT
```

Paste the production and preview KV namespace IDs into `wrangler.toml`.

```bash
wrangler secret put TURNSTILE_SECRET
```

Create the Turnstile site and secret key in the Cloudflare dashboard, then set the
secret with Wrangler. The config keeps `TURNSTILE_SECRET` empty for local dev.

Tune `DEMO_DAILY_CAP` and `NEURON_DAILY_CAP` in `[vars]` if the default demo
limits need to change.
