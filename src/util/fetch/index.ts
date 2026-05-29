import * as fsPromises from 'node:fs/promises';
import path from 'path';
import type { ConnectionOptions } from 'tls';

import { getProxyForUrl } from 'proxy-from-env';
import { Agent, type Dispatcher, interceptors, ProxyAgent } from 'undici';
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
const cachedAgents: Map<number, Dispatcher> = new Map();
const cachedProxyAgents: Map<string, Dispatcher> = new Map();

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

function getOrCreateAgent(tlsOptions: ConnectionOptions): Dispatcher {
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
  }).compose(interceptors.decompress({ skipErrorResponses: false }));
  cachedAgents.set(concurrency, agent);
  return agent;
}

function getProxyAgentCacheKey(proxyUrl: string, concurrency: number): string {
  return `${proxyUrl}::${concurrency}`;
}

function getOrCreateProxyAgent(proxyUrl: string, tlsOptions: ConnectionOptions): Dispatcher {
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
  }).compose(interceptors.decompress({ skipErrorResponses: false }));
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
 * Returns raw Response object for unified processing
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
/**
 * Returns a string form of a {@link RequestInfo} suitable for log output.
 * Strips basic-auth credentials and known sensitive query parameters (api_key,
 * token, password, signature, …) via {@link sanitizeUrl} so providers that
 * embed credentials in the URL (e.g. n8n webhooks, HTTP providers with
 * `?api_key=…`) do not leak them into retry diagnostics.
 */
function urlForLog(url: RequestInfo): string {
  const raw = typeof url === 'string' ? url : url.url;
  return sanitizeUrl(raw);
}

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
  const safeUrl = urlForLog(url);

  // Hard quota codes (e.g. insufficient_quota) won't resolve on retry. Fail
  // fast with a structured error so the caller can stop instead of amplifying
  // load against an exhausted account.
  if (isHardRateLimit && isHardQuotaCode(code)) {
    logger.debug(
      `Quota exhausted on URL ${safeUrl}: HTTP ${response.status} (code: ${code}), failing fast.`,
    );
    throw buildHttpRateLimitError(response, body, code);
  }

  if (attempt >= maxRetries) {
    if (isHardRateLimit) {
      // No retries remain: throw a structured error instead of a bare string
      // so callers can read Retry-After / reset / code without re-parsing.
      logger.debug(
        `Rate limited on URL ${safeUrl}: HTTP ${response.status} ${response.statusText}, attempt ${attempt + 1}/${maxRetries + 1}, no retries remain.`,
      );
      throw buildHttpRateLimitError(response, body, code);
    }
    throw new Error(
      `Rate limited: ${response.status} ${response.statusText} after ${maxRetries + 1} attempts`,
    );
  }

  logger.debug(
    `Rate limited on URL ${safeUrl}: HTTP ${response.status} ${response.statusText}, attempt ${attempt + 1}/${maxRetries + 1}, waiting before retry...`,
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

      logger.debug(
        `Request to ${urlForLog(url)} failed (attempt #${i + 1}), retrying: ${errorMessage}`,
      );
      if (i < maxRetries) {
        const waitTime = Math.pow(2, i) * (backoff + 1000 * Math.random());
        await sleep(waitTime);
      }
      lastErrorMessage = errorMessage;
    }
  }
  throw new Error(`Request failed after ${maxRetries} retries: ${lastErrorMessage}`);
}

