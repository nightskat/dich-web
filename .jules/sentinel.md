## 2024-05-14 - Type Casting and Path Traversal Risks in User Input
**Vulnerability:**
1. The JSON body was unsafely type casted using `as Record<string, string>` without runtime type checking, which could lead to server crashes or unexpected behavior if a malicious user sent a non-string type (e.g. nested objects or arrays).
2. The `targetLang` was interpolated directly into the returned `filename` without sanitization. While this specific instance just returns a JSON payload and doesn't write to the local filesystem (so server-side path traversal isn't an issue here), it could be problematic if the client trusts this filename and saves it locally. A filename like `../../../etc/passwd` or `XSS_Payload.docx` could be exploited on the client side.

**Learning:**
TypeScript types like `as Record<string, string>` do not exist at runtime. Never trust user input, even if the static types suggest it is safe. We also need to sanitize inputs used in returned parameters that clients might trust (like filenames).

**Prevention:**
Always validate runtime types of incoming JSON payloads using explicit type checks (`typeof val === 'string'`) or a validation library like Zod. Sanitize strings before injecting them into paths or filenames using strict allowlists (e.g., stripping non-alphanumeric characters).

## 2026-05-15 - Critical Information Disclosure in Logs
**Vulnerability:** Fetch error objects containing sensitive information (like Authorization headers or input buffers) were being logged in their entirety via `console.error` on LLM call failures.
**Learning:** The default behavior of logging the entire error object from a failed fetch request can unintentionally leak sensitive data. In a Cloudflare Worker environment or any backend API, raw error objects can contain full request details, which then end up in system logs.
**Prevention:** Always log specific error properties, such as `err.message`, rather than the full error object when handling network request failures, especially when requests contain API keys or sensitive user data.

## 2024-05-18 - CPU Exhaustion DoS via Synchronous Base64 Decoding
**Vulnerability:** The application decoded large Base64 strings (up to 15MB) using a synchronous `atob()` call followed by a manual loop to construct a `Uint8Array` in `src/index.ts`. This synchronous operation blocks the main thread and can cause CPU exhaustion DoS under concurrent load.
**Learning:** Manual synchronous manipulation of large strings/arrays in JavaScript is highly inefficient and blocks the event loop. The Cloudflare Workers runtime provides optimized native paths for certain operations.
**Prevention:** Use the `fetch` API with a data URI (`fetch('data:application/octet-stream;base64,...')`) to decode Base64 strings. This offloads the decoding to highly optimized native C++ bindings in V8, significantly reducing heap memory allocation and CPU overhead.
