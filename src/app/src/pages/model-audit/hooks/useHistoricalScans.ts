import { useQuery } from '@tanstack/react-query';
import { callApi } from '@app/utils/api';
import { modelAuditKeys } from './queryKeys';
import type { HistoricalScan } from './types';

interface UseHistoricalScansResult {
  data: HistoricalScan[];
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * React Query hook for fetching historical ModelAudit scans.
 *
 * Features:
 * - Automatic request deduplication
 * - 1 minute cache (scans list doesn't change often)
 * - Automatic background refetch on window focus
 * - Manual refetch available
 *
 * TODO: Implement pagination when backend supports it
 *
 * @example
 * ```typescript
 * const { data, isLoading, error, refetch } = useHistoricalScans();
 *
 * if (isLoading) return <Loading />;
 * if (error) return <Error message={error.message} />;
 *
 * return <ScansList scans={data} onDelete={() => refetch()} />;
 * ```
 */
export function useHistoricalScans(): UseHistoricalScansResult {
  const query = useQuery({
    queryKey: modelAuditKeys.scans(),
    queryFn: async (): Promise<HistoricalScan[]> => {
      const response = await callApi('/model-audit/scans');

      if (!response.ok) {
        throw new Error('Failed to fetch historical scans');
      }

      const data = await response.json();
      return data.scans || [];
    },
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
    retry: 1,
  });

  return {
    data: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