/**
 * Timing metrics captured while consuming a streaming HTTP response.
 *
 * Applies to text modalities only. Timing values are milliseconds.
 *
 * ## Precise field definitions
 *
 * `timeToFirstToken` is the wall time from request dispatch (when the
 * HTTP request is sent) to a detection event on the response body. The
 * default detection event is "first non-whitespace byte of the response
 * body" — a format-agnostic proxy for TTFT. For SSE streams this fires
 * on the first `data: ...` frame, which often carries framing metadata
 * (e.g. OpenAI's `{"delta":{"role":"assistant"}}`) rather than the first
 * model-generated content token.
 *
 * For canonical TTFT as defined in ML benchmarking literature (vLLM,
 * MLPerf, OpenAI performance docs) — "time from request dispatch to the
 * first model-generated output token" — pass a `firstTokenDetector` that
 * inspects the accumulated stream text and returns true when the first
 * content token has arrived. For OpenAI Chat Completions SSE:
 *
 *   firstTokenDetector: (buf) => /"delta":\s*\{[^}]*"content":"[^"]/.test(buf)
 *
 * `totalStreamTime` is from the arrival of the first response-body chunk to
 * the arrival of the last response-body chunk. It excludes connection/server
 * time before the first body bytes and excludes any idle tail while an
 * already-delivered stream remains open.
 *
 * `multiChunkDelivery` is true when the transport delivered more than
 * one network chunk (`ReadableStream.getReader().read()` call). It does
 * NOT mean the upstream model emitted multiple tokens. A server that
 * flushes every SSE event in one TCP write reports `false`. A server
 * that buffers and flushes in bursts reports `true`. Use this to detect
 * whether the stream actually progressed incrementally versus arrived
 * in a single burst (in which case `tokensPerSecond` is omitted).
 *
 * `tokensPerSecond` is populated by the caller (the HTTP provider) after
 * `transformResponse` produces the final content string. It uses a
 * `chars / 4` heuristic that is a standard English-prose proxy but
 * underestimates token counts for CJK text, code, and base64. It is
 * intentionally NOT computed from the raw stream buffer here because SSE
 * frame wrappers inflate character counts by 20x-60x.
 */
export interface StreamingMetrics {
  /**
   * Milliseconds from request dispatch to the first detected "token event".
   * See interface JSDoc for the precise definition and detector semantics.
   */
  timeToFirstToken?: number;
  /**
   * Milliseconds from first response-body chunk arrival to last chunk arrival.
   * Excludes the TTFT window and any idle tail before close.
   * Populated by `processStreamingResponse`.
   */
  totalStreamTime?: number;
  /**
   * Number of UTF-16 code units in the final completion text (i.e. after
   * `transformResponse` has parsed the stream). This is the exact raw
   * measurement — no heuristic. Divide by `totalStreamTime` and multiply by
   * 1000 to get chars/second, or pass through your own tokenizer for an
   * exact tokens-per-second figure that does not depend on the chars/4
   * approximation used by `tokensPerSecond`.
   */
  completionChars?: number;
  /**
   * Approximate throughput in "tokens" per second where a "token" is
   * defined as 4 UTF-16 code units (the OpenAI-documented English-prose
   * heuristic). Computed as `Math.ceil(completionChars / 4) / totalStreamTime * 1000`.
   * Only populated when the response delivered multiple network chunks
   * and the stream window is at least `MIN_MEANINGFUL_STREAM_WINDOW_MS`.
   *
   * NOT accurate for CJK text, code, or base64 — prefer `completionChars`
   * with your own tokenizer when precision matters.
   */
  tokensPerSecond?: number;
  /** True when the transport delivered more than one network chunk. */
  multiChunkDelivery?: boolean;
}

/**
 * Predicate called after each chunk is appended. When it returns true,
 * `timeToFirstToken` is stamped. Receives the accumulated raw response
 * text (across all chunks so far) so patterns can safely span chunk
 * boundaries.
 */
export type FirstTokenDetector = (accumulatedText: string) => boolean;

/**
 * Default detector: fires on the first non-whitespace byte in the new chunk.
 * Exported for callers that want to explicitly opt into the format-agnostic
 * wire-level proxy rather than a format-specific content detector.
 */
export const firstNonWhitespaceByteDetector: FirstTokenDetector = (accumulatedText) => {
  for (let i = 0; i < accumulatedText.length; i++) {
    if (accumulatedText.charCodeAt(i) > 32) {
      return true;
    }
  }
  return false;
};

/**
 * Supported text streaming response formats. Selects a built-in content-token
 * detector so callers do not have to reverse-engineer the SSE shape. These
 * detectors do not measure audio stream latency.
 *
 * - `openai-chat`: OpenAI Chat Completions (`/v1/chat/completions`). Fires on
 *   the first delta with a non-empty `content` string. Skips the leading
 *   `{"delta":{"role":"assistant"}}` framing frame.
 * - `openai-responses`: OpenAI Responses API (`/v1/responses`). Fires on the
 *   first `response.output_text.delta` event with a non-empty `delta`.
 * - `anthropic-messages`: Anthropic Messages API (`/v1/messages`). Fires on
 *   the first `content_block_delta` event with a non-empty `text_delta`.
 *
 * If your endpoint is not one of these, use `streamFirstTokenPattern` with a
 * custom regex or omit it entirely to get the default wire-level proxy.
 */
