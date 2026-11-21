/**
 * Filters a record to only include finite numeric values, dropping strings,
 * null, NaN, Infinity, arrays, objects, etc. Used to sanitize namedScores
 * from untrusted sources (extension hooks) before metrics aggregation.
 */
export function filterFiniteScores(scores: Record<string, unknown>): Record<string, number> {
  const filtered: Record<string, number> = {};
  for (const [key, value] of Object.entries(scores)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      filtered[key] = value;
    }
  }
  return filtered;
}

/**
 * Bounds a provider-controlled token count to a non-negative safe integer.
 * Usage numbers arrive as untrusted API data and flow into cost/metrics
 * aggregation, so garbage must not pass. The ceiling rejects absurd reports
 * (a single response never legitimately reaches a billion tokens) that would
 * otherwise overflow safe-integer accumulation a few rows later.
 */
const MAX_REASONABLE_TOKEN_COUNT = 1_000_000_000;

export function isSafeTokenCount(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= MAX_REASONABLE_TOKEN_COUNT
  );
}

/**
 * Bounds a provider-controlled cost to a non-negative finite number (costs
 * are fractional, so no integer constraint).
 */
export function isSafeCost(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
