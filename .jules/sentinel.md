## 2024-05-14 - Type Casting and Path Traversal Risks in User Input
**Vulnerability:**
1. The JSON body was unsafely type casted using `as Record<string, string>` without runtime type checking, which could lead to server crashes or unexpected behavior if a malicious user sent a non-string type (e.g. nested objects or arrays).
2. The `targetLang` was interpolated directly into the returned `filename` without sanitization. While this specific instance just returns a JSON payload and doesn't write to the local filesystem (so server-side path traversal isn't an issue here), it could be problematic if the client trusts this filename and saves it locally. A filename like `../../../etc/passwd` or `XSS_Payload.docx` could be exploited on the client side.

**Learning:**
TypeScript types like `as Record<string, string>` do not exist at runtime. Never trust user input, even if the static types suggest it is safe. We also need to sanitize inputs used in returned parameters that clients might trust (like filenames).

**Prevention:**
Always validate runtime types of incoming JSON payloads using explicit type checks (`typeof val === 'string'`) or a validation library like Zod. Sanitize strings before injecting them into paths or filenames using strict allowlists (e.g., stripping non-alphanumeric characters).