export type StreamFormat = 'openai-chat' | 'openai-responses' | 'anthropic-messages';
const BUILT_IN_STREAM_FORMAT = Symbol('builtInStreamFormat');
type BuiltInStreamFormatDetector = FirstTokenDetector & {
  [BUILT_IN_STREAM_FORMAT]: StreamFormat;
};

function parseSseDataEvents(accumulatedText: string): unknown[] {
  return accumulatedText.split(/\r?\n/).flatMap((line) => {
    const event = parseSseDataLine(line);
    return event === undefined ? [] : [event];
  });
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseSseDataLine(line: string): unknown | undefined {
  if (!line.startsWith('data:')) {
    return undefined;
  }

  const data = line.slice('data:'.length).trim();
  if (!data || data === '[DONE]') {
    return undefined;
  }

  try {
    return JSON.parse(data) as unknown;
  } catch {
    return undefined;
  }
}

const STREAM_FORMAT_EVENT_DETECTORS: Record<StreamFormat, (event: unknown) => boolean> = {
  'openai-chat': (event) => {
    if (!isRecord(event) || !Array.isArray(event.choices)) {
      return false;
    }
    return event.choices.some(
      (choice) =>
        isRecord(choice) && isRecord(choice.delta) && isNonEmptyString(choice.delta.content),
    );
  },
  'openai-responses': (event) =>
    isRecord(event) && event.type === 'response.output_text.delta' && isNonEmptyString(event.delta),
  'anthropic-messages': (event) =>
    isRecord(event) &&
    isRecord(event.delta) &&
    event.delta.type === 'text_delta' &&
    isNonEmptyString(event.delta.text),
};

/**
 * Build a first-token detector for a known streaming format.
 * When passed to `processStreamingResponse`, its format marker enables
 * incremental SSE processing instead of repeatedly parsing accumulated text.
 */
export function detectorForStreamFormat(format: StreamFormat): FirstTokenDetector {
  const detector = ((accumulatedText) =>
    parseSseDataEvents(accumulatedText).some(
      STREAM_FORMAT_EVENT_DETECTORS[format],
    )) as BuiltInStreamFormatDetector;
  detector[BUILT_IN_STREAM_FORMAT] = format;
  return detector;
}

function createIncrementalStreamFormatDetector(
  format: StreamFormat,
): (chunk: string, final: boolean) => boolean {
  let pendingLine = '';
  return (chunk, final) => {
    const lines = `${pendingLine}${chunk}`.split(/\r?\n/);
    pendingLine = final ? '' : (lines.pop() ?? '');
    return lines.some((line) => {
      const event = parseSseDataLine(line);
      return event !== undefined && STREAM_FORMAT_EVENT_DETECTORS[format](event);
    });
  };
}

function getBuiltInStreamFormat(
  detector: FirstTokenDetector | undefined,
): StreamFormat | undefined {
  return (detector as BuiltInStreamFormatDetector | undefined)?.[BUILT_IN_STREAM_FORMAT];
}

interface StreamingDetectionOptions {
  firstTokenDetector?: FirstTokenDetector;
  firstTokenDetectorWindowChars?: number;
  streamFormat?: StreamFormat;
}

function createStreamingTokenDetector(
  opts?: StreamingDetectionOptions,
): (chunk: string, final: boolean) => boolean {
  const builtInFormat = opts?.firstTokenDetector
    ? getBuiltInStreamFormat(opts.firstTokenDetector)
    : opts?.streamFormat;
  if (builtInFormat !== undefined) {
    return createIncrementalStreamFormatDetector(builtInFormat);
  }

  if (opts?.firstTokenDetector) {
    const detector = opts.firstTokenDetector;
    const windowChars = opts.firstTokenDetectorWindowChars;
    let detectorText = '';
    return (chunk) => {
      detectorText += chunk;
      if (windowChars !== undefined) {
        detectorText = detectorText.slice(-windowChars);
      }
      return detector(detectorText);
    };
  }

  return (chunk) => firstNonWhitespaceByteDetector(chunk);
}

/**
 * Consume a streaming HTTP response and collect timing metrics.
 *
 * `timeToFirstToken` is measured from `requestStartTime` so it captures
 * connection setup and server processing, not just stream-read latency.
 * Pass a `firstTokenDetector` to customize when TTFT fires (see
 * `StreamingMetrics` JSDoc for canonical-TTFT examples).
 *
 * @param response - The Response object to process as a stream
 * @param requestStartTime - The timestamp when the request was initiated (ms since epoch)
 * @param opts.firstTokenDetector - Predicate that decides when TTFT fires. Defaults
 *   to `firstNonWhitespaceByteDetector` (first non-whitespace body byte).
 * @param opts.streamFormat - Built-in SSE detector, processed once per completed event.
 *   Ignored when an unrelated custom `firstTokenDetector` is provided.
 * @param opts.firstTokenDetectorWindowChars - Optional rolling character window retained
 *   for a custom detector. Use this for pattern detectors over untrusted streams.
 */
export async function processStreamingResponse(
  response: Response,
  requestStartTime: number,
  opts?: StreamingDetectionOptions,
): Promise<{ text: string; streamingMetrics: StreamingMetrics }> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error(`Response has no readable body (status ${response.status})`);
  }

  const detectToken = createStreamingTokenDetector(opts);
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let firstTokenTime: number | undefined;
  let firstByteTime: number | undefined;
  let lastByteTime: number | undefined;
  let chunkCount = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      const now = Date.now();
      // Pin totalStreamTime strictly between first and last byte so the
      // window is "bytes arriving on the wire", not "time in this function."
      if (firstByteTime === undefined) {
        firstByteTime = now;
      }
      lastByteTime = now;

      const chunk = decoder.decode(value, { stream: true });
      chunks.push(chunk);
      chunkCount++;

      // Stamp TTFT on the first chunk whose arrival causes the detector to pass.
      // Measure from requestStartTime so network overhead (TCP/TLS/headers) is included.
      if (firstTokenTime === undefined && detectToken(chunk, false)) {
        firstTokenTime = now - requestStartTime;
      }
    }

    // Flush any buffered decoder state at EOF. This preserves the same
    // replacement-character behavior as Response.text() for truncated UTF-8.
    const trailingText = decoder.decode();
    if (trailingText) {
      chunks.push(trailingText);
    }
    if (
      firstTokenTime === undefined &&
      lastByteTime !== undefined &&
      detectToken(trailingText, true)
    ) {
      firstTokenTime = lastByteTime - requestStartTime;
    }
  } finally {
    reader.releaseLock();
  }

  const totalStreamTime =
    firstByteTime !== undefined && lastByteTime !== undefined
      ? lastByteTime - firstByteTime
      : undefined;

  return {
    text: chunks.join(''),
    streamingMetrics: {
      // Left undefined on all-whitespace streams so the ttft assertion reports "could not measure".
      timeToFirstToken: firstTokenTime,
      totalStreamTime,
      multiChunkDelivery: chunkCount > 1,
    },
  };
}

