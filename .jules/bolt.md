## 2024-05-14 - Redundant string trimming on repeated prompt construction
**Learning:** In Cloudflare Workers with limited memory and strict latency, performing `.trim()` and string concatenation on large context strings (like `readingNotes`, which can be MBs of text) inside a loop processing hundreds of segments leads to massive unnecessary GC pressure and CPU overhead.
**Action:** When mapping over chunks to generate LLM prompts, always pre-compute and cache the static prefix (including any massive context strings) outside the loop before appending chunk-specific dynamic segments.

## 2024-05-15 - Regex overhead in parsing LLM responses
**Learning:** Using `String.prototype.split('\n')` combined with per-line mapping and `.trim()` creates excessive array allocations and garbage collection pressure when processing LLM outputs line-by-line.
**Action:** To optimize processing multi-line responses, use a single global regular expression execution (`regex.exec` with the `/gm` flag) inside a `while` loop. This completely avoids intermediate array allocations from `.split()` and per-line string copies, significantly reducing latency and GC cycles.
