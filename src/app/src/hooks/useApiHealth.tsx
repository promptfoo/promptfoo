import { callApi } from '@app/utils/api';
import { useQuery } from '@tanstack/react-query';

export type ApiHealthStatus = 'unknown' | 'connected' | 'blocked' | 'loading' | 'disabled';

interface HealthResponse {
  status: string;
  message: string;
}

/**
 * Checks the health of the connection to Promptfoo Cloud.
 */
export function useApiHealth() {
  return useQuery<{ status: ApiHealthStatus; message: string }, Error>({
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
    retry: false,
    staleTime: 2000,
    initialData: {
      status: 'unknown',
      message: '',
    },
  });
}
