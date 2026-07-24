import { fetchWithCache } from '../cache';
import { getUserEmail } from '../globalConfig/accounts';
import { getRequestTimeoutMs } from '../providers/shared';
import { getRemoteGenerationHeaders, getRemoteGenerationUrl } from './remoteGeneration';

/**
 * Sends a task to the remote generation endpoint.
 *
 * Callers must build an explicit task payload containing only fields their remote
 * task consumes. In particular, do not pass a strategy config object through this
 * helper: strategy config can contain local-only provider options and credentials.
 */
export async function postRemoteGenerationTask<T>(
  payload: Record<string, unknown>,
): Promise<Awaited<ReturnType<typeof fetchWithCache<T>>>> {
  return fetchWithCache<T>(
    getRemoteGenerationUrl(),
    {
      method: 'POST',
      headers: getRemoteGenerationHeaders(),
      body: JSON.stringify({
        ...payload,
        email: getUserEmail(),
      }),
    },
    getRequestTimeoutMs(),
  );
}
