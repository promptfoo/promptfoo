import { promisify } from 'util';
import { gzip } from 'zlib';

import { CONSENT_ENDPOINT, EVENTS_ENDPOINT, R_ENDPOINT } from '../../constants';
import { CLOUD_API_HOST, cloudConfig } from '../../globalConfig/cloud';
import logger, { logRequestResponse } from '../../logger';

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

function shouldAttachCloudAuth(url: string | URL | Request, skipCloudAuth?: boolean): boolean {
  return !skipCloudAuth && isPromptfooCloudApiHost(url);
}

function hasAuthorizationHeader(headers: HeadersInit | undefined): boolean {
  if (!headers) {
    return false;
  }

  if (headers instanceof Headers) {
    return headers.has('authorization');
  }

  if (Array.isArray(headers)) {
    return headers.some(([name]) => name.toLowerCase() === 'authorization');
  }

  return Object.keys(headers).some((name) => name.toLowerCase() === 'authorization');
}

function headersToRecord(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) {
    return {};
  }

  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }

  return { ...headers };
}

function attachCloudAuthHeader(
  url: string | URL | Request,
  skipCloudAuth: boolean | undefined,
  opts: RequestInit,
): void {
  if (!shouldAttachCloudAuth(url, skipCloudAuth) || hasAuthorizationHeader(opts.headers)) {
    return;
  }

  const token = cloudConfig.getApiKey();
  opts.headers = {
    ...headersToRecord(opts.headers),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export async function monkeyPatchFetch(
  url: string | URL | Request,
  options?: FetchOptions,
): Promise<Response> {
  const NO_LOG_URLS = [R_ENDPOINT, CONSENT_ENDPOINT, EVENTS_ENDPOINT];
  const { skipCloudAuth, ...requestOptions } = options ?? {};
  const headers = (requestOptions.headers as Record<string, string>) || {};
  const isSilent = headers['x-promptfoo-silent'] === 'true';
  const logEnabled = !NO_LOG_URLS.some((logUrl) => url.toString().startsWith(logUrl)) && !isSilent;

  const opts: RequestInit = {
    ...requestOptions,
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

  attachCloudAuthHeader(url, skipCloudAuth, opts);
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
