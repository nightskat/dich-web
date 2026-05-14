# AGENTS.md — dich-web

## What this repo is

Thin Cloudflare Worker REST API around `@docshift/core`. Stateless BYOK translation:
caller supplies their `.docx` + their own LLM API key → gets back translated `.docx`.

**Single endpoint:** `POST /translate`

---

## Stack

| Tool | Purpose |
|------|---------|
| Cloudflare Workers | Edge runtime |
| Hono ^4 | Router (tiny, edge-native) |
| `@docshift/core` | Translation pipeline (npm, not yet published — use stub import for now) |
| wrangler ^3 | Deploy CLI |
| TypeScript ^5.6 | Language |

---

## File layout

```
src/
  index.ts      # Hono app + /translate route
  provider.ts   # CoreProvider impl via fetch only
wrangler.toml
package.json
tsconfig.json
.gitignore      # node_modules/, dist/
```

---

## Request / Response

```
POST /translate
{ "docx": "<base64>", "targetLang": "English", "apiKey": "sk-...", "provider": "openrouter", "glossary"?: "...", "rules"?: "..." }

200 → { "docx": "<base64>", "filename": "document_english.docx" }
400 → { "error": "missing docx" }
500 → { "error": "translation failed" }
```

---

## Commands

```bash
npm install
npm run build    # wrangler deploy --dry-run (type check)
```

Both must pass before opening PR.

---

## Key constraints

- **No secrets in Worker** — apiKey comes from request body only (BYOK). No wrangler secrets needed.
- **No DB, no auth, no sessions** — fully stateless
- **fetch only** — no Node.js builtins (`fs`, `child_process`, etc.) in `src/`
- **No Tauri, no React** — pure Edge TypeScript
- **CORS** — allow `*` origin for all POST/OPTIONS

---

## Note on @docshift/core dependency

`@docshift/core` is not yet published to npm. For the scaffold PR:
- Add it to `package.json` as `"@docshift/core": "^0.1.0"`
- Import types and functions as if it were installed
- `npm install` will fail on this dep — that's expected for now
- Run `npm run build` with `--dry-run` only; skip `npm install` if it fails on this dep
- Focus on correct TypeScript types and structure; CI will be wired once core is published

---

## What Jules should NOT do

- Do not hardcode any API key, secret, or credential
- Do not add a database, KV store, or Durable Objects
- Do not use `process.env` for apiKey (it comes from request body)
- Do not add authentication middleware
- Do not commit `node_modules/` or `dist/` — they are in `.gitignore`
- Do not add streaming responses (batch only)
