import { promisify } from 'util';
import { gzip } from 'zlib';

import { CONSENT_ENDPOINT, EVENTS_ENDPOINT, R_ENDPOINT } from '../../constants';
import { cloudConfig } from '../../globalConfig/cloud';
import logger, { logRequestResponse } from '../../logger';
import { sanitizeUrl } from '../sanitizer';

import type { FetchOptions } from './types';

const gzipAsync = promisify(gzip);

function isConnectionError(error: Error) {
  return (
    error instanceof TypeError &&
    error.message === 'fetch failed' &&
    // @ts-expect-error undici error cause
    error.cause?.stack?.includes('internalConnectMultiple')
  );
}

function getSafeUrlForConnectionLog(url: string | URL | Request): string {
  return sanitizeUrl(url instanceof Request ? url.url : url.toString());
}

function getSafeProxyForConnectionLog(): string {
  const proxyUrl = process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
  return proxyUrl ? `or Proxy: ${sanitizeUrl(proxyUrl)}` : '';
}

/**
 * Returns true when `url` targets the configured Promptfoo Cloud origin: the public
 * cloud host by default, or the on-prem host when one is configured via
 * `cloudConfig.getApiHost()`. Matching is scheme+host+port exact (`URL.origin`), so
 * look-alike hosts, HTTP downgrades, and different ports never match. Matching is
 * origin-wide — every path on the configured cloud origin is treated as cloud, so the
 * saved token may also reach sibling services hosted on that same origin. Fails closed
 * (returns false) when either URL is unparseable, so a misconfigured host never leaks
 * the token.
 */
export function isPromptfooCloudApiHost(url: string | URL | Request): boolean {
  try {
    const targetUrl = url instanceof Request ? url.url : url.toString();
    return new URL(targetUrl).origin === new URL(cloudConfig.getApiHost()).origin;
  } catch {
    return false;
  }
}

/**
 * Resolves the `Authorization` header value for a request to the configured Promptfoo
 * Cloud origin, or `undefined` when the request is not cloud-bound or no API key is
 * saved. Centralizing this keeps the live request (`monkeyPatchFetch`) and the cache
 * key (`getHeadersForCacheKey` in cache.ts) in lockstep.
 */
export function getCloudBearerToken(url: string | URL | Request): string | undefined {
  if (!isPromptfooCloudApiHost(url)) {
    return undefined;
  }
  const token = cloudConfig.getApiKey();
  return token ? `Bearer ${token}` : undefined;
}

/**
 * Case-insensitive check for a caller-supplied `Authorization` header. Request headers on
 * this path are always a plain object (see the `Record<string, string>` cast in
 * monkeyPatchFetch), so an object scan suffices. Used to avoid overriding an explicit
 * credential — e.g. the token being validated during cloud login/rotation.
 */
function hasAuthorizationHeader(headers: Record<string, string>): boolean {
  return Object.keys(headers).some((name) => name.toLowerCase() === 'authorization');
}

/**
 * Enhanced fetch wrapper that adds logging, authentication, error handling, and optional compression
 */
export async function monkeyPatchFetch(
  url: string | URL | Request,
  options?: FetchOptions,
): Promise<Response> {
  const NO_LOG_URLS = [R_ENDPOINT, CONSENT_ENDPOINT, EVENTS_ENDPOINT];
  const headers = (options?.headers as Record<string, string>) || {};
  const isSilent = headers['x-promptfoo-silent'] === 'true';
  const logEnabled = !NO_LOG_URLS.some((logUrl) => url.toString().startsWith(logUrl)) && !isSilent;

  const opts: RequestInit = {
    ...options,
  };

  const originalBody = opts.body;

  // Handle compression if requested
  if (options?.compress && opts.body && typeof opts.body === 'string') {
    try {
      const compressed = await gzipAsync(opts.body);
      opts.body = compressed as BodyInit;
      opts.headers = {
        ...(opts.headers || {}),
        'Content-Encoding': 'gzip',
      };
    } catch (e) {
      logger.warn(`Failed to compress request body: ${e}`);
    }
  }

  // Attach the saved cloud credential only for cloud-bound requests, and never
  // override an Authorization header the caller set explicitly — token
  // validation/rotation sends the token being validated, not the saved one.
  const cloudAuth = getCloudBearerToken(url);
  if (cloudAuth && !hasAuthorizationHeader(headers)) {
    opts.headers = {
      ...(opts.headers || {}),
      Authorization: cloudAuth,
    };
  }
  try {
    // biome-ignore lint/style/noRestrictedGlobals: we need raw fetch here
    const response = await fetch(url, opts);

    if (logEnabled) {
      void logRequestResponse({
        url: url.toString(),
        requestBody: originalBody,
        requestMethod: opts.method || 'GET',
        response,
      });
    }

    return response;
  } catch (e) {
    if (logEnabled) {
      void logRequestResponse({
        url: url.toString(),
        requestBody: opts.body,
        requestMethod: opts.method || 'GET',
        response: null,
      });
      if (isConnectionError(e as Error)) {
        logger.debug(
          `Connection error, please check your network connectivity to the host: ${getSafeUrlForConnectionLog(url)} ${getSafeProxyForConnectionLog()}`,
        );
        throw e;
      }
      logger.debug(
        `Error in fetch: ${JSON.stringify(e, Object.getOwnPropertyNames(e), 2)} ${e instanceof Error ? e.stack : ''}`,
      );
    }
    throw e;
  }
}
