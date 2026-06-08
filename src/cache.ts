import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';
import fs from 'fs';
import path from 'path';

import { createCache } from 'cache-manager';
import { Keyv } from 'keyv';
import { KeyvFile } from 'keyv-file';
import { getEnvBool, getEnvInt, getEnvString } from './envars';
import logger from './logger';
import { getRequestTimeoutMs } from './providers/shared';
import { getConfigDirectoryPath } from './util/config/manage';
import { sha256 } from './util/createHash';
import { isTransientConnectionError } from './util/fetch/errors';
import { fetchWithRetries, getFetchWithProxyHeaders } from './util/fetch/index';
import { getCloudBearerToken } from './util/fetch/monkeyPatchFetch';
import { isSecretField, looksLikeSecret } from './util/sanitizer';
import { sleep } from './util/time';
import type { Cache } from 'cache-manager';

import type { CacheOptions } from './types/cache';

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
 * Get the cache instance with optional namespace isolation.
 *
 * @returns The current cache instance (namespace-aware if inside withCacheNamespace)
 *
 * @example
 * ```typescript
 * import { cache } from 'promptfoo';
 *
 * const cacheInstance = cache.getCache();
 * const value = await cacheInstance.get('my-key');
 * ```
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

function currentNamespaceIncludesRepeatIndex(repeatIndex: number) {
  const namespaceParts = getCurrentCacheNamespace()?.split(':') ?? [];
  return namespaceParts.some(
    (part, index) => part === 'repeat' && namespaceParts[index + 1] === String(repeatIndex),
  );
}

function shouldApplyRepeatCacheSuffix(repeatIndex?: number) {
  return (
    repeatIndex != null && repeatIndex > 0 && !currentNamespaceIncludesRepeatIndex(repeatIndex)
  );
}

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
 * Run a function with isolated cache namespace.
 *
 * All cache operations within the function will be scoped to the namespace,
 * preventing cache collisions between different test runs or environments.
 *
 * @param namespace Namespace prefix for cache keys (undefined = no namespace)
 * @param fn Async function to run with the namespace
 *
 * @returns Result of the function
 *
 * @example
 * ```typescript
 * import { cache, evaluate } from 'promptfoo';
 *
 * // Run v1 and v2 evals with separate caches
 * const v1Results = await cache.withCacheNamespace('v1', async () => {
 *   return evaluate(testSuiteV1);
 * });
 *
 * const v2Results = await cache.withCacheNamespace('v2', async () => {
 *   return evaluate(testSuiteV2);
 * });
 * ```
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

export function withCacheEnabled<T>(enabledOverride: boolean | undefined, fn: () => Promise<T>) {
  if (enabledOverride === undefined) {
    return fn();
  }

  return cacheEnabledStorage.run({ enabled: enabledOverride }, fn);
}

