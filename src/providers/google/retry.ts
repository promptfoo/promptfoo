import logger from '../../logger';
import { parseRetryAfter } from '../../scheduler/headerParser';
import { DEFAULT_RETRY_POLICY, getRetryDelay } from '../../scheduler/retryPolicy';
import {
  extractRateLimitErrorCode,
  isHardQuotaCode,
  isHttpRateLimitError,
  isTransientConnectionError,
} from '../../util/fetch/errors';
import { sleep, sleepWithAbort } from '../../util/time';

import type { CompletionOptions } from './types';
import type { GeminiApiResponse, GeminiResponseData } from './util';

const DEFAULT_GEMINI_MAX_RETRIES = 3;
const DEFAULT_GEMINI_BASE_RETRY_DELAY_MS = 1000;
const MAX_TIMER_DELAY_MS = 2_147_483_647;
const RETRYABLE_GEMINI_STATUSES: ReadonlySet<number> = new Set([408, 429, 500, 502, 503, 504]);
const RETRYABLE_NETWORK_CODES: ReadonlySet<string> = new Set([
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'EPIPE',
  'ETIMEDOUT',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_SOCKET',
]);

type GeminiResponseDatum = {
  candidates?: Array<{
    content?: { parts?: Array<(Record<string, unknown> & { text?: string }) | null> };
    finishReason?: string;
    safetyRatings?: Array<{ blocked?: boolean; probability: string }>;
  } | null>;
  error?: { code?: number };
  promptFeedback?: {
    blockReason?: unknown;
    safetyRatings?: Array<{ blocked?: boolean; probability: string }>;
  };
  usageMetadata?: GeminiUsage;
};

export interface GeminiUsage {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
  thoughtsTokenCount?: number;
}

export interface GeminiUsageTotals {
  promptTokenCount: number;
  candidatesTokenCount: number;
  totalTokenCount: number;
  thoughtsTokenCount: number;
  hasThoughtsTokenCount: boolean;
}

export function createGeminiUsageTotals(): GeminiUsageTotals {
  return {
    promptTokenCount: 0,
    candidatesTokenCount: 0,
    totalTokenCount: 0,
    thoughtsTokenCount: 0,
    hasThoughtsTokenCount: false,
  };
}

export function getGeminiResponseUsage(
  data: GeminiResponseData | GeminiApiResponse,
): GeminiUsage | undefined {
  const normalized = (Array.isArray(data) ? data : [data]) as GeminiResponseDatum[];
  for (let index = normalized.length - 1; index >= 0; index--) {
    if (normalized[index]?.usageMetadata) {
      return normalized[index].usageMetadata;
    }
  }
  return undefined;
}

export function addGeminiUsage(totals: GeminiUsageTotals, usage?: GeminiUsage): void {
  if (!usage) {
    return;
  }
  totals.promptTokenCount += usage.promptTokenCount ?? 0;
  totals.candidatesTokenCount += usage.candidatesTokenCount ?? 0;
  totals.totalTokenCount += usage.totalTokenCount ?? 0;
  totals.thoughtsTokenCount += usage.thoughtsTokenCount ?? 0;
  totals.hasThoughtsTokenCount ||= usage.thoughtsTokenCount !== undefined;
}

export function getGeminiErrorStatus(error: unknown): number | undefined {
  if (isHttpRateLimitError(error)) {
    return error.status;
  }
  if (!(error instanceof Error)) {
    return undefined;
  }
  const maybeError = error as Error & {
    response?: { status?: unknown };
    status?: unknown;
    statusCode?: unknown;
  };
  const status = maybeError.response?.status ?? maybeError.status ?? maybeError.statusCode;
  return typeof status === 'number' ? status : undefined;
}

export function getGeminiErrorStatusText(error: unknown): string {
  if (isHttpRateLimitError(error)) {
    return error.statusText;
  }
  if (error instanceof Error) {
    const statusText = (error as Error & { response?: { statusText?: unknown } }).response
      ?.statusText;
    if (typeof statusText === 'string' && statusText.length > 0) {
      return statusText;
    }
  }
  return 'Unknown Error';
}

function getErrorBody(error: Error): unknown {
  if (isHttpRateLimitError(error)) {
    return error.body;
  }
  return (error as Error & { response?: { data?: unknown } }).response?.data;
}

