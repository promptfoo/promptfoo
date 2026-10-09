/// <reference lib="es2021.weakref" />

import { AsyncLocalStorage } from 'node:async_hooks';
import crypto from 'node:crypto';
import fs from 'fs';
import path from 'path';

import { createCache } from 'cache-manager';
import { Keyv } from 'keyv';
import { KeyvFile } from 'keyv-file';
import { LRUCache } from 'lru-cache';
import { getEnvBool, getEnvInt, getEnvOverrides, getEnvString } from './envars';
import logger from './logger';
import { getRequestTimeoutMs } from './providers/shared';
import { getConfigDirectoryPath } from './util/config/manage';
import { sha256 } from './util/createHash';
import { isAbortError, isTransientConnectionError } from './util/fetch/errors';
import { fetchWithRetries, getFetchWithProxyHeaders } from './util/fetch/index';
import {
  getCloudAuthHeaderName,
  getCloudBearerToken,
  getCloudTaskTeamId,
  getRequestUrlString,
  PROMPTFOO_TEAM_ID_HEADER,
  preserveCloudAuthRedirects,
} from './util/fetch/monkeyPatchFetch';
import { isSecretField, looksLikeSecret, sanitizeUrlForLogging } from './util/sanitizer';
import { sleep } from './util/time';
import type { Cache } from 'cache-manager';

import type { CacheOptions } from './types/cache';
import type { FetchOptions } from './util/fetch/types';

interface CacheBackend {
  filePath?: string;
  clearGeneration: number;
  namespaces: CacheRegistry<string, { namespace: string; clearGeneration: number }>;
  instances: CacheRegistry<number, Cache>;
  claims: Set<string>;
  inflight: Map<string, Promise<string>>;
  writes: Map<Promise<unknown>, string>;
  clears: Map<Promise<boolean>, string | undefined>;
}

// Bound idle retention while preserving identity for callers that still hold a
// cache. In particular, eviction must not create competing writers for one file.
class CacheRegistry<Key extends string | number, Value extends object> {
  private readonly retained: LRUCache<Key, Value>;
  private readonly references = new Map<Key, WeakRef<Value>>();
  private readonly finalizer = new FinalizationRegistry<Key>((key) => {
    if (!this.references.get(key)?.deref()) {
      this.references.delete(key);
    }
  });

  constructor(max: number) {
    this.retained = new LRUCache({ max });
  }

  get(key: Key): Value | undefined {
    const value = this.retained.get(key) ?? this.references.get(key)?.deref();
    if (value) {
      this.retained.set(key, value);
    }
    return value;
  }

  set(key: Key, value: Value, retain = true): void {
    if (retain) {
      this.retained.set(key, value);
    }
    this.references.set(key, new WeakRef(value));
    this.finalizer.register(value, key);
  }

  *values(): IterableIterator<Value> {
    for (const reference of this.references.values()) {
      const value = reference.deref();
      if (value) {
        yield value;
      }
    }
  }
}

const cacheBackends = new CacheRegistry<string, CacheBackend>(32);
// Pending store operations can outlive a temporary cache-manager handle.
const storeOwners = new WeakMap<object, CacheBackend>();
let nextCacheClearGeneration = 0;

const cacheNamespaceStorage = new AsyncLocalStorage<{ namespace: string }>();
const cacheEnabledStorage = new AsyncLocalStorage<{ enabled: boolean }>();

// Explicit API overrides remain process-wide; environment defaults are invocation-scoped.
let enabled: boolean | undefined;

/** Default cache TTL: 14 days in seconds */
const DEFAULT_CACHE_TTL_SECONDS = 60 * 60 * 24 * 14;

/**
 * Get the cache TTL in milliseconds.
 * Reads from PROMPTFOO_CACHE_TTL environment variable (in seconds) or uses default.
 */