function getEffectiveCacheEnabled() {
  return cacheEnabledStorage.getStore()?.enabled ?? enabled;
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

type SerializedFetchResponse = string;

type PreparedFetchResponse = {
  response: SerializedFetchResponse;
  cacheable: boolean;
};

const inflightFetchResponses = new Map<string, Promise<SerializedFetchResponse>>();
type SharedAbortableInflightFetchResponse = {
  activeCallers: number;
  controller: AbortController;
  promise: Promise<SerializedFetchResponse>;
  settled: boolean;
};
const sharedAbortableInflightFetchResponses = new Map<
  string,
  SharedAbortableInflightFetchResponse
>();
const IGNORED_FETCH_CACHE_OPTION_KEYS = new Set(['method', 'signal']);
const FETCH_CACHE_SECRET_HMAC_CONTEXT = 'promptfoo:fetch-cache-secret-key';
// Headers that describe the transport/runtime rather than the selected
// representation. Excluded from cache keys so caches stay portable across SDK
// upgrades, Node versions, and OS/arch. `accept` intentionally stays in the
// key because shared fetch callers can legitimately negotiate different
// response formats for the same URL/body. `x-promptfoo-version` is also kept in
// the key so promptfoo upgrades remain a deliberate invalidation boundary.
const CACHE_KEY_IGNORED_HEADERS = new Set(['accept-encoding']);
const SDK_USER_AGENT_PATTERN = /^OpenAI\/JS \S+$/;
// A fixed, compiled-in salt (NOT a secret). It must be deterministic across
// processes so that a request carrying a static secret — or a binary body —
// hashes to the same on-disk cache key on every run and stays cacheable. A
// per-process random key broke that: each `promptfoo eval` run produced a new
// key and re-hit the upstream endpoint. The salt only domain-separates the
// one-way HMAC so raw secrets are never written into the cache key; it does not
// need to be unpredictable, and this matches the pre-existing (pre-isolation)
// behavior of hashing the value directly.
const FETCH_CACHE_SECRET_HMAC_SALT = 'promptfoo:fetch-cache-secret-hmac-salt:v1';
const abortSignalIds = new WeakMap<AbortSignal, number>();
let nextAbortSignalId = 0;

// `Headers.entries()` yields lowercased names per the Fetch spec, so we don't
// need to normalize the input here.
function isIgnoredCacheKeyHeader(name: string, headers: Headers): boolean {
  if (CACHE_KEY_IGNORED_HEADERS.has(name) || name.startsWith('x-stainless-')) {
    return true;
  }

  // The OpenAI SDK annotates its own requests with `x-stainless-*` telemetry
  // headers plus an SDK-specific user agent. Ignore that SDK-managed UA so
  // cache entries remain portable across runtime/SDK upgrades, while
  // preserving caller-authored User-Agent differences for generic fetch users.
  return (
    name === 'user-agent' &&
    SDK_USER_AGENT_PATTERN.test(headers.get(name) ?? '') &&
    Array.from(headers.keys()).some((headerName) => headerName.startsWith('x-stainless-'))
  );
}

function hasSdkTransportHeaders(url: RequestInfo, options: RequestInit) {
  const headers = new Headers(getFetchWithProxyHeaders(url, options));
  // Stainless SDKs create a fresh AbortController for every request, even when
  // the caller did not provide a signal. Those transport-only signals should
  // share an upstream request while retaining per-caller cancellation below.
  return Array.from(headers.keys()).some((headerName) => headerName.startsWith('x-stainless-'));
}

function fingerprintFetchCacheSecret(value: string) {
  return {
    __promptfooSecretFingerprint: crypto
      .createHmac('sha256', FETCH_CACHE_SECRET_HMAC_SALT)
      .update(FETCH_CACHE_SECRET_HMAC_CONTEXT)
      .update('\0')
      .update(value)
      .digest('hex'),
  };
}

function isSensitiveFetchCacheString(value: string, fieldName?: string) {
  return (fieldName && isSecretField(fieldName)) || looksLikeSecret(value);
}

function getStringForFetchCacheKey(value: string, fieldName?: string): unknown {
  if (isSensitiveFetchCacheString(value, fieldName)) {
    return fingerprintFetchCacheSecret(value);
  }
  return value;
}

function hasSensitiveJsonValue(value: unknown, fieldName?: string): boolean {
  if (typeof value === 'string') {
    return isSensitiveFetchCacheString(value, fieldName);
  }
  if (Array.isArray(value)) {
    return value.some((item) => hasSensitiveJsonValue(item, fieldName));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).some(([key, nestedValue]) =>
      hasSensitiveJsonValue(nestedValue, key),
    );
  }
  return false;
}

function getJsonValueForFetchCacheKey(value: unknown, fieldName?: string): unknown {
  if (typeof value === 'string') {
    return getStringForFetchCacheKey(value, fieldName);
  }
  if (Array.isArray(value)) {
    return value.map((item) => getJsonValueForFetchCacheKey(item, fieldName));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        getJsonValueForFetchCacheKey(nestedValue, key),
      ]),
    );
  }
  return value;
}

function getBodyStringForFetchCacheKey(value: string): unknown {
  try {
    const parsedValue = JSON.parse(value);
    return hasSensitiveJsonValue(parsedValue)
      ? {
          encoding: 'json',
          value: getJsonValueForFetchCacheKey(parsedValue),
        }
      : value;
  } catch {
    return getStringForFetchCacheKey(value);
  }
}

function hasSensitiveSearchParam(searchParams: URLSearchParams) {
  return Array.from(searchParams.entries()).some(([name, value]) =>
    isSensitiveFetchCacheString(value, name),
  );
}