function getGeminiErrorObjects(body: unknown): Array<Record<string, unknown>> {
  const roots = Array.isArray(body) ? body : [body];
  return roots.flatMap((root) => {
    if (!root || typeof root !== 'object') {
      return [];
    }
    const error = (root as { error?: unknown }).error;
    return error && typeof error === 'object' ? [error as Record<string, unknown>] : [];
  });
}

export function getGeminiErrorMessage(body: unknown): string | undefined {
  for (const error of getGeminiErrorObjects(body)) {
    if (typeof error.message === 'string' && error.message.length > 0) {
      return error.message;
    }
  }
  return undefined;
}

function normalizeHeaders(headers: unknown): Record<string, string> | undefined {
  if (!headers || typeof headers !== 'object') {
    return undefined;
  }

  const iterableHeaders = headers as { entries?: () => IterableIterator<[string, string]> };
  if (typeof iterableHeaders.entries === 'function') {
    const entries = Array.from(iterableHeaders.entries());
    if (entries.length > 0) {
      return Object.fromEntries(entries.map(([key, value]) => [key.toLowerCase(), value]));
    }
  }

  const headersWithJson = headers as { toJSON?: () => unknown };
  const raw = typeof headersWithJson.toJSON === 'function' ? headersWithJson.toJSON() : headers;
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }

  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string' || typeof value === 'number') {
      result[key.toLowerCase()] = String(value);
    } else if (Array.isArray(value)) {
      result[key.toLowerCase()] = value.join(', ');
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export function getGeminiErrorHeaders(error: unknown): Record<string, string> | undefined {
  const headers = isHttpRateLimitError(error)
    ? normalizeHeaders(error.headers)
    : error && typeof error === 'object' && 'headers' in error
      ? normalizeHeaders((error as { headers?: unknown }).headers)
      : error instanceof Error
        ? normalizeHeaders(
            (error as Error & { response?: { headers?: unknown } }).response?.headers,
          )
        : undefined;
  if (!headers) {
    return undefined;
  }
  const rateLimitHeaders = Object.fromEntries(
    Object.entries(headers).filter(
      ([name]) =>
        name === 'retry-after' ||
        name === 'retry-after-ms' ||
        name.startsWith('ratelimit-') ||
        name.startsWith('x-ratelimit-'),
    ),
  );
  return Object.keys(rateLimitHeaders).length > 0 ? rateLimitHeaders : undefined;
}

function getGoogleRetryInfoMs(body: unknown): number | undefined {
  for (const error of getGeminiErrorObjects(body)) {
    const details = error.details;
    if (!Array.isArray(details)) {
      continue;
    }
    for (const detail of details) {
      if (!detail || typeof detail !== 'object') {
        continue;
      }
      const retryDelay = (detail as { retryDelay?: unknown }).retryDelay;
      if (typeof retryDelay === 'string') {
        const match = retryDelay.match(/^(\d+(?:\.\d+)?)s$/);
        if (match) {
          return Number(match[1]) * 1000;
        }
      } else if (retryDelay && typeof retryDelay === 'object') {
        const seconds = Number((retryDelay as { seconds?: unknown }).seconds ?? 0);
        const nanos = Number((retryDelay as { nanos?: unknown }).nanos ?? 0);
        const delayMs = seconds * 1000 + nanos / 1_000_000;
        if (Number.isFinite(delayMs) && delayMs >= 0) {
          return delayMs;
        }
      }
    }
  }
  return undefined;
}

export function getGeminiRetryAfterMs(source: unknown, body?: unknown): number | undefined {
  if (isHttpRateLimitError(source) && source.retryAfterMs !== undefined) {
    return source.retryAfterMs;
  }

  const directHeaders =
    source && typeof source === 'object' && 'headers' in source
      ? normalizeHeaders((source as { headers?: unknown }).headers)
      : undefined;
  const headers = directHeaders ?? getGeminiErrorHeaders(source);
  if (!headers) {
    return getGoogleRetryInfoMs(
      body ?? (source instanceof Error ? getErrorBody(source) : undefined),
    );
  }

  const retryAfterMs = headers['retry-after-ms'];
  if (retryAfterMs !== undefined) {
    const parsed = Number(retryAfterMs);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  const retryAfter = headers['retry-after'];
  if (retryAfter !== undefined) {
    const parsed = parseRetryAfter(retryAfter);
    if (parsed !== null) {
      return parsed;
    }
  }
  return getGoogleRetryInfoMs(body ?? (source instanceof Error ? getErrorBody(source) : undefined));
}

function isHardQuotaBody(body: unknown): boolean {
  const roots = Array.isArray(body) ? body : [body];
  return roots.some((root) => {
    if (isHardQuotaCode(extractRateLimitErrorCode(root))) {
      return true;
    }
    return getGeminiErrorObjects(root).some((error) => {
      if (!Array.isArray(error.details)) {
        return false;
      }
      return error.details.some((detail) => {
        if (!detail || typeof detail !== 'object') {
          return false;
        }
        const record = detail as { reason?: unknown; violations?: unknown };
        if (
          typeof record.reason === 'string' &&
          ['BILLING_DISABLED', 'BILLING_NOT_ACTIVE', 'DAILY_LIMIT_EXCEEDED'].includes(record.reason)
        ) {
          return true;
        }
        if (!Array.isArray(record.violations)) {
          return false;
        }
        return record.violations.some((violation) => {
          if (!violation || typeof violation !== 'object') {
            return false;
          }
          const quotaId = (violation as { quotaId?: unknown }).quotaId;
          return typeof quotaId === 'string' && /(?:per[_-]?day|daily)/i.test(quotaId);
        });
      });
    });
  });
}

export function isGeminiHardQuotaError(error: unknown): boolean {
  return (
    (isHttpRateLimitError(error) && (error.kind === 'quota' || isHardQuotaCode(error.code))) ||
    (error instanceof Error && isHardQuotaBody(getErrorBody(error)))
  );
}

export function isGeminiRetryableStatus(status: number): boolean {
  return RETRYABLE_GEMINI_STATUSES.has(status);
}

export function isGeminiRetryableHttpResponse(status: number, body?: unknown): boolean {
  return isGeminiRetryableStatus(status) && !(status === 429 && isHardQuotaBody(body));
}

export function isGeminiRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  if (error.name === 'AbortError' || error.name === 'TimeoutError') {
    return false;
  }
  if (isHttpRateLimitError(error)) {
    return error.kind !== 'quota' && !isHardQuotaCode(error.code) && !isHardQuotaBody(error.body);
  }

  const status = getGeminiErrorStatus(error);
  if (status !== undefined) {
    return isGeminiRetryableHttpResponse(status, getErrorBody(error));
  }

  const maybeError = error as Error & { cause?: { code?: unknown }; code?: unknown };
  const codes = [maybeError.code, maybeError.cause?.code];
  if (codes.some((code) => typeof code === 'string' && RETRYABLE_NETWORK_CODES.has(code))) {
    return true;
  }
  const upperMessage = error.message.toUpperCase();
  if ([...RETRYABLE_NETWORK_CODES].some((code) => upperMessage.includes(code))) {
    return true;
  }
  if (isTransientConnectionError(error)) {
    return true;
  }

  const message = error.message.toLowerCase();
  return (
    /\b(408|429|500|502|503|504)\b/.test(message) ||
    message.includes('connect timeout') ||
    message.includes('connecttimeouterror') ||
    message.includes('request timed out') ||
    message.includes('service unavailable') ||
    message.includes('gateway timeout') ||
    message.includes('rate limit') ||
    message.includes('too many requests') ||
    message.includes('resource exhausted') ||
    message.includes('overloaded')
  );
}

function hasUsableOutput(
  parts: Array<(Record<string, unknown> & { text?: string }) | null> | undefined,
) {
  return Boolean(
    parts?.some((part) => {
      if (!part) {
        return false;
      }
      if (typeof part.text === 'string') {
        return part.text.length > 0;
      }
      return Object.keys(part).length > 0;
    }),
  );
}

/**
 * Classifies successful HTTP responses that Gemini asks callers to retry.
 * Only an absent/empty output with no authoritative block or terminal finish
 * reason is retryable. Streaming responses are assessed as a whole so an
 * initial metadata-only chunk cannot hide output in a later chunk.
 */
export function isGeminiRetryableResponseData(
  data: GeminiResponseData | GeminiApiResponse,
): boolean {
  const isStream = Array.isArray(data);
  const normalized = (isStream ? data : [data]) as GeminiResponseDatum[];
  let hasOutput = false;

  for (const datum of normalized) {
    if (!datum || typeof datum !== 'object') {
      continue;
    }
    if (datum.error?.code !== undefined) {
      if (!isGeminiRetryableHttpResponse(datum.error.code, datum)) {
        return false;
      }
      continue;
    }
    if (datum.promptFeedback?.blockReason) {
      return false;
    }
    if (datum.promptFeedback?.safetyRatings?.some((rating) => rating.blocked === true)) {
      return false;
    }

    if (!datum.candidates?.length) {
      continue;
    }

    for (const candidate of datum.candidates) {
      if (!candidate) {
        continue;
      }
      if (candidate.safetyRatings?.some((rating) => rating.blocked === true)) {
        return false;
      }
      if (candidate.finishReason && candidate.finishReason !== 'STOP') {
        return false;
      }
      hasOutput ||= hasUsableOutput(candidate.content?.parts);
    }
  }

  return !hasOutput;
}

export function getGeminiRetryDelay(
  config: CompletionOptions,
  attempt: number,
  retryAfterMs?: number,
): number {
  const configuredDelay =
    config.baseRetryDelay === undefined
      ? DEFAULT_GEMINI_BASE_RETRY_DELAY_MS
      : Number(config.baseRetryDelay);
  const baseDelayMs =
    Number.isFinite(configuredDelay) && configuredDelay >= 0
      ? configuredDelay
      : DEFAULT_GEMINI_BASE_RETRY_DELAY_MS;
  if (retryAfterMs !== undefined && retryAfterMs >= 0) {
    if (retryAfterMs === 0) {
      return 0;
    }
    const jitter = retryAfterMs * DEFAULT_RETRY_POLICY.jitterFactor * Math.random();
    return retryAfterMs + jitter;
  }
  return getRetryDelay(attempt, { ...DEFAULT_RETRY_POLICY, baseDelayMs });
}

export function getGeminiMaxRetries(config: CompletionOptions): number {
  const raw: unknown = config.maxRetries;
  if (raw === undefined) {
    return DEFAULT_GEMINI_MAX_RETRIES;
  }

  const parsed =
    typeof raw === 'number'
      ? raw
      : typeof raw === 'string' && /^\d+$/.test(raw.trim())
        ? Number(raw)
        : Number.NaN;
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    logger.warn('[Google] Ignoring invalid maxRetries; expected a non-negative integer.', {
      maxRetries: raw,
    });
    return DEFAULT_GEMINI_MAX_RETRIES;
  }
  return parsed;
}

