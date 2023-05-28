import path from 'node:path';

import cacheManager from 'cache-manager';
import fsStore from 'cache-manager-fs-hash';
import fetch, { Response } from 'node-fetch';

import logger from './logger.js';
import { getConfigDirectoryPath, fetchWithTimeout } from './util.js';

import type { Cache } from 'cache-manager';
import type { RequestInfo, RequestInit } from 'node-fetch';

let diskCache: Cache | undefined;

let enabled =
  typeof process.env.CACHE_ENABLED === 'undefined' ? true : Boolean(process.env.USE_CACHE);

function getCache() {
  if (!diskCache) {
    diskCache = cacheManager.caching({
      store: process.env.NODE_ENV === 'test' ? 'memory' : fsStore,
      options: {
        max: process.env.CACHE_MAX_FILE_COUNT || 10_000, // number of files
        path: process.env.CACHE_PATH || path.join(getConfigDirectoryPath(), 'cache'),
        ttl: process.env.CACHE_TTL || 60 * 60 * 24 * 14, // in seconds, 14 days
        maxsize: process.env.CACHE_MAX_SIZE || 1e7, // in bytes, 10mb
        //zip: true, // whether to use gzip compression
      },
    });
  }
  return diskCache;
}

export async function fetchJsonWithCache(
  url: RequestInfo,
  options: RequestInit = {},
  timeout: number,
): Promise<Response> {
  if (!enabled) {
    const resp = await fetchWithTimeout(url, options, timeout);
    return resp.json();
  }

  const cache = await getCache();

  const copy = Object.assign({}, options);
  delete copy.headers;
  const cacheKey = `fetch:${url}:${JSON.stringify(copy)}`;

  // Try to get the cached response
  const cachedResponse = await cache.get(cacheKey);

  if (cachedResponse) {
    logger.debug(`Returning cached response for ${url}: ${cachedResponse}`);
    return JSON.parse(cachedResponse as string);
  }

  // Fetch the actual data and store it in the cache
  const response = await fetchWithTimeout(url, options, timeout);
  try {
    const data = await response.json();
    logger.debug(`Storing ${url} response in cache: ${data}`);
    await cache.set(cacheKey, JSON.stringify(data));
    return data;
  } catch (err) {
    throw new Error(`Error parsing response from ${url}: ${err}`);
  }
}

export function enableCache() {
  enabled = true;
}

export function disableCache() {
  logger.info('Cache is disabled.');
  enabled = false;
}
