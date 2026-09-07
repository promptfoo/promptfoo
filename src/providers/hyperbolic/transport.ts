import { fetchWithCache } from '../../cache';
import logger from '../../logger';
import { getRequestTimeoutMs, shouldBustProviderCache } from '../shared';

import type { CallApiContextParams } from '../../types/providers';

type JsonResult<T> =
  | { ok: true; data: T; cached: boolean; latencyMs?: number }
  | { ok: false; error: string };

/** Shared transport policy; each media provider owns model validation, output and pricing. */
export async function requestHyperbolicJson<T>(
  url: string,
  apiKey: string,
  body: Record<string, unknown>,
  context?: CallApiContextParams,
  signal?: AbortSignal,
): Promise<JsonResult<T>> {
  signal?.throwIfAborted();
  try {
    const { data, cached, status, statusText, latencyMs } = await fetchWithCache<unknown>(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(body),
        ...(signal && { signal }),
      },
      getRequestTimeoutMs(),
      'json',
      shouldBustProviderCache(context),
    );
    signal?.throwIfAborted();
    if (status < 200 || status >= 300) {
      return {
        ok: false,
        error: `API error: ${status} ${statusText}\n${typeof data === 'string' ? data : JSON.stringify(data)}`,
      };
    }
    if (!data || typeof data !== 'object') {
      return { ok: false, error: 'Invalid JSON response from API' };
    }
    if ('error' in data && data.error) {
      return {
        ok: false,
        error: typeof data.error === 'string' ? data.error : JSON.stringify(data.error),
      };
    }
    return { ok: true, data: data as T, cached, latencyMs };
  } catch (error) {
    signal?.throwIfAborted();
    logger.error(`API call error: ${String(error)}`);
    return { ok: false, error: `API call error: ${String(error)}` };
  }
}
