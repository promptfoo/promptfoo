import { promisify } from 'util';
import { brotliDecompress, gunzip, gzip, inflate } from 'zlib';

import { CONSENT_ENDPOINT, EVENTS_ENDPOINT, R_ENDPOINT } from '../../constants';
import { CLOUD_API_HOST, cloudConfig } from '../../globalConfig/cloud';
import logger, { logRequestResponse } from '../../logger';

import type { FetchOptions } from './types';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const inflateAsync = promisify(inflate);
const brotliDecompressAsync = promisify(brotliDecompress);

function isConnectionError(error: Error) {
  return (
    error instanceof TypeError &&
    error.message === 'fetch failed' &&
    // @ts-expect-error undici error cause
    error.cause?.stack?.includes('internalConnectMultiple')
  );
}

const SUPPORTED_DECODERS: Record<string, (buf: Buffer) => Promise<Buffer>> = {
  gzip: gunzipAsync,
  'x-gzip': gunzipAsync,
  deflate: inflateAsync,
  br: brotliDecompressAsync,
};

/**
 * Belt-and-suspenders for compressed responses. The pooled dispatchers compose
 * `interceptors.decompress()`, but on some Node versions (observed on Node 26)
 * that interceptor skips non-2xx responses and Node's bundled fetch does not
 * fall back to decoding Brotli over an external dispatcher — callers then see
 * raw compressed bytes. If the Content-Encoding header survives the fetch and
 * we recognize the algorithm, attempt to decode; if the body was already
 * decoded the decoder errors on missing/invalid magic bytes and we hand back
 * the original payload unchanged.
 */
export async function decompressResponseIfNeeded(response: Response): Promise<Response> {
  const encodingHeader = response.headers.get('content-encoding');
  if (!encodingHeader || !response.body) {
    return response;
  }
  const decode = SUPPORTED_DECODERS[encodingHeader.toLowerCase()];
  if (!decode) {
    return response;
  }

  const raw = Buffer.from(await response.arrayBuffer());
  if (raw.length === 0) {
    return response;
  }

  let decoded: Buffer;
  try {
    decoded = await decode(raw);
  } catch {
    return new Response(toArrayBuffer(raw), {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }

  const headers = new Headers(response.headers);
  headers.delete('content-encoding');
  headers.delete('content-length');
  return new Response(toArrayBuffer(decoded), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
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
    // biome-ignore lint/style/noRestrictedGlobals: we need raw fetch here
    const rawResponse = await fetch(url, opts);
    const response = await decompressResponseIfNeeded(rawResponse);

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
