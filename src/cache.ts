import cacheManager from 'cache-manager';
import type { Cache } from 'cache-manager';
import fsStore from 'cache-manager-fs-hash';
import fs from 'fs';
import path from 'path';
import { getEnvBool, getEnvString, getEnvInt } from './envars';
import { fetchWithRetries } from './fetch';
import logger from './logger';
import { REQUEST_TIMEOUT_MS } from './providers/shared';
import { getConfigDirectoryPath } from './util/config/manage';

let cacheInstance: Cache | undefined;

let enabled = getEnvBool('PROMPTFOO_CACHE_ENABLED', true);

const cacheType =
  getEnvString('PROMPTFOO_CACHE_TYPE') || (getEnvString('NODE_ENV') === 'test' ? 'memory' : 'disk');

export function getCache() {
  if (!cacheInstance) {
    let cachePath = '';
    if (cacheType === 'disk' && enabled) {
      cachePath =
        getEnvString('PROMPTFOO_CACHE_PATH') || path.join(getConfigDirectoryPath(), 'cache');
      if (!fs.existsSync(cachePath)) {
        logger.info(`Creating cache folder at ${cachePath}.`);
        fs.mkdirSync(cachePath, { recursive: true });
      }
    }
    cacheInstance = cacheManager.caching({
      store: cacheType === 'disk' && enabled ? fsStore : 'memory',
      options: {
        max: getEnvInt('PROMPTFOO_CACHE_MAX_FILE_COUNT', 10_000), // number of files
        path: cachePath,
        ttl: getEnvInt('PROMPTFOO_CACHE_TTL', 60 * 60 * 24 * 14), // in seconds, 14 days
        maxsize: getEnvInt('PROMPTFOO_CACHE_MAX_SIZE', 1e7), // in bytes, 10mb
        //zip: true, // whether to use gzip compression
      },
    });
  }
  return cacheInstance;
}

export type FetchWithCacheResult<T> = {
  data: T;
  cached: boolean;
  status: number;
  statusText: string;
  headers?: Record<string, string>;
};

export async function fetchWithCache<T = any>(
  url: RequestInfo,
  options: RequestInit = {},
  timeout: number = REQUEST_TIMEOUT_MS,
  format: 'json' | 'text' = 'json',
  bust: boolean = false,
  maxRetries?: number,
): Promise<FetchWithCacheResult<T>> {
  if (!enabled || bust) {
    const resp = await fetchWithRetries(url, options, timeout, maxRetries);

    const respText = await resp.text();
    try {
      return {
        cached: false,
        data: format === 'json' ? JSON.parse(respText) : respText,
        status: resp.status,
        statusText: resp.statusText,
        headers: Object.fromEntries(resp.headers.entries()),
      };
    } catch {
      throw new Error(`Error parsing response as JSON: ${respText}`);
    }
  }

  const cache = await getCache();

  const copy = Object.assign({}, options);
  delete copy.headers;
  const cacheKey = `fetch:v2:${url}:${JSON.stringify(copy)}`;

  let cached = true;
  let errorResponse = null;

  // Use wrap to ensure that the fetch is only done once even for concurrent invocations
  const cachedResponse = await cache.wrap(cacheKey, async () => {
    // Fetch the actual data and store it in the cache
    cached = false;
    const response = await fetchWithRetries(url, options, timeout, maxRetries);
    const responseText = await response.text();
    const headers = Object.fromEntries(response.headers.entries());

    try {
      const data = JSON.stringify({
        data: format === 'json' ? JSON.parse(responseText) : responseText,
        status: response.status,
        statusText: response.statusText,
        headers,
      });
      if (!response.ok) {
        if (responseText == '') {
          errorResponse = JSON.stringify({
            data: `Empty Response: ${response.status}: ${response.statusText}`,
            status: response.status,
            statusText: response.statusText,
            headers,
          });
        } else {
          errorResponse = data;
        }
        // Don't cache error responses
        return;
      }
      if (!data) {
        // Don't cache empty responses
        return;
      }
      logger.debug(`Storing ${url} response in cache: ${data}`);
      return data;
    } catch (err) {
      throw new Error(
        `Error parsing response from ${url}: ${
          (err as Error).message
        }. Received text: ${responseText}`,
      );
    }
  });

  if (cached && cachedResponse) {
    logger.debug(`Returning cached response for ${url}: ${cachedResponse}`);
  }

  const parsedResponse = JSON.parse((cachedResponse ?? errorResponse) as string);
  return {
    cached,
    data: parsedResponse.data as T,
    status: parsedResponse.status,
    statusText: parsedResponse.statusText,
    headers: parsedResponse.headers,
  };
}

export function enableCache() {
  enabled = true;
}

export function disableCache() {
  enabled = false;
}

export async function clearCache() {
  return getCache().reset();
}

export function isCacheEnabled() {
  return enabled;
}
