import { FlatCache } from 'flat-cache';
import fs from 'fs';
import path from 'path';
import { getEnvBool, getEnvString, getEnvInt } from './envars';
import { fetchWithRetries } from './fetch';
import logger from './logger';
import { REQUEST_TIMEOUT_MS } from './providers/shared';
import { getConfigDirectoryPath } from './util/config/manage';

// Define the Store interface that cache-manager expects
interface Store {
  name: string;
}

// Define a Cache interface that matches what providers expect
export interface Cache {
  store: Store;
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttl?: number): Promise<void>;
  del(key: string): Promise<void>;
  reset(): Promise<void>;
  wrap<T>(key: string, fn: () => Promise<T>): Promise<T>;
}

// Create a wrapper class that implements the Cache interface using FlatCache
class CacheWrapper implements Cache {
  private flatCache: FlatCache;
  public store: Store;

  constructor(flatCache: FlatCache, isMemory: boolean = false) {
    this.flatCache = flatCache;
    this.store = {
      name: isMemory ? 'memory' : 'fs-hash',
    };
  }

  async get<T>(key: string): Promise<T | undefined> {
    const value = this.flatCache.getKey(key);
    if (value === undefined) {
      return undefined;
    }
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as T;
    }
  }

  async set<T>(key: string, value: T | undefined | null): Promise<void> {
    if (value === undefined || value === null) {
      this.flatCache.setKey(key, undefined);
    } else {
      this.flatCache.setKey(key, typeof value === 'string' ? value : JSON.stringify(value));
    }
    this.flatCache.save();
  }

  async del(key: string): Promise<void> {
    this.flatCache.setKey(key, undefined);
    this.flatCache.save();
  }

  async reset(): Promise<void> {
    this.flatCache.clear();
    this.flatCache.save();
  }

  async wrap<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }
    const value = await fn();
    await this.set(key, value);
    return value;
  }
}

let cacheInstance: Cache | undefined;

let enabled = getEnvBool('PROMPTFOO_CACHE_ENABLED', true);

const cacheType =
  getEnvString('PROMPTFOO_CACHE_TYPE') || (getEnvString('NODE_ENV') === 'test' ? 'memory' : 'disk');

export function getCache(): Cache {
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

    const cacheId = 'promptfoo-cache';
    const options = {
      ttl: getEnvInt('PROMPTFOO_CACHE_TTL', 60 * 60 * 24 * 14), // in seconds, 14 days
      lruSize: getEnvInt('PROMPTFOO_CACHE_MAX_FILE_COUNT', 10_000), // number of files
      expirationInterval: 60 * 60 * 1000, // 1 hour in milliseconds
      persistInterval: 5 * 60 * 1000, // 5 minutes in milliseconds
      cacheDir: cachePath,
    };

    const flatCache = new FlatCache(options);
    flatCache.load(cacheId);
    cacheInstance = new CacheWrapper(flatCache, cacheType === 'memory');
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

  const cache = getCache();

  const copy = Object.assign({}, options);
  delete copy.headers;
  const cacheKey = `fetch:v2:${url}:${JSON.stringify(copy)}`;

  let cached = true;
  let errorResponse = null;

  // Check if we have a cached response
  const cachedResponse = await cache.get<string>(cacheKey);

  if (!cachedResponse) {
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
        return JSON.parse(errorResponse || '{}');
      }
      if (!data) {
        // Don't cache empty responses
        return JSON.parse(errorResponse || '{}');
      }
      logger.debug(`Storing ${url} response in cache: ${data}`);
      await cache.set(cacheKey, data);
    } catch (err) {
      throw new Error(
        `Error parsing response from ${url}: ${
          (err as Error).message
        }. Received text: ${responseText}`,
      );
    }
  }

  if (cached && cachedResponse) {
    logger.debug(`Returning cached response for ${url}: ${cachedResponse}`);
  }

  const parsedResponse = JSON.parse(cachedResponse as string);
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
  const cache = getCache();
  await cache.reset();
}

export function isCacheEnabled() {
  return enabled;
}
