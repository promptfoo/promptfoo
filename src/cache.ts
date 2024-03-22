import fs from 'fs';
import path from 'path';

import cacheManager from 'cache-manager';
import fsStore from 'cache-manager-fs-hash';

import logger from './logger';
import { fetchWithRetries } from './fetch';
import { getConfigDirectoryPath } from './util';

import type { Cache } from 'cache-manager';
import type { RequestInfo, RequestInit } from 'node-fetch';

let cacheInstance: Cache | undefined;

let enabled =
  typeof process.env.PROMPTFOO_CACHE_ENABLED === 'undefined'
    ? true
    : process.env.PROMPTFOO_CACHE_ENABLED === '1' ||
      process.env.PROMPTFOO_CACHE_ENABLED === 'true' ||
      process.env.PROMPTFOO_CACHE_ENABLED === 'yes';

const cacheType =
  process.env.PROMPTFOO_CACHE_TYPE || (process.env.NODE_ENV === 'test' ? 'memory' : 'disk');

export function getCache() {
  if (!cacheInstance) {
    const cachePath =
      process.env.PROMPTFOO_CACHE_PATH || path.join(getConfigDirectoryPath(), 'cache');
    if (!fs.existsSync(cachePath)) {
      logger.info(`Creating cache folder at ${cachePath}.`);
      fs.mkdirSync(cachePath, { recursive: true });
    }
    cacheInstance = cacheManager.caching({
      store: cacheType === 'disk' ? fsStore : 'memory',
      options: {
        max: process.env.PROMPTFOO_CACHE_MAX_FILE_COUNT || 10_000, // number of files
        path: cachePath,
        ttl: process.env.PROMPTFOO_CACHE_TTL || 60 * 60 * 24 * 14, // in seconds, 14 days
        maxsize: process.env.PROMPTFOO_CACHE_MAX_SIZE || 1e7, // in bytes, 10mb
        //zip: true, // whether to use gzip compression
      },
    });
  }
  return cacheInstance;
}

export async function fetchWithCache(
  url: RequestInfo,
  options: RequestInit = {},
  timeout: number,
  format: 'json' | 'text' = 'json',
  bust: boolean = false,
): Promise<{ data: any; cached: boolean }> {
  if (!enabled || bust) {
    const resp = await fetchWithRetries(url, options, timeout);
    const respText = await resp.text();
    try {
      return {
        cached: false,
        data: format === 'json' ? JSON.parse(respText) : respText,
      };
    } catch (error) {
      throw new Error(`Error parsing response as JSON: ${respText}`);
    }
  }

  const cache = await getCache();

  const copy = Object.assign({}, options);
  delete copy.headers;
  const cacheKey = `fetch:${url}:${JSON.stringify(copy)}`;

  // Try to get the cached response
  const cachedResponse = await cache.get(cacheKey);

  if (cachedResponse) {
    logger.debug(`Returning cached response for ${url}: ${cachedResponse}`);
    return {
      cached: true,
      data: JSON.parse(cachedResponse as string),
    };
  }

  // Fetch the actual data and store it in the cache
  const response = await fetchWithRetries(url, options, timeout);
  const responseText = await response.text();
  try {
    const data = format === 'json' ? JSON.parse(responseText) : responseText;
    if (response.ok) {
      logger.debug(`Storing ${url} response in cache: ${JSON.stringify(data)}`);
      await cache.set(cacheKey, JSON.stringify(data));
    }
    return {
      cached: false,
      data,
    };
  } catch (err) {
    throw new Error(
      `Error parsing response from ${url}: ${
        (err as Error).message
      }. Received text: ${responseText}`,
    );
  }
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
