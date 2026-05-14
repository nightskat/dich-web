AGENTS.md — dich-web Cloudflare Worker
Stack

Hono framework, Cloudflare Workers runtime
Depends on `@docshift/core` (not yet on npm — local stub used for build)
TypeScript, no bundler (wrangler handles it)

Key constraints

No Node.js built-ins: Workers runtime has no `Buffer`, `fs`, `path`
btoa encoding: ALWAYS use `btoa(Array.from(bytes, b => String.fromCharCode(b)).join(''))` — spread (`...`) throws stack overflow for files >~100KB
CoreProvider interface (from `@docshift/core`):

`complete(prompt: string): Promise<string>`
`translateWithBrief(segments, targetLang, readingNotes: string, onProgress?, opts?: {glossary?, rules?})`
3rd param is `readingNotes` (string output from S1 primer), NOT `{glossary, rules}`



Test
```bash
npm run test   # vitest
npm run build  # tsc --noEmit
```
