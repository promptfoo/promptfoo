import fs from 'fs';

import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type MockInstance,
  vi,
} from 'vitest';
import {
  clearCache,
  disableCache,
  enableCache,
  fetchWithCache,
  getCache,
  isCacheEnabled,
  withCacheNamespace,
} from '../src/cache';
import { fetchWithRetries } from '../src/util/fetch/index';
import { mockProcessEnv } from './util/utils';

vi.mock('../src/util/config/manage', () => ({
  getConfigDirectoryPath: vi.fn().mockReturnValue('/mock/config/path'),
}));

vi.mock('../src/globalConfig/cloud', () => ({
  CLOUD_API_HOST: 'https://api.promptfoo.app',
  cloudConfig: {
    getApiKey: vi.fn(() => process.env.PROMPTFOO_API_KEY),
  },
}));

// Mock fetchWithRetries to return proper Response objects
vi.mock('../src/util/fetch/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/util/fetch/index')>()),
  fetchWithRetries: vi.fn(),
}));

// Mock sleep to avoid real delays in body-read retry tests
vi.mock('../src/util/time', () => ({
  sleep: vi.fn().mockResolvedValue(undefined),
}));

const mockFetchWithRetries = vi.mocked(fetchWithRetries);

// Mock cache-manager v7
vi.mock('cache-manager', () => ({
  createCache: vi.fn().mockImplementation(({ stores }) => {
    const cache = new Map<string, unknown>();
    const expiresAt = new Map<string, number>();
    const inflight = new Map();
    const memoryStore = {
      iterator: vi.fn().mockImplementation(async function* (_namespace?: string) {
        for (const [key, value] of cache.entries()) {
          yield [key, value];
        }
      }),
      delete: vi.fn().mockImplementation((key: string) => {
        cache.delete(key);
        expiresAt.delete(key);
        return Promise.resolve(true);
      }),
      deleteMany: vi.fn().mockImplementation((keys: string[]) => {
        for (const key of keys) {
          cache.delete(key);
          expiresAt.delete(key);
        }
        return Promise.resolve(true);
      }),
      clear: vi.fn().mockImplementation(() => {
        cache.clear();
        expiresAt.clear();
        return Promise.resolve();
      }),
    };

    return {
      stores: stores?.length ? stores : [memoryStore],
      get: vi.fn().mockImplementation((key) => cache.get(key)),
      set: vi.fn().mockImplementation((key, value, ttl) => {
        cache.set(key, value);
        if (ttl === undefined) {
          expiresAt.delete(key);
        } else {
          expiresAt.set(key, Date.now() + ttl);
        }
        return Promise.resolve();
      }),
      del: vi.fn().mockImplementation((key) => {
        cache.delete(key);
        expiresAt.delete(key);
        return Promise.resolve();
      }),
      clear: vi.fn().mockImplementation(() => {
        cache.clear();
        expiresAt.clear();
        inflight.clear();
        return Promise.resolve(true);
      }),
      wrap: vi.fn().mockImplementation(async (key, fn) => {
        if (cache.has(key)) {
          return cache.get(key);
        }
        if (inflight.has(key)) {
          return inflight.get(key);
        }
        const pending = (async () => {
          try {
            const value = await fn();
            if (value !== undefined) {
              cache.set(key, value);
            }
            return value;
          } finally {
            inflight.delete(key);
          }
        })();
        inflight.set(key, pending);
        return pending;
      }),
      // Add required Cache interface methods
      mget: vi.fn().mockImplementation((keys: string[]) => {
        return Promise.resolve(keys.map((key) => cache.get(key)));
      }),
      mset: vi
        .fn()
        .mockImplementation((list: Array<{ key: string; value: unknown; ttl?: number }>) => {
          for (const { key, value, ttl } of list) {
            cache.set(key, value);
            if (ttl === undefined) {
              expiresAt.delete(key);
            } else {
              expiresAt.set(key, Date.now() + ttl);
            }
          }
          return Promise.resolve(list);
        }),
      mdel: vi.fn().mockImplementation((keys: string[]) => {
        for (const key of keys) {
          cache.delete(key);
          expiresAt.delete(key);
        }
        return Promise.resolve(true);
      }),
      reset: vi.fn(),
      ttl: vi.fn().mockImplementation((key: string) => {
        const expiry = expiresAt.get(key);
        if (expiry === undefined) {
          return Promise.resolve(undefined);
        }
        return Promise.resolve(Math.max(0, expiry - Date.now()));
      }),
      on: vi.fn(),
      removeAllListeners: vi.fn(),
    } as any;
  }),
}));

// Mock keyv and keyv-file with proper class constructors
vi.mock('keyv', () => {
  return {
    Keyv: class MockKeyv {},
  };
});

vi.mock('keyv-file', () => {
  return {
    __esModule: true,
    KeyvFile: class MockKeyvFile {},
    default: class MockKeyvFile {},
  };
});

