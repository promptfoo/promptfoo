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

/** Extracts the request URL as a string. A `Request`'s `toString()` is "[object Request]", so read `.url`. */
function getRequestUrlString(url: string | URL | Request): string {
  return url instanceof Request ? url.url : url.toString();
}

function matchesNoLogUrl(url: string, noLogUrl: string): boolean {
  try {
    const target = new URL(url);
    const excluded = new URL(noLogUrl);
    if (target.origin !== excluded.origin) {
      return false;
    }

    const excludedPath = excluded.pathname.replace(/\/+$/, '');
    return (
      excludedPath === '' ||
      target.pathname === excludedPath ||
      target.pathname.startsWith(`${excludedPath}/`)
    );
  } catch {
    return false;
  }
}

function getSafeUrlForConnectionLog(url: string | URL | Request): string {
  return sanitizeUrl(getRequestUrlString(url));
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
 * Resolves the caller-supplied headers for a request: the explicit `options.headers` when
 * present, otherwise the headers carried by a `Request` URL.
 *
 * `monkeyPatchFetch`'s only in-repo caller (`fetchWithProxy`) always normalizes headers to
 * a plain object, but the function is exported and typed to accept any `HeadersInit` /
 * `Request`, so the helpers here preserve every shape rather than assuming a `Record`.
 */
function getEffectiveHeaders(
  url: string | URL | Request,
  headers: HeadersInit | undefined,
): HeadersInit | undefined {
  return headers ?? (url instanceof Request ? url.headers : undefined);
}

/** Case-insensitive check for a caller-supplied `Authorization` header (any `HeadersInit` shape). */
function hasAuthorizationHeader(headers: HeadersInit | undefined): boolean {
  return new Headers(headers).has('authorization');
}

/**
 * Returns `headers` with `name: value` set. Plain objects retain their shape, while a
 * `Headers` instance or `[name, value][]` array is normalized through `Headers` so existing
 * entries are never dropped (a naive object spread would discard them).
 */
function setHeader(headers: HeadersInit | undefined, name: string, value: string): HeadersInit {
  if (headers instanceof Headers || Array.isArray(headers)) {
    const merged = new Headers(headers);
    merged.set(name, value);
    return merged;
  }
  return { ...(headers ?? {}), [name]: value };
}

/**
 * Enhanced fetch wrapper that adds logging, authentication, error handling, and optional compression
 */
export async function monkeyPatchFetch(
  url: string | URL | Request,
  options?: FetchOptions,
): Promise<Response> {
  const NO_LOG_URLS = [R_ENDPOINT, CONSENT_ENDPOINT, EVENTS_ENDPOINT];
  const urlString = getRequestUrlString(url);
  const callerHeaders = getEffectiveHeaders(url, options?.headers);
  const isSilent = new Headers(callerHeaders).get('x-promptfoo-silent') === 'true';
  const logEnabled = !NO_LOG_URLS.some((logUrl) => matchesNoLogUrl(urlString, logUrl)) && !isSilent;

  const opts: RequestInit = {
    ...options,
  };

  const originalBody = opts.body;

  // Handle compression if requested
  if (options?.compress && opts.body && typeof opts.body === 'string') {
    try {
      const compressed = await gzipAsync(opts.body);
      opts.body = compressed as BodyInit;
      opts.headers = setHeader(getEffectiveHeaders(url, opts.headers), 'Content-Encoding', 'gzip');
    } catch (e) {
      logger.warn(`Failed to compress request body: ${e}`);
    }
  }

  // Attach the saved cloud credential only for cloud-bound requests, and never
  // override an Authorization header the caller set explicitly — token
  // validation/rotation sends the token being validated, not the saved one.
  const cloudAuth = getCloudBearerToken(url);
  const effectiveHeaders = getEffectiveHeaders(url, opts.headers);
  if (cloudAuth && !hasAuthorizationHeader(effectiveHeaders)) {
    opts.headers = setHeader(effectiveHeaders, 'Authorization', cloudAuth);
  }
  try {
    // biome-ignore lint/style/noRestrictedGlobals: we need raw fetch here
    const response = await fetch(url, opts);

    if (logEnabled) {
      void logRequestResponse({
        url: urlString,
        requestBody: originalBody,
        requestMethod: opts.method || 'GET',
        response,
      });
    }

    return response;
  } catch (e) {
    if (logEnabled) {
      void logRequestResponse({
        url: urlString,
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
