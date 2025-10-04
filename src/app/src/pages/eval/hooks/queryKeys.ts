/**
 * Query key factory for eval-related queries.
 *
 * Using a query key factory provides:
 * - Type safety for query keys
 * - Consistency across the codebase
 * - Easy invalidation of related queries
 * - Clear documentation of cache structure
 *
 * IMPORTANT: Query keys must be serializable and stable.
 * - Use primitives (string, number, boolean) when possible
 * - Arrays must be sorted/normalized to ensure stable comparison
 * - Objects should be avoided or deeply serialized
 *
 * @see https://tkdodo.eu/blog/effective-react-query-keys#use-query-key-factories
 */

import type { UseEvalTableOptions } from './useEvalTable';

/**
 * Serializes filters array to a stable string for use in query keys.
 * This prevents cache misses from reference equality checks.
 */
function serializeFilters(filters: UseEvalTableOptions['filters']): string {
  if (!filters || filters.length === 0) {
    return '';
  }
  // Sort by type then value to ensure stable ordering
  const sorted = [...filters].sort((a, b) => {
    const typeCompare = (a.type || '').localeCompare(b.type || '');
    if (typeCompare !== 0) return typeCompare;
    return String(a.value || '').localeCompare(String(b.value || ''));
  });
  return JSON.stringify(sorted);
}

export const evalKeys = {
  /**
   * Base key for all eval-related queries.
   */
  all: ['eval'] as const,

  /**
   * All queries for a specific eval ID.
   */
  byId: (evalId: string | null) => [...evalKeys.all, evalId] as const,

  /**
   * Table data for a specific eval.
   * PERFORMANCE FIX: Serialize complex options to prevent cache pollution.
   */
  table: (evalId: string | null, options: Required<UseEvalTableOptions>) =>
    [
      ...evalKeys.byId(evalId),
      'table',
      {
        pageIndex: options.pageIndex,
        pageSize: options.pageSize,
        filterMode: options.filterMode,
        searchText: options.searchText,
        filters: serializeFilters(options.filters),
        comparisonEvalIds: [...options.comparisonEvalIds].sort(), // Sort for stability
      },
    ] as const,

  /**
   * Metadata keys for a specific eval.
   */
  metadataKeys: (evalId: string | null, comparisonEvalIds: string[]) =>
    [...evalKeys.byId(evalId), 'metadata-keys', [...comparisonEvalIds].sort()] as const,
};
