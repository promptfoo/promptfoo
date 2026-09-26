import { promisify } from 'util';
import { gzip } from 'zlib';

import { CONSENT_ENDPOINT, EVENTS_ENDPOINT, R_ENDPOINT } from '../../constants';
import { cloudConfig } from '../../globalConfig/cloud';
import logger, { logRequestResponse } from '../../logger';
import { sanitizeUrl, sanitizeUrlForLogging } from '../sanitizer';
import { restrictCloudAuthRedirects, unwrapCloudAuthRedirectError } from './cloudAuthRedirects';
import type { Dispatcher } from 'undici';

import type { FetchOptions } from './types';

const gzipAsync = promisify(gzip);

export const PROMPTFOO_TEAM_ID_HEADER = 'x-promptfoo-team-id';

function isConnectionError(error: Error) {
  return (
    error instanceof TypeError &&
    error.message === 'fetch failed' &&
    // @ts-expect-error undici error cause
    error.cause?.stack?.includes('internalConnectMultiple')
  );
}

/** Extracts the request URL as a string. A `Request`'s `toString()` is "[object Request]", so read `.url`. */
export function getRequestUrlString(url: string | URL | Request): string {
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
export function isPromptfooCloudApiHost(url: string | URL | Request, apiHost?: string): boolean {
  try {
    const targetUrl = url instanceof Request ? url.url : url.toString();
    return new URL(targetUrl).origin === new URL(apiHost ?? cloudConfig.getApiHost()).origin;
  } catch {
    return false;
  }
}

/** Resolve the current credential for a request to the configured Cloud origin. */
export function getCloudBearerToken(url: string | URL | Request): string | undefined {
  const config = cloudConfig.getRequestConfig();
  return isPromptfooCloudApiHost(url, config.apiHost)
    ? config.headers?.[config.authHeaderName]
    : undefined;
}

function isCloudTaskPath(url: string | URL | Request): boolean {
  try {
    const pathname = new URL(getRequestUrlString(url)).pathname.replace(/\/+$/, '');
    return pathname.endsWith('/api/v1/task') || pathname.endsWith('/api/v1/task/harmful');
  } catch {
    return false;
  }
}

/** Returns the persisted CLI team for authenticated Cloud task requests. */
export function getCloudTaskTeamId(url: string | URL | Request): string | undefined {
  const config = cloudConfig.getRequestConfig();
  return config.headers && isPromptfooCloudApiHost(url, config.apiHost) && isCloudTaskPath(url)
    ? config.teamId
    : undefined;
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

function hasHeader(headers: HeadersInit | undefined, name: string): boolean {
  return new Headers(headers).has(name);
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

/** Capture Cloud authentication once, before cache lookup, asynchronous work, or retries. */
export function prepareCloudRequest(
  url: string | URL | Request,
  options: FetchOptions = {},
): FetchOptions {
  if (options.cloudAuthHeaderName !== undefined) {
    return options;
  }

  const callerHeaders = getEffectiveHeaders(url, options.headers);
  if (options.skipCloudAuthInjection) {
    // Candidate credentials can use a header that is not part of the saved session.
    const customAuth = Array.from(new Headers(callerHeaders)).some(
      ([name, value]) => name !== 'authorization' && /^Bearer\s/i.test(value),
    );
    return {
      ...options,
      cloudAuthHeaderName: null,
      ...(customAuth ? { restrictCloudAuthRedirects: true } : {}),
    };
  }

  let headers = callerHeaders;
  let getAuthHeaders = options.getAuthHeaders;
  let restrictRedirects = options.restrictCloudAuthRedirects;
  const config = cloudConfig.getRequestConfig();
  const isCloud = isPromptfooCloudApiHost(url, config.apiHost);
  const credential = config.headers?.[config.authHeaderName];
  let cloudAuthHeaderName = isCloud ? config.authHeaderName.toLowerCase() : null;
  const defaults: Record<string, string> = {};
  if (isCloud && credential) {
    // fetchWithProxy converts URL userinfo into Basic auth; it takes precedence over
    // automatic Authorization, just like an explicit caller-supplied header.
    const parsedUrl = new URL(getRequestUrlString(url));
    const hasUrlAuth = Boolean(parsedUrl.username || parsedUrl.password);
    if (
      !hasHeader(headers, config.authHeaderName) &&
      !(hasUrlAuth && cloudAuthHeaderName === 'authorization')
    ) {
      defaults[config.authHeaderName] = credential;
    }
    if (isCloudTaskPath(url) && config.teamId && !hasHeader(headers, PROMPTFOO_TEAM_ID_HEADER)) {
      defaults[PROMPTFOO_TEAM_ID_HEADER] = config.teamId;
    }
    for (const [name, value] of Object.entries(defaults)) {
      headers = setHeader(headers, name, value);
    }
    if (getAuthHeaders && Object.keys(defaults).length > 0) {
      const resolveHeaders = getAuthHeaders;
      getAuthHeaders = async (signal) => {
        const resolved = new Headers(defaults);
        new Headers(await resolveHeaders(signal)).forEach((value, name) =>
          resolved.set(name, value),
        );
        return resolved;
      };
    }
  }
  const value = new Headers(headers).get(config.authHeaderName);
  if (
    config.authHeaderName.toLowerCase() !== 'authorization' &&
    value &&
    /^Bearer\s/i.test(value) &&
    (isCloud || value.replace(/^Bearer\s+/i, '') === credential?.replace(/^Bearer\s+/i, ''))
  ) {
    cloudAuthHeaderName = config.authHeaderName.toLowerCase();
    restrictRedirects = true;
  }

  // Request-time authentication supplies defaults on each attempt; explicit headers still win.
  const preparedHeaders = getAuthHeaders ? callerHeaders : headers;
  return {
    ...options,
    ...(preparedHeaders ? { headers: preparedHeaders } : {}),
    ...(getAuthHeaders ? { getAuthHeaders } : {}),
    cloudAuthHeaderName,
    ...(restrictRedirects ? { restrictCloudAuthRedirects: true } : {}),
  };
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

  const {
    restrictCloudAuthRedirects: restrictRedirects,
    cloudAuthHeaderName,
    skipCloudAuthInjection,
    disableTransientRetries: _disableTransientRetries,
    getAuthHeaders: _getAuthHeaders,
    compress,
    ...opts
  }: FetchOptions & {
    dispatcher?: Pick<Dispatcher, 'dispatch'>;
  } = prepareCloudRequest(url, options);

  const originalBody = opts.body;

  // Handle compression if requested
  if (compress && opts.body && typeof opts.body === 'string') {
    try {
      const compressed = await gzipAsync(opts.body);
      opts.body = compressed as BodyInit;
      opts.headers = setHeader(getEffectiveHeaders(url, opts.headers), 'Content-Encoding', 'gzip');
    } catch (e) {
      logger.warn(`Failed to compress request body: ${e}`);
    }
  }

  // Request-time auth may resolve after preparation. Strengthen the policy from final
  // headers without consulting or injecting credentials from a newer saved session.
  const finalHeaders = new Headers(getEffectiveHeaders(url, opts.headers));
  const hasCustomCloudAuth = skipCloudAuthInjection
    ? Array.from(finalHeaders).some(
        ([name, value]) => name !== 'authorization' && /^Bearer\s/i.test(value),
      )
    : cloudAuthHeaderName &&
      cloudAuthHeaderName !== 'authorization' &&
      /^Bearer\s/i.test(finalHeaders.get(cloudAuthHeaderName) ?? '');
  if (restrictRedirects || hasCustomCloudAuth) {
    opts.dispatcher = restrictCloudAuthRedirects(urlString, opts.dispatcher);
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
      const safeUrl = sanitizeUrlForLogging(urlString);
      const safeError =
        `${JSON.stringify(e, Object.getOwnPropertyNames(e), 2)} ${e instanceof Error ? e.stack : ''}`
          .split(urlString)
          .join(safeUrl);
      logger.debug(`Error in fetch: ${safeError}`);
    }
    throw unwrapCloudAuthRedirectError(e);
  }
}
