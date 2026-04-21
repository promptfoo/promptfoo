import logger from '../../logger';
import { sleep } from '../../util/time';

import type { CompletionOptions } from './types';

const DEFAULT_GEMINI_MAX_RETRIES = 3;
const DEFAULT_GEMINI_BASE_RETRY_DELAY_MS = 1000;
const RETRYABLE_NETWORK_CODES = new Set(['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EPIPE']);

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
  logger.debug(
    `Retrying Google Gemini API call (attempt ${attempt + 1}/${maxRetries}) after ${Math.round(
      delay,
    )}ms`,
  );
  await sleep(delay);
}
