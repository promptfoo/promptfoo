import * as fsPromises from 'fs/promises';
import path from 'path';
import type { ConnectionOptions } from 'tls';

import { getProxyForUrl } from 'proxy-from-env';
import { Agent, ProxyAgent } from 'undici';
import cliState from '../../cliState';
import { DEFAULT_MAX_CONCURRENCY, VERSION } from '../../constants';
import { getEnvBool, getEnvInt, getEnvString } from '../../envars';
import logger from '../../logger';
import { getRequestTimeoutMs } from '../../providers/shared';
import { parseRateLimitHeaders, parseRetryAfter } from '../../scheduler/headerParser';
import invariant from '../../util/invariant';
import { sleep } from '../../util/time';
import { sanitizeUrl } from '../sanitizer';
import {
  extractRateLimitErrorCode,
  HttpRateLimitError,
  isHardQuotaCode,
  type SystemError,
} from './errors';
import { monkeyPatchFetch } from './monkeyPatchFetch';
import { getFetchRetryContextMaxRetries } from './retryContext';

import type { FetchOptions } from './types';

// Cached agents to avoid recreating on every request.
// Keep separate entries per resolved connection count so overlapping requests
// with different request-scoped concurrency caps do not evict each other.
// Without caching, concurrent requests race on setGlobalDispatcher(),
// corrupting TLS session state and producing "bad record mac" errors.
//
// Note: TLS options (rejectUnauthorized, CA cert) are captured at agent
// creation time. This is acceptable because these env vars don't change
// mid-process. If that assumption changes, add cache-invalidation logic.
const cachedAgents: Map<number, Agent> = new Map();
const cachedProxyAgents: Map<string, ProxyAgent> = new Map();

/**
 * Get the connection pool size for HTTP agents.
 * Priority: PROMPTFOO_FETCH_CONNECTIONS env var > CLI -j flag > DEFAULT_MAX_CONCURRENCY (4).
 * Set PROMPTFOO_FETCH_CONNECTIONS to override independently of eval concurrency
 * (e.g., server deployments that need more connections than the default 4).
 */
function getConnectionPoolSize(): number {
  const envConnections = getEnvString('PROMPTFOO_FETCH_CONNECTIONS');
  if (envConnections != null) {
    const parsed = parseInt(envConnections, 10);
    if (!isNaN(parsed)) {
      return parsed;
    }
  }
  return cliState.maxConcurrency || DEFAULT_MAX_CONCURRENCY;
}

/**
 * Clear cached agents so the next request creates fresh ones.
 * Exported for testing only.
 */
export function clearAgentCache(): void {
  for (const agent of cachedAgents.values()) {
    if (typeof agent.close === 'function') {
      agent.close();
    }
  }
  cachedAgents.clear();
  for (const agent of cachedProxyAgents.values()) {
    if (typeof agent.close === 'function') {
      agent.close();
    }
  }
  cachedProxyAgents.clear();
}

function getOrCreateAgent(tlsOptions: ConnectionOptions): Agent {
  const concurrency = getConnectionPoolSize();
  const existing = cachedAgents.get(concurrency);
  if (existing) {
    return existing;
  }
  const agent = new Agent({
    headersTimeout: getRequestTimeoutMs(),
    keepAliveTimeout: 30_000,
    keepAliveMaxTimeout: 60_000,
    connections: concurrency,
    connect: tlsOptions,
  });
  cachedAgents.set(concurrency, agent);
  return agent;
}

function getProxyAgentCacheKey(proxyUrl: string, concurrency: number): string {
  return `${proxyUrl}::${concurrency}`;
}

function getOrCreateProxyAgent(proxyUrl: string, tlsOptions: ConnectionOptions): ProxyAgent {
  const concurrency = getConnectionPoolSize();
  const cacheKey = getProxyAgentCacheKey(proxyUrl, concurrency);
  const existing = cachedProxyAgents.get(cacheKey);
  if (existing) {
    return existing;
  }
  const agent = new ProxyAgent({
    uri: proxyUrl,
    proxyTls: tlsOptions,
    requestTls: tlsOptions,
    headersTimeout: getRequestTimeoutMs(),
    keepAliveTimeout: 30_000,
    keepAliveMaxTimeout: 60_000,
    connections: concurrency,
  });
  cachedProxyAgents.set(cacheKey, agent);
  return agent;
}

