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
    // path aligned with its response decoding behavior. Preserve intentional
    // monkey patches of global fetch so tests and external instrumentation keep
    // observing requests.
    const fetch: typeof globalThis.fetch = shouldUseUndiciFetch(options)
      ? (undiciFetch as unknown as typeof globalThis.fetch)
      : globalThis.fetch;
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
