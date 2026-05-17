# dich-web

Cloudflare Worker REST API for translating `.docx` files through `@docshift/core`.

The API is stateless and BYOK: callers send their own LLM API key in the request body. No Worker secrets, KV, Durable Objects, or database are required for this scaffold.

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
