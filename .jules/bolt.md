## 2024-05-14 - Redundant string trimming on repeated prompt construction
**Learning:** In Cloudflare Workers with limited memory and strict latency, performing `.trim()` and string concatenation on large context strings (like `readingNotes`, which can be MBs of text) inside a loop processing hundreds of segments leads to massive unnecessary GC pressure and CPU overhead.
**Action:** When mapping over chunks to generate LLM prompts, always pre-compute and cache the static prefix (including any massive context strings) outside the loop before appending chunk-specific dynamic segments.
