import { callApiTyped } from '@app/utils/apiClient';
import { useQuery } from '@tanstack/react-query';
import type { GetRemoteHealthResponse } from '@promptfoo/dtos';

export type ApiHealthStatus = 'unknown' | 'connected' | 'blocked' | 'disabled';

export type ApiHealthResult = {
  status: ApiHealthStatus;
  message: string;
};

/**
 * Checks the health of the connection to Promptfoo Cloud.
 */
export function useApiHealth() {
  return useQuery<ApiHealthResult, Error>({
    queryKey: ['apiHealth'],
    queryFn: async () => {
      try {
        const { status, message } = await callApiTyped<GetRemoteHealthResponse>('/remote-health', {
          cache: 'no-store',
        });
        return {
          status: status === 'DISABLED' ? 'disabled' : status === 'OK' ? 'connected' : 'blocked',
          message,
        };
      } catch {
        return {
          status: 'blocked',
          message: 'Network error: Unable to check API health',
        };
      }
    },
    refetchInterval: 3000, // Poll every 3 seconds
    retry: false, // Failed queries will not be retried until the next poll
    staleTime: 2000, // Data is fresh for 2 seconds
    initialData: {
      status: 'unknown',
      message: '',
    },
  });
}