/**
 * Resolve whether to disable transient-error retries. An explicit caller flag
 * always wins (a caller may opt back in even when the provider set
 * `maxRetries: 0`); otherwise we disable only when the retry context carries
 * `maxRetries === 0`.
 */
function resolveTransientRetryDisabled(explicit?: boolean): boolean {
  if (explicit !== undefined) {
    return explicit;
  }
  return getFetchRetryContextMaxRetries() === 0;
}

function headersInitToRecord(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) {
    return {};
  }

  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(new Headers(headers).entries());
  }

  return { ...headers };
}

export function getFetchWithProxyHeaders(
  url: RequestInfo,
  options: FetchOptions,
): Record<string, string> {
  const requestHeaders =
    url instanceof Request && options.headers === undefined ? headersInitToRecord(url.headers) : {};
  const optionHeaders = headersInitToRecord(options.headers);

  return {
    ...requestHeaders,
    ...optionHeaders,
    'x-promptfoo-version': VERSION,
  };
}

function getFetchUrlString(url: RequestInfo): string | undefined {
  if (typeof url === 'string') {
    return url;
  }
  if (url instanceof URL) {
    return url.toString();
  }
  if (url instanceof Request) {
    return url.url;
  }
  return undefined;
}

export async function fetchWithProxy(
  url: RequestInfo,
  options: FetchOptions = {},
  abortSignal?: AbortSignal,
): Promise<Response> {
  let finalUrl = url;
  let finalUrlString = getFetchUrlString(url);

  if (!finalUrlString) {
    throw new Error('Invalid URL');
  }

  // Combine abort signals: incoming abortSignal parameter + any signal in options
  const combinedSignal = abortSignal
    ? options.signal
      ? AbortSignal.any([options.signal, abortSignal])
      : abortSignal
    : options.signal;

  // This is overridden globally but Node v20 is still complaining so we need to add it here too
  const finalOptions: FetchOptions & { dispatcher?: any } = {
    ...options,
    headers: getFetchWithProxyHeaders(url, options),
    signal: combinedSignal,
  };

  if (typeof url === 'string') {
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.username || parsedUrl.password) {
        if (
          finalOptions.headers &&
          'Authorization' in (finalOptions.headers as Record<string, string>)
        ) {
          logger.warn(
            'Both URL credentials and Authorization header present - URL credentials will be ignored',
          );
        } else {
          // Move credentials to Authorization header
          const username = parsedUrl.username || '';
          const password = parsedUrl.password || '';
          const credentials = Buffer.from(`${username}:${password}`).toString('base64');
          finalOptions.headers = {
            ...(finalOptions.headers as Record<string, string>),
            Authorization: `Basic ${credentials}`,
          };
        }
        parsedUrl.username = '';
        parsedUrl.password = '';
        finalUrl = parsedUrl.toString();
        finalUrlString = finalUrl.toString();
      }
    } catch (e) {
      logger.debug(`URL parsing failed in fetchWithProxy: ${e}`);
    }
  }

  const tlsOptions: ConnectionOptions = {
    rejectUnauthorized: !getEnvBool('PROMPTFOO_INSECURE_SSL', true),
  };

  // Support custom CA certificates
  const caCertPath = getEnvString('PROMPTFOO_CA_CERT_PATH');
  if (caCertPath) {
    try {
      const resolvedPath = path.resolve(cliState.basePath || '', caCertPath);
      const ca = await fsPromises.readFile(resolvedPath, 'utf8');
      tlsOptions.ca = ca;
      logger.debug(`Using custom CA certificate from ${resolvedPath}`);
    } catch (e) {
      logger.warn(`Failed to read CA certificate from ${caCertPath}: ${e}`);
    }
  }
  const proxyUrl = finalUrlString ? getProxyForUrl(finalUrlString) : '';

  // Bind the dispatcher per-request to avoid global state races under concurrency.
  // Respect a caller-provided dispatcher (e.g. HTTP provider's custom TLS agent for mTLS).
  if (!finalOptions.dispatcher) {
    if (proxyUrl) {
      logger.debug(`Using proxy: ${sanitizeUrl(proxyUrl)}`);
      finalOptions.dispatcher = getOrCreateProxyAgent(proxyUrl, tlsOptions);
    } else {
      finalOptions.dispatcher = getOrCreateAgent(tlsOptions);
    }
  }

  // Transient error retry logic (502/503/504/524 with matching status text).
  // When a provider sets maxRetries: 0 and the caller did not pass an explicit
  // disableTransientRetries, honor the provider intent via the retry context.
  const disableTransientRetries = resolveTransientRetryDisabled(options.disableTransientRetries);
  const maxTransientRetries = disableTransientRetries ? 0 : 3;

  for (let attempt = 0; attempt <= maxTransientRetries; attempt++) {
    const response = await monkeyPatchFetch(finalUrl, finalOptions);

    if (!disableTransientRetries && isTransientError(response) && attempt < maxTransientRetries) {
      const backoffMs = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
      logger.debug(
        `Transient error (${response.status} ${response.statusText}), retry ${attempt + 1}/${maxTransientRetries} after ${backoffMs}ms`,
      );
      await sleep(backoffMs);
      continue;
    }

    return response;
  }

  // This should be unreachable, but TypeScript needs it
  throw new Error('Unexpected end of transient retry loop');
}