export function getCacheTtlMs(): number {
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

function resolveCachePath(cachePath: string): string {
  const absolutePath = path.resolve(cachePath);
  let ancestor = absolutePath;
  while (true) {
    try {
      return path.join(fs.realpathSync(ancestor), path.relative(ancestor, absolutePath));
    } catch (error) {
      const parent = path.dirname(ancestor);
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || parent === ancestor) {
        // Preserve the existing disk-store/claim error handling for inaccessible paths.
        return absolutePath;
      }
      try {
        // A file or directory alias may point at a cache that has not been created yet.
        if (fs.lstatSync(ancestor).isSymbolicLink()) {
          const target = path.resolve(parent, fs.readlinkSync(ancestor));
          return resolveCachePath(path.join(target, path.relative(ancestor, absolutePath)));
        }
      } catch {
        // Keep walking to the nearest existing parent.
      }
      // Resolve an existing parent when this invocation has not created its cache yet.
      ancestor = parent;
    }
  }
}

function getCacheFileIdentity(filePath: string) {
  let ancestor = filePath;
  try {
    while (true) {
      const stat = fs.statSync(ancestor, { bigint: true, throwIfNoEntry: false });
      if (stat) {
        return stat.ino > 0n
          ? JSON.stringify([
              stat.dev.toString(),
              stat.ino.toString(),
              path.relative(ancestor, filePath),
            ])
          : undefined;
      }
      const parent = path.dirname(ancestor);
      if (parent === ancestor) {
        return undefined;
      }
      ancestor = parent;
    }
  } catch {
    return undefined;
  }
}

function getCacheBackend(
  cacheEnabled = getEffectiveCacheEnabled(),
  cachePath?: string,
  retain = cacheEnabled,
): CacheBackend {
  const cacheType =
    getEnvString('PROMPTFOO_CACHE_TYPE') ||
    (getEnvString('NODE_ENV') === 'test' ? 'memory' : 'disk');
  const scopedConfigDirectory =
    getEnvOverrides()?.PROMPTFOO_CONFIG_DIR ?? getEnvOverrides('file')?.PROMPTFOO_CONFIG_DIR;
  const filePath =
    cachePath !== undefined || (cacheType === 'disk' && cacheEnabled)
      ? resolveCachePath(
          path.join(
            cachePath ??
              (getEnvString('PROMPTFOO_CACHE_PATH') ||
                path.join(scopedConfigDirectory || getConfigDirectoryPath(), 'cache')),
            'cache.json',
          ),
        )
      : undefined;
  const identity = JSON.stringify(filePath ?? null);
  let backend = retain ? cacheBackends.get(identity) : undefined;
  if (!backend && retain && filePath) {
    const fileIdentity = getCacheFileIdentity(filePath);
    if (fileIdentity) {
      // Resolve an unfamiliar alias against live paths, avoiding a stale inode index.
      for (const candidate of cacheBackends.values()) {
        if (candidate.filePath && getCacheFileIdentity(candidate.filePath) === fileIdentity) {
          return candidate;
        }
      }
    }
  }
  if (!backend) {
    backend = {
      filePath,
      clearGeneration: nextCacheClearGeneration++,
      namespaces: new CacheRegistry(32),
      instances: new CacheRegistry<number, Cache>(16),
      claims: new Set(),
      inflight: new Map(),
      writes: new Map(),
      clears: new Map(),
    };
    // Disabled handles remain isolated, but global clearing must still reach live ones.
    cacheBackends.set(retain ? identity : `disabled:${backend.clearGeneration}`, backend, retain);
  }
  return backend;
}

function getCacheInstance(backend = getCacheBackend()) {
  const ttl = getCacheTtlMs();
  let cacheInstance = backend.instances.get(ttl);
  if (!cacheInstance) {
    // Different TTL defaults must share one store, especially for disk caches: two
    // KeyvFile instances for the same file can overwrite each other's contents.
    const existingInstance = backend.instances.values().next().value;
    const stores = existingInstance ? existingInstance.stores : [];

    if (!existingInstance && backend.filePath) {
      const directory = path.dirname(backend.filePath);
      if (!fs.existsSync(directory)) {
        logger.info(`Creating cache folder at ${directory}.`);
        fs.mkdirSync(directory, { recursive: true });
      }

      try {
        const store = new KeyvFile({ filename: backend.filePath });
        stores.push(new Keyv({ store }));
      } catch (err) {
        logger.warn(
          `[Cache] Failed to initialize disk cache: ${(err as Error).message}. ` +
            `Using memory cache instead.`,
        );
      }
    }

    cacheInstance = createCache({ stores, ttl, refreshThreshold: 0 });
    for (const store of cacheInstance.stores) {
      storeOwners.set(store, backend);
      if (store.opts.store) {
        storeOwners.set(store.opts.store, backend);
      }
    }
    const clear = cacheInstance.clear.bind(cacheInstance);
    cacheInstance.clear = () =>
      clearBackendCache(backend, undefined, async () => {
        const result = await clear();
        backend.claims.clear();
        if (backend.filePath) {
          fs.rmSync(getClaimsPath(backend.filePath), { force: true, recursive: true });
        }
        return result;
      });
    backend.instances.set(ttl, cacheInstance);
  }
  return cacheInstance;
}

