import { computeCacheMetrics } from '../../src/metrics/cache';
import type { MetricableResult } from '../../src/metrics/types';

describe('computeCacheMetrics', () => {
  it('should return null hitRate for empty results', () => {
    const metrics = computeCacheMetrics([]);
    expect(metrics).toEqual({
      hits: 0,
      misses: 0,
      hitRate: null,
    });
  });

  it('should return null hitRate when no responses have cache info', () => {
    const results: MetricableResult[] = [
      { success: true, latencyMs: 100 },
      { success: true, latencyMs: 200 },
    ];
    const metrics = computeCacheMetrics(results);
    expect(metrics).toEqual({
      hits: 0,
      misses: 0,
      hitRate: null,
    });
  });

  it('should count cache hits correctly', () => {
    const results: MetricableResult[] = [
      { success: true, latencyMs: 100, response: { cached: true } },
      { success: true, latencyMs: 200, response: { cached: true } },
      { success: true, latencyMs: 300, response: { cached: false } },
    ];
    const metrics = computeCacheMetrics(results);
    expect(metrics).toEqual({
      hits: 2,
      misses: 1,
      hitRate: 2 / 3,
    });
  });

  it('should count cache misses correctly', () => {
    const results: MetricableResult[] = [
      { success: true, latencyMs: 100, response: { cached: false } },
      { success: true, latencyMs: 200, response: { cached: false } },
    ];
    const metrics = computeCacheMetrics(results);
    expect(metrics).toEqual({
      hits: 0,
      misses: 2,
      hitRate: 0,
    });
  });

  it('should handle 100% cache hit rate', () => {
    const results: MetricableResult[] = [
      { success: true, latencyMs: 100, response: { cached: true } },
      { success: true, latencyMs: 200, response: { cached: true } },
    ];
    const metrics = computeCacheMetrics(results);
    expect(metrics).toEqual({
      hits: 2,
      misses: 0,
      hitRate: 1,
    });
  });

  it('should exclude results without response from hit rate calculation', () => {
    const results: MetricableResult[] = [
      { success: true, latencyMs: 100, response: { cached: true } },
      { success: false, latencyMs: 0, error: 'timeout' }, // no response
      { success: true, latencyMs: 200, response: { cached: false } },
    ];
    const metrics = computeCacheMetrics(results);
    // Only 2 results have responses
    expect(metrics).toEqual({
      hits: 1,
      misses: 1,
      hitRate: 0.5,
    });
  });
});
