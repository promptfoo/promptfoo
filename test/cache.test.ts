import fs from 'fs';

import {
  clearCache,
  disableCache,
  enableCache,
  fetchWithCache,
  isCacheEnabled,
} from '../src/cache';
import { fetchWithRetries } from '../src/util/fetch/index';

jest.mock('../src/util/config/manage', () => ({
  getConfigDirectoryPath: jest.fn().mockReturnValue('/mock/config/path'),
}));

// Mock fetchWithRetries to return proper Response objects
jest.mock('../src/util/fetch/index', () => ({
  fetchWithRetries: jest.fn(),
}));

// Mock keyv-file to prevent filesystem operations during tests
jest.mock('keyv-file', () => {
  return jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    set: jest.fn(),
    delete: jest.fn(),
    clear: jest.fn(),
  }));
});

// Mock keyv
jest.mock('keyv', () => {
  return {
    Keyv: jest.fn().mockImplementation(() => ({
      get: jest.fn(),
      set: jest.fn(),
      delete: jest.fn(),
      clear: jest.fn(),
    })),
  };
});

const mockFetchWithRetries = jest.mocked(fetchWithRetries);

// Mock cache-manager v7
jest.mock('cache-manager', () => {
  return {
    createCache: jest.fn().mockImplementation((config = {}) => {
      const cache = new Map();
      // Determine store type based on whether stores array has items
      const storesArray = config.stores || [];
      const storeName = storesArray.length > 0 ? 'keyv-file' : 'memory';
      return {
        stores: [
          {
            name: storeName,
          },
        ],
        get: jest.fn().mockImplementation((key) => cache.get(key)),
        set: jest.fn().mockImplementation((key, value) => {
          cache.set(key, value);
          return Promise.resolve();
        }),
        del: jest.fn().mockImplementation((key) => {
          cache.delete(key);
          return Promise.resolve();
        }),
        clear: jest.fn().mockImplementation(() => {
          cache.clear();
          return Promise.resolve();
        }),
        wrap: jest.fn().mockImplementation(async (key, fn) => {
          const existing = cache.get(key);
          if (existing) {
            return existing;
          }
          const value = await fn();
          if (value !== undefined) {
            cache.set(key, value);
          }
          return value;
        }),
      };
    }),
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
  let mkdirSyncMock: jest.SpyInstance;
  let existsSyncMock: jest.SpyInstance;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    // Clear cache type override from test setup
    delete process.env.PROMPTFOO_CACHE_TYPE;
    mkdirSyncMock = jest.spyOn(fs, 'mkdirSync').mockImplementation();
    existsSyncMock = jest.spyOn(fs, 'existsSync').mockReturnValue(false);
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
    expect(cache.stores[0]).toHaveProperty('name', 'memory');
  });

  it('should use disk cache in non-test environment', async () => {
    process.env.NODE_ENV = 'production';
    const cacheModule = await import('../src/cache');
    const cache = cacheModule.getCache();
    expect(cache.stores[0]).toHaveProperty('name', 'keyv-file');
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
    expect(cache.stores[0]).toHaveProperty('name', 'keyv-file');
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
    jest.resetModules();
    mockFetchWithRetries.mockReset();
    clearCache();
    enableCache();
  });

  afterEach(() => {
    jest.useRealTimers();
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

    it('should handle request timeout', async () => {
      jest.useFakeTimers();
      const mockTimeoutPromise = new Promise((resolve) => {
        setTimeout(() => resolve(mockFetchWithRetriesResponse(true, response)), 2000);
      });
      mockFetchWithRetries.mockImplementationOnce(() => mockTimeoutPromise as Promise<Response>);

      const fetchPromise = fetchWithCache(url, {}, 100);

      await expect(
        Promise.race([
          fetchPromise,
          new Promise((_, reject) => {
            jest.advanceTimersByTime(150);
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
