import { computeLatencyMetrics, getPercentile } from '../../src/metrics/latency';
import type { MetricableResult } from '../../src/metrics/types';

describe('getPercentile', () => {
  it('should return 0 for empty array', () => {
    expect(getPercentile([], 0.5)).toBe(0);
  });

  it('should return the only element for single-element array', () => {
    expect(getPercentile([100], 0.5)).toBe(100);
    expect(getPercentile([100], 0.95)).toBe(100);
    expect(getPercentile([100], 0.99)).toBe(100);
  });

  it('should return exact value when percentile lands on index', () => {
    const sorted = [10, 20, 30, 40, 50];
    // p50 of 5 elements: rank = 0.5 * 4 = 2, so index 2 = 30
    expect(getPercentile(sorted, 0.5)).toBe(30);
  });

  it('should interpolate between values', () => {
    const sorted = [10, 20, 30, 40];
    // p50 of 4 elements: rank = 0.5 * 3 = 1.5
    // Interpolate between index 1 (20) and index 2 (30): 20 + 0.5 * 10 = 25
    expect(getPercentile(sorted, 0.5)).toBe(25);
  });

  it('should compute p95 correctly', () => {
    const sorted = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
    // p95 of 10 elements: rank = 0.95 * 9 = 8.55
    // Interpolate between index 8 (900) and index 9 (1000): 900 + 0.55 * 100 = 955
    expect(getPercentile(sorted, 0.95)).toBeCloseTo(955);
  });

  it('should compute p99 correctly', () => {
    const sorted = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
    // p99 of 10 elements: rank = 0.99 * 9 = 8.91
    // Interpolate between index 8 (900) and index 9 (1000): 900 + 0.91 * 100 = 991
    expect(getPercentile(sorted, 0.99)).toBeCloseTo(991);
  });

  it('should handle two-element array', () => {
    const sorted = [100, 200];
    expect(getPercentile(sorted, 0.5)).toBe(150);
    expect(getPercentile(sorted, 0.95)).toBe(195);
  });
});

describe('computeLatencyMetrics', () => {
  const createResult = (latencyMs: number): MetricableResult => ({
    success: true,
    latencyMs,
  });

  it('should return zeros for empty results', () => {
    const metrics = computeLatencyMetrics([]);
    expect(metrics).toEqual({
      avgMs: 0,
      p50Ms: 0,
      p95Ms: 0,
      p99Ms: 0,
    });
  });

  it('should compute metrics for single result', () => {
    const results = [createResult(100)];
    const metrics = computeLatencyMetrics(results);
    expect(metrics).toEqual({
      avgMs: 100,
      p50Ms: 100,
      p95Ms: 100,
      p99Ms: 100,
    });
  });

  it('should compute average correctly', () => {
    const results = [createResult(100), createResult(200), createResult(300)];
    const metrics = computeLatencyMetrics(results);
    expect(metrics.avgMs).toBe(200);
  });

  it('should filter out zero and undefined latencies', () => {
    const results: MetricableResult[] = [
      { success: true, latencyMs: 100 },
      { success: true, latencyMs: 0 },
      { success: true, latencyMs: 200 },
    ];
    const metrics = computeLatencyMetrics(results);
    // Only 100 and 200 should be included
    expect(metrics.avgMs).toBe(150);
  });

  it('should round values to integers', () => {
    const results = [createResult(100), createResult(200), createResult(201)];
    const metrics = computeLatencyMetrics(results);
    // Average: (100 + 200 + 201) / 3 = 167.0
    expect(metrics.avgMs).toBe(167);
  });

  it('should compute distinct p50, p95, p99 for varied latencies', () => {
    // 20 results with increasing latencies
    const results = Array.from({ length: 20 }, (_, i) => createResult((i + 1) * 100));
    const metrics = computeLatencyMetrics(results);

    expect(metrics.avgMs).toBe(1050); // (100+200+...+2000)/20 = 21000/20 = 1050
    expect(metrics.p50Ms).toBeLessThan(metrics.p95Ms);
    expect(metrics.p95Ms).toBeLessThan(metrics.p99Ms);
  });
});
