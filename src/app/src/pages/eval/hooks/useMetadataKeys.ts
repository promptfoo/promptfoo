import { useQuery } from '@tanstack/react-query';
import { callApi } from '@app/utils/api';
import { evalKeys } from './queryKeys';

interface UseMetadataKeysResult {
  data: string[];
  isLoading: boolean;
  error: Error | null;
}

/**
 * React Query hook to fetch metadata keys for an evaluation.
 *
 * This hook automatically:
 * - Caches results based on evalId and comparisonEvalIds
 * - Deduplicates simultaneous requests
 * - Handles abort/cancellation via React Query's built-in signal
 * - Provides loading and error states
 * - Has a 30-second timeout
 */
export function useMetadataKeys(
  evalId: string | null,
  comparisonEvalIds: string[] = [],
): UseMetadataKeysResult {
  const query = useQuery({
    queryKey: evalKeys.metadataKeys(evalId, comparisonEvalIds),
    queryFn: async ({ signal }) => {
      if (!evalId) {
        return [];
      }

      // Create timeout promise that will reject after 30 seconds
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('Metadata keys request timed out after 30 seconds'));
        }, 30000);
      });

      // Build URL with comparison eval IDs as query params
      const url = new URL(`/eval/${evalId}/metadata-keys`, window.location.origin);
      comparisonEvalIds.forEach((compId) => {
        url.searchParams.append('comparisonEvalIds', compId);
      });

      // Race between the fetch and the timeout
      const fetchPromise = callApi(url.toString().replace(window.location.origin, ''), {
        signal,
      }).then(async (resp) => {
        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
        }
        const data = await resp.json();
        return data.keys as string[];
      });

      const keys = await Promise.race([fetchPromise, timeoutPromise]);
      return keys;
    },
    enabled: !!evalId,
    staleTime: 60 * 1000, // 1 minute - metadata keys don't change often
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
    retry: 1,
  });

  return {
    data: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}
