/**
 * Serializes data for embedding inside an LLM prompt as a JSON literal,
 * with extra protection against **closing-delimiter breakout**.
 *
 * Scope: escapes every `</` to `<\/`. The output stays valid JSON
 * (`\/` is a JSON escape for `/`) but the `</tag>` closing pattern no
 * longer appears literally in the prompt. That stops adversarial inputs
 * containing `</Candidate>`, `</Prompt>`, etc. from terminating an
 * XML-ish wrapper the prompt may use elsewhere.
 *
 * Out of scope: opening tags pass through unchanged, and other
 * prompt-injection patterns ("ignore previous instructions", fenced
 * code blocks, role-tag impersonation) pass through verbatim inside
 * the JSON string. Defense-in-depth, not a security boundary.
 *
 * Use only for LLM-bound prompts; do NOT use for outputs sent to other
 * parsers (the `\/` escape would survive a re-serialization round-trip).
 */
export function safeJsonForLlm(value: unknown): string {
  return JSON.stringify(value).replace(/<\//g, '<\\/');
}

/**
 * Parses a JSON object out of an LLM response, tolerating an optional
 * leading/trailing ```json fence. Returns `null` on any parse failure
 * so callers can take their fail-open path without a try/catch.
 */
export function parseLlmJson(raw: string): unknown {
  try {
    return JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, '').trim());
  } catch {
    return null;
  }
}
