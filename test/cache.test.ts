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
  isCacheEnabled,
} from '../src/cache';
import { fetchWithRetries } from '../src/util/fetch/index';

vi.mock('../src/util/config/manage', () => ({
  getConfigDirectoryPath: vi.fn().mockReturnValue('/mock/config/path'),
}));

// Mock fetchWithRetries to return proper Response objects
vi.mock('../src/util/fetch/index', () => ({
  fetchWithRetries: vi.fn(),
}));

// Mock cacheMigration
vi.mock('../src/cacheMigration', () => ({
  shouldRunMigration: vi.fn().mockReturnValue(false), // Don't run migration by default in tests
  runMigration: vi.fn().mockReturnValue({
    success: true,
    stats: { successCount: 0, skippedExpired: 0, failureCount: 0, errors: [] },
  }),
}));

const mockFetchWithRetries = vi.mocked(fetchWithRetries);

// Mock cache-manager v7
vi.mock('cache-manager', () => ({
  createCache: vi.fn().mockImplementation(({ stores }) => {
    const cache = new Map();
    return {
      stores: stores || [],
      get: vi.fn().mockImplementation((key) => cache.get(key)),
      set: vi.fn().mockImplementation((key, value) => {
        cache.set(key, value);
        return Promise.resolve();
      }),
      del: vi.fn().mockImplementation((key) => {
        cache.delete(key);
        return Promise.resolve();
      }),
      clear: vi.fn().mockImplementation(() => {
        cache.clear();
        return Promise.resolve();
      }),
      wrap: vi.fn().mockImplementation(async (key, fn) => {
        const existing = cache.get(key);
        if (existing) {
          return existing;
        }
        const value = await fn();
        cache.set(key, value);
        return value;
      }),
      // Add required Cache interface methods
      mget: vi.fn(),
      mset: vi.fn(),
      mdel: vi.fn(),
      reset: vi.fn(),
      ttl: vi.fn(),
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
    json: () => (ok ? Promise.resolve(response) : Promise.reject(new Error('Invalid JSON'))),
    headers: new Headers({
      'content-type': contentType,
      'x-session-id': '45',
    }),
  } as Response;
};

describe('cache configuration', () => {
  const originalEnv = process.env;
  let mkdirSyncMock: MockInstance;
  let existsSyncMock: MockInstance;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    // Clear cache type override from test setup
    delete process.env.PROMPTFOO_CACHE_TYPE;
    mkdirSyncMock = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);
    existsSyncMock = vi.spyOn(fs, 'existsSync').mockReturnValue(false);
  });

  afterEach(() => {
    process.env = originalEnv;
    mkdirSyncMock.mockRestore();
    existsSyncMock.mockRestore();
  });

  it('should use memory cache in test environment', async () => {
    process.env.NODE_ENV = 'test';
    const cacheModule = await import('../src/cache');
    const cache = cacheModule.getCache();
    // In test environment, stores array should be empty (memory cache)
    expect(cache.stores).toEqual([]);
  });

  it('should use disk cache in non-test environment', async () => {
    process.env.NODE_ENV = 'production';
    const cacheModule = await import('../src/cache');
    const cache = cacheModule.getCache();
    // In production, stores array should have at least one store (disk cache)
    expect(cache.stores.length).toBeGreaterThan(0);
  });

  it('should respect custom cache path', async () => {
    process.env.PROMPTFOO_CACHE_PATH = '/custom/cache/path';
    process.env.NODE_ENV = 'production';
    const cacheModule = await import('../src/cache');
    cacheModule.getCache();
    expect(fs.mkdirSync).toHaveBeenCalledWith('/custom/cache/path', { recursive: true });
  });

  it('should respect cache configuration from environment', async () => {
    process.env.PROMPTFOO_CACHE_MAX_FILE_COUNT = '100';
    process.env.PROMPTFOO_CACHE_TTL = '3600';
    process.env.PROMPTFOO_CACHE_MAX_SIZE = '1000000';
    process.env.NODE_ENV = 'production';

    const cacheModule = await import('../src/cache');
    const cache = cacheModule.getCache();
    // Should have disk cache store
    expect(cache.stores.length).toBeGreaterThan(0);
  });

  it('should handle cache directory creation when it exists', async () => {
    existsSyncMock.mockReturnValue(true);
    process.env.NODE_ENV = 'production';

    const cacheModule = await import('../src/cache');
    cacheModule.getCache();
    expect(mkdirSyncMock).not.toHaveBeenCalled();
  });
});

describe('fetchWithCache', () => {
  const url = 'https://api.example.com/data';
  const response = { data: 'test data' };

  beforeEach(() => {
    vi.resetModules();
    mockFetchWithRetries.mockReset();
    clearCache();
    enableCache();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(() => {
    enableCache(); // Reset to default state
  });

  describe('with cache enabled', () => {
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

    it('should detect HTML error pages returned instead of JSON', async () => {
      const htmlErrorPage = `<html>
<head><title>504 Gateway Time-out</title></head>
<body>
<center><h1>504 Gateway Time-out</h1></center>
</body>
</html>`;
      const mockResponse = mockFetchWithRetriesResponse(true, htmlErrorPage);
      mockFetchWithRetries.mockResolvedValueOnce(mockResponse);

      await expect(fetchWithCache(url, {}, 1000, 'json')).rejects.toThrow(
        'Received HTML instead of JSON (server may be experiencing issues)',
      );
    });

    it('should include partial HTML content in error message', async () => {
      const htmlErrorPage = '<html><body><h1>Error</h1></body></html>';
      const mockResponse = mockFetchWithRetriesResponse(true, htmlErrorPage);
      mockFetchWithRetries.mockResolvedValueOnce(mockResponse);

      await expect(fetchWithCache(url, {}, 1000, 'json')).rejects.toThrow(/<html>/);
    });

    it('should truncate long response text in JSON parsing errors', async () => {
      const longInvalidJson = 'a'.repeat(1000);
      const mockResponse = mockFetchWithRetriesResponse(true, longInvalidJson);
      mockFetchWithRetries.mockResolvedValueOnce(mockResponse);

      try {
        await fetchWithCache(url, {}, 1000, 'json');
        expect.fail('Should have thrown');
      } catch (err) {
        const error = err as Error;
        // Error message should be truncated - should not contain full 1000 character response
        expect(error.message).not.toContain('a'.repeat(1000));
        // Should contain truncated version (500 chars of 'a')
        expect(error.message).toContain('a'.repeat(500));
      }
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
