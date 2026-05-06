/**
 * Cache helpers exposed through the Node.js package.
 *
 * Use this namespace when custom providers need shared cache access or when
 * related evals need isolated cache namespaces.
 *
 * @example
 * ```ts
 * import { cache } from 'promptfoo';
 *
 * await cache.withCacheNamespace('preview', async () => {
 *   await cache.getCache().set('last-provider', 'openai:chat:gpt-5.5');
 * });
 * ```
 *
 * @module
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'fs';
import path from 'path';

import { createCache } from 'cache-manager';
import { Keyv } from 'keyv';
import { KeyvFile } from 'keyv-file';
import { getEnvBool, getEnvInt, getEnvString } from './envars';
import { cloudConfig } from './globalConfig/cloud';
import logger from './logger';
import { getRequestTimeoutMs } from './providers/shared';
import { getConfigDirectoryPath } from './util/config/manage';
import { sha256 } from './util/createHash';
import { isTransientConnectionError } from './util/fetch/errors';
import { fetchWithRetries, getFetchWithProxyHeaders } from './util/fetch/index';
import { isPromptfooCloudApiHost } from './util/fetch/monkeyPatchFetch';
import { sleep } from './util/time';
import type { Cache } from 'cache-manager';

let cacheInstance: Cache | undefined;
const namespacedCacheInstances = new Map<string, Cache>();

const cacheNamespaceStorage = new AsyncLocalStorage<{ namespace: string }>();
const cacheEnabledStorage = new AsyncLocalStorage<{ enabled: boolean }>();

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

/**
 * Return the active promptfoo cache instance.
 *
 * Most callers should prefer the higher-level cache helpers. Reach for the raw
 * cache only when a custom provider needs to manage its own cached values.
 *
 * @returns The active cache instance for the current namespace.
 *
 * @example
 * ```ts
 * import { cache } from 'promptfoo';
 *
 * const value = await cache.getCache().get('provider:last-response');
 * ```
 *
 * @public
 */
export function getCache() {
  const namespace = cacheNamespaceStorage.getStore()?.namespace;
  if (namespace) {
    return getNamespacedCache(namespace);
  }
  return getCacheInstance();
}

function getCacheInstance() {
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

      const newCacheFile = path.join(cachePath, 'cache.json');

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

    // Initialize cache (disk if stores array has items, memory otherwise)
    cacheInstance = createCache({
      stores,
      ttl: getCacheTtlMs(),
      refreshThreshold: 0, // Disable background refresh
    });
  }
  return cacheInstance;
}

function getNamespacedCache(namespace: string) {
  const cachedNamespaceInstance = namespacedCacheInstances.get(namespace);
  if (cachedNamespaceInstance) {
    return cachedNamespaceInstance;
  }

  const cache = getCacheInstance();
  const namespacedCache = {
    ...cache,
    get: (key: string) => cache.get(getScopedCacheKey(key, namespace)),
    set: (key: string, value: unknown, ttl?: number) =>
      cache.set(getScopedCacheKey(key, namespace), value, ttl),
    del: (key: string) => cache.del(getScopedCacheKey(key, namespace)),
    mget: <T>(keys: string[]) =>
      cache.mget<T>(keys.map((key) => getScopedCacheKey(key, namespace))),
    mset: async <T>(list: Array<{ key: string; value: T; ttl?: number }>) => {
      const scopedList = list.map(({ key, value, ttl }) => ({
        key: getScopedCacheKey(key, namespace),
        value,
        ttl,
      }));
      const savedList = await cache.mset<T>(scopedList);
      return (savedList ?? scopedList).map(({ key, value, ttl }) => ({
        key: getUnscopedCacheKey(key, namespace),
        value,
        ttl,
      }));
    },
    mdel: (keys: string[]) => cache.mdel(keys.map((key) => getScopedCacheKey(key, namespace))),
    ttl: (key: string) => cache.ttl(getScopedCacheKey(key, namespace)),
    clear: () => clearNamespacedCache(cache, namespace),
    wrap: (...args: Parameters<Cache['wrap']>) =>
      cache.wrap(
        getScopedCacheKey(args[0] as string, namespace),
        ...(args.slice(1) as Parameters<Cache['wrap']> extends [string, ...infer Rest]
          ? Rest
          : never),
      ),
  } as Cache;

  namespacedCacheInstances.set(namespace, namespacedCache);
  return namespacedCache;
}

