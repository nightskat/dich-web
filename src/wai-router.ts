/**
 * Per-chunk model router for /translate-demo (CF Workers AI).
 *
 * Routes each LLM call to the cheapest/fastest model that's safe for the
 * given chunk's content. Bench (2026-05-17) showed:
 *  - Gemma 3 12B: fastest (1.2s avg), preserves numbers, best dharma round-trip
 *  - Llama 3.3 70B fp8-fast: safer for longer/number-heavy chunks (2.5s, ~10x neurons)
 *  - Llama 4 Scout 17B & Mistral 24B: HALLUCINATE numbers (10x off) — REJECTED
 *  - Qwen3 30B: outputs raw JSON metadata — REJECTED
 *
 * Tuned conservatively: when in doubt about numerical fidelity, use 70B.
 */

export const MODEL_DEFAULT = '@cf/google/gemma-3-12b-it';
export const MODEL_HEAVY = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

// Patterns that signal numerical/financial content where 12B hallucinated less but
// where we still prefer the bigger model for safety. Examples flagged:
//  - "15 tỷ", "2.5 triệu", "VND 100,000", "$50", "12%", "Q1 2026"
//  - Long digit sequences (table-row data)
const numericRisk = /[0-9][0-9.,]{2,}|t[ỷy] đồng|triệu|VND|\$[0-9]|%[^a-zA-Z]|Q[1-4]\b/i;

// Chunks longer than this need a model with more capacity to keep context coherent.
const longChunkChars = 1500;

export function pickWaiModel(prompt: string): string {
  if (prompt.length > longChunkChars) return MODEL_HEAVY;
  if (numericRisk.test(prompt)) return MODEL_HEAVY;
  return MODEL_DEFAULT;
}
