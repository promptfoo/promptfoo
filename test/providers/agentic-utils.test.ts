import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCache, isCacheEnabled } from '../../src/cache';
import {
  type CacheCheckResult,
  cacheResponse,
  getCachedResponse,
  initializeAgenticCache,
} from '../../src/providers/agentic-utils';

vi.mock('../../src/cache');

describe('agentic-utils', () => {
  let mockCache: { get: ReturnType<typeof vi.fn>; set: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.resetAllMocks();
    mockCache = {
      get: vi.fn(),
      set: vi.fn(),
    };
    vi.mocked(isCacheEnabled).mockReturnValue(false);
    vi.mocked(getCache).mockResolvedValue(mockCache as any);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('getCachedResponse', () => {
    it('should set cached: true flag when returning cached response', async () => {
      const mockCachedResponse = {
        output: 'cached response from agentic provider',
        tokenUsage: { total: 100, prompt: 40, completion: 60 },
        cost: 0.001,
      };

      mockCache.get = vi.fn().mockResolvedValue(JSON.stringify(mockCachedResponse));

      const cacheResult: CacheCheckResult = {
        shouldCache: true,
        shouldReadCache: true,
        shouldWriteCache: true,
        cache: mockCache as any,
        cacheKey: 'test-cache-key',
      };

      const result = await getCachedResponse(cacheResult, 'test context');

      expect(result).toBeDefined();
      expect(result!.cached).toBe(true);
      expect(result!.output).toBe('cached response from agentic provider');
      expect(result!.tokenUsage).toEqual({ total: 100, prompt: 40, completion: 60 });
      expect(result!.cost).toBe(0.001);
      expect(mockCache.get).toHaveBeenCalledWith('test-cache-key');
    });

    it('should return undefined when shouldReadCache is false', async () => {
      const cacheResult: CacheCheckResult = {
        shouldCache: true,
        shouldReadCache: false, // bustCache scenario
        shouldWriteCache: true,
        cache: mockCache as any,
        cacheKey: 'test-cache-key',
      };

      const result = await getCachedResponse(cacheResult);

      expect(result).toBeUndefined();
      expect(mockCache.get).not.toHaveBeenCalled();
    });

    it('should return undefined when cache is not available', async () => {
      const cacheResult: CacheCheckResult = {
        shouldCache: false,
        shouldReadCache: false,
        shouldWriteCache: false,
        cache: undefined,
        cacheKey: undefined,
      };

      const result = await getCachedResponse(cacheResult);

      expect(result).toBeUndefined();
    });

    it('should return undefined when cache key is not available', async () => {
      const cacheResult: CacheCheckResult = {
        shouldCache: true,
        shouldReadCache: true,
        shouldWriteCache: true,
        cache: mockCache as any,
        cacheKey: undefined,
      };

      const result = await getCachedResponse(cacheResult);

      expect(result).toBeUndefined();
      expect(mockCache.get).not.toHaveBeenCalled();
    });

    it('should return undefined when cache returns null', async () => {
      mockCache.get = vi.fn().mockResolvedValue(null);

      const cacheResult: CacheCheckResult = {
        shouldCache: true,
        shouldReadCache: true,
        shouldWriteCache: true,
        cache: mockCache as any,
        cacheKey: 'test-cache-key',
      };

      const result = await getCachedResponse(cacheResult);

      expect(result).toBeUndefined();
      expect(mockCache.get).toHaveBeenCalledWith('test-cache-key');
    });

    it('should return undefined and log error when cache.get throws', async () => {
      mockCache.get = vi.fn().mockRejectedValue(new Error('Cache error'));

      const cacheResult: CacheCheckResult = {
        shouldCache: true,
        shouldReadCache: true,
        shouldWriteCache: true,
        cache: mockCache as any,
        cacheKey: 'test-cache-key',
      };

      const result = await getCachedResponse(cacheResult);

      expect(result).toBeUndefined();
      expect(mockCache.get).toHaveBeenCalledWith('test-cache-key');
    });

    it('should preserve all original response fields when setting cached flag', async () => {
      const mockCachedResponse = {
        output: 'test output',
        error: undefined,
        tokenUsage: { total: 50 },
        cost: 0.0005,
        logProbs: [0.1, 0.2],
        metadata: { custom: 'data' },
      };

      mockCache.get = vi.fn().mockResolvedValue(JSON.stringify(mockCachedResponse));

      const cacheResult: CacheCheckResult = {
        shouldCache: true,
        shouldReadCache: true,
        shouldWriteCache: true,
        cache: mockCache as any,
        cacheKey: 'test-cache-key',
      };

      const result = await getCachedResponse(cacheResult);

      expect(result).toBeDefined();
      expect(result!.cached).toBe(true);
      expect(result!.output).toBe('test output');
      expect(result!.tokenUsage).toEqual({ total: 50 });
      expect(result!.cost).toBe(0.0005);
      expect(result!.logProbs).toEqual([0.1, 0.2]);
      expect(result!.metadata).toEqual({ custom: 'data' });
    });
  });

  describe('cacheResponse', () => {
    it('should cache response when shouldWriteCache is true', async () => {
      const response = {
        output: 'response to cache',
        tokenUsage: { total: 100 },
      };

      const cacheResult: CacheCheckResult = {
        shouldCache: true,
        shouldReadCache: true,
        shouldWriteCache: true,
        cache: mockCache as any,
        cacheKey: 'test-cache-key',
      };

      await cacheResponse(cacheResult, response);

      expect(mockCache.set).toHaveBeenCalledWith('test-cache-key', JSON.stringify(response));
    });

    it('should not cache response when shouldWriteCache is false', async () => {
      const response = {
        output: 'response to cache',
      };

      const cacheResult: CacheCheckResult = {
        shouldCache: true,
        shouldReadCache: true,
        shouldWriteCache: false,
        cache: mockCache as any,
        cacheKey: 'test-cache-key',
      };

      await cacheResponse(cacheResult, response);

      expect(mockCache.set).not.toHaveBeenCalled();
    });
  });

  describe('initializeAgenticCache', () => {
    it('should return cache disabled result when cache is disabled', async () => {
      vi.mocked(isCacheEnabled).mockReturnValue(false);

      const result = await initializeAgenticCache(
        { cacheKeyPrefix: 'test' },
        { prompt: 'test prompt' },
      );

      expect(result.shouldCache).toBe(false);
      expect(result.shouldReadCache).toBe(false);
      expect(result.shouldWriteCache).toBe(false);
      expect(result.cache).toBeUndefined();
      expect(result.cacheKey).toBeUndefined();
    });

    it('should return cache enabled result when cache is enabled', async () => {
      vi.mocked(isCacheEnabled).mockReturnValue(true);

      const result = await initializeAgenticCache(
        { cacheKeyPrefix: 'test' },
        { prompt: 'test prompt' },
      );

      expect(result.shouldCache).toBe(true);
      expect(result.shouldReadCache).toBe(true);
      expect(result.shouldWriteCache).toBe(true);
      expect(result.cache).toBeDefined();
      expect(result.cacheKey).toBeDefined();
      expect(result.cacheKey).toContain('test:');
    });

    it('should set shouldReadCache to false when bustCache is true', async () => {
      vi.mocked(isCacheEnabled).mockReturnValue(true);

      const result = await initializeAgenticCache(
        { cacheKeyPrefix: 'test', bustCache: true },
        { prompt: 'test prompt' },
      );

      expect(result.shouldCache).toBe(true);
      expect(result.shouldReadCache).toBe(false);
      expect(result.shouldWriteCache).toBe(true);
    });

    it('should disable caching when mcp is provided without cacheMcp', async () => {
      vi.mocked(isCacheEnabled).mockReturnValue(true);

      const result = await initializeAgenticCache(
        { cacheKeyPrefix: 'test', mcp: { servers: [{ name: 'test' }] } },
        { prompt: 'test prompt' },
      );

      expect(result.shouldCache).toBe(false);
      expect(result.shouldReadCache).toBe(false);
      expect(result.shouldWriteCache).toBe(false);
    });

    it('should enable caching when mcp is provided with cacheMcp true', async () => {
      vi.mocked(isCacheEnabled).mockReturnValue(true);

      const result = await initializeAgenticCache(
        { cacheKeyPrefix: 'test', mcp: { servers: [{ name: 'test' }] }, cacheMcp: true },
        { prompt: 'test prompt' },
      );

      expect(result.shouldCache).toBe(true);
      expect(result.shouldReadCache).toBe(true);
      expect(result.shouldWriteCache).toBe(true);
    });

    it('should produce different cache keys for different mcp configs', async () => {
      vi.mocked(isCacheEnabled).mockReturnValue(true);

      const resultA = await initializeAgenticCache(
        { cacheKeyPrefix: 'test', mcp: { servers: [{ name: 'server-a' }] }, cacheMcp: true },
        { prompt: 'test prompt' },
      );

      const resultB = await initializeAgenticCache(
        { cacheKeyPrefix: 'test', mcp: { servers: [{ name: 'server-b' }] }, cacheMcp: true },
        { prompt: 'test prompt' },
      );

      expect(resultA.cacheKey).toBeDefined();
      expect(resultB.cacheKey).toBeDefined();
      expect(resultA.cacheKey).not.toBe(resultB.cacheKey);
    });
  });
});
