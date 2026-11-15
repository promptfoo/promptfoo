import { callApi } from '@app/utils/api';
import { useQuery } from '@tanstack/react-query';

export type ApiHealthStatus = 'unknown' | 'connected' | 'blocked' | 'disabled' | 'skipped';

interface HealthResponse {
  status: string;
  message: string;
}

export type ApiHealthResult = {
  status: ApiHealthStatus;
  message: string;
};

// PROMPTFOO_NO_NETWORK skips the background Promptfoo Cloud health check. The
// server answers that skipped poll with its own SKIPPED status, while an
// explicit remote-generation disable still answers DISABLED, so the two cases
// stay distinct here: a skipped poll leaves generation enabled, a genuinely
// disabled check blocks remote-only controls. The installed server injects the
// meta tag at runtime; standalone builds embed the flag at build time (see
// PostHogProvider).
export function isNoNetworkMode(): boolean {
  return (
    import.meta.env.VITE_PROMPTFOO_NO_NETWORK === 'true' ||
    (typeof document !== 'undefined' &&
      document.querySelector('meta[name="promptfoo-no-network"]') !== null)
  );
}

/**
 * Whether generation controls should stay enabled for this health status. A
 * skipped poll leaves generation enabled the same way a connected poll does;
 * only a genuinely disabled or failed check blocks.
 */
export function isApiHealthAvailable(status: ApiHealthStatus): boolean {
  return status === 'connected' || status === 'skipped';
}

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
        // The server distinguishes a skipped poll (SKIPPED, no-network mode
        // alone) from an explicit remote-generation disable (DISABLED, which
        // wins when both flags are set). Trust the wire status: mapping
        // DISABLED to skipped from the client-side no-network flag would
        // re-enable remote-only controls that the disable flags forbid.
        if (status === 'SKIPPED') {
          return { status: 'skipped', message };
        }
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
