import { describe, expect, it } from 'vitest';
import { computeLatencyStats, getPercentile } from '../../src/runStats/latency';
import type { StatableResult } from '../../src/runStats/types';

describe('getPercentile', () => {
  it('should return 0 for empty array', () => {
    expect(getPercentile([], 0.5)).toBe(0);
  });

  it('should return single value for single-element array', () => {
    expect(getPercentile([100], 0.5)).toBe(100);
    expect(getPercentile([100], 0.95)).toBe(100);
  });

  it('should return exact value when percentile lands on index', () => {
    // [10, 20, 30, 40, 50] - p50 should be exactly 30 (middle value)
    expect(getPercentile([10, 20, 30, 40, 50], 0.5)).toBe(30);
  });

  it('should interpolate between values', () => {
    // [10, 20] - p50 should interpolate: rank = 0.5 * 1 = 0.5
    // lower=0, upper=1, fraction=0.5, result = 10 + 0.5*(20-10) = 15
    expect(getPercentile([10, 20], 0.5)).toBe(15);
  });

  it('should compute p95 with interpolation', () => {
    // [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]
    // p95: rank = 0.95 * 9 = 8.55
    // lower=8, upper=9, fraction=0.55
    // result = 900 + 0.55*(1000-900) = 955
    const values = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
    expect(getPercentile(values, 0.95)).toBeCloseTo(955, 5);
  });

  it('should handle p99 for small arrays', () => {
    // [100, 200, 300] - p99: rank = 0.99 * 2 = 1.98
    // lower=1, upper=2, fraction=0.98
    // result = 200 + 0.98*(300-200) = 298
    expect(getPercentile([100, 200, 300], 0.99)).toBe(298);
  });
});

describe('computeLatencyStats', () => {
  it('should return zeros for empty results', () => {
    const stats = computeLatencyStats([]);
    expect(stats).toEqual({ avgMs: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0 });
  });

  it('should compute stats for single result', () => {
    const results: StatableResult[] = [{ success: true, latencyMs: 100 }];
    const stats = computeLatencyStats(results);
    expect(stats).toEqual({ avgMs: 100, p50Ms: 100, p95Ms: 100, p99Ms: 100 });
  });

  it('should compute average correctly', () => {
    const results: StatableResult[] = [
      { success: true, latencyMs: 100 },
      { success: true, latencyMs: 200 },
      { success: true, latencyMs: 300 },
    ];
    const stats = computeLatencyStats(results);
    expect(stats.avgMs).toBe(200); // (100+200+300)/3
  });

  it('should filter out zero and undefined latencies', () => {
    const results: StatableResult[] = [
      { success: true, latencyMs: 100 },
      { success: true, latencyMs: 0 },
      { success: true, latencyMs: undefined as unknown as number },
      { success: true, latencyMs: 200 },
    ];
    const stats = computeLatencyStats(results);
    expect(stats.avgMs).toBe(150); // (100+200)/2
  });

  it('should compute percentiles correctly', () => {
    // 20 values: 50, 100, 150, ..., 1000
    const results: StatableResult[] = Array.from({ length: 20 }, (_, i) => ({
      success: true,
      latencyMs: (i + 1) * 50,
    }));
    const stats = computeLatencyStats(results);

    // p50: rank = 0.5 * 19 = 9.5 -> interpolate between index 9 (500) and 10 (550)
    expect(stats.p50Ms).toBe(525);
    // p95: rank = 0.95 * 19 = 18.05 -> interpolate between index 18 (950) and 19 (1000)
    expect(stats.p95Ms).toBe(953); // 950 + 0.05*50 = 952.5 rounded
    // p99: rank = 0.99 * 19 = 18.81 -> interpolate between index 18 (950) and 19 (1000)
    // Due to floating point: 950 + 0.81*50 = 990.5 -> Math.round(990.5) = 990 (banker's rounding)
    expect(stats.p99Ms).toBe(990);
  });

  it('should round results to integers', () => {
    const results: StatableResult[] = [
      { success: true, latencyMs: 100 },
      { success: true, latencyMs: 101 },
    ];
    const stats = computeLatencyStats(results);
    // avg = 100.5 -> rounds to 101
    expect(stats.avgMs).toBe(101);
  });
});
