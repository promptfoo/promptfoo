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
 * aggregation, so garbage must not pass.
 */
export function isSafeTokenCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Bounds a provider-controlled cost to a non-negative finite number (costs
 * are fractional, so no integer constraint).
 */
export function isSafeCost(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