function getNamespacedCache(namespace: string) {
  const backend = getCacheBackend();
  const cache = getCacheInstance(backend);
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
    clear: () => clearNamespacedCache(cache, namespace, backend),
    wrap: (...args: Parameters<Cache['wrap']>) =>
      cache.wrap(
        getScopedCacheKey(args[0] as string, namespace),
        ...(args.slice(1) as Parameters<Cache['wrap']> extends [string, ...infer Rest]
          ? Rest
          : never),
      ),
  } as Cache;

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

function getCacheGeneration(backend: CacheBackend) {
  const namespace = getCurrentCacheNamespace();
  if (!namespace) {
    return backend;
  }
  let state = backend.namespaces.get(namespace);
  if (!state) {
    // Active calls retain their state; an evicted idle namespace starts with a fresh token.
    state = { namespace, clearGeneration: nextCacheClearGeneration++ };
    backend.namespaces.set(namespace, state);
  }
  return state;
}

/** Opaque invalidation token for the currently selected backend and namespace. */
export function getCacheClearGeneration() {
  return getCacheGeneration(getCacheBackend()).clearGeneration;
}

function getUnscopedCacheKey(cacheKey: string, namespace: string) {
  const namespacePrefix = `${namespace}:`;
  return cacheKey.startsWith(namespacePrefix) ? cacheKey.slice(namespacePrefix.length) : cacheKey;
}

function clearBackendCache(
  backend: CacheBackend,
  namespace: string | undefined,
  clear: () => Promise<boolean>,
): Promise<boolean> {
  const prefix = namespace ? `${namespace}:` : undefined;
  const generation = nextCacheClearGeneration++;
  if (!prefix) {
    backend.clearGeneration = generation;
    backend.inflight.clear();
  }
  for (const state of backend.namespaces.values()) {
    if (!prefix || state.namespace === namespace || state.namespace.startsWith(prefix)) {
      state.clearGeneration = generation;
    }
  }
  // Drain started writes; later fetches wait for deletion before reading or writing.
  const clearing = Promise.allSettled(
    [...backend.writes]
      .filter(([, key]) => !prefix || key.startsWith(prefix))
      .map(([write]) => write),
  )
    .then(clear)
    .finally(() => backend.clears.delete(clearing));
  backend.clears.set(clearing, prefix);
  return clearing;
}

function clearNamespacedCache(cache: Cache, namespace: string, backend: CacheBackend) {
  return clearBackendCache(backend, namespace, async () => {
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
  });
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
  return (
    cacheEnabledStorage.getStore()?.enabled ??
    enabled ??
    getEnvBool('PROMPTFOO_CACHE_ENABLED', true)
  );
}

export type FetchWithCacheResult<T> = {
  data: T;
  cached: boolean;
  /** Another concurrent caller owns the upstream request that produced this response. */
  coalesced?: boolean;
  status: number;
  statusText: string;
  headers?: Record<string, string>;
  latencyMs?: number;
  deleteFromCache?: () => Promise<void>;
  updateCache?: (
    data: unknown,
    status: number,
    statusText: string,
    headers?: Record<string, string>,
  ) => Promise<void>;
};

type SerializedFetchResponse = string;

type PreparedFetchResponse = {
  response: SerializedFetchResponse;
  cacheable: boolean;
};

const IGNORED_FETCH_CACHE_OPTION_KEYS = new Set(['method', 'signal']);
const IGNORED_FETCH_CACHE_HEADERS = new Set(['traceparent', 'tracestate']);
const FETCH_CACHE_SECRET_HMAC_CONTEXT = 'promptfoo:fetch-cache-secret-key';
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

