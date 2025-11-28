import { computeCacheStats } from '../../src/runStats/cache';
import type { StatableResult } from '../../src/runStats/types';

describe('computeCacheStats', () => {
  it('should return null hitRate for empty results', () => {
    const stats = computeCacheStats([]);
    expect(stats).toEqual({
      hits: 0,
      misses: 0,
      hitRate: null,
    });
  });

  it('should return null hitRate when no responses have cache info', () => {
    const results: StatableResult[] = [
      { success: true, latencyMs: 100 },
      { success: true, latencyMs: 200 },
    ];
    const stats = computeCacheStats(results);
    expect(stats).toEqual({
      hits: 0,
      misses: 0,
      hitRate: null,
    });
  });

  it('should count cache hits correctly', () => {
    const results: StatableResult[] = [
      { success: true, latencyMs: 100, response: { cached: true } },
      { success: true, latencyMs: 200, response: { cached: true } },
      { success: true, latencyMs: 300, response: { cached: false } },
    ];
    const stats = computeCacheStats(results);
    expect(stats).toEqual({
      hits: 2,
      misses: 1,
      hitRate: 2 / 3,
    });
  });

  it('should count cache misses correctly', () => {
    const results: StatableResult[] = [
      { success: true, latencyMs: 100, response: { cached: false } },
      { success: true, latencyMs: 200, response: { cached: false } },
    ];
    const stats = computeCacheStats(results);
    expect(stats).toEqual({
      hits: 0,
      misses: 2,
      hitRate: 0,
    });
  });

  it('should handle 100% cache hit rate', () => {
    const results: StatableResult[] = [
      { success: true, latencyMs: 100, response: { cached: true } },
      { success: true, latencyMs: 200, response: { cached: true } },
    ];
    const stats = computeCacheStats(results);
    expect(stats).toEqual({
      hits: 2,
      misses: 0,
      hitRate: 1,
    });
  });

  it('should exclude results without response from hit rate calculation', () => {
    const results: StatableResult[] = [
      { success: true, latencyMs: 100, response: { cached: true } },
      { success: false, latencyMs: 0, error: 'timeout' }, // no response
      { success: true, latencyMs: 200, response: { cached: false } },
    ];
    const stats = computeCacheStats(results);
    // Only 2 results have responses
    expect(stats).toEqual({
      hits: 1,
      misses: 1,
      hitRate: 0.5,
    });
  });
});