function getCurrentCacheNamespace() {
  return cacheNamespaceStorage.getStore()?.namespace;
}

/**
 * Build the implementation-level cache key for the current namespace.
 *
 * @internal
 */
export function getScopedCacheKey(cacheKey: string, namespace = getCurrentCacheNamespace()) {
  return namespace ? `${namespace}:${cacheKey}` : cacheKey;
}

function getUnscopedCacheKey(cacheKey: string, namespace: string) {
  const namespacePrefix = `${namespace}:`;
  return cacheKey.startsWith(namespacePrefix) ? cacheKey.slice(namespacePrefix.length) : cacheKey;
}

async function clearNamespacedCache(cache: Cache, namespace: string) {
  const namespacePrefix = `${namespace}:`;

  for (const store of cache.stores) {
    if (!store.iterator) {
      throw new Error(
        `[Cache] Cannot clear namespace ${namespace} because a cache store does not support key iteration.`,
      );
    }

    const keysToDelete: string[] = [];
    for await (const [key] of store.iterator(undefined)) {
      if (typeof key === 'string' && key.startsWith(namespacePrefix)) {
        keysToDelete.push(key);
      }
    }

    if (keysToDelete.length === 0) {
      continue;
    }

    try {
      if (store.deleteMany) {
        await store.deleteMany(keysToDelete);
      } else {
        await Promise.all(keysToDelete.map((key) => store.delete(key)));
      }
    } catch (err) {
      throw new Error(
        `[Cache] Failed to clear ${keysToDelete.length} keys for namespace "${namespace}": ${(err as Error).message}`,
      );
    }
  }

  return true;
}

/**
 * Run an async operation inside an isolated cache namespace.
 *
 * Namespaces are useful when two related runs should not reuse each other's
 * cached responses, such as baseline and candidate comparisons.
 *
 * @example
 * ```ts
 * import { cache, evaluate } from 'promptfoo';
 *
 * const baseline = await cache.withCacheNamespace('baseline', () =>
 *   evaluate(baselineSuite),
 * );
 * const candidate = await cache.withCacheNamespace('candidate', () =>
 *   evaluate(candidateSuite),
 * );
 * ```
 *
 * @param namespace - Namespace suffix to apply for the duration of the call.
 * Pass `undefined` to reuse the current namespace unchanged.
 * @param fn - Async operation to run inside the scoped namespace.
 * @returns The value returned by `fn`.
 *
 * @typeParam T - Value returned by `fn`.
 * @public
 */
export function withCacheNamespace<T>(namespace: string | undefined, fn: () => Promise<T>) {
  if (!namespace) {
    return fn();
  }

  const parentNamespace = getCurrentCacheNamespace();
  if (parentNamespace === namespace) {
    return fn();
  }

  const scopedNamespace = parentNamespace ? `${parentNamespace}:${namespace}` : namespace;
  return cacheNamespaceStorage.run({ namespace: scopedNamespace }, fn);
}

/**
 * Run an operation with a request-local cache override.
 *
 * @internal
 */
export function withCacheEnabled<T>(enabledOverride: boolean | undefined, fn: () => Promise<T>) {
  if (enabledOverride === undefined) {
    return fn();
  }

  return cacheEnabledStorage.run({ enabled: enabledOverride }, fn);
}

function getEffectiveCacheEnabled() {
  return cacheEnabledStorage.getStore()?.enabled ?? enabled;
}

/**
 * Metadata returned by `fetchWithCache()`.
 *
 * @example
 * ```ts
 * const result: FetchWithCacheResult<{ ok: boolean }> = {
 *   data: { ok: true },
 *   cached: false,
 *   status: 200,
 *   statusText: 'OK',
 * };
 * ```
 *
 * @typeParam T - Parsed response payload type.
 * @public
 */
export type FetchWithCacheResult<T> = {
  /** Parsed response payload. */
  data: T;
  /** Whether the response was served from cache. */
  cached: boolean;
  /** HTTP response status code. */
  status: number;
  /** HTTP response status text. */
  statusText: string;
  /** Response headers normalized to string values. */
  headers?: Record<string, string>;
  /** End-to-end fetch latency in milliseconds. */
  latencyMs?: number;
  /** Delete this response from cache when it was cache-backed. */
  deleteFromCache?: () => Promise<void>;
};

type SerializedFetchResponse = string;