const mockFetchWithRetriesResponse = (
  ok: boolean,
  response: object | string,
  contentType = 'application/json',
): Response => {
  const responseText = typeof response === 'string' ? response : JSON.stringify(response);
  return {
    ok,
    status: ok ? 200 : 400,
    statusText: ok ? 'OK' : 'Bad Request',
    text: () => Promise.resolve(responseText),
    json: () => {
      try {
        return Promise.resolve(JSON.parse(responseText));
      } catch (err) {
        return Promise.reject(err);
      }
    },
    headers: new Headers({
      'content-type': contentType,
      'x-session-id': '45',
    }),
  } as Response;
};

describe('cache configuration', () => {
  const originalEnv = { ...process.env };
  let mkdirSyncMock: MockInstance;
  let existsSyncMock: MockInstance;

  beforeEach(() => {
    vi.resetModules();
    mockProcessEnv({ ...originalEnv }, { clear: true });
    // Clear cache type override from test setup
    mockProcessEnv({ PROMPTFOO_CACHE_TYPE: undefined });
    mkdirSyncMock = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);
    existsSyncMock = vi.spyOn(fs, 'existsSync').mockReturnValue(false);
  });

  afterEach(() => {
    mockProcessEnv(originalEnv, { clear: true });
    mkdirSyncMock.mockRestore();
    existsSyncMock.mockRestore();
  });

  it('should use memory cache in test environment', async () => {
    mockProcessEnv({ NODE_ENV: 'test' });
    const cacheModule = await import('../src/cache');
    const cache = cacheModule.getCache();
    // In test environment, promptfoo falls back to an in-memory store instead of disk.
    expect(cache.stores.length).toBeGreaterThan(0);
  });

  it('should use disk cache in non-test environment', async () => {
    mockProcessEnv({ NODE_ENV: 'production' });
    const cacheModule = await import('../src/cache');
    const cache = cacheModule.getCache();
    // In production, stores array should have at least one store (disk cache)
    expect(cache.stores.length).toBeGreaterThan(0);
  });

  it('should respect custom cache path', async () => {
    mockProcessEnv({ PROMPTFOO_CACHE_PATH: '/custom/cache/path' });
    mockProcessEnv({ NODE_ENV: 'production' });
    const cacheModule = await import('../src/cache');
    cacheModule.getCache();
    expect(fs.mkdirSync).toHaveBeenCalledWith('/custom/cache/path', { recursive: true });
  });

  it('should respect cache configuration from environment', async () => {
    mockProcessEnv({ PROMPTFOO_CACHE_MAX_FILE_COUNT: '100' });
    mockProcessEnv({ PROMPTFOO_CACHE_TTL: '3600' });
    mockProcessEnv({ PROMPTFOO_CACHE_MAX_SIZE: '1000000' });
    mockProcessEnv({ NODE_ENV: 'production' });

    const cacheModule = await import('../src/cache');
    const cache = cacheModule.getCache();
    // Should have disk cache store
    expect(cache.stores.length).toBeGreaterThan(0);
  });

  it('should handle cache directory creation when it exists', async () => {
    existsSyncMock.mockReturnValue(true);
    mockProcessEnv({ NODE_ENV: 'production' });

    const cacheModule = await import('../src/cache');
    cacheModule.getCache();
    expect(mkdirSyncMock).not.toHaveBeenCalled();
  });
});

