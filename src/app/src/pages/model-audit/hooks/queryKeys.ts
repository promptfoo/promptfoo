/**
 * Query key factory for model-audit-related queries.
 *
 * Using a query key factory provides:
 * - Type safety for query keys
 * - Consistency across the codebase
 * - Easy invalidation of related queries
 * - Clear documentation of cache structure
 *
 * @see https://tkdodo.eu/blog/effective-react-query-keys#use-query-key-factories
 */

export const modelAuditKeys = {
  /**
   * Base key for all model-audit-related queries.
   */
  all: ['model-audit'] as const,

  /**
   * Installation check query.
   */
  installation: () => [...modelAuditKeys.all, 'installation'] as const,

  /**
   * Historical scans list query.
   */
  scans: () => [...modelAuditKeys.all, 'scans'] as const,

  /**
   * Individual scan by ID.
   */
  scan: (id: string) => [...modelAuditKeys.all, 'scan', id] as const,
};
