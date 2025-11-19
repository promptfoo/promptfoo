import fs from 'fs';
import path from 'path';

import cacheManager from 'cache-manager';
import { getEnvBool, getEnvInt, getEnvString } from './envars';
import logger from './logger';
import { REQUEST_TIMEOUT_MS } from './providers/shared';
import { getConfigDirectoryPath } from './util/config/manage';
import { fetchWithRetries } from './util/fetch/index';
import type { Cache } from 'cache-manager';

let cacheInstance: Cache | undefined;

let enabled = getEnvBool('PROMPTFOO_CACHE_ENABLED', true);

const cacheType =
  getEnvString('PROMPTFOO_CACHE_TYPE') || (getEnvString('NODE_ENV') === 'test' ? 'memory' : 'disk');

export function getCache() {
  if (!cacheInstance) {
    let cachePath = '';
    let store: any = 'memory';

    if (cacheType === 'disk' && enabled) {
      cachePath =
        getEnvString('PROMPTFOO_CACHE_PATH') || path.join(getConfigDirectoryPath(), 'cache');
      if (!fs.existsSync(cachePath)) {
        logger.info(`Creating cache folder at ${cachePath}.`);
        fs.mkdirSync(cachePath, { recursive: true });
      }
      // Lazy load fsStore only when disk cache is actually needed.
      // This prevents module loading errors in tests and handles Windows compatibility issues.
      // Note: cache-manager-fs-hash depends on lockfile@1.x which uses signal-exit@3.x,
      // but other dependencies may pull in signal-exit@4.x which has breaking API changes.
      // If loading fails (common on Windows), we gracefully fall back to memory cache.
      try {
        store = require('cache-manager-fs-hash');
      } catch (err) {
        logger.warn(
          `Failed to load disk cache module (${(err as Error).message}). ` +
            `Using memory cache instead. This is a known limitation on some systems ` +
            `due to dependency compatibility issues and does not affect functionality.`,
        );
        store = 'memory';
      }
    }

    cacheInstance = cacheManager.caching({
      store,
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
  latencyMs?: number;
  deleteFromCache?: () => Promise<void>;
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
    const fetchStart = Date.now();
    const resp = await fetchWithRetries(url, options, timeout, maxRetries);
    const fetchLatencyMs = Date.now() - fetchStart;

    const respText = await resp.text();
    try {
      return {
        cached: false,
        data: format === 'json' ? JSON.parse(respText) : respText,
        status: resp.status,
        statusText: resp.statusText,
        headers: Object.fromEntries(resp.headers.entries()),
        latencyMs: fetchLatencyMs,
        deleteFromCache: async () => {
          // No-op when cache is disabled
        },
      };
    } catch {
      throw new Error(`Error parsing response as JSON: ${respText}`);
    }
  }

  const copy = Object.assign({}, options);
  delete copy.headers;
  const cacheKey = `fetch:v2:${url}:${JSON.stringify(copy)}`;
  const cache = await getCache();

  let cached = true;
  let errorResponse = null;
  let fetchLatencyMs: number | undefined;

  // Use wrap to ensure that the fetch is only done once even for concurrent invocations
  const cachedResponse = await cache.wrap(cacheKey, async () => {
    // Fetch the actual data and store it in the cache
    cached = false;
    const fetchStart = Date.now();
    const response = await fetchWithRetries(url, options, timeout, maxRetries);
    fetchLatencyMs = Date.now() - fetchStart;
    const responseText = await response.text();
    const headers = Object.fromEntries(response.headers.entries());

    try {
      const parsedData = format === 'json' ? JSON.parse(responseText) : responseText;
      const data = JSON.stringify({
        data: parsedData,
        status: response.status,
        statusText: response.statusText,
        headers,
        latencyMs: fetchLatencyMs,
      });
      if (!response.ok) {
        if (responseText == '') {
          errorResponse = JSON.stringify({
            data: `Empty Response: ${response.status}: ${response.statusText}`,
            status: response.status,
            statusText: response.statusText,
            headers,
            latencyMs: fetchLatencyMs,
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
      // Don't cache if the parsed data contains an error
      if (format === 'json' && parsedData?.error) {
        logger.debug(`Not caching ${url} because it contains an 'error' key: ${parsedData.error}`);
        return data;
      }
      logger.debug(`Storing ${url} response in cache with latencyMs=${fetchLatencyMs}: ${data}`);
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
    latencyMs: parsedResponse.latencyMs,
    deleteFromCache: async () => {
      await cache.del(cacheKey);
      logger.debug(`Evicted from cache: ${cacheKey}`);
    },
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
