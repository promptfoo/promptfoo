import type { ResultsFilter } from './store';

/**
 * Serializes a filter object with deterministic key ordering.
 * Strips internal fields (id, sortIndex) and sorts keys alphabetically for consistent JSON output.
 * Used for both URL persistence and comparisons.
 */
export function serializeFilter(filter: Partial<ResultsFilter>): Record<string, any> {
  // biome-ignore lint/correctness/noUnusedVariables: id and sortIndex are intentionally excluded
  const { id, sortIndex, ...rest } = filter;
  const sortedKeys = Object.keys(rest).sort();
  const sorted: Record<string, any> = {};
  for (const key of sortedKeys) {
    sorted[key] = rest[key as keyof typeof rest];
  }
  return sorted;
}