export function getHeadersForCacheKey(url: RequestInfo, options: RequestInit) {
  const headers = new Headers(getFetchWithProxyHeaders(url, options));

  // Mirror monkeyPatchFetch so the cache key reflects the auth header that will
  // actually be sent: fold in the cloud bearer token for cloud-bound requests, under
  // whatever header name is configured, without overriding a caller-supplied header.
  const cloudAuth = getCloudBearerToken(url);
  // Whenever a cloud credential resolves for this request, its header name is
  // sensitive and must be fingerprinted below — whether this function injects it
  // (headers.set) or a caller already set it explicitly beforehand (e.g.
  // resolveGuardrailsApi via cloudConfig.getAuthHeaders()). A custom header name
  // and/or a short on-prem token can both evade the generic
  // isSecretField/looksLikeSecret heuristics used for ordinary headers, so this
  // must not depend on whether headers.set() actually ran here. Lowercased once
  // at capture because Headers.entries() below always yields lowercase names.
  let cloudAuthHeaderNameForFingerprint: string | undefined;
  if (cloudAuth) {
    const cloudAuthHeaderName = getCloudAuthHeaderName();
    cloudAuthHeaderNameForFingerprint = cloudAuthHeaderName.toLowerCase();
    if (!headers.has(cloudAuthHeaderName)) {
      headers.set(cloudAuthHeaderName, cloudAuth);
    }
  }

  const cloudTaskTeamId = getCloudTaskTeamId(url);
  if (cloudTaskTeamId && !headers.has(PROMPTFOO_TEAM_ID_HEADER)) {
    headers.set(PROMPTFOO_TEAM_ID_HEADER, cloudTaskTeamId);
  }

  return Array.from(headers.entries())
    .filter(([name]) => !IGNORED_FETCH_CACHE_HEADERS.has(name))
    .sort(([nameA, valueA], [nameB, valueB]) => {
      const nameComparison = nameA.localeCompare(nameB);
      return nameComparison === 0 ? valueA.localeCompare(valueB) : nameComparison;
    })
    .map(([name, value]) => [
      name,
      name === cloudAuthHeaderNameForFingerprint
        ? fingerprintFetchCacheSecret(value)
        : getStringForFetchCacheKey(value, name),
    ]);
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

function getInflightFetchCacheKey(cacheKey: string, url: RequestInfo, options: RequestInit) {
  const signal = options.signal ?? (url instanceof Request ? url.signal : undefined);
  return signal ? `${cacheKey}:signal:${getAbortSignalId(signal)}` : cacheKey;
}

/**
 * Atomically claim a cache-scoped one-time action. Disk-backed claims use an exclusive file so
 * separate eval processes cannot both attribute the same background response's usage.
 */
export function claimCacheKeyOnce(cacheKey: string): boolean {
  // Disabling response caching must still retain process-local one-time claims.
  const backend = getCacheBackend(getEffectiveCacheEnabled(), undefined, true);
  const claimedCacheKeys = backend.claims;
  const scopedCacheKey = getScopedCacheKey(cacheKey);
  if (claimedCacheKeys.has(scopedCacheKey)) {
    return false;
  }

  if (backend.filePath) {
    const claimsPath = getClaimsPath(backend.filePath);
    try {
      fs.mkdirSync(claimsPath, { recursive: true });
      const handle = fs.openSync(path.join(claimsPath, sha256(scopedCacheKey)), 'wx');
      fs.closeSync(handle);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        claimedCacheKeys.add(scopedCacheKey);
        return false;
      }
      logger.warn(
        `[Cache] Failed to persist a one-time cache claim: ${(error as Error).message}. ` +
          'Using a process-local claim instead.',
      );
    }
  }

  claimedCacheKeys.add(scopedCacheKey);
  return true;
}

function getClaimsPath(filePath: string): string {
  const name = path.basename(filePath);
  return path.join(path.dirname(filePath), name === 'cache.json' ? 'claims' : `${name}.claims`);
}

