import * as fsPromises from 'fs/promises';
import path from 'path';
import type { ConnectionOptions } from 'tls';

import { getProxyForUrl } from 'proxy-from-env';
import { Agent, ProxyAgent, setGlobalDispatcher } from 'undici';
import cliState from '../../cliState';
import { VERSION } from '../../constants';
import { getEnvBool, getEnvInt, getEnvString } from '../../envars';
import logger from '../../logger';
import { REQUEST_TIMEOUT_MS } from '../../providers/shared';
import invariant from '../../util/invariant';
import { sleep } from '../../util/time';
import { sanitizeUrl } from '../sanitizer';
import { monkeyPatchFetch } from './monkeyPatchFetch';

import type { FetchOptions } from './types';

/**
 * Options for configuring TLS in proxy connections
 */
interface ProxyTlsOptions {
  uri: string;
  proxyTls: ConnectionOptions;
  requestTls: ConnectionOptions;
  headersTimeout?: number;
}

/**
 * Error with additional system information
 */
interface SystemError extends Error {
  code?: string;
  cause?: unknown;
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

  if (proxyUrl) {
    logger.debug(`Using proxy: ${sanitizeUrl(proxyUrl)}`);
    const agent = new ProxyAgent({
      uri: proxyUrl,
      proxyTls: tlsOptions,
      requestTls: tlsOptions,
      headersTimeout: REQUEST_TIMEOUT_MS,
    } as ProxyTlsOptions);
    setGlobalDispatcher(agent);
  } else {
    const agent = new Agent({
      headersTimeout: REQUEST_TIMEOUT_MS,
    });
    setGlobalDispatcher(agent);
  }

  return await monkeyPatchFetch(finalUrl, finalOptions);
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
    waitTime = Math.max(Number.parseInt(openaiReset) * 1000, 0);
  } else if (rateLimitReset) {
    const resetTime = new Date(Number.parseInt(rateLimitReset) * 1000);
    const now = new Date();
    waitTime = Math.max(resetTime.getTime() - now.getTime() + 1000, 0);
  } else if (retryAfter) {
    waitTime = Number.parseInt(retryAfter) * 1000;
  }

  logger.debug(`Rate limited, waiting ${waitTime}ms before retry`);
  await sleep(waitTime);
}

/**
 * Fetch with automatic retries and rate limit handling
 * Returns raw Response object for unified processing
 */
export type { FetchOptions } from './types';

export async function fetchWithRetries(
  url: RequestInfo,
  options: FetchOptions = {},
  timeout: number,
  maxRetries?: number,
): Promise<Response> {
  maxRetries = Math.max(0, maxRetries ?? 4);

  let lastErrorMessage: string | undefined;
  const backoff = getEnvInt('PROMPTFOO_REQUEST_BACKOFF_MS', 5000);

  for (let i = 0; i <= maxRetries; i++) {
    let response;
    try {
      response = await fetchWithTimeout(url, options, timeout);

      if (getEnvBool('PROMPTFOO_RETRY_5XX') && response.status >= 500 && response.status < 600) {
        throw new Error(`Internal Server Error: ${response.status} ${response.statusText}`);
      }

      if (response && isRateLimited(response)) {
        logger.debug(
          `Rate limited on URL ${url}: ${response.status} ${response.statusText}, attempt ${i + 1}/${maxRetries + 1}, waiting before retry...`,
        );
        lastErrorMessage = `Rate limited: ${response.status} ${response.statusText}`;
        await handleRateLimit(response);
        continue;
      }

      return response;
    } catch (error) {
      // Don't retry on abort - propagate immediately
      if (error instanceof Error && error.name === 'AbortError') {
        throw error;
      }

      let errorMessage;
      if (error instanceof Error) {
        // Extract as much detail as possible from the error
        const typedError = error as SystemError;
        errorMessage = `${typedError.name}: ${typedError.message}`;
        if (typedError.cause) {
          errorMessage += ` (Cause: ${typedError.cause})`;
        }
        if (typedError.code) {
          // Node.js system errors often have error codes
          errorMessage += ` (Code: ${typedError.code})`;
        }
      } else {
        errorMessage = String(error);
      }

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
 * Streaming metrics to track timing information during streaming responses
 */
export interface StreamingMetrics {
  timeToFirstToken?: number;
  tokensPerSecond?: number;
  totalStreamTime?: number;
  isActuallyStreaming?: boolean;
}

/**
 * Callback for first token detection during streaming
 */
export type FirstTokenCallback = () => void;

/**
 * Options for streaming fetch requests
 */
export interface StreamingFetchOptions {
  onFirstToken?: FirstTokenCallback;
  enableMetrics?: boolean;
}

/**
 * Process a streaming response and extract TTFT metrics
 *
 * @param response - The Response object to process as a stream
 * @param requestStartTime - The timestamp when the request was initiated (for accurate TTFT)
 * @param onFirstToken - Optional callback triggered when first token is detected
 * @returns Object containing the full response text and streaming metrics
 */
export async function processStreamingResponse(
  response: Response,
  requestStartTime: number,
  onFirstToken?: FirstTokenCallback,
): Promise<{ text: string; streamingMetrics: StreamingMetrics }> {
  const streamStart = Date.now();
  let firstTokenTime: number | undefined;
  let hasCalledFirstToken = false;

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body is not readable');
  }

  const decoder = new TextDecoder();
  let text = '';
  let tokenCount = 0;
  let chunkCount = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      const chunk = decoder.decode(value, { stream: true });
      text += chunk;
      chunkCount++;

      // Detect first meaningful token using a simple heuristic
      // Limitation: This may not be accurate if the stream includes preambles,
      // comments, or other non-content chunks. More sophisticated detection
      // should be implemented in the provider's transformResponse function.
      if (!hasCalledFirstToken && chunk.trim().length > 0) {
        // CRITICAL: Measure from request start, not stream start
        // This includes network overhead (TCP handshake, TLS, HTTP headers)
        firstTokenTime = Date.now() - requestStartTime;
        hasCalledFirstToken = true;
        if (onFirstToken) {
          onFirstToken();
        }
      }

      // Approximate token counting using character-based estimation
      // Note: This is a rough approximation (4 chars ≈ 1 token) and may be
      // inaccurate for non-English text, code, or tokens with special formatting.
      // For more accurate token counting, integrate with a proper tokenizer.
      tokenCount += Math.ceil(chunk.length / 4);
    }
  } finally {
    reader.releaseLock();
  }

  const totalStreamTime = Date.now() - streamStart;
  const tokensPerSecond = totalStreamTime > 0 ? (tokenCount / totalStreamTime) * 1000 : 0;

  // For non-streaming responses (single chunk), TTFT is the time from request start to receiving the chunk
  if (chunkCount === 1 && !firstTokenTime) {
    firstTokenTime = Date.now() - requestStartTime;
  }

  // Ensure we always have a valid TTFT value for streaming metrics
  // If no first token time was captured, calculate from request start to now
  const finalTtft = firstTokenTime || Date.now() - requestStartTime;

  return {
    text,
    streamingMetrics: {
      timeToFirstToken: finalTtft,
      tokensPerSecond,
      totalStreamTime,
      isActuallyStreaming: chunkCount > 1,
    },
  };
}