/**
 * Minimum streamed window below which `tokensPerSecond` is suppressed.
 *
 * Rationale (why 50ms specifically):
 *
 * 1. Cross-region HTTP round-trip times to major LLM endpoints sit in the
 *    10-40ms range on a typical cloud or residential link, so inter-chunk
 *    gaps shorter than ~50ms are dominated by network buffering jitter
 *    rather than model generation cadence.
 * 2. The rate formula is `chars/4 / streamWindowMs * 1000`. At 50ms the
 *    denominator is large enough that a +/-5ms clock jitter moves the
 *    reported rate by at most 10%, which matches the chars/4 heuristic's
 *    own precision floor for English text.
 * 3. Below ~50ms, real multi-chunk streams tend to represent a single TCP
 *    packet arriving in two network-stack reads (kernel -> userspace
 *    boundary). Reporting throughput for that case misrepresents the
 *    model's token-generation speed.
 *
 * Callers that want the raw rate at any window can compute it from
 * `completionChars` and `totalStreamTime` directly; this constant only
 * governs the convenience `tokensPerSecond` field.
 */
export const MIN_MEANINGFUL_STREAM_WINDOW_MS = 50;

/**
 * Compute tokens-per-second using content chars (chars/4 heuristic) over the
 * streamed window. Returns `undefined` when the window is too short or
 * content is empty — in those cases the number would be misleading (or
 * infinite) rather than informative.
 */
export function estimateStreamingTokensPerSecond(
  completionChars: number,
  streamWindowMs: number | undefined,
): number | undefined {
  if (
    completionChars <= 0 ||
    streamWindowMs === undefined ||
    streamWindowMs < MIN_MEANINGFUL_STREAM_WINDOW_MS
  ) {
    return undefined;
  }
  return (Math.ceil(completionChars / 4) / streamWindowMs) * 1000;
}
