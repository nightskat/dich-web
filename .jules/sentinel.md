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
## 2024-05-19 - Missing Timeout on External API Calls
**Vulnerability:** External `fetch` calls to LLM providers in `src/provider.ts` lacked a timeout configuration. If a provider's API hangs indefinitely, it could exhaust server resources and cause a Denial of Service (DoS) by keeping connections and requests open indefinitely.
**Learning:** Cloudflare Workers or serverless functions are vulnerable to resource exhaustion if external dependencies hang. We must not rely on the default behavior of `fetch`, which has no timeout.
**Prevention:** Always include `signal: AbortSignal.timeout(ms)` when making outbound network requests to external services, especially those not under our control like LLM APIs.
## 2026-07-23 - Information Disclosure via Detailed Error Messages
**Vulnerability:** The error response text from the LLM provider was being read and attached to the `ProviderError` object in `src/provider.ts:118`. This raw error text could contain sensitive information, such as internal routing details, token information, or provider-specific configuration.
**Learning:** The error text was included to aid debugging but unintentionally exposed potential sensitive data to upstream consumers or logging systems if the error propagates.
**Prevention:** Avoid passing raw third-party error bodies to application-level error metadata. Instead, return generic status codes or sanitized error messages, preserving security and privacy while logging the full details only securely within the application's secure logging infrastructure if needed.
