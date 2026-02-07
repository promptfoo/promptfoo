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
import invariant from '../../util/invariant';
import { sleep } from '../../util/time';
import { sanitizeUrl } from '../sanitizer';
import { monkeyPatchFetch } from './monkeyPatchFetch';

import type { SystemError } from './errors';
import type { FetchOptions } from './types';

// Cached agents to avoid recreating on every request.
// Without caching, concurrent requests race on setGlobalDispatcher(),
// corrupting TLS session state and producing "bad record mac" errors.
//
// Note: TLS options (rejectUnauthorized, CA cert) are captured at agent
// creation time. This is acceptable because these env vars don't change
// mid-process. If that assumption changes, add cache-invalidation logic.
let cachedAgent: Agent | null = null;
let cachedAgentConcurrency: number | undefined;
let cachedProxyAgents: Map<string, ProxyAgent> = new Map();

/**
 * Clear cached agents so the next request creates fresh ones.
 * Exported for testing only.
 */
export function clearAgentCache(): void {
  if (cachedAgent && typeof cachedAgent.close === 'function') {
    cachedAgent.close();
  }
  cachedAgent = null;
  cachedAgentConcurrency = undefined;
  for (const agent of cachedProxyAgents.values()) {
    if (typeof agent.close === 'function') {
      agent.close();
    }
  }
  cachedProxyAgents = new Map();
}

function getOrCreateAgent(tlsOptions: ConnectionOptions): Agent {
  const concurrency = cliState.maxConcurrency || DEFAULT_MAX_CONCURRENCY;
  // Recreate if concurrency changed (e.g., early fetch used default,
  // then user set -j flag before eval starts).
  if (cachedAgent && cachedAgentConcurrency !== concurrency) {
    if (typeof cachedAgent.close === 'function') {
      cachedAgent.close();
    }
    cachedAgent = null;
  }
  if (!cachedAgent) {
    cachedAgent = new Agent({
      headersTimeout: REQUEST_TIMEOUT_MS,
      keepAliveTimeout: 30_000,
      keepAliveMaxTimeout: 60_000,
      connections: concurrency,
      connect: tlsOptions,
    });
    cachedAgentConcurrency = concurrency;
  }
  return cachedAgent;
}

function getOrCreateProxyAgent(proxyUrl: string, tlsOptions: ConnectionOptions): ProxyAgent {
  if (!cachedProxyAgents.has(proxyUrl)) {
    const concurrency = cliState.maxConcurrency || DEFAULT_MAX_CONCURRENCY;
    const agent = new ProxyAgent({
      uri: proxyUrl,
      proxyTls: tlsOptions,
      requestTls: tlsOptions,
      headersTimeout: REQUEST_TIMEOUT_MS,
      keepAliveTimeout: 30_000,
      keepAliveMaxTimeout: 60_000,
      connections: concurrency,
    });
    cachedProxyAgents.set(proxyUrl, agent);
  }
  return cachedProxyAgents.get(proxyUrl)!;
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
  if (proxyUrl) {
    logger.debug(`Using proxy: ${sanitizeUrl(proxyUrl)}`);
    finalOptions.dispatcher = getOrCreateProxyAgent(proxyUrl, tlsOptions);
  } else {
    finalOptions.dispatcher = getOrCreateAgent(tlsOptions);
  }

  // Transient error retry logic (502/503/504 with matching status text)
  const maxTransientRetries = options.disableTransientRetries ? 0 : 3;

  for (let attempt = 0; attempt <= maxTransientRetries; attempt++) {
    const response = await monkeyPatchFetch(finalUrl, finalOptions);

    if (
      !options.disableTransientRetries &&
      isTransientError(response) &&
      attempt < maxTransientRetries
    ) {
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
    default:
      return false;
  }
}

/**
 * Fetch with automatic retries and rate limit handling
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