describe('fetchWithCache', () => {
  const url = 'https://api.example.com/data';
  const response = { data: 'test data' };

  beforeEach(async () => {
    vi.resetModules();
    mockFetchWithRetries.mockReset();
    await clearCache();
    enableCache();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(() => {
    enableCache(); // Reset to default state
  });

  describe('with cache enabled', () => {
    it('should isolate direct cache access by namespace', async () => {
      const cache = getCache();

      await cache.set('shared-key', 'global-value');

      await withCacheNamespace('repeat:0', async () => {
        const scopedCache = getCache();
        await scopedCache.set('shared-key', 'repeat-0-value');

        expect(await scopedCache.get('shared-key')).toBe('repeat-0-value');
      });

      await withCacheNamespace('repeat:1', async () => {
        const scopedCache = getCache();

        expect(await scopedCache.get('shared-key')).toBeUndefined();
      });

      expect(await cache.get('shared-key')).toBe('global-value');
    });

    it('should isolate bulk cache access and namespace-local clear operations', async () => {
      const cache = getCache();
      await cache.mset([{ key: 'bulk-key', value: 'global-value' }]);

      await withCacheNamespace('repeat:0', async () => {
        const scopedCache = getCache();
        const savedEntries = await scopedCache.mset([
          { key: 'bulk-key', value: 'repeat-0-value', ttl: 5000 },
        ]);

        expect(savedEntries).toEqual([{ key: 'bulk-key', value: 'repeat-0-value', ttl: 5000 }]);
        expect(await scopedCache.mget(['bulk-key'])).toEqual(['repeat-0-value']);
        expect(await scopedCache.ttl('bulk-key')).toEqual(expect.any(Number));
      });

      await withCacheNamespace('repeat:1', async () => {
        const scopedCache = getCache();

        expect(await scopedCache.mget(['bulk-key'])).toEqual([undefined]);
        expect(await scopedCache.ttl('bulk-key')).toBeUndefined();
        expect(await scopedCache.clear()).toBe(true);
      });

      expect(await cache.mget(['bulk-key'])).toEqual(['global-value']);

      await withCacheNamespace('repeat:0', async () => {
        const scopedCache = getCache();

        expect(await scopedCache.mget(['bulk-key'])).toEqual(['repeat-0-value']);
        expect(await scopedCache.mdel(['bulk-key'])).toBe(true);
        expect(await scopedCache.mget(['bulk-key'])).toEqual([undefined]);
      });
    });

    it('should fetch and cache successful requests', async () => {
      const mockResponse = mockFetchWithRetriesResponse(true, response);
      mockFetchWithRetries.mockResolvedValueOnce(mockResponse);

      const result = await fetchWithCache(url, {}, 1000);

      expect(mockFetchWithRetries).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        cached: false,
        data: response,
        status: 200,
        statusText: 'OK',
        headers: { 'x-session-id': '45', 'content-type': 'application/json' },
      });
      expect(result.deleteFromCache).toBeInstanceOf(Function);

      // Second call should use cache
      const cachedResult = await fetchWithCache(url, {}, 1000);
      expect(mockFetchWithRetries).toHaveBeenCalledTimes(1); // No additional fetch calls
      expect(cachedResult).toMatchObject({
        data: response,
        status: 200,
        statusText: 'OK',
        headers: { 'x-session-id': '45', 'content-type': 'application/json' },
        cached: true,
      });
      expect(cachedResult.deleteFromCache).toBeInstanceOf(Function);
    });

    it('should return cached false to all concurrent callers on a cache miss', async () => {
      const mockResponse = mockFetchWithRetriesResponse(true, response);
      mockFetchWithRetries.mockResolvedValue(mockResponse);

      const [result1, result2] = await Promise.all([
        fetchWithCache(url, {}, 1000),
        fetchWithCache(url, {}, 1000),
      ]);

      expect(result1).toMatchObject({
        cached: false,
        data: response,
        status: 200,
      });
      expect(result2).toMatchObject({
        cached: false,
        data: response,
        status: 200,
      });
      expect(mockFetchWithRetries).toHaveBeenCalledTimes(1);

      const cachedResult = await fetchWithCache(url, {}, 1000);
      expect(cachedResult.cached).toBe(true);
      expect(cachedResult.data).toEqual(response);
      expect(mockFetchWithRetries).toHaveBeenCalledTimes(1);
    });

    it('should isolate in-flight fetch deduping by namespace', async () => {
      mockFetchWithRetries
        .mockResolvedValueOnce(mockFetchWithRetriesResponse(true, { data: 'repeat 0' }))
        .mockResolvedValueOnce(mockFetchWithRetriesResponse(true, { data: 'repeat 1' }));

      const [repeat0Result, repeat1Result] = await Promise.all([
        withCacheNamespace('repeat:0', () => fetchWithCache(url, {}, 1000)),
        withCacheNamespace('repeat:1', () => fetchWithCache(url, {}, 1000)),
      ]);

      expect(mockFetchWithRetries).toHaveBeenCalledTimes(2);
      expect(repeat0Result.data).toEqual({ data: 'repeat 0' });
      expect(repeat1Result.data).toEqual({ data: 'repeat 1' });

      const repeat0CachedResult = await withCacheNamespace('repeat:0', () =>
        fetchWithCache(url, {}, 1000),
      );
      const repeat1CachedResult = await withCacheNamespace('repeat:1', () =>
        fetchWithCache(url, {}, 1000),
      );

      expect(mockFetchWithRetries).toHaveBeenCalledTimes(2);
      expect(repeat0CachedResult).toMatchObject({
        cached: true,
        data: { data: 'repeat 0' },
      });
      expect(repeat1CachedResult).toMatchObject({
        cached: true,
        data: { data: 'repeat 1' },
      });
    });

    it('should not cache failed requests', async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: () => Promise.resolve(JSON.stringify({ error: 'Bad Request' })),
        json: () => Promise.resolve({ error: 'Bad Request' }),
        headers: new Headers({
          'content-type': 'application/json',
          'x-session-id': '45',
        }),
      } as Response;
      mockFetchWithRetries.mockResolvedValueOnce(mockResponse);

      const result = await fetchWithCache(url, {}, 1000);
      expect(result.status).toBe(400);
      expect(result.statusText).toBe('Bad Request');
      expect(result.data).toEqual({ error: 'Bad Request' });

      // Second call should try fetching again
      mockFetchWithRetries.mockResolvedValueOnce(mockResponse);
      const result2 = await fetchWithCache(url, {}, 1000);
      expect(result2.status).toBe(400);
      expect(result2.statusText).toBe('Bad Request');
      expect(result2.data).toEqual({ error: 'Bad Request' });
      expect(mockFetchWithRetries).toHaveBeenCalledTimes(2);
    });

    it('should not cache successful responses that contain an error payload', async () => {
      const mockResponse = mockFetchWithRetriesResponse(true, { error: 'Rate limit exceeded' });
      mockFetchWithRetries.mockResolvedValue(mockResponse);

      const result = await fetchWithCache(url, {}, 1000);
      expect(result.status).toBe(200);
      expect(result.cached).toBe(false);
      expect(result.data).toEqual({ error: 'Rate limit exceeded' });

      const result2 = await fetchWithCache(url, {}, 1000);
      expect(result2.status).toBe(200);
      expect(result2.cached).toBe(false);
      expect(result2.data).toEqual({ error: 'Rate limit exceeded' });
      expect(mockFetchWithRetries).toHaveBeenCalledTimes(2);
    });

    it('should return non-cacheable successful error payloads to all concurrent callers', async () => {
      const mockResponse = mockFetchWithRetriesResponse(true, { error: 'Rate limit exceeded' });
      mockFetchWithRetries.mockResolvedValue(mockResponse);

      const [result1, result2] = await Promise.all([
        fetchWithCache(url, {}, 1000),
        fetchWithCache(url, {}, 1000),
      ]);

      expect(result1).toMatchObject({
        cached: false,
        status: 200,
        data: { error: 'Rate limit exceeded' },
      });
      expect(result2).toMatchObject({
        cached: false,
        status: 200,
        data: { error: 'Rate limit exceeded' },
      });
      expect(mockFetchWithRetries).toHaveBeenCalledTimes(1);

      const result3 = await fetchWithCache(url, {}, 1000);
      expect(result3.cached).toBe(false);
      expect(result3.data).toEqual({ error: 'Rate limit exceeded' });
      expect(mockFetchWithRetries).toHaveBeenCalledTimes(2);
    });

    it('should return failed responses to all concurrent callers without caching them', async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: () => Promise.resolve(JSON.stringify({ error: 'Bad Request' })),
        json: () => Promise.resolve({ error: 'Bad Request' }),
        headers: new Headers({
          'content-type': 'application/json',
          'x-session-id': '45',
        }),
      } as Response;
      mockFetchWithRetries.mockResolvedValue(mockResponse);

      const [result1, result2] = await Promise.all([
        fetchWithCache(url, {}, 1000),
        fetchWithCache(url, {}, 1000),
      ]);

      expect(result1).toMatchObject({
        cached: false,
        status: 400,
        data: { error: 'Bad Request' },
      });
      expect(result2).toMatchObject({
        cached: false,
        status: 400,
        data: { error: 'Bad Request' },
      });
      expect(mockFetchWithRetries).toHaveBeenCalledTimes(1);

      await fetchWithCache(url, {}, 1000);
      expect(mockFetchWithRetries).toHaveBeenCalledTimes(2);
    });

    it('should handle empty responses', async () => {
      const mockResponse = {
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: () => Promise.resolve(JSON.stringify({ error: 'Empty Response' })),
        json: () => Promise.resolve({ error: 'Empty Response' }),
        headers: new Headers({
          'content-type': 'application/json',
          'x-session-id': '45',
        }),
      } as Response;
      mockFetchWithRetries.mockResolvedValueOnce(mockResponse);

      const result = await fetchWithCache(url, {}, 1000);
      expect(result.status).toBe(400);
      expect(result.statusText).toBe('Bad Request');
      expect(result.data).toEqual({ error: 'Empty Response' });
    });

    it('should handle non-JSON responses when JSON is expected', async () => {
      const mockResponse = mockFetchWithRetriesResponse(true, 'not json');
      mockFetchWithRetries.mockResolvedValueOnce(mockResponse);

      await expect(fetchWithCache(url, {}, 1000, 'json')).rejects.toThrow('Error parsing response');
    });

    it('should handle request timeout', async () => {
      vi.useFakeTimers();
      const mockTimeoutPromise = new Promise((resolve) => {
        setTimeout(() => resolve(mockFetchWithRetriesResponse(true, response)), 2000);
      });
      mockFetchWithRetries.mockImplementationOnce(() => mockTimeoutPromise as Promise<Response>);

      const fetchPromise = fetchWithCache(url, {}, 100);

      await expect(
        Promise.race([
          fetchPromise,
          new Promise((_, reject) => {
            vi.advanceTimersByTime(150);
            reject(new Error('timeout'));
          }),
        ]),
      ).rejects.toThrow('timeout');
    });

    it('should handle network errors', async () => {
      mockFetchWithRetries.mockRejectedValueOnce(new Error('Network error'));
      await expect(fetchWithCache(url, {}, 100)).rejects.toThrow('Network error');
    });

    it('should allow retrying after concurrent network failures', async () => {
      mockFetchWithRetries.mockRejectedValueOnce(new Error('Network error'));

      const [result1, result2] = await Promise.allSettled([
        fetchWithCache(url, {}, 100),
        fetchWithCache(url, {}, 100),
      ]);

      expect(result1.status).toBe('rejected');
      expect(result2.status).toBe('rejected');
      expect(mockFetchWithRetries).toHaveBeenCalledTimes(1);

      mockFetchWithRetries.mockResolvedValueOnce(mockFetchWithRetriesResponse(true, response));
      const retryResult = await fetchWithCache(url, {}, 1000);

      expect(retryResult.cached).toBe(false);
      expect(retryResult.data).toEqual(response);
      expect(mockFetchWithRetries).toHaveBeenCalledTimes(2);
    });

    it('should isolate signaled in-flight failures from unsignaled callers', async () => {
      const controller = new AbortController();
      let resolveSignaledStarted: () => void = () => {};
      const signaledStarted = new Promise<void>((resolve) => {
        resolveSignaledStarted = resolve;
      });

      mockFetchWithRetries.mockImplementation((_requestUrl, requestOptions) => {
        const signal = requestOptions?.signal;
        if (signal === controller.signal) {
          resolveSignaledStarted();
          return new Promise<Response>((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
          });
        }
        return Promise.resolve(mockFetchWithRetriesResponse(true, { data: 'unsignaled' }));
      });

      const signaledPromise = fetchWithCache(url, { signal: controller.signal }, 1000);
      await signaledStarted;
      const unsignaledPromise = fetchWithCache(url, {}, 1000);

      controller.abort();
      const [signaledResult, unsignaledResult] = await Promise.allSettled([
        signaledPromise,
        unsignaledPromise,
      ]);

      expect(signaledResult).toMatchObject({ status: 'rejected' });
      if (signaledResult.status === 'rejected') {
        expect(signaledResult.reason.message).toBe('Aborted');
      }
      expect(unsignaledResult).toMatchObject({ status: 'fulfilled' });
      if (unsignaledResult.status === 'fulfilled') {
        expect(unsignaledResult.value).toMatchObject({
          cached: false,
          data: { data: 'unsignaled' },
        });
      }
      expect(mockFetchWithRetries).toHaveBeenCalledTimes(2);
    });

    it('should not let aborted signaled callers join unsignaled in-flight responses', async () => {
      const controller = new AbortController();
      let resolveUnsignaledFetch: (value: Response) => void = () => {};
      const unsignaledFetch = new Promise<Response>((resolve) => {
        resolveUnsignaledFetch = resolve;
      });

      mockFetchWithRetries.mockImplementation((_requestUrl, requestOptions) => {
        const signal = requestOptions?.signal;
        if (signal === controller.signal) {
          if (signal.aborted) {
            return Promise.reject(new Error('Aborted'));
          }
          return new Promise<Response>((_resolve, reject) => {
            signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
          });
        }
        return unsignaledFetch;
      });

      const unsignaledPromise = fetchWithCache(url, {}, 1000);
      const signaledPromise = fetchWithCache(url, { signal: controller.signal }, 1000);

      await Promise.resolve();
      controller.abort();
      resolveUnsignaledFetch(mockFetchWithRetriesResponse(true, { data: 'unsignaled' }));
      const [unsignaledResult, signaledResult] = await Promise.allSettled([
        unsignaledPromise,
        signaledPromise,
      ]);

      expect(unsignaledResult).toMatchObject({ status: 'fulfilled' });
      if (unsignaledResult.status === 'fulfilled') {
        expect(unsignaledResult.value).toMatchObject({
          cached: false,
          data: { data: 'unsignaled' },
        });
      }
      expect(signaledResult).toMatchObject({ status: 'rejected' });
      if (signaledResult.status === 'rejected') {
        expect(signaledResult.reason.message).toBe('Aborted');
      }
      expect(mockFetchWithRetries).toHaveBeenCalledTimes(2);
    });

    it('should handle request options in cache key', async () => {
      const options = { method: 'POST', body: JSON.stringify({ test: true }) };
      const mockResponse = mockFetchWithRetriesResponse(true, response);
      mockFetchWithRetries.mockResolvedValueOnce(mockResponse);

      await fetchWithCache(url, options, 1000);
      expect(mockFetchWithRetries).toHaveBeenCalledTimes(1);

      // Different options should trigger new fetch
      const differentOptions = { method: 'POST', body: JSON.stringify({ test: false }) };
      mockFetchWithRetries.mockResolvedValueOnce(mockResponse);
      await fetchWithCache(url, differentOptions, 1000);
      expect(mockFetchWithRetries).toHaveBeenCalledTimes(2);
    });

    it('should not cache opaque FormData request bodies', async () => {
      const cache = getCache();
      const firstFormData = new FormData();
      firstFormData.append('file', new Blob(['audio-one']), 'sample.wav');
      const secondFormData = new FormData();
      secondFormData.append('file', new Blob(['audio-two']), 'sample.wav');

      mockFetchWithRetries
        .mockResolvedValueOnce(mockFetchWithRetriesResponse(true, { data: 'first audio' }))
        .mockResolvedValueOnce(mockFetchWithRetriesResponse(true, { data: 'second audio' }));

      const firstResult = await fetchWithCache(
        url,
        { headers: { Authorization: 'Bearer same-token' }, method: 'POST', body: firstFormData },
        1000,
      );
      const secondResult = await fetchWithCache(
        url,
        { headers: { Authorization: 'Bearer same-token' }, method: 'POST', body: secondFormData },
        1000,
      );

      expect(mockFetchWithRetries).toHaveBeenCalledTimes(2);
      expect(firstResult.data).toEqual({ data: 'first audio' });
      expect(secondResult.data).toEqual({ data: 'second audio' });
      expect(vi.mocked(cache.set)).not.toHaveBeenCalled();
    });

    it('should not treat null init body as overriding a Request body when caching', async () => {
      const cache = getCache();
      mockFetchWithRetries
        .mockResolvedValueOnce(mockFetchWithRetriesResponse(true, { data: 'first request body' }))
        .mockResolvedValueOnce(mockFetchWithRetriesResponse(true, { data: 'second request body' }));

      const firstResult = await fetchWithCache(
        new Request(url, { method: 'POST', body: 'request-body-one' }),
        { method: 'POST', body: null },
        1000,
      );
      const secondResult = await fetchWithCache(
        new Request(url, { method: 'POST', body: 'request-body-two' }),
        { method: 'POST', body: null },
        1000,
      );

      expect(mockFetchWithRetries).toHaveBeenCalledTimes(2);
      expect(firstResult.data).toEqual({ data: 'first request body' });
      expect(secondResult.data).toEqual({ data: 'second request body' });
      expect(vi.mocked(cache.set)).not.toHaveBeenCalled();
    });

    it('should not cache requests with opaque transport options', async () => {
      const cache = getCache();
      mockFetchWithRetries
        .mockResolvedValueOnce(mockFetchWithRetriesResponse(true, { data: 'first identity' }))
        .mockResolvedValueOnce(mockFetchWithRetriesResponse(true, { data: 'second identity' }));

      const firstResult = await fetchWithCache(
        url,
        { dispatcher: { clientCert: 'first-cert' }, method: 'GET' } as unknown as RequestInit,
        1000,
      );
      const secondResult = await fetchWithCache(
        url,
        { dispatcher: { clientCert: 'second-cert' }, method: 'GET' } as unknown as RequestInit,
        1000,
      );

      expect(mockFetchWithRetries).toHaveBeenCalledTimes(2);
      expect(firstResult.data).toEqual({ data: 'first identity' });
      expect(secondResult.data).toEqual({ data: 'second identity' });
      expect(vi.mocked(cache.set)).not.toHaveBeenCalled();
    });

    it('should isolate cached responses by request headers without storing secrets in the key', async () => {
      const cache = getCache();
      mockFetchWithRetries
        .mockResolvedValueOnce(mockFetchWithRetriesResponse(true, { data: 'token one data' }))
        .mockResolvedValueOnce(mockFetchWithRetriesResponse(true, { data: 'token two data' }));

      const tokenOneResult = await fetchWithCache(
        'https://api.example.com/data?api_key=secret-url-token',
        {
          headers: { Authorization: 'Bearer secret-header-token-one' },
          method: 'POST',
          body: JSON.stringify({ apiKey: 'secret-body-token' }),
        },
        1000,
      );
      const tokenTwoResult = await fetchWithCache(
        'https://api.example.com/data?api_key=secret-url-token',
        {
          headers: { Authorization: 'Bearer secret-header-token-two' },
          method: 'POST',
          body: JSON.stringify({ apiKey: 'secret-body-token' }),
        },
        1000,
      );

      expect(mockFetchWithRetries).toHaveBeenCalledTimes(2);
      expect(tokenOneResult.data).toEqual({ data: 'token one data' });
      expect(tokenTwoResult.data).toEqual({ data: 'token two data' });

      const cacheKeys = vi.mocked(cache.set).mock.calls.map(([cacheKey]) => String(cacheKey));
      expect(cacheKeys).toHaveLength(2);
      for (const cacheKey of cacheKeys) {
        expect(cacheKey).not.toContain('secret-url-token');
        expect(cacheKey).not.toContain('secret-header-token');
        expect(cacheKey).not.toContain('secret-body-token');
      }
    });

    it('should isolate cloud requests by injected API key without storing the key', async () => {
      const cache = getCache();
      const restoreEnv = mockProcessEnv({ PROMPTFOO_API_KEY: 'secret-cloud-token-one' });
      mockFetchWithRetries.mockImplementation(() =>
        Promise.resolve(
          mockFetchWithRetriesResponse(true, {
            data:
              process.env.PROMPTFOO_API_KEY === 'secret-cloud-token-one'
                ? 'cloud token one data'
                : 'cloud token two data',
          }),
        ),
      );

      try {
        const requestOptions = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ task: 'same-body' }),
        };

        const tokenOneResult = await fetchWithCache(
          'https://api.promptfoo.app/api/v1/task',
          requestOptions,
          1000,
        );

        mockProcessEnv({ PROMPTFOO_API_KEY: 'secret-cloud-token-two' });

        const tokenTwoResult = await fetchWithCache(
          'https://api.promptfoo.app/api/v1/task',
          requestOptions,
          1000,
        );

        expect(mockFetchWithRetries).toHaveBeenCalledTimes(2);
        expect(tokenOneResult.data).toEqual({ data: 'cloud token one data' });
        expect(tokenTwoResult.data).toEqual({ data: 'cloud token two data' });

        const cacheKeys = vi.mocked(cache.set).mock.calls.map(([cacheKey]) => String(cacheKey));
        expect(cacheKeys).toHaveLength(2);
        for (const cacheKey of cacheKeys) {
          expect(cacheKey).not.toContain('secret-cloud-token-one');
          expect(cacheKey).not.toContain('secret-cloud-token-two');
        }
      } finally {
        restoreEnv();
      }
    });

    it('should preserve Request headers when isolating cached responses', async () => {
      const cache = getCache();
      mockFetchWithRetries
        .mockResolvedValueOnce(mockFetchWithRetriesResponse(true, { data: 'request token one' }))
        .mockResolvedValueOnce(mockFetchWithRetriesResponse(true, { data: 'request token two' }));

      const firstRequest = new Request(url, {
        headers: { Authorization: 'Bearer request-token-one' },
      });
      const secondRequest = new Request(url, {
        headers: { Authorization: 'Bearer request-token-two' },
      });

      const firstResult = await fetchWithCache(firstRequest, {}, 1000);
      const secondResult = await fetchWithCache(secondRequest, {}, 1000);

      expect(mockFetchWithRetries).toHaveBeenCalledTimes(2);
      expect(firstResult.data).toEqual({ data: 'request token one' });
      expect(secondResult.data).toEqual({ data: 'request token two' });

      const cacheKeys = vi.mocked(cache.set).mock.calls.map(([cacheKey]) => String(cacheKey));
      expect(cacheKeys).toHaveLength(2);
      for (const cacheKey of cacheKeys) {
        expect(cacheKey).not.toContain('request-token-one');
        expect(cacheKey).not.toContain('request-token-two');
      }
    });

    it('should treat init headers as replacing Request headers in cache keys', async () => {
      const cache = getCache();
      mockFetchWithRetries
        .mockResolvedValueOnce(mockFetchWithRetriesResponse(true, { data: 'request auth' }))
        .mockResolvedValueOnce(mockFetchWithRetriesResponse(true, { data: 'init headers' }));

      const request = new Request(url, {
        headers: { Authorization: 'Bearer request-token' },
      });

      const requestHeaderResult = await fetchWithCache(request, {}, 1000);
      const initHeaderResult = await fetchWithCache(request, { headers: {} }, 1000);

      expect(mockFetchWithRetries).toHaveBeenCalledTimes(2);
      expect(requestHeaderResult.data).toEqual({ data: 'request auth' });
      expect(initHeaderResult.data).toEqual({ data: 'init headers' });

      const cacheKeys = vi.mocked(cache.set).mock.calls.map(([cacheKey]) => String(cacheKey));
      expect(cacheKeys).toHaveLength(2);
      for (const cacheKey of cacheKeys) {
        expect(cacheKey).not.toContain('request-token');
      }
    });

    it('should normalize request method casing in cache keys', async () => {
      mockFetchWithRetries.mockResolvedValueOnce(
        mockFetchWithRetriesResponse(true, { data: 'method-normalized' }),
      );

      const lowercaseMethodResult = await fetchWithCache(url, { method: 'get' }, 1000);
      const uppercaseMethodResult = await fetchWithCache(url, { method: 'GET' }, 1000);

      expect(mockFetchWithRetries).toHaveBeenCalledTimes(1);
      expect(lowercaseMethodResult.cached).toBe(false);
      expect(uppercaseMethodResult).toMatchObject({
        cached: true,
        data: { data: 'method-normalized' },
      });
    });

    it('should canonicalize primitive fetch option order in cache keys', async () => {
      mockFetchWithRetries.mockResolvedValueOnce(
        mockFetchWithRetriesResponse(true, { data: 'ordered-options' }),
      );

      const firstResult = await fetchWithCache(
        url,
        { cache: 'no-store', credentials: 'same-origin' },
        1000,
      );
      const secondResult = await fetchWithCache(
        url,
        { credentials: 'same-origin', cache: 'no-store' },
        1000,
      );

      expect(mockFetchWithRetries).toHaveBeenCalledTimes(1);
      expect(firstResult.cached).toBe(false);
      expect(secondResult).toMatchObject({
        cached: true,
        data: { data: 'ordered-options' },
      });
    });

    it('should isolate cached responses by requested response format', async () => {
      mockFetchWithRetries
        .mockResolvedValueOnce(mockFetchWithRetriesResponse(true, { data: 'json data' }))
        .mockResolvedValueOnce(
          mockFetchWithRetriesResponse(true, 'plain text response', 'text/plain'),
        );

      const jsonResult = await fetchWithCache(url, {}, 1000, 'json');
      const textResult = await fetchWithCache<string>(url, {}, 1000, 'text');

      expect(mockFetchWithRetries).toHaveBeenCalledTimes(2);
      expect(jsonResult.data).toEqual({ data: 'json data' });
      expect(textResult.data).toBe('plain text response');
    });

    it('should respect cache busting', async () => {
      const mockResponse = mockFetchWithRetriesResponse(true, response);
      mockFetchWithRetries.mockResolvedValueOnce(mockResponse);
      await fetchWithCache(url, {}, 1000);

      mockFetchWithRetries.mockResolvedValueOnce(
        mockFetchWithRetriesResponse(true, { data: 'new data' }),
      );
      const result = await fetchWithCache(url, {}, 1000, 'json', true);

      expect(mockFetchWithRetries).toHaveBeenCalledTimes(2);
      expect(result.data).toEqual({ data: 'new data' });
      expect(result.cached).toBe(false);
    });
  });

  describe('with cache disabled', () => {
    const BODY_READ_TOTAL_ATTEMPTS = 3; // 1 initial attempt + 2 retries

    beforeEach(() => {
      disableCache();
    });

    it('should always fetch fresh data', async () => {
      const mockResponse = mockFetchWithRetriesResponse(true, response);
      mockFetchWithRetries.mockResolvedValueOnce(mockResponse);

      const firstResult = await fetchWithCache(url, {}, 1000);
      expect(mockFetchWithRetries).toHaveBeenCalledTimes(1);
      expect(firstResult).toMatchObject({
        cached: false,
        data: response,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json', 'x-session-id': '45' },
      });
      expect(firstResult.deleteFromCache).toBeInstanceOf(Function);

      // Second call should fetch again
      mockFetchWithRetries.mockResolvedValueOnce(mockResponse);
      const secondResult = await fetchWithCache(url, {}, 1000);
      expect(mockFetchWithRetries).toHaveBeenCalledTimes(2);
      expect(secondResult).toMatchObject({
        cached: false,
        data: response,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json', 'x-session-id': '45' },
      });
      expect(secondResult.deleteFromCache).toBeInstanceOf(Function);
    });

    it('should retry on transient body-read error then succeed', async () => {
      const responseText = JSON.stringify(response);
      const textMockFail = vi
        .fn<() => Promise<string>>()
        .mockRejectedValue(new Error('ECONNRESET during body read'));
      const textMockSuccess = vi.fn<() => Promise<string>>().mockResolvedValue(responseText);

      mockFetchWithRetries.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: textMockFail,
        headers: new Headers({ 'content-type': 'application/json' }),
      } as unknown as Response);
      // Second fetch (after body retry): succeeds
      mockFetchWithRetries.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: textMockSuccess,
        headers: new Headers({ 'content-type': 'application/json' }),
      } as unknown as Response);

      const result = await fetchWithCache(url, {}, 1000);

      expect(mockFetchWithRetries).toHaveBeenCalledTimes(2);
      expect(textMockFail).toHaveBeenCalledTimes(1);
      expect(textMockSuccess).toHaveBeenCalledTimes(1);
      expect(result.data).toEqual(response);
      expect(result.cached).toBe(false);
    });

    it('should throw after exhausting body-read retries', async () => {
      // All fetches return responses whose text() fails with transient error
      for (let i = 0; i < BODY_READ_TOTAL_ATTEMPTS; i++) {
        mockFetchWithRetries.mockResolvedValueOnce({
          ok: true,
          status: 200,
          statusText: 'OK',
          text: () => Promise.reject(new Error('ECONNRESET during body read')),
          headers: new Headers({ 'content-type': 'application/json' }),
        } as unknown as Response);
      }

      await expect(fetchWithCache(url, {}, 1000)).rejects.toThrow('ECONNRESET');
      expect(mockFetchWithRetries).toHaveBeenCalledTimes(BODY_READ_TOTAL_ATTEMPTS);
    });

    it('should not retry body-read for non-transient errors', async () => {
      mockFetchWithRetries.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.reject(new Error('self signed certificate')),
        headers: new Headers({ 'content-type': 'application/json' }),
      } as unknown as Response);

      await expect(fetchWithCache(url, {}, 1000)).rejects.toThrow('self signed certificate');
      // Only 1 fetch — no retry for permanent errors
      expect(mockFetchWithRetries).toHaveBeenCalledTimes(1);
    });

    it('should not retry body-read for POST requests (non-idempotent)', async () => {
      mockFetchWithRetries.mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: () => Promise.reject(new Error('ECONNRESET during body read')),
        headers: new Headers({ 'content-type': 'application/json' }),
      } as unknown as Response);

      await expect(fetchWithCache(url, { method: 'POST', body: '{}' }, 1000)).rejects.toThrow(
        'ECONNRESET',
      );
      // Only 1 fetch — no body retry for non-idempotent methods
      expect(mockFetchWithRetries).toHaveBeenCalledTimes(1);
    });

    it('should not catch fetchWithRetries errors in body retry loop', async () => {
      // fetchWithRetries itself throws — should propagate directly, not retry
      mockFetchWithRetries.mockRejectedValueOnce(new Error('ECONNRESET from fetch'));

      await expect(fetchWithCache(url, {}, 1000)).rejects.toThrow('ECONNRESET from fetch');
      // Only 1 call — body retry loop does not re-invoke fetchWithRetries
      expect(mockFetchWithRetries).toHaveBeenCalledTimes(1);
    });
  });

  describe('cache utility functions', () => {
    it('should track cache enabled state', () => {
      expect(isCacheEnabled()).toBe(true);
      disableCache();
      expect(isCacheEnabled()).toBe(false);
      enableCache();
      expect(isCacheEnabled()).toBe(true);
    });

    it('should clear cache', async () => {
      const mockResponse = mockFetchWithRetriesResponse(true, response);
      mockFetchWithRetries.mockResolvedValueOnce(mockResponse);
      await fetchWithCache(url, {}, 1000);
      expect(mockFetchWithRetries).toHaveBeenCalledTimes(1);

      await clearCache();

      mockFetchWithRetries.mockResolvedValueOnce(mockResponse);
      await fetchWithCache(url, {}, 1000);
      expect(mockFetchWithRetries).toHaveBeenCalledTimes(2);
    });
  });
});
