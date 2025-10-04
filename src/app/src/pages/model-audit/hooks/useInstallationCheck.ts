import { useQuery } from '@tanstack/react-query';
import { callApi } from '@app/utils/api';
import { modelAuditKeys } from './queryKeys';

interface InstallationCheckResult {
  installed: boolean;
  cwd: string;
}

interface UseInstallationCheckResult {
  data: InstallationCheckResult | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * React Query hook for checking ModelAudit installation status.
 *
 * Features:
 * - Automatic request deduplication
 * - 5 minute cache (installation status rarely changes)
 * - No automatic refetch on window focus
 * - Manual refetch available via returned function
 *
 * @example
 * ```typescript
 * const { data, isLoading, error, refetch } = useInstallationCheck();
 *
 * if (isLoading) return <Loading />;
 * if (error) return <Error />;
 * if (!data?.installed) return <InstallInstructions />;
 * ```
 */
export function useInstallationCheck(): UseInstallationCheckResult {
  const query = useQuery({
    queryKey: modelAuditKeys.installation(),
    queryFn: async (): Promise<InstallationCheckResult> => {
      const response = await callApi('/model-audit/check-installed');

      if (!response.ok) {
        throw new Error('Failed to check installation');
      }

      const data = await response.json();
      return {
        installed: data.installed,
        cwd: data.cwd || '',
      };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes - installation status rarely changes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
    refetchOnWindowFocus: false, // Don't refetch on window focus
    retry: 1, // Retry once on failure
  });

  return {
    data: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
