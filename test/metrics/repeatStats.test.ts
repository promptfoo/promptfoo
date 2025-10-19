import { describe, it, expect } from '@jest/globals';
import calculateRepeatStats from '../../src/metrics/repeatStats.js';
import type { PostProcessingContext } from '../../src/types/index';

describe('calculateRepeatStats', () => {
  it('should return empty object when repeat is 1 or less', () => {
    const context = {
      results: [],
      prompts: [],
      stats: {
        successes: 0,
        failures: 0,
        errors: 0,
        tokenUsage: { total: 0, prompt: 0, completion: 0, cached: 0, numRequests: 0 }
      },
      options: { repeat: 1 },
    } as unknown as PostProcessingContext;

    const result = calculateRepeatStats(context) as Record<string, number>;
    expect(result).toEqual({});
  });

  it('should calculate pass^N for all passing tests', () => {
    const context = {
      results: [
        // Test 1, run 1
        { promptIdx: 0, testIdx: 0, success: true, score: 1, latencyMs: 100 },
        // Test 1, run 2
        { promptIdx: 0, testIdx: 0, success: true, score: 1, latencyMs: 110 },
        // Test 1, run 3
        { promptIdx: 0, testIdx: 0, success: true, score: 1, latencyMs: 105 },
      ],
      prompts: [],
      stats: {
        successes: 0,
        failures: 0,
        errors: 0,
        tokenUsage: { total: 0, prompt: 0, completion: 0, cached: 0, numRequests: 0 }
      },
      options: { repeat: 3 },
    } as unknown as PostProcessingContext;

    const result = calculateRepeatStats(context) as Record<string, number>;

    // Pass rate is 100% (3/3), so pass^3 = 1.0^3 = 1.0
    expect(result['repeat.pass_n']).toBe(1.0);
    expect(result['repeat.pass_rate']).toBe(1.0);
    expect(result['repeat.flip_rate']).toBe(0); // No flips (all passed)
    expect(result['repeat.score.mean']).toBe(1.0);
    expect(result['repeat.score.stddev']).toBe(0); // All scores are 1
    expect(result['repeat.score.min']).toBe(1);
    expect(result['repeat.score.max']).toBe(1);
    expect(result['repeat.latency.mean']).toBeCloseTo(105, 0);
    expect(result['repeat.latency.p95']).toBeGreaterThan(0);
    expect(result['repeat.latency.p99']).toBeGreaterThan(0);
  });

  it('should calculate pass^N for all failing tests', () => {
    const context = {
      results: [
        { promptIdx: 0, testIdx: 0, success: false, score: 0, latencyMs: 100 },
        { promptIdx: 0, testIdx: 0, success: false, score: 0, latencyMs: 110 },
        { promptIdx: 0, testIdx: 0, success: false, score: 0, latencyMs: 105 },
      ],
      prompts: [],
      stats: {
        successes: 0,
        failures: 0,
        errors: 0,
        tokenUsage: { total: 0, prompt: 0, completion: 0, cached: 0, numRequests: 0 }
      },
      options: { repeat: 3 },
    } as unknown as PostProcessingContext;

    const result = calculateRepeatStats(context) as Record<string, number>;

    // Pass rate is 0% (0/3), so pass^3 = 0.0^3 = 0.0
    expect(result['repeat.pass_n']).toBe(0);
    expect(result['repeat.pass_rate']).toBe(0);
    expect(result['repeat.flip_rate']).toBe(0); // No flips (all failed)
  });

  it('should calculate pass^N for mixed results', () => {
    const context = {
      results: [
        { promptIdx: 0, testIdx: 0, success: true, score: 1, latencyMs: 100 },
        { promptIdx: 0, testIdx: 0, success: false, score: 0, latencyMs: 110 },
        { promptIdx: 0, testIdx: 0, success: true, score: 1, latencyMs: 105 },
      ],
      prompts: [],
      stats: {
        successes: 0,
        failures: 0,
        errors: 0,
        tokenUsage: { total: 0, prompt: 0, completion: 0, cached: 0, numRequests: 0 }
      },
      options: { repeat: 3 },
    } as unknown as PostProcessingContext;

    const result = calculateRepeatStats(context) as Record<string, number>;

    // Pass rate is 66.67% (2/3), so pass^3 = (2/3)^3 ≈ 0.296
    expect(result['repeat.pass_rate']).toBeCloseTo(2 / 3, 2);
    expect(result['repeat.pass_n']).toBeCloseTo(Math.pow(2 / 3, 3), 3);
    expect(result['repeat.flip_rate']).toBe(1); // 2 flips in 2 transitions (100%)
    expect(result['repeat.score.mean']).toBeCloseTo(2 / 3, 2);
  });

  it('should calculate flip rate correctly', () => {
    const context = {
      results: [
        { promptIdx: 0, testIdx: 0, success: true, score: 1, latencyMs: 100 },
        { promptIdx: 0, testIdx: 0, success: false, score: 0, latencyMs: 110 },
        { promptIdx: 0, testIdx: 0, success: true, score: 1, latencyMs: 105 },
        { promptIdx: 0, testIdx: 0, success: true, score: 1, latencyMs: 95 },
      ],
      prompts: [],
      stats: {
        successes: 0,
        failures: 0,
        errors: 0,
        tokenUsage: { total: 0, prompt: 0, completion: 0, cached: 0, numRequests: 0 }
      },
      options: { repeat: 4 },
    } as unknown as PostProcessingContext;

    const result = calculateRepeatStats(context) as Record<string, number>;

    // Sequence: T, F, T, T
    // Flips: 1 (T→F), 2 (F→T), 3 (T→T no flip)
    // Flip rate = 2 flips / 3 transitions = 0.667
    expect(result['repeat.flip_rate']).toBeCloseTo(2 / 3, 2);
  });

  it('should handle multiple test cases independently', () => {
    const context = {
      results: [
        // Test 0 - all pass
        { promptIdx: 0, testIdx: 0, success: true, score: 1, latencyMs: 100 },
        { promptIdx: 0, testIdx: 0, success: true, score: 1, latencyMs: 110 },
        // Test 1 - all fail
        { promptIdx: 0, testIdx: 1, success: false, score: 0, latencyMs: 200 },
        { promptIdx: 0, testIdx: 1, success: false, score: 0, latencyMs: 210 },
      ],
      prompts: [],
      stats: {
        successes: 0,
        failures: 0,
        errors: 0,
        tokenUsage: { total: 0, prompt: 0, completion: 0, cached: 0, numRequests: 0 }
      },
      options: { repeat: 2 },
    } as unknown as PostProcessingContext;

    const result = calculateRepeatStats(context) as Record<string, number>;

    // Average of test 0 (pass^2 = 1.0) and test 1 (pass^2 = 0.0) = 0.5
    expect(result['repeat.pass_n']).toBeCloseTo(0.5, 2);
    // Average pass rate: (1.0 + 0.0) / 2 = 0.5
    expect(result['repeat.pass_rate']).toBeCloseTo(0.5, 2);
  });

  it('should handle score variance', () => {
    const context = {
      results: [
        { promptIdx: 0, testIdx: 0, success: true, score: 0.5, latencyMs: 100 },
        { promptIdx: 0, testIdx: 0, success: true, score: 0.8, latencyMs: 110 },
        { promptIdx: 0, testIdx: 0, success: true, score: 0.6, latencyMs: 105 },
      ],
      prompts: [],
      stats: {
        successes: 0,
        failures: 0,
        errors: 0,
        tokenUsage: { total: 0, prompt: 0, completion: 0, cached: 0, numRequests: 0 }
      },
      options: { repeat: 3 },
    } as unknown as PostProcessingContext;

    const result = calculateRepeatStats(context) as Record<string, number>;

    expect(result['repeat.score.mean']).toBeCloseTo(0.633, 2);
    expect(result['repeat.score.stddev']).toBeGreaterThan(0);
    expect(result['repeat.score.min']).toBe(0.5);
    expect(result['repeat.score.max']).toBe(0.8);
  });

  it('should warn if test has wrong number of results', () => {
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const context = {
      results: [
        // Test with only 2 results instead of 3
        { promptIdx: 0, testIdx: 0, success: true, score: 1, latencyMs: 100 },
        { promptIdx: 0, testIdx: 0, success: true, score: 1, latencyMs: 110 },
      ],
      prompts: [],
      stats: {
        successes: 0,
        failures: 0,
        errors: 0,
        tokenUsage: { total: 0, prompt: 0, completion: 0, cached: 0, numRequests: 0 }
      },
      options: { repeat: 3 },
    } as unknown as PostProcessingContext;

    calculateRepeatStats(context);

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Test 0_0 has 2 results, expected 3'),
    );

    consoleWarnSpy.mockRestore();
  });

  it('should handle tests without latency', () => {
    const context = {
      results: [
        { promptIdx: 0, testIdx: 0, success: true, score: 1 },
        { promptIdx: 0, testIdx: 0, success: true, score: 1 },
      ],
      prompts: [],
      stats: {
        successes: 0,
        failures: 0,
        errors: 0,
        tokenUsage: { total: 0, prompt: 0, completion: 0, cached: 0, numRequests: 0 }
      },
      options: { repeat: 2 },
    } as unknown as PostProcessingContext;

    const result = calculateRepeatStats(context) as Record<string, number>;

    // Should not have latency metrics
    expect(result['repeat.latency.mean']).toBeUndefined();
    expect(result['repeat.latency.p95']).toBeUndefined();
    expect(result['repeat.latency.p99']).toBeUndefined();
  });

  it('should calculate latency percentiles correctly', () => {
    const context = {
      results: [
        { promptIdx: 0, testIdx: 0, success: true, score: 1, latencyMs: 100 },
        { promptIdx: 0, testIdx: 0, success: true, score: 1, latencyMs: 200 },
        { promptIdx: 0, testIdx: 0, success: true, score: 1, latencyMs: 300 },
        { promptIdx: 0, testIdx: 0, success: true, score: 1, latencyMs: 400 },
        { promptIdx: 0, testIdx: 0, success: true, score: 1, latencyMs: 500 },
      ],
      prompts: [],
      stats: {
        successes: 0,
        failures: 0,
        errors: 0,
        tokenUsage: { total: 0, prompt: 0, completion: 0, cached: 0, numRequests: 0 }
      },
      options: { repeat: 5 },
    } as unknown as PostProcessingContext;

    const result = calculateRepeatStats(context) as Record<string, number>;

    expect(result['repeat.latency.mean']).toBeCloseTo(300, 0);
    // p95 should be around the 95th percentile (close to 500)
    expect(result['repeat.latency.p95']).toBeGreaterThanOrEqual(400);
    // p99 should be around the 99th percentile (close to 500)
    expect(result['repeat.latency.p99']).toBeGreaterThanOrEqual(400);
  });
});