function getSanitizedResponse(
  data: unknown,
  statusText: string,
  headers: Record<string, string> | undefined,
  sanitizeResponse?: CacheOptions['sanitizeResponse'],
) {
  return sanitizeResponse
    ? sanitizeResponse({ data, statusText, headers: { ...headers } })
    : { data, statusText, headers };
}

function serializeFetchResponse(
  data: unknown,
  status: number,
  statusText: string,
  headers: Record<string, string> | undefined,
  latencyMs: number | undefined,
  sanitizeResponse?: CacheOptions['sanitizeResponse'],
): SerializedFetchResponse {
  const sanitized = getSanitizedResponse(data, statusText, headers, sanitizeResponse);
  return JSON.stringify({
    data: sanitized.data,
    status,
    statusText: sanitized.statusText,
    headers: sanitized.headers,
    latencyMs,
  });
}

function deserializeFetchResponse<T>(
  response: SerializedFetchResponse,
  cached: boolean,
  cache: Cache,
  cacheKey: string,
  sanitizeResponse?: CacheOptions['sanitizeResponse'],
) {
  const parsedResponse = JSON.parse(response);
  const sanitized = getSanitizedResponse(
    parsedResponse.data,
    parsedResponse.statusText,
    parsedResponse.headers,
    sanitizeResponse,
  );
  return {
    cached,
    data: sanitized.data as T,
    status: parsedResponse.status,
    statusText: sanitized.statusText,
    headers: sanitized.headers,
    latencyMs: parsedResponse.latencyMs,
    deleteFromCache: async () => {
      await cache.del(cacheKey);
      logger.debug(`Evicted from cache: ${cacheKey}`);
    },
    updateCache: async (
      data: unknown,
      status: number,
      statusText: string,
      headers?: Record<string, string>,
    ) => {
      await cache.set(
        cacheKey,
        serializeFetchResponse(
          data,
          status,
          statusText,
          headers ?? {},
          parsedResponse.latencyMs,
          sanitizeResponse,
        ),
      );
      logger.debug(`Updated cached response: ${cacheKey}`);
    },
  };
}

async function fetchAndReadBody(
  url: RequestInfo,
  options: FetchOptions,
  timeout: number,
  maxRetries: number | undefined,
  isIdempotent: boolean,
  logEnabled: boolean,
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
        if (logEnabled) {
          logger.debug('[Cache] Body stream failed with transient error, retrying', {
            attempt: bodyAttempt + 1,
            maxRetries: maxBodyRetries,
            backoffMs,
            error: (err as Error)?.message?.slice(0, 200),
          });
        }
        await sleep(backoffMs);
        continue;
      }
      // Preserve cancellation: an aborted body read rejects with an AbortError, and
      // callers (e.g. evaluator.ts) suppress expected cancellation by checking
      // `err.name === 'AbortError'`. Wrapping it would reset the name to 'Error' and
      // turn cancelled evals into ordinary provider failures, so rethrow aborts as-is.
      if (isAbortError(err)) {
        throw err;
      }
      // Surface the URL and HTTP response context so opaque body-read failures
      // (e.g. "TypeError: terminated" from a Cloudflare-originated 403) include
      // actionable diagnostics instead of a bare platform error. Sanitize the URL so
      // credential-bearing userinfo / query params are not leaked into logs.
      const wrappedError = new Error(
        `Error reading response body from ${sanitizeUrlForLogging(getRequestUrlString(url))}: ${
          (err as Error).message
        }. HTTP ${resp.status} ${resp.statusText}`,
      ) as Error & { cause?: unknown };
      wrappedError.cause = err;
      throw wrappedError;
    }
  }
  // Unreachable: loop always returns or throws, but TypeScript needs this
  throw new Error('Exhausted body retries without returning or throwing');
}

function parseFetchResponse(
  url: RequestInfo,
  response: Response,
  responseText: string,
  format: 'json' | 'text',
  sanitizeResponse?: CacheOptions['sanitizeResponse'],
): unknown {
  try {
    return format === 'json' ? JSON.parse(responseText) : responseText;
  } catch (err) {
    const message = `Error parsing response from ${sanitizeUrlForLogging(getRequestUrlString(url))}:`;
    if (sanitizeResponse) {
      // Malformed JSON cannot pass through the sanitizer. Body text, parser excerpts,
      // and statusText can all contain escaped credentials, so omit them entirely.
      throw new Error(`${message} Invalid JSON. HTTP ${response.status}.`);
    }
    throw new Error(
      `${message} ${(err as Error).message}. HTTP ${response.status} ${response.statusText}. Received text: ${responseText}`,
    );
  }
}