export function createGeminiRetrySignal(
  callerSignal: AbortSignal | undefined,
  timeoutMs: number,
): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return callerSignal ? AbortSignal.any([callerSignal, timeoutSignal]) : timeoutSignal;
}

export function throwIfGeminiAborted(signal: AbortSignal): void {
  if (!signal.aborted) {
    return;
  }
  if (signal.reason instanceof Error) {
    throw signal.reason;
  }
  throw new Error('cancelled by user');
}

export async function waitBeforeGeminiRetry(
  config: CompletionOptions,
  attempt: number,
  maxRetries: number,
  retryAfterMs?: number,
  signal?: AbortSignal,
): Promise<void> {
  const delay = getGeminiRetryDelay(config, attempt, retryAfterMs);
  logger.debug('[Google] Retrying Gemini API call', {
    attempt: attempt + 1,
    maxRetries,
    delayMs: Math.round(delay),
  });
  let remainingDelay = delay;
  do {
    const timerDelay = Math.min(remainingDelay, MAX_TIMER_DELAY_MS);
    if (signal) {
      try {
        await sleepWithAbort(timerDelay, signal);
      } catch {
        throwIfGeminiAborted(signal);
        throw new Error('Gemini retry wait failed');
      }
    } else {
      await sleep(timerDelay);
    }
    remainingDelay -= timerDelay;
  } while (remainingDelay > 0);
}
