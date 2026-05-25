import logger from '../../logger';
import { sleep } from '../../util/time';
import { type GeminiApiResponse, type GeminiResponseData, isNonCandidateStreamChunk } from './util';

import type { CompletionOptions } from './types';

const DEFAULT_GEMINI_MAX_RETRIES = 3;
const DEFAULT_GEMINI_BASE_RETRY_DELAY_MS = 1000;
const RETRYABLE_NETWORK_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EPIPE']);
const NON_RETRYABLE_FINISH_REASONS = new Set([
  'SAFETY',
  'PROHIBITED_CONTENT',
  'RECITATION',
  'BLOCKLIST',
  'SPII',
  'IMAGE_SAFETY',
]);

type GeminiResponseDatum = {
  candidates?: GeminiResponseData['candidates'];
  error?: { code: number };
  promptFeedback?: {
    blockReason?: unknown;
    safetyRatings?: Array<{ probability: string }>;
  };
};

function getErrorStatus(error: Error): number | undefined {
  const maybeError = error as Error & {
    response?: { status?: unknown };
    status?: unknown;
    statusCode?: unknown;
  };

  const status = maybeError.response?.status ?? maybeError.status ?? maybeError.statusCode;
  return typeof status === 'number' ? status : undefined;
}

function hasRetryableNetworkCode(error: Error): boolean {
  const maybeError = error as Error & {
    code?: unknown;
    cause?: { code?: unknown };
  };
  const codes = [maybeError.code, maybeError.cause?.code];
  if (codes.some((code) => typeof code === 'string' && RETRYABLE_NETWORK_CODES.has(code))) {
    return true;
  }

  const message = error.message.toUpperCase();
  return [...RETRYABLE_NETWORK_CODES].some((code) => message.includes(code));
}

export function isGeminiRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

export function isGeminiRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const status = getErrorStatus(error);
  if (status !== undefined) {
    return isGeminiRetryableStatus(status);
  }

  if (hasRetryableNetworkCode(error)) {
    return true;
  }

  const message = error.message.toLowerCase();
  if (/\b(408|429|5\d{2})\b/.test(message)) {
    return true;
  }

  return (
    message.includes('service unavailable') ||
    message.includes('gateway timeout') ||
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('resource exhausted') ||
    message.includes('quota exceeded') ||
    message.includes('overloaded')
  );
}

/**
 * Classifies successful HTTP responses that Gemini asks callers to retry.
 *
 * Empty candidate/output responses are transient in practice and are the response
 * shapes surfaced by issue #7077. Safety refusals remain authoritative responses.
 */
export function isGeminiRetryableResponseData(
  data: GeminiResponseData | GeminiApiResponse,
): boolean {
  const isStream = Array.isArray(data);
  const normalizedData = (isStream ? data : [data]) as GeminiResponseDatum[];
  let hasOutput = false;

  for (const datum of normalizedData) {
    if (datum.error) {
      return isGeminiRetryableStatus(datum.error.code);
    }

    if (datum.promptFeedback?.blockReason) {
      return false;
    }

    if (!datum.candidates?.length) {
      if (isStream && isNonCandidateStreamChunk(datum as GeminiResponseData)) {
        continue;
      }

      const hasFlaggedSafetyRating = datum.promptFeedback?.safetyRatings?.some(
        (rating) => rating.probability !== 'NEGLIGIBLE',
      );
      return !hasFlaggedSafetyRating;
    }

    const candidate = datum.candidates[0];
    if (!candidate) {
      return true;
    }
    if (candidate.finishReason && NON_RETRYABLE_FINISH_REASONS.has(candidate.finishReason)) {
      return false;
    }
    if (candidate.content?.parts) {
      hasOutput = true;
    } else if (candidate.finishReason !== 'STOP') {
      return true;
    }
  }

  return !hasOutput;
}

export function getGeminiRetryDelay(config: CompletionOptions, attempt: number): number {
  const configuredDelay =
    config.baseRetryDelay === undefined
      ? DEFAULT_GEMINI_BASE_RETRY_DELAY_MS
      : Number(config.baseRetryDelay);
  const baseDelay = Number.isFinite(configuredDelay)
    ? Math.max(0, configuredDelay)
    : DEFAULT_GEMINI_BASE_RETRY_DELAY_MS;
  return baseDelay * Math.pow(2, attempt) + Math.random() * baseDelay;
}

export function getGeminiMaxRetries(config: CompletionOptions): number {
  const configuredRetries =
    config.maxRetries === undefined ? DEFAULT_GEMINI_MAX_RETRIES : Number(config.maxRetries);
  return Number.isFinite(configuredRetries) ? Math.max(0, Math.floor(configuredRetries)) : 0;
}

export async function waitBeforeGeminiRetry(
  config: CompletionOptions,
  attempt: number,
  maxRetries: number,
): Promise<void> {
  const delay = getGeminiRetryDelay(config, attempt);
  logger.debug('[Google] Retrying Gemini API call', {
    attempt: attempt + 1,
    maxRetries,
    delayMs: Math.round(delay),
  });
  await sleep(delay);
}
