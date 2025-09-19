import fs from 'fs';
import path from 'path';
import type { ConnectionOptions } from 'tls';

import { getProxyForUrl } from 'proxy-from-env';
import { Agent, ProxyAgent } from 'undici';
import cliState from '../../cliState';
import {
  CONSENT_ENDPOINT,
  EVENTS_ENDPOINT,
  R_ENDPOINT,
  VERSION,
} from '../../constants';
import { getEnvBool, getEnvInt, getEnvString } from '../../envars';
import { CLOUD_API_HOST, cloudConfig } from '../../globalConfig/cloud';
import logger, { logRequestResponse } from '../../logger';
import { REQUEST_TIMEOUT_MS } from '../../providers/shared';
import invariant from '../../util/invariant';
import { sleep } from '../../util/time';
import { sanitizeUrl } from '../sanitizer';

// Note: Global fetch override removed to prevent library users from being affected
// All promptfoo code should use fetchWithProxy, fetchWithTimeout, or fetchWithRetries instead

function isConnectionError(error: Error) {
  return (
    error instanceof TypeError &&
    error.message === 'fetch failed' &&
    // @ts-expect-error undici error cause
    error.cause?.stack?.includes('internalConnectMultiple')
  );
}
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

/**
 * Cache for agents to avoid recreating them on every request
 */
interface AgentCache {
  agent: Agent | ProxyAgent;
}

// Cache multiple agents based on their configuration
const agentCache = new Map<string, AgentCache>();

/**
 * Clear the cached agents - primarily for testing
 */
export function clearAgentCache(): void {
  agentCache.clear();
}

/**
 * Generate a cache key based on the agent configuration
 */
function getAgentCacheKey(
  proxyUrl: string,
  tlsOptions: ConnectionOptions,
  caCertPath?: string,
): string {
  // Create a deterministic key based on the configuration
  const tlsConfig = JSON.stringify({
    rejectUnauthorized: tlsOptions.rejectUnauthorized,
    ca: tlsOptions.ca ? 'present' : 'absent', // Don't include actual CA in key, just its presence
  });
  return `${proxyUrl}|${tlsConfig}|${caCertPath || ''}`;
}

/**
 * Get or create an agent based on the current configuration
 */
function getOrCreateAgent(url: string): Agent | ProxyAgent {
  const tlsOptions: ConnectionOptions = {
    rejectUnauthorized: !getEnvBool('PROMPTFOO_INSECURE_SSL', true),
  };

  // Support custom CA certificates
  const caCertPath = getEnvString('PROMPTFOO_CA_CERT_PATH');
  if (caCertPath) {
    try {
      const resolvedPath = path.resolve(cliState.basePath || '', caCertPath);
      const ca = fs.readFileSync(resolvedPath, 'utf8');
      tlsOptions.ca = ca;
      logger.debug(`Using custom CA certificate from ${resolvedPath}`);
    } catch (e) {
      logger.warn(`Failed to read CA certificate from ${caCertPath}: ${e}`);
    }
  }

  const proxyUrl = getProxyForUrl(url);
  const cacheKey = getAgentCacheKey(proxyUrl, tlsOptions, caCertPath);
  const cachedEntry = agentCache.get(cacheKey);
  if (cachedEntry) {
    if (proxyUrl) {
      logger.debug(`Using proxy: ${sanitizeUrl(proxyUrl)} (cached agent)`);
    }

    return cachedEntry.agent;
  }

  // Create a new agent
  let agent: Agent | ProxyAgent;
  if (proxyUrl) {
    logger.debug(`Using proxy: ${sanitizeUrl(proxyUrl)}`);
    agent = new ProxyAgent({
      uri: proxyUrl,
      proxyTls: tlsOptions,
      requestTls: tlsOptions,
      headersTimeout: REQUEST_TIMEOUT_MS,
    } as ProxyTlsOptions);
  } else {
    logger.debug('Creating new Agent (no proxy)');
    agent = new Agent({
      headersTimeout: REQUEST_TIMEOUT_MS,
    });
  }

  // Cache the agent
  agentCache.set(cacheKey, { agent });

  return agent;
}

export async function fetchWithProxy(
  url: RequestInfo,
  options: RequestInit = {},
): Promise<Response> {
  // Enhanced fetch with logging, authentication, proxy support, and error handling
  const NO_LOG_URLS = [R_ENDPOINT, CONSENT_ENDPOINT, EVENTS_ENDPOINT];
  // Don't log localhost health checks to reduce startup noise
  const isLocalHealthCheck =
    url.toString().includes('localhost') && url.toString().includes('/health');
  const logEnabled =
    !NO_LOG_URLS.some((logUrl) => url.toString().startsWith(logUrl)) && !isLocalHealthCheck;

  let finalUrl = url;
  let finalUrlString: string | undefined = undefined;

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

  // Determine if this is a promptfoo service that should receive version header
  const isPromptfooService =
    finalUrlString &&
    (finalUrlString.includes('promptfoo.app') ||
      finalUrlString.includes('promptfoo.dev') ||
      finalUrlString.includes(CLOUD_API_HOST));

  const finalOptions: RequestInit & { dispatcher?: any } = {
    ...options,
    headers: {
      ...(options.headers as Record<string, string>),
      // Only send version header to promptfoo services
      ...(isPromptfooService ? { 'x-promptfoo-version': VERSION } : {}),
    },
    dispatcher: getOrCreateAgent(finalUrlString),
  };

  // Handle cloud API authentication
  if (
    (typeof url === 'string' && url.startsWith(CLOUD_API_HOST)) ||
    (url instanceof URL && url.host === CLOUD_API_HOST.replace(/^https?:\/\//, ''))
  ) {
    const token = cloudConfig.getApiKey();
    finalOptions.headers = {
      ...(finalOptions.headers as Record<string, string>),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  // Handle URL credentials
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

  try {
    // biome-ignore lint/style/noRestrictedGlobals: we need to use global fetch in this enhanced wrapper
    const response = await fetch(finalUrl, finalOptions);

    if (logEnabled) {
      logRequestResponse({
        url: finalUrl.toString(),
        requestBody: finalOptions.body,
        requestMethod: finalOptions.method || 'GET',
        response,
      });
    }

    return response;
  } catch (e) {
    if (logEnabled) {
      logRequestResponse({
        url: finalUrl.toString(),
        requestBody: finalOptions.body,
        requestMethod: finalOptions.method || 'GET',
        response: null,
        error: true,
      });
      if (isConnectionError(e as Error)) {
        logger.error(
          `Connection error, please check your network connectivity to the host: ${finalUrl} ${process.env.HTTP_PROXY || process.env.HTTPS_PROXY ? `or Proxy: ${process.env.HTTP_PROXY || process.env.HTTPS_PROXY}` : ''}`,
        );
        throw e;
      }
      logger.error(
        `Error in fetch: ${JSON.stringify(e, Object.getOwnPropertyNames(e), 2)} ${e instanceof Error ? e.stack : ''}`,
      );
    }
    throw e;
  }
}

export function fetchWithTimeout(
  url: RequestInfo,
  options: RequestInit = {},
  timeout: number,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const { signal } = controller;
    const timeoutId = setTimeout(() => {
      controller.abort();
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
 */
export async function fetchWithRetries(
  url: RequestInfo,
  options: RequestInit = {},
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
          `Rate limited on URL ${url}: ${response.status} ${response.statusText}, waiting before retry ${i + 1}/${maxRetries}`,
        );
        await handleRateLimit(response);
        continue;
      }

      return response;
    } catch (error) {
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
