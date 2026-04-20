import * as fsPromises from 'fs/promises';
import path from 'path';
import type { ConnectionOptions } from 'tls';

import { getProxyForUrl } from 'proxy-from-env';
import { Agent, ProxyAgent } from 'undici';
import cliState from '../../cliState';
import { DEFAULT_MAX_CONCURRENCY, VERSION } from '../../constants';
import { getEnvBool, getEnvInt, getEnvString } from '../../envars';
import logger from '../../logger';
import { REQUEST_TIMEOUT_MS } from '../../providers/shared';
import { parseRateLimitHeaders, parseRetryAfter } from '../../scheduler/headerParser';
import invariant from '../../util/invariant';
import { sleep } from '../../util/time';
import { sanitizeUrl } from '../sanitizer';
import { monkeyPatchFetch } from './monkeyPatchFetch';
import { getFetchRetryContextMaxRetries } from './retryContext';

import type { SystemError } from './errors';
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
    headersTimeout: REQUEST_TIMEOUT_MS,
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
    headersTimeout: REQUEST_TIMEOUT_MS,
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

export async function fetchWithProxy(
  url: RequestInfo,
  options: FetchOptions = {},
  abortSignal?: AbortSignal,
): Promise<Response> {
  let finalUrl = url;
  let finalUrlString: string | undefined;

  if (typeof url === 'string') {
    finalUrlString = url;
  } else if (url instanceof URL) {
    finalUrlString = url.toString();
  } else if (url instanceof Request) {
    finalUrlString = url.url;
  }

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
    headers: {
      ...(options.headers as Record<string, string>),
      'x-promptfoo-version': VERSION,
    },
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
 * Handle rate limiting by waiting the appropriate amount of time
 */
export async function handleRateLimit(response: Response): Promise<void> {
  const rateLimitReset = response.headers.get('X-RateLimit-Reset');
  const retryAfter = response.headers.get('Retry-After');
  // OpenAI specific headers
  const openaiReset =
    response.headers.get('x-ratelimit-reset-requests') ||
    response.headers.get('x-ratelimit-reset-tokens');

  let waitTime = 60_000; // Default wait time of 60 seconds

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

  logger.debug(`Rate limited, waiting ${waitTime}ms before retry`);
  await sleep(waitTime);
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
        lastErrorMessage = `Rate limited: ${response.status} ${response.statusText}`;
        if (i >= maxRetries) {
          // No retries remain: fail fast instead of honoring the Retry-After delay.
          // `lastErrorMessage` was set above so the throw below carries the 429 detail.
          logger.debug(
            `Rate limited on URL ${url}: ${response.status} ${response.statusText}, attempt ${i + 1}/${maxRetries + 1}, no retries remain.`,
          );
          break;
        }
        logger.debug(
          `Rate limited on URL ${url}: ${response.status} ${response.statusText}, attempt ${i + 1}/${maxRetries + 1}, waiting before retry...`,
        );
        await handleRateLimit(response);
        continue;
      }

      return response;
    } catch (error) {
      // Don't retry on abort - propagate immediately
      if (error instanceof Error && error.name === 'AbortError') {
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
 * model-generated content token. Empirical measurement against OpenAI
 * gpt-4o-mini shows this framing overhead averages ~17ms (max ~48ms).
 *
 * For canonical TTFT as defined in ML benchmarking literature (vLLM,
 * MLPerf, OpenAI performance docs) — "time from request dispatch to the
 * first model-generated output token" — pass a `firstTokenDetector` that
 * inspects the accumulated stream text and returns true when the first
 * content token has arrived. For OpenAI Chat Completions SSE:
 *
 *   firstTokenDetector: (buf) => /"delta":\s*\{[^}]*"content":"[^"]/.test(buf)
 *
 * `totalStreamTime` is from the first read of the response body to stream
 * close — it excludes the TTFT window.
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
  /** Rough throughput estimate (completion chars / 4) per second. See interface doc for caveats. */
  tokensPerSecond?: number;
  /** Milliseconds from the first body read to stream close (excludes TTFT window). */
  totalStreamTime?: number;
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
 * Supported streaming response formats. Selects a built-in content-token
 * detector so callers do not have to reverse-engineer the SSE shape.
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

/**
 * Built-in regex patterns for `StreamFormat`. Each pattern matches the first
 * emission of a non-empty content token in the respective SSE protocol.
 *
 * The patterns are deliberately conservative: they require the `"content"` /
 * `"delta"` / `"text"` field to be followed by at least one non-quote byte,
 * so they do not fire on empty-delta framing events (e.g. Anthropic's
 * `{"type":"content_block_start"}`).
 */
export const STREAM_FORMAT_PATTERNS: Record<StreamFormat, RegExp> = {
  'openai-chat': /"delta":\s*\{[^}]*"content":"[^"]/,
  'openai-responses': /"type":\s*"response\.output_text\.delta"[\s\S]*?"delta":"[^"]/,
  'anthropic-messages': /"type":\s*"text_delta"[\s\S]*?"text":"[^"]/,
};

/**
 * Build a first-token detector for a known streaming format.
 * Returns `undefined` for unknown formats so callers can fall back to the
 * wire-level default.
 */
export function detectorForStreamFormat(format: StreamFormat): FirstTokenDetector {
  const pattern = STREAM_FORMAT_PATTERNS[format];
  return (accumulatedText) => pattern.test(accumulatedText);
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
 */
export async function processStreamingResponse(
  response: Response,
  requestStartTime: number,
  opts?: { firstTokenDetector?: FirstTokenDetector },
): Promise<{ text: string; streamingMetrics: StreamingMetrics }> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error(`Response has no readable body (status ${response.status})`);
  }

  const detector = opts?.firstTokenDetector ?? firstNonWhitespaceByteDetector;
  const streamStart = Date.now();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let firstTokenTime: number | undefined;
  let accumulatedText = '';
  let chunkCount = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      const chunk = decoder.decode(value, { stream: true });
      chunks.push(chunk);
      accumulatedText += chunk;
      chunkCount++;

      // Stamp TTFT on the first chunk whose arrival causes the detector to pass.
      // Measure from requestStartTime so network overhead (TCP/TLS/headers) is included.
      if (firstTokenTime === undefined && detector(accumulatedText)) {
        firstTokenTime = Date.now() - requestStartTime;
      }
    }
  } finally {
    reader.releaseLock();
  }

  return {
    text: chunks.join(''),
    streamingMetrics: {
      // Left undefined on all-whitespace streams so the ttft assertion reports "could not measure".
      timeToFirstToken: firstTokenTime,
      totalStreamTime: Date.now() - streamStart,
      multiChunkDelivery: chunkCount > 1,
    },
  };
}

/**
 * Minimum streamed window, in milliseconds, below which throughput numbers
 * become unstable (single-chunk bursts divide by near-zero). Callers should
 * skip populating `tokensPerSecond` when the window is shorter than this.
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