function getSearchParamsForFetchCacheKey(searchParams: URLSearchParams): unknown {
  if (!hasSensitiveSearchParam(searchParams)) {
    return searchParams.toString();
  }
  return Array.from(searchParams.entries()).map(([name, value]) => [
    name,
    getStringForFetchCacheKey(value, name),
  ]);
}

function getUrlForFetchCacheKey(url: RequestInfo) {
  const urlString = url instanceof Request ? url.url : String(url);
  try {
    const parsedUrl = new URL(urlString);
    if (!hasSensitiveSearchParam(parsedUrl.searchParams)) {
      return urlString;
    }
    parsedUrl.search = '';
    return {
      href: parsedUrl.toString(),
      searchParams: getSearchParamsForFetchCacheKey(new URL(urlString).searchParams),
    };
  } catch {
    return getStringForFetchCacheKey(urlString);
  }
}

function getHeadersForCacheKey(url: RequestInfo, options: RequestInit) {
  const headers = new Headers(getFetchWithProxyHeaders(url, options));

  // Mirror monkeyPatchFetch so the cache key reflects the Authorization header that
  // will actually be sent: fold in the cloud bearer token for cloud-bound requests,
  // without overriding a caller-supplied Authorization.
  const cloudAuth = getCloudBearerToken(url);
  if (cloudAuth && !headers.has('Authorization')) {
    headers.set('Authorization', cloudAuth);
  }

  return Array.from(headers.entries())
    .filter(([name]) => !isIgnoredCacheKeyHeader(name, headers))
    .sort(([nameA, valueA], [nameB, valueB]) => {
      const nameComparison = nameA.localeCompare(nameB);
      return nameComparison === 0 ? valueA.localeCompare(valueB) : nameComparison;
    })
    .map(([name, value]) => [name, getStringForFetchCacheKey(value, name)]);
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
    hmacSha256: crypto
      .createHmac('sha256', FETCH_CACHE_SECRET_HMAC_SALT)
      .update(`${FETCH_CACHE_SECRET_HMAC_CONTEXT}:bytes`)
      .update('\0')
      .update(buffer)
      .digest('hex'),
  };
}

