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

## 2024-05-18 - Missing Timeout on External API Calls
**Vulnerability:** The `fetch` call to external LLM providers in `src/provider.ts` lacked a timeout mechanism.
**Learning:** External API calls in serverless environments like Cloudflare Workers can hang indefinitely if the upstream service is unresponsive, leading to resource exhaustion (DoS) and potential excessive billing.
**Prevention:** Always use `AbortSignal.timeout(ms)` for external `fetch` requests to ensure they fail predictably within a reasonable timeframe (e.g., 60 seconds for LLMs).
