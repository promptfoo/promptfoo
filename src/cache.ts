import fs from 'fs';
import path from 'path';

import { createCache } from 'cache-manager';
import { Keyv } from 'keyv';
import KeyvFile from 'keyv-file';
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
    const stores = [];

    if (cacheType === 'disk' && enabled) {
      cachePath =
        getEnvString('PROMPTFOO_CACHE_PATH') || path.join(getConfigDirectoryPath(), 'cache');
      if (!fs.existsSync(cachePath)) {
        logger.info(`Creating cache folder at ${cachePath}.`);
        fs.mkdirSync(cachePath, { recursive: true });
      }

      // Try to use disk cache with keyv-file
      try {
        const store = new KeyvFile({
          filename: path.join(cachePath, 'cache.msgpack'),
        });
        const keyv = new Keyv({
          store,
          ttl: getEnvInt('PROMPTFOO_CACHE_TTL', 60 * 60 * 24 * 14) * 1000, // Convert to ms
        });
        stores.push(keyv);
      } catch (err) {
        logger.warn(
          `Failed to load disk cache module (${(err as Error).message}). ` +
            `Using memory cache instead. This is a known limitation on some systems ` +
            `due to dependency compatibility issues and does not affect functionality.`,
        );
        // Falls back to memory cache below
      }
    }

    cacheInstance = createCache({
      stores,
      ttl: getEnvInt('PROMPTFOO_CACHE_TTL', 60 * 60 * 24 * 14) * 1000, // Convert to ms
      refreshThreshold: 0, // Disable background refresh
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
  const cache = getCache();

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
  return getCache().clear();
}

export function isCacheEnabled() {
  return enabled;
}
