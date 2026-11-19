import { fetchWithCache, ResponseJsonParseError } from '../cache';
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
  /** Reject non-2xx or invalid JSON with this context and the status, omitting the response body. */
  responseErrorContext?: string;
}

function checkResponseStatus(status: number, context: string): void {
  if (status < 200 || status >= 300) {
    throw new Error(`${context} failed (HTTP ${status}).`);
  }
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
  let response: Awaited<ReturnType<typeof fetchWithCache<T>>>;

  try {
    const request = {
      method: 'POST',
      headers: getRemoteGenerationHeaders(options?.headers),
      body: JSON.stringify({
        ...payload,
        email: getUserEmail(),
      }),
    };
    response = options?.bustCache
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
  } catch (error) {
    if (provider && !responseRecorded) {
      recordFailedGenerationTokenUsage(provider, error);
    }
    if (options?.responseErrorContext && error instanceof ResponseJsonParseError) {
      checkResponseStatus(error.status, options.responseErrorContext);
      throw new Error(
        `${options.responseErrorContext} returned invalid JSON (HTTP ${error.status}).`,
      );
    }
    throw error;
  }
  if (options?.responseErrorContext) {
    checkResponseStatus(response.status, options.responseErrorContext);
  }
  return response;
}
