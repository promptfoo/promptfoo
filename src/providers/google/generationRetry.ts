import { setTimeout as delay } from 'node:timers/promises';

import type { GeminiResponseData } from './util';

interface GenerationRetryOptions {
  streaming?: boolean;
  tools?: unknown;
  hasCallbacks?: boolean;
  maxRetries?: number;
  baseRetryDelay?: number;
  timeoutMs: number;
  signal?: AbortSignal;
}

function isEmptyGeminiResponse(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value) || 'error' in value) {
    return false;
  }
  const response = value as GeminiResponseData;
  // Feedback, usage and terminal outcomes indicate the service processed the
  // request. Keep that response and its billing/safety information intact.
  return (
    response.usageMetadata === undefined &&
    response.promptFeedback === undefined &&
    Array.isArray(response.candidates) &&
    response.candidates.every(
      (candidate) =>
        candidate &&
        !candidate.safetyRatings?.length &&
        (!candidate.finishReason || candidate.finishReason === 'STOP') &&
        (candidate.content?.parts === undefined ||
          (Array.isArray(candidate.content.parts) && candidate.content.parts.length === 0)),
    )
  );
}

interface GenerationResponse {
  data?: unknown;
  status?: number;
  headers?: Headers | Record<string, string>;
  cached?: boolean;
  deleteFromCache?: () => Promise<void>;
}

function retryAfterMs(headers: GenerationResponse['headers']): number | undefined {
  const value = headers instanceof Headers ? headers.get('Retry-After') : headers?.['retry-after'];
  if (!value) {
    return undefined;
  }
  return /^\d+$/.test(value) ? Number(value) * 1000 : Math.max(0, Date.parse(value) - Date.now());
}

/** Retry one explicit HTTP 503 or empty successful GenerateContent response. */
export async function retryGeminiGeneration<T extends GenerationResponse>(
  options: GenerationRetryOptions,
  request: (signal: AbortSignal | undefined, isRetry: boolean) => Promise<T>,
): Promise<{ response: T; requests: number }> {
  const retry =
    !options.streaming &&
    !options.hasCallbacks &&
    (options.tools === undefined || (Array.isArray(options.tools) && options.tools.length === 0)) &&
    (options.maxRetries === undefined ||
      (Number.isSafeInteger(options.maxRetries) && options.maxRetries > 0));
  const signals = options.signal ? [options.signal] : [];
  const signal = retry
    ? AbortSignal.any([...signals, AbortSignal.timeout(options.timeoutMs)])
    : options.signal;
  signal?.throwIfAborted();
  let unavailableResponse: GenerationResponse | undefined;
  const initial = await request(signal, false).catch((error: unknown) => {
    const response = (error as { response?: GenerationResponse } | null)?.response;
    if (!retry || response?.status !== 503) {
      throw error;
    }
    unavailableResponse = response;
  });
  // Keep other transport errors on their existing paths. For 2xx, retry
  // only the recognized empty body with no indication of billed/safety work.
  if (initial) {
    const success = initial.status === undefined || (initial.status >= 200 && initial.status < 300);
    if (!retry || (initial.status !== 503 && !(success && isEmptyGeminiResponse(initial.data)))) {
      return { response: initial, requests: 1 };
    }
  }

  await initial?.deleteFromCache?.();
  const configuredDelay = options.baseRetryDelay ?? 200;
  const wait = Math.max(
    configuredDelay,
    retryAfterMs((initial ?? unavailableResponse)?.headers) || 0,
  );
  // Reuse the original deadline. A server request to wait longer naturally
  // aborts before retrying. The retry bypasses caches and nested transport retries.
  signal?.throwIfAborted();
  await delay(
    Math.min(Number.isFinite(wait) && wait >= 0 ? wait : 200, options.timeoutMs),
    undefined,
    { signal },
  );
  signal?.throwIfAborted();
  return { response: await request(signal, true), requests: initial?.cached ? 1 : 2 };
}
