import cacheManager from 'cache-manager';
import type { Cache } from 'cache-manager';
import fsStore from 'cache-manager-fs-hash';
import fs from 'fs';
import type { RequestInfo, RequestInit } from 'node-fetch';
import path from 'path';
import { getEnvBool, getEnvString, getEnvInt } from './envars';
import { fetchWithRetries } from './fetch';
import logger from './logger';
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
};

export async function fetchWithCache<T = any>(
  url: RequestInfo,
  options: RequestInit = {},
  timeout: number,
  format: 'json' | 'text' = 'json',
  bust: boolean = false,
): Promise<FetchWithCacheResult<T>> {
  if (!enabled || bust) {
    const resp = await fetchWithRetries(url, options, timeout);
    const respText = await resp.text();
    try {
      return {
        cached: false,
        data: format === 'json' ? JSON.parse(respText) : respText,
      };
    } catch {
      throw new Error(`Error parsing response as JSON: ${respText}`);
    }
  }

  const cache = await getCache();

  const copy = Object.assign({}, options);
  delete copy.headers;
  const cacheKey = `fetch:${url}:${JSON.stringify(copy)}`;

  let cached = true;
  let errorResponse = null;

  // Use wrap to ensure that the fetch is only done once even for concurrent invocations
  const cachedResponse = await cache.wrap(cacheKey, async () => {
    // Fetch the actual data and store it in the cache
    cached = false;
    const response = await fetchWithRetries(url, options, timeout);
    const responseText = await response.text();
    try {
      const data = JSON.stringify(format === 'json' ? JSON.parse(responseText) : responseText);
      if (!response.ok) {
        errorResponse = data;
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

  return {
    cached,
    data: JSON.parse((cachedResponse ?? errorResponse) as string) as T,
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
