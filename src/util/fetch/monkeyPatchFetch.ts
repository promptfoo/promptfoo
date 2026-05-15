import { promisify } from 'util';
import { gzip } from 'zlib';

// biome-ignore lint/style/noRestrictedImports: this wrapper is the sanctioned fetch abstraction, and dispatcher-backed requests need Undici's decoder path.
import { fetch as undiciFetch } from 'undici';
import { CONSENT_ENDPOINT, EVENTS_ENDPOINT, R_ENDPOINT } from '../../constants';
import { CLOUD_API_HOST, cloudConfig } from '../../globalConfig/cloud';
import logger, { logRequestResponse } from '../../logger';

import type { FetchOptions } from './types';

const gzipAsync = promisify(gzip);
const defaultFetch = globalThis.fetch;

function isConnectionError(error: Error) {
  return (
    error instanceof TypeError &&
    error.message === 'fetch failed' &&
    // @ts-expect-error undici error cause
    error.cause?.stack?.includes('internalConnectMultiple')
  );
}

function shouldUseUndiciFetch(options?: FetchOptions): boolean {
  const dispatcher = (options as (FetchOptions & { dispatcher?: unknown }) | undefined)?.dispatcher;
  const hasNativeMultipartBody =
    typeof FormData !== 'undefined' && options?.body instanceof FormData;
  return Boolean(dispatcher) && !hasNativeMultipartBody && globalThis.fetch === defaultFetch;
}

function getUndiciFetchArgs(
  url: string | URL | Request,
  options: RequestInit,
): [string | URL | Request, RequestInit] {
  if (!(url instanceof Request)) {
    return [url, options];
  }

  // npm Undici does not accept Node's native Request instances as fetch inputs.
  // Preserve the Request semantics that would normally flow through global fetch
  // while handing Undici a URL string it can parse.
  const fetchOptions = {
    ...options,
    body: options.body ?? url.body ?? undefined,
    cache: options.cache ?? url.cache,
    credentials: options.credentials ?? url.credentials,
    headers: options.headers ?? url.headers,
    integrity: options.integrity ?? url.integrity,
    keepalive: options.keepalive ?? url.keepalive,
    method: options.method ?? url.method,
    mode: options.mode ?? url.mode,
    redirect: options.redirect ?? url.redirect,
    referrer: options.referrer ?? url.referrer,
    referrerPolicy: options.referrerPolicy ?? url.referrerPolicy,
    signal: options.signal ?? url.signal,
  } as RequestInit & { duplex?: 'half' };

  const duplex = (url as Request & { duplex?: 'half' }).duplex;
  if (duplex) {
    fetchOptions.duplex = duplex;
  }

  return [url.url, fetchOptions];
}

function getFetchInvocation(
  url: string | URL | Request,
  options: FetchOptions | undefined,
  requestOptions: RequestInit,
): {
  fetch: typeof globalThis.fetch;
  url: string | URL | Request;
  options: RequestInit;
} {
  if (!shouldUseUndiciFetch(options)) {
    return {
      fetch: globalThis.fetch,
      url,
      options: requestOptions,
    };
  }

  const [fetchUrl, fetchOptions] = getUndiciFetchArgs(url, requestOptions);
  return {
    fetch: undiciFetch as unknown as typeof globalThis.fetch,
    url: fetchUrl,
    options: fetchOptions,
  };
}

/**
 * Enhanced fetch wrapper that adds logging, authentication, error handling, and optional compression
 */

export function isPromptfooCloudApiHost(url: string | URL | Request): boolean {
  try {
    const targetUrl = url instanceof Request ? url.url : url.toString();
    return new URL(targetUrl).origin === CLOUD_API_HOST;
  } catch {
    return false;
  }
}

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

  if (isPromptfooCloudApiHost(url)) {
    const token = cloudConfig.getApiKey();
    opts.headers = {
      ...(opts.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }
  try {
    // Node's global fetch does not reliably decode compressed responses when it
    // receives an npm Undici dispatcher. Undici's own fetch keeps the dispatcher
    // path aligned with its response decoding behavior. Runtime replacements of
    // global fetch that differ from the module-load default still observe calls.
    const fetchInvocation = getFetchInvocation(url, options, opts);
    const response = await fetchInvocation.fetch(fetchInvocation.url, fetchInvocation.options);

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
          `Connection error, please check your network connectivity to the host: ${url} ${process.env.HTTP_PROXY || process.env.HTTPS_PROXY ? `or Proxy: ${process.env.HTTP_PROXY || process.env.HTTPS_PROXY}` : ''}`,
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
