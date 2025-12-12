import { describe, expect, it } from 'vitest';
import { computeCacheStats } from '../../src/runStats/cache';
import type { StatableResult } from '../../src/runStats/types';

describe('computeCacheStats', () => {
  it('should return null hitRate for empty results', () => {
    const stats = computeCacheStats([]);
    expect(stats).toEqual({ hits: 0, misses: 0, hitRate: null });
  });

  it('should count cache hits', () => {
    const results: StatableResult[] = [
      { success: true, latencyMs: 100, response: { cached: true } },
      { success: true, latencyMs: 200, response: { cached: true } },
    ];
    const stats = computeCacheStats(results);
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(0);
    expect(stats.hitRate).toBe(1);
  });

  it('should count cache misses', () => {
    const results: StatableResult[] = [
      { success: true, latencyMs: 100, response: { cached: false } },
      { success: true, latencyMs: 200, response: { cached: false } },
    ];
    const stats = computeCacheStats(results);
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(2);
    expect(stats.hitRate).toBe(0);
  });

  it('should compute correct hit rate', () => {
    const results: StatableResult[] = [
      { success: true, latencyMs: 100, response: { cached: true } },
      { success: true, latencyMs: 200, response: { cached: false } },
      { success: true, latencyMs: 300, response: { cached: true } },
      { success: true, latencyMs: 400, response: { cached: false } },
    ];
    const stats = computeCacheStats(results);
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(2);
    expect(stats.hitRate).toBe(0.5);
  });

  it('should exclude results without response from cache stats', () => {
    const results: StatableResult[] = [
      { success: true, latencyMs: 100, response: { cached: true } },
      { success: false, latencyMs: 200, error: 'Some error' }, // No response
      { success: true, latencyMs: 300, response: { cached: false } },
    ];
    const stats = computeCacheStats(results);
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBe(0.5);
  });

  it('should handle results with undefined cached field', () => {
    const results: StatableResult[] = [
      { success: true, latencyMs: 100, response: {} },
      { success: true, latencyMs: 200, response: { cached: true } },
    ];
    const stats = computeCacheStats(results);
    // response exists but cached is undefined -> counted as miss
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBe(0.5);
  });

  it('should return null hitRate when all results have errors', () => {
    const results: StatableResult[] = [
      { success: false, latencyMs: 100, error: 'Error 1' },
      { success: false, latencyMs: 200, error: 'Error 2' },
    ];
    const stats = computeCacheStats(results);
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
    expect(stats.hitRate).toBeNull();
  });
});