type PreparedFetchResponse = {
  response: SerializedFetchResponse;
  cacheable: boolean;
};

const inflightFetchResponses = new Map<string, Promise<SerializedFetchResponse>>();
const IGNORED_FETCH_CACHE_OPTION_KEYS = new Set(['method', 'signal']);
const abortSignalIds = new WeakMap<AbortSignal, number>();
let nextAbortSignalId = 0;

function getHeadersForCacheKey(url: RequestInfo, options: RequestInit) {
  const headers = new Headers(getFetchWithProxyHeaders(url, options));

  if (isPromptfooCloudApiHost(url)) {
    const token = cloudConfig.getApiKey();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
  }

  return Array.from(headers.entries()).sort(([nameA, valueA], [nameB, valueB]) => {
    const nameComparison = nameA.localeCompare(nameB);
    return nameComparison === 0 ? valueA.localeCompare(valueB) : nameComparison;
  });
}

function hashFetchCacheKey(identity: unknown) {
  return sha256(JSON.stringify(identity));
}

function hashBytesForCacheKey(bytes: ArrayBuffer | ArrayBufferView) {
  const buffer = ArrayBuffer.isView(bytes)
    ? Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    : Buffer.from(bytes);
  return {
    byteLength: buffer.byteLength,
    sha256: sha256(buffer),
  };
}

function getBodyForFetchCacheKey(body: RequestInit['body'] | ReadableStream | null | undefined) {
  if (body == null) {
    return { cacheable: true, identity: undefined };
  }

  if (typeof body === 'string') {
    return { cacheable: true, identity: { type: 'string', value: body } };
  }

  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
    return { cacheable: true, identity: { type: 'url-search-params', value: body.toString() } };
  }

  if (body instanceof ArrayBuffer) {
    return { cacheable: true, identity: { type: 'array-buffer', ...hashBytesForCacheKey(body) } };
  }

  if (ArrayBuffer.isView(body)) {
    return {
      cacheable: true,
      identity: { type: body.constructor.name, ...hashBytesForCacheKey(body) },
    };
  }

  return { cacheable: false, identity: undefined };
}

function getOptionsForFetchCacheKey(options: RequestInit, bodyIdentity: unknown) {
  const identity: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(options).sort(([keyA], [keyB]) =>
    keyA.localeCompare(keyB),
  )) {
    if (key === 'headers' || IGNORED_FETCH_CACHE_OPTION_KEYS.has(key)) {
      continue;
    }

    if (key === 'body') {
      identity.body = bodyIdentity;
      continue;
    }

    if (value == null || ['boolean', 'number', 'string'].includes(typeof value)) {
      identity[key] = value;
      continue;
    }

    return { cacheable: false, identity: undefined };
  }

  if (!Object.prototype.hasOwnProperty.call(options, 'body') && bodyIdentity !== undefined) {
    identity.body = bodyIdentity;
  }

  return { cacheable: true, identity };
}

function getFetchCacheKey(
  url: RequestInfo,
  options: RequestInit,
  method: string,
  format: 'json' | 'text',
) {
  const bodyForCacheKey = getBodyForFetchCacheKey(
    options.body ?? (url instanceof Request ? url.body : undefined),
  );
  if (!bodyForCacheKey.cacheable) {
    return null;
  }

  const optionsForCacheKey = getOptionsForFetchCacheKey(options, bodyForCacheKey.identity);
  if (!optionsForCacheKey.cacheable) {
    return null;
  }

  return getScopedCacheKey(
    `fetch:v3:${hashFetchCacheKey({
      format,
      headers: getHeadersForCacheKey(url, options),
      method,
      options: optionsForCacheKey.identity,
      url: url instanceof Request ? url.url : String(url),
    })}`,
  );
}

function getAbortSignalId(signal: AbortSignal) {
  let signalId = abortSignalIds.get(signal);
  if (signalId === undefined) {
    signalId = ++nextAbortSignalId;
    abortSignalIds.set(signal, signalId);
  }
  return signalId;
}

function getInflightFetchCacheKey(cacheKey: string, url: RequestInfo, options: RequestInit) {
  const signal = options.signal ?? (url instanceof Request ? url.signal : undefined);
  return signal ? `${cacheKey}:signal:${getAbortSignalId(signal)}` : cacheKey;
}

