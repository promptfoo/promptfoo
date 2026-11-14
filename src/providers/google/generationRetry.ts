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

/** Retry explicit HTTP 503 or empty successful GenerateContent responses within one deadline. */
export async function retryGeminiGeneration<T extends GenerationResponse>(
  options: GenerationRetryOptions,
  request: (
    signal: AbortSignal | undefined,
    isRetry: boolean,
    allowTransportRetries: boolean,
  ) => Promise<T>,
): Promise<{ response: T; requests: number }> {
  const configuredRetries = options.maxRetries ?? 1;
  const retryAllowed =
    !options.streaming &&
    !options.hasCallbacks &&
    (options.tools === undefined || (Array.isArray(options.tools) && options.tools.length === 0)) &&
    Number.isSafeInteger(configuredRetries) &&
    configuredRetries > 0;
  const deadline = retryAllowed ? AbortSignal.timeout(options.timeoutMs) : undefined;
  const signal =
    deadline && options.signal
      ? AbortSignal.any([deadline, options.signal])
      : (deadline ?? options.signal);

  let requests = 0;
  for (let attempt = 0; ; attempt++) {
    signal?.throwIfAborted();
    const canRetry = retryAllowed && attempt < configuredRetries;
    let headers: GenerationResponse['headers'];
    try {
      const response = await request(signal, attempt > 0, retryAllowed && attempt === 0);
      if (!response.cached) {
        requests++;
      }
      const success =
        response.status === undefined || (response.status >= 200 && response.status < 300);
      if (
        !canRetry ||
        (response.status !== 503 && !(success && isEmptyGeminiResponse(response.data)))
      ) {
        return { response, requests: Math.max(1, requests) };
      }
      headers = response.headers;
      await response.deleteFromCache?.();
    } catch (error) {
      const response = (error as { response?: GenerationResponse } | null)?.response;
      if (!canRetry || response?.status !== 503) {
        throw error;
      }
      requests++;
      headers = response.headers;
    }

    const wait = Math.max(options.baseRetryDelay ?? 200, retryAfterMs(headers) || 0);
    signal?.throwIfAborted();
    await delay(
      Math.min(Number.isFinite(wait) && wait >= 0 ? wait : 200, options.timeoutMs),
      undefined,
      { signal },
    );
  }
}