export function fetchWithTimeout(
  url: RequestInfo,
  options: FetchOptions = {},
  timeout: number,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const timeoutController = new AbortController();

    // Combine timeout signal with any incoming abort signal
    // The composite signal will abort if EITHER signal aborts
    const signal = options.signal
      ? AbortSignal.any([options.signal, timeoutController.signal])
      : timeoutController.signal;

    const timeoutId = setTimeout(() => {
      timeoutController.abort();
      reject(new Error(`Request timed out after ${timeout} ms`));
    }, timeout);

    fetchWithProxy(url, {
      ...options,
      signal,
    })
      .then((response) => {
        clearTimeout(timeoutId);
        resolve(response);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}
/**
 * Check if a response indicates rate limiting
 */
export function isRateLimited(response: Response): boolean {
  // These checks helps make sure we set up tests correctly.
  invariant(response.headers, 'Response headers are missing');
  invariant(response.status, 'Response status is missing');

  // Check for OpenAI specific rate limit headers and status codes
  return (
    response.headers.get('X-RateLimit-Remaining') === '0' ||
    response.status === 429 ||
    // OpenAI specific error codes
    response.headers.get('x-ratelimit-remaining-requests') === '0' ||
    response.headers.get('x-ratelimit-remaining-tokens') === '0'
  );
}

/**
 * Compute how long to wait after a rate-limited response.
 * Reads `Retry-After`, `X-RateLimit-Reset`, and OpenAI-style reset headers.
 * Default: 60s.
 */
export function computeRateLimitWaitMs(response: Response): number {
  const rateLimitReset = response.headers.get('X-RateLimit-Reset');
  const retryAfter = response.headers.get('Retry-After');
  const openaiReset =
    response.headers.get('x-ratelimit-reset-requests') ||
    response.headers.get('x-ratelimit-reset-tokens');

  let waitTime = 60_000;

  if (openaiReset) {
    const parsedHeaders = parseRateLimitHeaders(Object.fromEntries(response.headers.entries()));
    if (parsedHeaders.resetAt !== undefined) {
      waitTime = Math.max(parsedHeaders.resetAt - Date.now(), 0);
    }
  } else if (rateLimitReset) {
    const resetTime = new Date(Number.parseInt(rateLimitReset) * 1000);
    const now = new Date();
    waitTime = Math.max(resetTime.getTime() - now.getTime() + 1000, 0);
  } else if (retryAfter) {
    waitTime = parseRetryAfter(retryAfter) ?? waitTime;
  }

  return waitTime;
}

/**
 * Maximum jitter (in ms) added to rate-limit waits. Spreads concurrent
 * waiters so they don't all retry in the same instant after Retry-After.
 */
const RATE_LIMIT_JITTER_MS = 1000;

/**
 * Handle rate limiting by waiting the appropriate amount of time, plus a
 * uniform random jitter to avoid synchronized retry storms when many
 * concurrent requests hit the same rate limit.
 */
export async function handleRateLimit(response: Response): Promise<void> {
  const waitTime = computeRateLimitWaitMs(response);
  const jitter = Math.floor(Math.random() * RATE_LIMIT_JITTER_MS);
  const totalWait = waitTime + jitter;
  logger.debug(
    `Rate limited, waiting ${totalWait}ms (base ${waitTime}ms + ${jitter}ms jitter) before retry`,
  );
  await sleep(totalWait);
}

/**
 * Hard cap on bytes read from a 429 response body during classification.
 * A hostile or buggy upstream could otherwise stream a multi-MB body on
 * every 429, amplifying memory pressure under concurrent eval load. 64 KB
 * is well above any well-formed provider error envelope (typical OpenAI
 * / Anthropic JSON errors are <1 KB).
 */
const RATE_LIMIT_BODY_PEEK_BYTES = 64 * 1024;

/**
 * Read the body of a rate-limited response without consuming the original
 * stream. Returns the parsed body (JSON if parseable, else raw text) and
 * any extracted error code (e.g. `insufficient_quota`).
 *
 * Why clone: `Response.text()` consumes the underlying stream. The original
 * response may still be observed by upstream wrappers (logging middleware,
 * monkey-patched fetch); cloning preserves their ability to read the body.
 *
 * Failures (clone, read, parse) degrade to `{ body: undefined, code:
 * undefined }` and are logged at debug level. Losing the body code only
 * widens classification from `quota` to `rate_limit`, which is the safer
 * (retryable) side of the misclassification.
 */
async function peekRateLimitBody(
  response: Response,
): Promise<{ body: unknown; code: string | undefined }> {
  let cloned: Response;
  try {
    cloned = response.clone();
  } catch (err) {
    logger.debug(`[fetch] peekRateLimitBody: clone failed, skipping body code lookup: ${err}`);
    return { body: undefined, code: undefined };
  }

  let text: string;
  try {
    text = await readBoundedText(cloned, RATE_LIMIT_BODY_PEEK_BYTES);
  } catch (err) {
    logger.debug(`[fetch] peekRateLimitBody: body read failed: ${err}`);
    return { body: undefined, code: undefined };
  }

  if (!text) {
    return { body: undefined, code: undefined };
  }

  try {
    const json = JSON.parse(text);
    return { body: json, code: extractRateLimitErrorCode(json) };
  } catch {
    // Keep the raw bytes for diagnostics; no code is extractable.
    logger.debug('[fetch] peekRateLimitBody: response body was not JSON');
    return { body: text, code: undefined };
  }
}

/**
 * Drain a Response's body into a string, but stop reading once `maxBytes`
 * have been collected. Each streamed chunk is bounded to the remaining
 * budget *before* it enters the in-memory buffer, so a single oversized
 * chunk cannot exceed `maxBytes` of retained memory. Falls back to
 * `.text()` when the body stream isn't available (some Response polyfills);
 * in that path we consult `Content-Length` first to skip materializing
 * very large bodies entirely.
 */
async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  if (!response.body) {
    const contentLength = Number.parseInt(response.headers?.get?.('content-length') ?? '', 10);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      return '';
    }
    const text = await response.text();
    return text.length > maxBytes ? text.slice(0, maxBytes) : text;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < maxBytes) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      const room = maxBytes - total;
      // Use `.slice()` (copy), not `.subarray()` (view), so the upstream
      // buffer for an oversized chunk can be released after this iteration.
      const bounded = value.byteLength <= room ? value : value.slice(0, room);
      chunks.push(bounded);
      total += bounded.byteLength;
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Reader cancellation can fail if the stream is already closed; safe to ignore.
    }
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

