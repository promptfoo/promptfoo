import { promisify } from 'util';
import { gzip } from 'zlib';

import { CONSENT_ENDPOINT, EVENTS_ENDPOINT, R_ENDPOINT } from '../../constants';
import { CLOUD_API_HOST, cloudConfig } from '../../globalConfig/cloud';
import logger, { logRequestResponse } from '../../logger';

import type { FetchOptions } from './types';

const gzipAsync = promisify(gzip);

const NO_LOG_URLS = [R_ENDPOINT, CONSENT_ENDPOINT, EVENTS_ENDPOINT];

function isConnectionError(error: Error) {
  return (
    error instanceof TypeError &&
    error.message === 'fetch failed' &&
    // @ts-expect-error undici error cause
    error.cause?.stack?.includes('internalConnectMultiple')
  );
}

function isLogEnabled(url: string | URL | Request, headers: Record<string, string>): boolean {
  const isSilent = headers['x-promptfoo-silent'] === 'true';
  return !NO_LOG_URLS.some((logUrl) => url.toString().startsWith(logUrl)) && !isSilent;
}

async function applyCompression(opts: RequestInit): Promise<RequestInit> {
  if (!opts.body || typeof opts.body !== 'string') {
    return opts;
  }
  try {
    const compressed = await gzipAsync(opts.body);
    return {
      ...opts,
      body: compressed as BodyInit,
      headers: {
        ...(opts.headers || {}),
        'Content-Encoding': 'gzip',
      },
    };
  } catch (e) {
    logger.warn(`Failed to compress request body: ${e}`);
    return opts;
  }
}

function applyCloudAuth(url: string | URL | Request, opts: RequestInit): RequestInit {
  const isCloudUrl =
    (typeof url === 'string' && url.startsWith(CLOUD_API_HOST)) ||
    (url instanceof URL && url.host === CLOUD_API_HOST.replace(/^https?:\/\//, ''));

  if (!isCloudUrl) {
    return opts;
  }

  const token = cloudConfig.getApiKey();
  return {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };
}

function logFetchError(url: string | URL | Request, opts: RequestInit, e: unknown): void {
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
    return;
  }

  logger.debug(
    `Error in fetch: ${JSON.stringify(e, Object.getOwnPropertyNames(e), 2)} ${e instanceof Error ? e.stack : ''}`,
  );
}

/**
 * Enhanced fetch wrapper that adds logging, authentication, error handling, and optional compression
 */

export async function monkeyPatchFetch(
  url: string | URL | Request,
  options?: FetchOptions,
): Promise<Response> {
  const headers = (options?.headers as Record<string, string>) || {};
  const logEnabled = isLogEnabled(url, headers);

  let opts: RequestInit = { ...options };
  const originalBody = opts.body;

  if (options?.compress) {
    opts = await applyCompression(opts);
  }

  opts = applyCloudAuth(url, opts);

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
      logFetchError(url, opts, e);
    }
    throw e;
  }
}