async function prepareFetchResponse(
  url: RequestInfo,
  options: RequestInit,
  timeout: number,
  maxRetries: number | undefined,
  isIdempotent: boolean,
  format: 'json' | 'text',
  logEnabled: boolean,
  sanitizeResponse?: CacheOptions['sanitizeResponse'],
): Promise<PreparedFetchResponse> {
  const result = await fetchAndReadBody(
    url,
    options,
    timeout,
    maxRetries,
    isIdempotent,
    logEnabled,
  );
  const response = result.resp;
  const responseText = result.respText;
  const fetchLatencyMs = result.fetchLatencyMs;
  const parsedData = parseFetchResponse(url, response, responseText, format, sanitizeResponse);
  // Capture cacheability before a sanitizer can remove or change an upstream error.
  const responseError =
    format === 'json' &&
    parsedData !== null &&
    typeof parsedData === 'object' &&
    'error' in parsedData
      ? parsedData.error
      : undefined;
  const serializedResponse = serializeFetchResponse(
    !response.ok && responseText === ''
      ? `Empty Response: ${response.status}: ${response.statusText}`
      : parsedData,
    response.status,
    response.statusText,
    Object.fromEntries(response.headers.entries()),
    fetchLatencyMs,
    sanitizeResponse,
  );

  if (!response.ok) {
    return { response: serializedResponse, cacheable: false };
  }

  if (responseError) {
    if (logEnabled) {
      logger.debug(
        `Not caching ${sanitizeUrlForLogging(getRequestUrlString(url))} because it contains an 'error' key: ${sanitizeResponse ? serializedResponse : responseError}`,
      );
    }
    return { response: serializedResponse, cacheable: false };
  }

  if (logEnabled) {
    logger.debug(
      `Storing ${sanitizeUrlForLogging(getRequestUrlString(url))} response in cache with latencyMs=${fetchLatencyMs}: ${serializedResponse}`,
    );
  }
  return { response: serializedResponse, cacheable: true };
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
  options: FetchOptions = {},
  timeout: number = getRequestTimeoutMs(),
  format: 'json' | 'text' = 'json',
  bustOrOptions: boolean | CacheOptions | undefined = false,
  maxRetries?: number,
): Promise<FetchWithCacheResult<T>> {
  const fetchOptions = preserveCloudAuthRedirects(url, options);
  const cacheOptions: CacheOptions =
    typeof bustOrOptions === 'boolean' ? { bust: bustOrOptions } : (bustOrOptions ?? {});
  const { bust = false, repeatIndex, cacheKey: providedCacheKey, sanitizeResponse } = cacheOptions;
  const logEnabled =
    new Headers(getFetchWithProxyHeaders(url, fetchOptions)).get('x-promptfoo-silent') !== 'true';

  // Only retry body-read for idempotent methods to avoid double-submitting
  // POST/PATCH requests (the server already processed the request once
  // headers arrived; only the response body stream failed).
  const method = (
    fetchOptions.method ?? (url instanceof Request ? url.method : 'GET')
  ).toUpperCase();
  const isIdempotent = ['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE'].includes(method);

  const cacheEnabled = getEffectiveCacheEnabled();
  if (cacheEnabled && !bust && fetchOptions.getAuthHeaders && !providedCacheKey) {
    throw new Error(
      'Request-time authentication requires cache bypass or an explicit principal-scoped cache key.',
    );
  }
  if (cacheEnabled && !bust && sanitizeResponse && !providedCacheKey) {
    throw new Error(
      'Response sanitization requires cache bypass or an explicit cache key identifying the sanitizer policy.',
    );
  }
  const repeatSuffix = shouldApplyRepeatCacheSuffix(repeatIndex) ? `:repeat${repeatIndex}` : '';
  // Caller-provided keys must not reuse responses accepted without Cloud redirect protection.
  const providedKeyPrefix = fetchOptions.restrictCloudAuthRedirects
    ? 'fetch:cloud-auth:v3'
    : 'fetch:v3';
  const cacheKey =
    cacheEnabled && !bust
      ? providedCacheKey
        ? getScopedCacheKey(`${providedKeyPrefix}:${providedCacheKey}${repeatSuffix}`)
        : getFetchCacheKey(url, fetchOptions, method, format, repeatIndex)
      : null;

  if (!cacheEnabled || bust || cacheKey == null) {
    const { respText, resp, fetchLatencyMs } = await fetchAndReadBody(
      url,
      fetchOptions,
      timeout,
      maxRetries,
      isIdempotent,
      logEnabled,
    );
    const parsedData = parseFetchResponse(url, resp, respText, format, sanitizeResponse);
    const sanitized = getSanitizedResponse(
      parsedData,
      resp.statusText,
      Object.fromEntries(resp.headers.entries()),
      sanitizeResponse,
    );
    return {
      cached: false,
      data: sanitized.data as T,
      status: resp.status,
      statusText: sanitized.statusText,
      headers: sanitized.headers,
      latencyMs: fetchLatencyMs,
      deleteFromCache: async () => {
        // No-op when cache is disabled
      },
    };
  }

  const backend = getCacheBackend();
  const cache = getCacheInstance(backend);
  const inflightFetchResponses = backend.inflight;
  const generationState = getCacheGeneration(backend);
  const clearGeneration = generationState.clearGeneration;
  await Promise.allSettled(
    [...backend.clears]
      .filter(([, prefix]) => !prefix || cacheKey.startsWith(prefix))
      .map(([clearing]) => clearing),
  );

  const cachedResponse = await cache.get<SerializedFetchResponse>(cacheKey);
  if (cachedResponse != null) {
    const result = deserializeFetchResponse<T>(
      cachedResponse,
      true,
      cache,
      cacheKey,
      sanitizeResponse,
    );
    if (logEnabled) {
      const loggedResponse = sanitizeResponse
        ? serializeFetchResponse(
            result.data,
            result.status,
            result.statusText,
            result.headers,
            result.latencyMs,
          )
        : cachedResponse;
      logger.debug(
        `Returning cached response for ${sanitizeUrlForLogging(getRequestUrlString(url))}: ${loggedResponse}`,
      );
    }
    return result;
  }

  const inflightCacheKey = `${clearGeneration}:${getInflightFetchCacheKey(cacheKey, url, fetchOptions)}`;
  let inflightResponse = inflightFetchResponses.get(inflightCacheKey);
  const coalesced = inflightResponse !== undefined;
  if (!inflightResponse) {
    inflightResponse = (async () => {
      const preparedResponse = await prepareFetchResponse(
        url,
        fetchOptions,
        timeout,
        maxRetries,
        isIdempotent,
        format,
        logEnabled,
        sanitizeResponse,
      );
      if (preparedResponse.cacheable && generationState.clearGeneration === clearGeneration) {
        const write = cache
          .set(cacheKey, preparedResponse.response)
          .finally(() => backend.writes.delete(write));
        backend.writes.set(write, cacheKey);
        await write;
      }
      return preparedResponse.response;
    })().finally(() => {
      inflightFetchResponses.delete(inflightCacheKey);
    });
    inflightFetchResponses.set(inflightCacheKey, inflightResponse);
  }

  const response = await inflightResponse;
  const result = deserializeFetchResponse<T>(response, false, cache, cacheKey, sanitizeResponse);
  return coalesced ? { ...result, coalesced: true } : result;
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
 * Clear the configured default and all retained cache backends.
 * Pass a cache directory to target it, including after its invocation has ended.
 *
 * The next request to a cleared cache refetches its response.
 *
 * @example
 * ```typescript
 * import { cache, evaluate } from 'promptfoo';
 *
 * await cache.clearCache();
 * const results = await evaluate(testSuite);  // Refetches all
 * ```
 */
export async function clearCache(cachePath?: string) {
  // Explicit clearing works even when reads/writes are disabled.
  const configured = getCacheBackend(true, cachePath);
  const backends = cachePath === undefined ? [...cacheBackends.values()] : [configured];
  await Promise.all(backends.map((backend) => getCacheInstance(backend).clear()));
  return true;
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