function buildHttpRateLimitError(
  response: Response,
  body: unknown,
  code: string | undefined,
): HttpRateLimitError {
  const headers = Object.fromEntries(response.headers.entries());
  const parsed = parseRateLimitHeaders(headers);
  return new HttpRateLimitError({
    status: response.status,
    statusText: response.statusText,
    retryAfterMs: parsed.retryAfterMs,
    resetAt: parsed.resetAt,
    code,
    headers,
    body,
  });
}

/**
 * Check if a response indicates a transient server error that should be retried.
 * Matches specific status codes with their expected status text to avoid
 * retrying permanent failures (e.g., some APIs return 502 for auth errors).
 */
export function isTransientError(response: Response): boolean {
  if (!response?.statusText) {
    return false;
  }
  const statusText = response.statusText.toLowerCase();
  switch (response.status) {
    case 502:
      return statusText.includes('bad gateway');
    case 503:
      return statusText.includes('service unavailable');
    case 504:
      return statusText.includes('gateway timeout');
    case 524: // Cloudflare-specific timeout error
      return statusText.includes('timeout');
    default:
      return false;
  }
}

/**
 * Fetch with automatic retries and rate limit handling
 */
export type { FetchOptions } from './types';

/**
 * Decide what to do with a rate-limited response inside `fetchWithRetries`.
 *
 * Throws on hard-quota fail-fast or retry exhaustion (with a structured
 * {@link HttpRateLimitError} for status 429, or a plain `Error` for the soft
 * `X-RateLimit-Remaining=0` 200 case). Otherwise sleeps via
 * {@link handleRateLimit} and returns so the caller can `continue` the loop.
 */
