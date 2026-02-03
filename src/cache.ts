import fs from 'fs';
import path from 'path';

import { createCache } from 'cache-manager';
import { Keyv } from 'keyv';
import { KeyvFile } from 'keyv-file';
import { runMigration, shouldRunMigration } from './cacheMigration';
import { getEnvBool, getEnvInt, getEnvString } from './envars';
import logger from './logger';
import { REQUEST_TIMEOUT_MS } from './providers/shared';
import { isTransientConnectionError } from './scheduler/types';
import { getConfigDirectoryPath } from './util/config/manage';
import { fetchWithRetries } from './util/fetch/index';
import { sleep } from './util/time';
import type { Cache } from 'cache-manager';

let cacheInstance: Cache | undefined;

let enabled = getEnvBool('PROMPTFOO_CACHE_ENABLED', true);

const cacheType =
  getEnvString('PROMPTFOO_CACHE_TYPE') || (getEnvString('NODE_ENV') === 'test' ? 'memory' : 'disk');

/** Default cache TTL: 14 days in seconds */
const DEFAULT_CACHE_TTL_SECONDS = 60 * 60 * 24 * 14;

/**
 * Get the cache TTL in milliseconds.
 * Reads from PROMPTFOO_CACHE_TTL environment variable (in seconds) or uses default.
 */
function getCacheTtlMs(): number {
  return getEnvInt('PROMPTFOO_CACHE_TTL', DEFAULT_CACHE_TTL_SECONDS) * 1000;
}

export function getCache() {
  if (!cacheInstance) {
    let cachePath = '';
    const stores = [];
    let migrationFailed = false;

    if (cacheType === 'disk' && enabled) {
      cachePath =
        getEnvString('PROMPTFOO_CACHE_PATH') || path.join(getConfigDirectoryPath(), 'cache');

      if (!fs.existsSync(cachePath)) {
        logger.info(`Creating cache folder at ${cachePath}.`);
        fs.mkdirSync(cachePath, { recursive: true });
      }

      const newCacheFile = path.join(cachePath, 'cache.json');

      // Run migration if needed
      if (shouldRunMigration(cachePath, newCacheFile)) {
        logger.info('[Cache] Migrating cache from v4 to v7...');

        try {
          const result = runMigration(cachePath, newCacheFile);

          if (result.success) {
            logger.info(
              `[Cache] Migration completed: ${result.stats.successCount} entries migrated, ` +
                `${result.stats.skippedExpired} expired`,
            );
            if (result.backupPath) {
              logger.info(`[Cache] Backup kept at: ${result.backupPath}`);
            }
          } else {
            logger.error(
              `[Cache] Migration failed: ${result.stats.errors.join(', ')}. ` +
                `Falling back to memory cache.`,
            );
            migrationFailed = true;
          }
        } catch (err) {
          logger.error(
            `[Cache] Migration error: ${(err as Error).message}. ` +
              `Falling back to memory cache.`,
          );
          migrationFailed = true;
        }
      }

      // Set up disk cache if migration succeeded or wasn't needed
      if (!migrationFailed) {
        try {
          const store = new KeyvFile({
            filename: newCacheFile,
          });

          const keyv = new Keyv({
            store,
            ttl: getCacheTtlMs(),
          });

          stores.push(keyv);
        } catch (err) {
          logger.warn(
            `[Cache] Failed to initialize disk cache: ${(err as Error).message}. ` +
              `Using memory cache instead.`,
          );
          // Falls through to memory cache
        }
      }
    }

    // Initialize cache (disk if stores array has items, memory otherwise)
    cacheInstance = createCache({
      stores,
      ttl: getCacheTtlMs(),
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

export async function fetchWithCache<T = unknown>(
  url: RequestInfo,
  options: RequestInit = {},
  timeout: number = REQUEST_TIMEOUT_MS,
  format: 'json' | 'text' = 'json',
  bust: boolean = false,
  maxRetries?: number,
): Promise<FetchWithCacheResult<T>> {
  if (!enabled || bust) {
    // Retry the fetch+body-read cycle for transient body-stream errors.
    // SSL/TLS errors can occur during response body streaming (after headers
    // arrive), which is outside fetchWithRetries' retry scope.  The try/catch
    // only wraps resp.text() so fetchWithRetries errors propagate directly
    // without multiplying retry counts.
    const maxBodyRetries = 2;
    for (let bodyAttempt = 0; bodyAttempt <= maxBodyRetries; bodyAttempt++) {
      const fetchStart = Date.now();
      // fetchWithRetries errors propagate directly — not caught by body retry
      const resp = await fetchWithRetries(url, options, timeout, maxRetries);
      const fetchLatencyMs = Date.now() - fetchStart;

      let respText: string;
      try {
        respText = await resp.text();
      } catch (err) {
        if (isTransientConnectionError(err as Error) && bodyAttempt < maxBodyRetries) {
          const backoffMs = Math.pow(2, bodyAttempt) * 1000;
          logger.debug(
            `Body read failed with transient error, retry ${bodyAttempt + 1}/${maxBodyRetries} after ${backoffMs}ms: ${(err as Error)?.message?.slice(0, 200)}`,
          );
          await sleep(backoffMs);
          continue;
        }
        throw err;
      }
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
    // Retry the fetch+body-read cycle for transient body-stream errors.
    // The try/catch only wraps response.text() so fetchWithRetries errors
    // propagate directly without multiplying retry counts.
    const maxBodyRetries = 2;
    let response!: Response;
    let responseText!: string;
    for (let bodyAttempt = 0; bodyAttempt <= maxBodyRetries; bodyAttempt++) {
      cached = false;
      const fetchStart = Date.now();
      // fetchWithRetries errors propagate directly — not caught by body retry
      response = await fetchWithRetries(url, options, timeout, maxRetries);
      fetchLatencyMs = Date.now() - fetchStart;
      try {
        responseText = await response.text();
        break;
      } catch (err) {
        if (isTransientConnectionError(err as Error) && bodyAttempt < maxBodyRetries) {
          const backoffMs = Math.pow(2, bodyAttempt) * 1000;
          logger.debug(
            `Body read failed with transient error, retry ${bodyAttempt + 1}/${maxBodyRetries} after ${backoffMs}ms: ${(err as Error)?.message?.slice(0, 200)}`,
          );
          await sleep(backoffMs);
          continue;
        }
        throw err;
      }
    }
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
