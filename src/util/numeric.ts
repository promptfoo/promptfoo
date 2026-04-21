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
