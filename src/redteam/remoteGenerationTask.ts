import { fetchWithCache } from '../cache';
import { getUserEmail } from '../globalConfig/accounts';
import { getRequestTimeoutMs } from '../providers/shared';
import {
  recordFailedGenerationTokenUsage,
  recordGenerationTokenUsage,
} from './generationTokenUsage';
import { getRemoteGenerationHeaders, getRemoteGenerationUrl } from './remoteGeneration';

import type { StrategyRuntimeContext } from './strategies/types';

interface RemoteGenerationTaskOptions {
  headers?: Record<string, string>;
  bustCache?: boolean;
}

/**
 * Sends a task to the remote generation endpoint.
 *
 * Callers must build an explicit task payload containing only fields their remote
 * task consumes. In particular, do not pass a strategy config object through this
 * helper: strategy config can contain local-only provider options and credentials.
 */
export async function postRemoteGenerationTask<T>(
  payload: Record<string, unknown>,
  runtimeContext?: StrategyRuntimeContext,
  options?: RemoteGenerationTaskOptions,
): Promise<Awaited<ReturnType<typeof fetchWithCache<T>>>> {
  const provider = runtimeContext?.generationProviderSelection?.provider;
  let responseRecorded = false;

  try {
    const request = {
      method: 'POST',
      headers: getRemoteGenerationHeaders(options?.headers),
      body: JSON.stringify({
        ...payload,
        email: getUserEmail(),
      }),
    };
    const response = options?.bustCache
      ? await fetchWithCache<T>(
          getRemoteGenerationUrl(),
          request,
          getRequestTimeoutMs(),
          'json',
          true,
        )
      : await fetchWithCache<T>(getRemoteGenerationUrl(), request, getRequestTimeoutMs());
    const data = response.data as
      | { tokenUsage?: Parameters<typeof recordGenerationTokenUsage>[1]['tokenUsage'] }
      | undefined;

    // Some remote tasks are deterministic, so an absent usage payload cannot be treated as a
    // model request. Only the service knows whether or how many provider calls actually ran.
    if (provider && data?.tokenUsage && !response.coalesced) {
      responseRecorded = true;
      recordGenerationTokenUsage(provider, {
        tokenUsage: data.tokenUsage,
        cached: response.cached,
      });
    }

    return response;
  } catch (error) {
    if (provider && !responseRecorded) {
      recordFailedGenerationTokenUsage(provider, error);
    }
    throw error;
  }
}
