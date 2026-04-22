import { callApi } from '@app/utils/api';
import { useQuery } from '@tanstack/react-query';

export type ApiHealthStatus = 'unknown' | 'connected' | 'blocked' | 'disabled';

interface HealthResponse {
  status: string;
  message: string;
}

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
        const response = await callApi('/remote-health', { cache: 'no-store' });
        const { status, message } = (await response.json()) as HealthResponse;
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
