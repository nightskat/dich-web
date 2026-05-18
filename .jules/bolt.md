## 2024-05-14 - Redundant string trimming on repeated prompt construction
**Learning:** In Cloudflare Workers with limited memory and strict latency, performing `.trim()` and string concatenation on large context strings (like `readingNotes`, which can be MBs of text) inside a loop processing hundreds of segments leads to massive unnecessary GC pressure and CPU overhead.
**Action:** When mapping over chunks to generate LLM prompts, always pre-compute and cache the static prefix (including any massive context strings) outside the loop before appending chunk-specific dynamic segments.

## 2024-05-15 - Regex overhead in parsing LLM responses
**Learning:** Using `String.prototype.split('\n')` combined with per-line mapping and `.trim()` creates excessive array allocations and garbage collection pressure when processing LLM outputs line-by-line.
**Action:** To optimize processing multi-line responses, use a single global regular expression execution (`regex.exec` with the `/gm` flag) inside a `while` loop. This completely avoids intermediate array allocations from `.split()` and per-line string copies, significantly reducing latency and GC cycles.

## 2024-05-16 - Base64 decoding loop overhead for large strings
**Learning:** In Cloudflare Workers, manually decoding large Base64 strings (e.g., up to 15MB) using `atob()` and looping over the string to populate a `Uint8Array` causes massive V8 heap memory allocations and CPU overhead, potentially leading to slow execution and memory limits.
**Action:** Always use the `fetch` API with a data URI (`fetch('data:application/octet-stream;base64,...')`) to offload decoding to native C++ bindings, which is highly optimized and significantly reduces memory and CPU overhead compared to manual JavaScript loops.

## 2024-05-17 - Base64 encoding overhead for large arrays
**Learning:** In Cloudflare Workers, generating Base64 from a `Uint8Array` using `Array.from(bytes, b => String.fromCharCode(b)).join('')` creates massive intermediate arrays and strings, causing severe GC pressure and CPU overhead for large buffers (up to 15MB). Simply spreading the array (`...bytes`) causes maximum call stack size exceeded errors.
**Action:** Use a chunked `String.fromCharCode.apply(null, chunk)` approach inside a loop. This avoids stack overflow errors and is significantly faster and more memory-efficient than creating intermediate arrays with `Array.from`.