function getBodyForFetchCacheKey(body: RequestInit['body'] | ReadableStream | null | undefined) {
  if (body == null) {
    return { cacheable: true, identity: undefined };
  }

  if (typeof body === 'string') {
    return {
      cacheable: true,
      identity: { type: 'string', value: getBodyStringForFetchCacheKey(body) },
    };
  }

  if (typeof URLSearchParams !== 'undefined' && body instanceof URLSearchParams) {
    return {
      cacheable: true,
      identity: { type: 'url-search-params', value: getSearchParamsForFetchCacheKey(body) },
    };
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
  repeatIndex?: number,
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

  const repeatSuffix = shouldApplyRepeatCacheSuffix(repeatIndex) ? `:repeat${repeatIndex}` : '';
  return getScopedCacheKey(
    `fetch:v3:${hashFetchCacheKey({
      format,
      headers: getHeadersForCacheKey(url, options),
      method,
      options: optionsForCacheKey.identity,
      url: getUrlForFetchCacheKey(url),
    })}${repeatSuffix}`,
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

function getInflightFetchCacheKey(
  cacheKey: string,
  url: RequestInfo,
  options: RequestInit,
  timeout: number,
  maxRetries: number | undefined,
  isolateBySignal = true,
) {
  const transportKey = `${cacheKey}:timeout:${timeout}:maxRetries:${maxRetries ?? 'default'}`;
  if (!isolateBySignal) {
    return transportKey;
  }

  const signal = options.signal ?? (url instanceof Request ? url.signal : undefined);
  return signal ? `${transportKey}:signal:${getAbortSignalId(signal)}` : transportKey;
}

function getAbortReason(signal: AbortSignal) {
  return signal.reason ?? new DOMException('The operation was aborted', 'AbortError');
}

function abortSharedInflightIfUnused(
  inflightCacheKey: string,
  inflightResponse: SharedAbortableInflightFetchResponse,
) {
  if (inflightResponse.activeCallers !== 0 || inflightResponse.settled) {
    return;
  }

  if (sharedAbortableInflightFetchResponses.get(inflightCacheKey) === inflightResponse) {
    sharedAbortableInflightFetchResponses.delete(inflightCacheKey);
  }
  inflightResponse.controller.abort();
}

function waitForSharedAbortableInflightResponse(
  inflightCacheKey: string,
  inflightResponse: SharedAbortableInflightFetchResponse,
  signal?: AbortSignal,
): Promise<SerializedFetchResponse> {
  if (signal?.aborted) {
    abortSharedInflightIfUnused(inflightCacheKey, inflightResponse);
    return Promise.reject(getAbortReason(signal));
  }

  inflightResponse.activeCallers += 1;
  return new Promise<SerializedFetchResponse>((resolve, reject) => {
    let finished = false;
    const finish = () => {
      if (finished) {
        return false;
      }
      finished = true;
      signal?.removeEventListener('abort', handleAbort);
      inflightResponse.activeCallers -= 1;
      return true;
    };
    const handleAbort = () => {
      if (!signal || !finish()) {
        return;
      }
      abortSharedInflightIfUnused(inflightCacheKey, inflightResponse);
      reject(getAbortReason(signal));
    };
    signal?.addEventListener('abort', handleAbort, { once: true });

    inflightResponse.promise.then(
      (response) => {
        if (finish()) {
          resolve(response);
        }
      },
      (error) => {
        if (finish()) {
          reject(error);
        }
      },
    );
  });
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
      }. HTTP ${response.status} ${response.statusText}. Received text: ${responseText}`,
    );
  }
}

/**
 * Fetch a URL with automatic caching.
 *
 * Caches HTTP responses with configurable TTL. Useful for fetching external
 * data files, embeddings, or API responses that don't change frequently.
 *
 * @param url URL to fetch
 * @param options Fetch options (method, headers, body, etc.)
 * @param timeout Request timeout in milliseconds (default: standard timeout)
 * @param format Response format: 'json' or 'text' (default: 'json')
 * @param bustOrOptions Bypass cache or provide cache options for this request
 * @param maxRetries Maximum number of retries on transient errors
 *
 * @returns FetchWithCacheResult with data, cache status, and HTTP metadata
 *
 * @example
 * ```typescript
 * import { cache } from 'promptfoo';
 *
 * // Fetch with 1-hour TTL
 * const result = await cache.fetchWithCache(
 *   'https://api.example.com/data',
 *   { method: 'GET' },
 *   undefined,
 *   'json'
 * );
 *
 * console.log(result.cached); // true if from cache
 * console.log(result.data); // the fetched data
 * console.log(result.status); // HTTP status code
 * ```
 *
 * @see withCacheNamespace for cache isolation
 * @see enableCache / disableCache for cache control
 */
export async function fetchWithCache<T = unknown>(
  url: RequestInfo,
  options: RequestInit = {},
  timeout: number = getRequestTimeoutMs(),
  format: 'json' | 'text' = 'json',
  bustOrOptions: boolean | CacheOptions | undefined = false,
  maxRetries?: number,
): Promise<FetchWithCacheResult<T>> {
  const cacheOptions: CacheOptions =
    typeof bustOrOptions === 'boolean' ? { bust: bustOrOptions } : (bustOrOptions ?? {});
  const { bust = false, repeatIndex } = cacheOptions;

  // Only retry body-read for idempotent methods to avoid double-submitting
  // POST/PATCH requests (the server already processed the request once
  // headers arrived; only the response body stream failed).
  const method = (options.method ?? (url instanceof Request ? url.method : 'GET')).toUpperCase();
  const isIdempotent = ['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE'].includes(method);
  const callerSignal = options.signal ?? (url instanceof Request ? url.signal : undefined);
  const dedupeAbortableRequests = Boolean(callerSignal && hasSdkTransportHeaders(url, options));

  const cacheEnabled = getEffectiveCacheEnabled();
  const cacheKey =
    cacheEnabled && !bust ? getFetchCacheKey(url, options, method, format, repeatIndex) : null;

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
    } catch (err) {
      throw new Error(
        `Error parsing response from ${url}: ${
          (err as Error).message
        }. HTTP ${resp.status} ${resp.statusText}. Received text: ${respText}`,
      );
    }
  }

  const cache = getCacheInstance();

  const cachedResponse = await cache.get<SerializedFetchResponse>(cacheKey);
  if (dedupeAbortableRequests && callerSignal?.aborted) {
    throw getAbortReason(callerSignal);
  }
  if (cachedResponse != null) {
    logger.debug(`Returning cached response for ${url}: ${cachedResponse}`);
    return deserializeFetchResponse<T>(cachedResponse, true, cache, cacheKey);
  }

  const inflightCacheKey = getInflightFetchCacheKey(
    cacheKey,
    url,
    options,
    timeout,
    maxRetries,
    !dedupeAbortableRequests,
  );
  const fetchResponse = async (requestOptions: RequestInit) => {
    const preparedResponse = await prepareFetchResponse(
      url,
      requestOptions,
      timeout,
      maxRetries,
      isIdempotent,
      format,
    );
    if (preparedResponse.cacheable) {
      await cache.set(cacheKey, preparedResponse.response);
    }
    return preparedResponse.response;
  };

  if (dedupeAbortableRequests) {
    let inflightResponse = sharedAbortableInflightFetchResponses.get(inflightCacheKey);
    if (!inflightResponse) {
      const controller = new AbortController();
      const sharedRequestOptions = {
        ...options,
        signal: controller.signal,
      };
      const sharedRequest = fetchResponse(sharedRequestOptions);
      const newInflightResponse: SharedAbortableInflightFetchResponse = {
        activeCallers: 0,
        controller,
        promise: sharedRequest,
        settled: false,
      };
      newInflightResponse.promise = sharedRequest.finally(() => {
        newInflightResponse.settled = true;
        if (sharedAbortableInflightFetchResponses.get(inflightCacheKey) === newInflightResponse) {
          sharedAbortableInflightFetchResponses.delete(inflightCacheKey);
        }
      });
      sharedAbortableInflightFetchResponses.set(inflightCacheKey, newInflightResponse);
      inflightResponse = newInflightResponse;
    }

    const response = await waitForSharedAbortableInflightResponse(
      inflightCacheKey,
      inflightResponse,
      callerSignal ?? undefined,
    );
    return deserializeFetchResponse<T>(response, false, cache, cacheKey);
  }

  let inflightResponse = inflightFetchResponses.get(inflightCacheKey);
  if (!inflightResponse) {
    inflightResponse = fetchResponse(options).finally(() => {
      inflightFetchResponses.delete(inflightCacheKey);
    });
    inflightFetchResponses.set(inflightCacheKey, inflightResponse);
  }

  const response = await inflightResponse;
  return deserializeFetchResponse<T>(response, false, cache, cacheKey);
}

/**
 * Enable caching for all provider calls (default behavior).
 *
 * @example
 * ```typescript
 * import { cache } from 'promptfoo';
 * cache.enableCache();
 * ```
 */
export function enableCache() {
  enabled = true;
}

/**
 * Disable caching. Provider calls will hit the API every time.
 *
 * Useful during development or testing when you want fresh results.
 *
 * @example
 * ```typescript
 * import { cache, evaluate } from 'promptfoo';
 *
 * cache.disableCache();
 * const results = await evaluate(testSuite);  // Always fresh
 * cache.enableCache();
 * ```
 */
export function disableCache() {
  enabled = false;
}

/**
 * Clear all cached results.
 *
 * Removes all cached provider responses. The cache will refetch on next access.
 *
 * @example
 * ```typescript
 * import { cache, evaluate } from 'promptfoo';
 *
 * await cache.clearCache();
 * const results = await evaluate(testSuite);  // Refetches all
 * ```
 */
export async function clearCache() {
  inflightFetchResponses.clear();
  namespacedCacheInstances.clear();
  return getCacheInstance().clear();
}

/**
 * Check if caching is currently enabled.
 *
 * @returns true if cache is enabled, false otherwise
 *
 * @example
 * ```typescript
 * import { cache } from 'promptfoo';
 *
 * if (cache.isCacheEnabled()) {
 *   console.log('Cache is active');
 * }
 * ```
 */
export function isCacheEnabled() {
  return getEffectiveCacheEnabled();
}