async function handleRateLimitedResponse(
  response: Response,
  url: RequestInfo,
  attempt: number,
  maxRetries: number,
): Promise<void> {
  // Only the 429 path produces a structured error. A 200 OK with
  // `X-RateLimit-Remaining=0` is a soft hint that we're approaching a limit —
  // sleep and retry, but constructing a "Rate limit exceeded: HTTP 200 OK"
  // error on retry exhaustion would be misleading and pointlessly buffers a
  // 64 KB body peek on every successful call.
  const isHardRateLimit = response.status === 429;
  const { body, code } = isHardRateLimit
    ? await peekRateLimitBody(response)
    : { body: undefined, code: undefined };

  // Hard quota codes (e.g. insufficient_quota) won't resolve on retry. Fail
  // fast with a structured error so the caller can stop instead of amplifying
  // load against an exhausted account.
  if (isHardRateLimit && isHardQuotaCode(code)) {
    logger.debug(
      `Quota exhausted on URL ${url}: HTTP ${response.status} (code: ${code}), failing fast.`,
    );
    throw buildHttpRateLimitError(response, body, code);
  }

  if (attempt >= maxRetries) {
    if (isHardRateLimit) {
      // No retries remain: throw a structured error instead of a bare string
      // so callers can read Retry-After / reset / code without re-parsing.
      logger.debug(
        `Rate limited on URL ${url}: HTTP ${response.status} ${response.statusText}, attempt ${attempt + 1}/${maxRetries + 1}, no retries remain.`,
      );
      throw buildHttpRateLimitError(response, body, code);
    }
    throw new Error(
      `Rate limited: ${response.status} ${response.statusText} after ${maxRetries + 1} attempts`,
    );
  }

  logger.debug(
    `Rate limited on URL ${url}: HTTP ${response.status} ${response.statusText}, attempt ${attempt + 1}/${maxRetries + 1}, waiting before retry...`,
  );
  await handleRateLimit(response);
}

function formatFetchErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const typedError = error as SystemError;
  let message = `${typedError.name}: ${typedError.message}`;
  if (typedError.cause) {
    message += ` (Cause: ${typedError.cause})`;
  }
  if (typedError.code) {
    message += ` (Code: ${typedError.code})`;
  }
  return message;
}

export async function fetchWithRetries(
  url: RequestInfo,
  options: FetchOptions = {},
  timeout: number,
  maxRetries?: number,
): Promise<Response> {
  const contextMaxRetries = getFetchRetryContextMaxRetries();
  maxRetries = Math.max(0, maxRetries ?? contextMaxRetries ?? 4);

  let lastErrorMessage: string | undefined;
  const backoff = getEnvInt('PROMPTFOO_REQUEST_BACKOFF_MS', 5000);

  for (let i = 0; i <= maxRetries; i++) {
    let response;
    try {
      // Disable transient retries in fetchWithProxy to avoid double-retrying
      response = await fetchWithTimeout(
        url,
        { ...options, disableTransientRetries: true },
        timeout,
      );

      if (getEnvBool('PROMPTFOO_RETRY_5XX') && response.status >= 500 && response.status < 600) {
        throw new Error(`Internal Server Error: ${response.status} ${response.statusText}`);
      }

      if (response && isRateLimited(response)) {
        await handleRateLimitedResponse(response, url, i, maxRetries);
        continue;
      }

      return response;
    } catch (error) {
      // Don't retry on abort - propagate immediately
      if (error instanceof Error && error.name === 'AbortError') {
        throw error;
      }

      // Structured rate-limit errors are already final (quota fail-fast or
      // retries exhausted) and carry retry-after / reset metadata. Don't
      // swallow them in the generic retry path.
      if (error instanceof HttpRateLimitError) {
        throw error;
      }

      const errorMessage = formatFetchErrorMessage(error);

      logger.debug(`Request to ${url} failed (attempt #${i + 1}), retrying: ${errorMessage}`);
      if (i < maxRetries) {
        const waitTime = Math.pow(2, i) * (backoff + 1000 * Math.random());
        await sleep(waitTime);
      }
      lastErrorMessage = errorMessage;
    }
  }
  throw new Error(`Request failed after ${maxRetries} retries: ${lastErrorMessage}`);
}