function serializeFetchResponse(
  data: unknown,
  status: number,
  statusText: string,
  headers: Record<string, string>,
  latencyMs: number | undefined,
): SerializedFetchResponse {
  return JSON.stringify({
    data,
    status,
    statusText,
    headers,
    latencyMs,
  });
}

function deserializeFetchResponse<T>(
  response: SerializedFetchResponse,
  cached: boolean,
  cache: Cache,
  cacheKey: string,
) {
  const parsedResponse = JSON.parse(response);
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

async function fetchAndReadBody(
  url: RequestInfo,
  options: RequestInit,
  timeout: number,
  maxRetries: number | undefined,
  isIdempotent: boolean,
): Promise<{ respText: string; resp: Response; fetchLatencyMs: number }> {
  const maxBodyRetries = isIdempotent ? 2 : 0;
  for (let bodyAttempt = 0; bodyAttempt <= maxBodyRetries; bodyAttempt++) {
    const fetchStart = Date.now();
    // fetchWithRetries errors propagate directly — not caught by body retry
    const resp = await fetchWithRetries(url, options, timeout, maxRetries);
    const fetchLatencyMs = Date.now() - fetchStart;

    try {
      const respText = await resp.text();
      return { respText, resp, fetchLatencyMs };
    } catch (err) {
      if (isTransientConnectionError(err as Error) && bodyAttempt < maxBodyRetries) {
        const backoffMs = Math.pow(2, bodyAttempt) * 1000;
        logger.debug('[Cache] Body stream failed with transient error, retrying', {
          attempt: bodyAttempt + 1,
          maxRetries: maxBodyRetries,
          backoffMs,
          error: (err as Error)?.message?.slice(0, 200),
        });
        await sleep(backoffMs);
        continue;
      }
      throw err;
    }
  }
  // Unreachable: loop always returns or throws, but TypeScript needs this
  throw new Error('Exhausted body retries without returning or throwing');
}

async function prepareFetchResponse(
  url: RequestInfo,
  options: RequestInit,
  timeout: number,
  maxRetries: number | undefined,
  isIdempotent: boolean,
  format: 'json' | 'text',
): Promise<PreparedFetchResponse> {
  const result = await fetchAndReadBody(url, options, timeout, maxRetries, isIdempotent);
  const response = result.resp;
  const responseText = result.respText;
  const fetchLatencyMs = result.fetchLatencyMs;
  const headers = Object.fromEntries(response.headers.entries());

  try {
    const parsedData = format === 'json' ? JSON.parse(responseText) : responseText;
    const serializedResponse = serializeFetchResponse(
      parsedData,
      response.status,
      response.statusText,
      headers,
      fetchLatencyMs,
    );

    if (!response.ok) {
      return {
        response:
          responseText === ''
            ? serializeFetchResponse(
                `Empty Response: ${response.status}: ${response.statusText}`,
                response.status,
                response.statusText,
                headers,
                fetchLatencyMs,
              )
            : serializedResponse,
        cacheable: false,
      };
    }

    if (format === 'json' && parsedData?.error) {
      logger.debug(`Not caching ${url} because it contains an 'error' key: ${parsedData.error}`);
      return {
        response: serializedResponse,
        cacheable: false,
      };
    }

    logger.debug(
      `Storing ${url} response in cache with latencyMs=${fetchLatencyMs}: ${serializedResponse}`,
    );
    return {
      response: serializedResponse,
      cacheable: true,
    };
  } catch (err) {
    throw new Error(
      `Error parsing response from ${url}: ${
        (err as Error).message
      }. Received text: ${responseText}`,
    );
  }
}

/**
 * Fetch a URL through promptfoo's retrying cache wrapper.
 *
 * Use this in custom providers when you want the same retry and response-cache
 * behavior as built-in HTTP-backed providers.
 *
 * @param url - Target URL or `Request` to fetch.
 * @param options - Fetch options (method, headers, body) passed through to the
 * underlying request.
 * @param timeout - Request timeout in milliseconds. Defaults to the value of the
 * `REQUEST_TIMEOUT_MS` environment variable.
 * @param format - `'json'` (default) parses the response body as JSON;
 * `'text'` returns the raw response body unchanged.
 * @param bust - Skip the cache and force a fresh request.
 * @param maxRetries - Maximum retry attempts on transient errors. Defaults to
 * the value of `PROMPTFOO_REQUEST_BACKOFF_MS` / built-in retry policy.
 * @throws When `format` is `'json'` and the response body is not valid JSON.
 *
 * @example
 * ```ts
 * import { cache } from 'promptfoo';
 *
 * type Echo = { args: Record<string, string> };
 * const { data, cached } = await cache.fetchWithCache<Echo>(
 *   'https://httpbin.org/get?model=gpt-4o-mini',
 * );
 * console.log(cached, data.args.model);
 * ```
 *
 * @typeParam T - Parsed response payload type returned from JSON mode.
 * @public
 */
export async function fetchWithCache<T = unknown>(
  url: RequestInfo,
  options: RequestInit = {},
  timeout: number = getRequestTimeoutMs(),
  format: 'json' | 'text' = 'json',
  bust: boolean = false,
  maxRetries?: number,
): Promise<FetchWithCacheResult<T>> {
  // Only retry body-read for idempotent methods to avoid double-submitting
  // POST/PATCH requests (the server already processed the request once
  // headers arrived; only the response body stream failed).
  const method = (options.method ?? (url instanceof Request ? url.method : 'GET')).toUpperCase();
  const isIdempotent = ['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE'].includes(method);

  const cacheEnabled = getEffectiveCacheEnabled();
  const cacheKey = cacheEnabled && !bust ? getFetchCacheKey(url, options, method, format) : null;

  if (!cacheEnabled || bust || cacheKey == null) {
    const { respText, resp, fetchLatencyMs } = await fetchAndReadBody(
      url,
      options,
      timeout,
      maxRetries,
      isIdempotent,
    );
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

  const cache = getCacheInstance();

  const cachedResponse = await cache.get<SerializedFetchResponse>(cacheKey);
  if (cachedResponse != null) {
    logger.debug(`Returning cached response for ${url}: ${cachedResponse}`);
    return deserializeFetchResponse<T>(cachedResponse, true, cache, cacheKey);
  }

  const inflightCacheKey = getInflightFetchCacheKey(cacheKey, url, options);
  let inflightResponse = inflightFetchResponses.get(inflightCacheKey);
  if (!inflightResponse) {
    inflightResponse = (async () => {
      const preparedResponse = await prepareFetchResponse(
        url,
        options,
        timeout,
        maxRetries,
        isIdempotent,
        format,
      );
      if (preparedResponse.cacheable) {
        await cache.set(cacheKey, preparedResponse.response);
      }
      return preparedResponse.response;
    })().finally(() => {
      inflightFetchResponses.delete(inflightCacheKey);
    });
    inflightFetchResponses.set(inflightCacheKey, inflightResponse);
  }

  const response = await inflightResponse;
  return deserializeFetchResponse<T>(response, false, cache, cacheKey);
}

/**
 * Enable the shared promptfoo cache.
 *
 * Call this after a previous `disableCache()` when later work in the same
 * process should resume normal cache reads and writes.
 *
 * @example
 * ```ts
 * import { cache } from 'promptfoo';
 *
 * cache.enableCache();
 * ```
 *
 * @public
 */
export function enableCache() {
  enabled = true;
}

/**
 * Disable the shared promptfoo cache for future calls.
 *
 * This changes process-level cache behavior for subsequent calls; it does not
 * delete entries that are already stored.
 *
 * @example
 * ```ts
 * import { cache } from 'promptfoo';
 *
 * cache.disableCache();
 * ```
 *
 * @public
 */
export function disableCache() {
  enabled = false;
}

/**
 * Clear the shared promptfoo cache.
 *
 * Use this when tests or scripts need to remove existing shared entries before
 * running a fresh request path.
 *
 * @returns `true` after the active cache store has been cleared.
 *
 * @example
 * ```ts
 * import { cache } from 'promptfoo';
 *
 * await cache.clearCache();
 * ```
 *
 * @public
 */
export async function clearCache() {
  inflightFetchResponses.clear();
  namespacedCacheInstances.clear();
  return getCacheInstance().clear();
}

/**
 * Return whether the shared promptfoo cache is enabled.
 *
 * This reports the effective state for the current call context, including any
 * scoped override applied by internal helpers.
 *
 * @returns `true` when cache reads and writes are enabled for the current call.
 *
 * @example
 * ```ts
 * import { cache } from 'promptfoo';
 *
 * if (cache.isCacheEnabled()) {
 *   console.log('cache is active');
 * }
 * ```
 *
 * @public
 */
export function isCacheEnabled() {
  return getEffectiveCacheEnabled();
}
