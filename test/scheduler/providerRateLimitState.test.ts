import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderRateLimitState } from '../../src/scheduler/providerRateLimitState';

// Fast retry policy for tests - minimal delays
const FAST_RETRY_POLICY = {
  maxRetries: 3,
  baseDelayMs: 1, // 1ms instead of 1000ms
  maxDelayMs: 10, // 10ms instead of 60000ms
  jitterFactor: 0,
};

describe('ProviderRateLimitState', () => {
  let state: ProviderRateLimitState;

  beforeEach(() => {
    vi.useFakeTimers();
    state = new ProviderRateLimitState({
      rateLimitKey: 'test-provider',
      maxConcurrency: 5,
      minConcurrency: 1,
      retryPolicy: FAST_RETRY_POLICY,
    });
  });

  afterEach(() => {
    state.dispose();
    vi.useRealTimers();
  });

  describe('Constructor', () => {
    it('should initialize with provided options', () => {
      const metrics = state.getMetrics();
      expect(metrics.rateLimitKey).toBe('test-provider');
      expect(metrics.maxConcurrency).toBe(5);
    });

    it('should accept custom retry policy', () => {
      const customState = new ProviderRateLimitState({
        rateLimitKey: 'custom-provider',
        maxConcurrency: 10,
        minConcurrency: 2,
        retryPolicy: {
          maxRetries: 5,
          baseDelayMs: 2000,
          maxDelayMs: 30000,
          jitterFactor: 0.1,
        },
      });

      expect(customState.rateLimitKey).toBe('custom-provider');
      customState.dispose();
    });
  });

  describe('executeWithRetry - success path', () => {
    it('should execute function and return result', async () => {
      const result = await state.executeWithRetry('req-1', async () => 'success', {});

      expect(result).toBe('success');
    });

    it('should increment completed requests on success', async () => {
      await state.executeWithRetry('req-1', async () => 'success', {});

      const metrics = state.getMetrics();
      expect(metrics.completedRequests).toBe(1);
      expect(metrics.failedRequests).toBe(0);
    });

    it('should increment total requests', async () => {
      await state.executeWithRetry('req-1', async () => 'success', {});
      await state.executeWithRetry('req-2', async () => 'success', {});

      const metrics = state.getMetrics();
      expect(metrics.totalRequests).toBe(2);
    });
  });

  describe('executeWithRetry - error handling', () => {
    it('should propagate errors', async () => {
      await expect(
        state.executeWithRetry(
          'req-1',
          async () => {
            throw new Error('Test error');
          },
          {},
        ),
      ).rejects.toThrow('Test error');
    });

    it('should increment failed requests on error', async () => {
      try {
        await state.executeWithRetry(
          'req-1',
          async () => {
            throw new Error('Test error');
          },
          {},
        );
      } catch {}

      const metrics = state.getMetrics();
      expect(metrics.failedRequests).toBe(1);
      expect(metrics.completedRequests).toBe(0);
    });
  });

  describe('executeWithRetry - rate limit detection', () => {
    let noRetryState: ProviderRateLimitState;

    beforeEach(() => {
      // Use no-retry policy for rate limit detection tests
      noRetryState = new ProviderRateLimitState({
        rateLimitKey: 'test-provider-no-retry',
        maxConcurrency: 5,
        minConcurrency: 1,
        retryPolicy: { maxRetries: 0, baseDelayMs: 1, maxDelayMs: 1, jitterFactor: 0 },
      });
    });

    afterEach(() => {
      noRetryState.dispose();
    });

    it('should detect rate limit via isRateLimited callback', async () => {
      const events: any[] = [];
      noRetryState.on('ratelimit:hit', (data) => events.push(data));

      try {
        await noRetryState.executeWithRetry('req-1', async () => ({ status: 429 }), {
          isRateLimited: (result) => result?.status === 429,
        });
      } catch {}

      expect(events.length).toBeGreaterThan(0);
    });

    it('should detect rate limit error by message', async () => {
      const events: any[] = [];
      noRetryState.on('ratelimit:hit', (data) => events.push(data));

      try {
        await noRetryState.executeWithRetry(
          'req-1',
          async () => {
            throw new Error('Rate limit exceeded');
          },
          {},
        );
      } catch {}

      expect(events.length).toBeGreaterThan(0);
    });

    it('should detect 429 error by message', async () => {
      const events: any[] = [];
      noRetryState.on('ratelimit:hit', (data) => events.push(data));

      try {
        await noRetryState.executeWithRetry(
          'req-1',
          async () => {
            throw new Error('HTTP 429: Too Many Requests');
          },
          {},
        );
      } catch {}

      expect(events.length).toBeGreaterThan(0);
    });

    it('should detect too many requests error', async () => {
      const events: any[] = [];
      noRetryState.on('ratelimit:hit', (data) => events.push(data));

      try {
        await noRetryState.executeWithRetry(
          'req-1',
          async () => {
            throw new Error('Too many requests');
          },
          {},
        );
      } catch {}

      expect(events.length).toBeGreaterThan(0);
    });

    it('should handle error with undefined message gracefully', async () => {
      // Test that isRateLimitError doesn't crash when error.message is undefined
      const error = new Error('placeholder');
      (error as { message: string | undefined }).message = undefined;

      // Should not throw - just not detect it as a rate limit
      await expect(
        noRetryState.executeWithRetry(
          'req-1',
          async () => {
            throw error;
          },
          {},
        ),
      ).rejects.toBeDefined();

      // The error should be counted as failed, not as a rate limit
      const metrics = noRetryState.getMetrics();
      expect(metrics.failedRequests).toBe(1);
      expect(metrics.rateLimitHits).toBe(0);
    });
  });

  describe('executeWithRetry - retry behavior', () => {
    it('should retry on rate limit and eventually succeed', async () => {
      let attempt = 0;

      // Start the request - it will retry after rate limit
      const promise = state.executeWithRetry(
        'req-1',
        async () => {
          attempt++;
          if (attempt < 2) {
            throw new Error('Rate limit');
          }
          return 'success';
        },
        {
          // Use 0 for immediate retry to avoid timing-dependent flakiness
          // (non-zero values race against slot queue's resetAt timer)
          getRetryAfter: () => 0,
        },
      );

      // Run all timers to completion (handles retry delays and rate limit resets)
      await vi.runAllTimersAsync();

      const result = await promise;

      expect(attempt).toBe(2);
      expect(result).toBe('success');
    });

    it('should emit retrying event', async () => {
      const events: any[] = [];
      state.on('request:retrying', (data) => events.push(data));

      let attempt = 0;
      const promise = state.executeWithRetry(
        'req-1',
        async () => {
          attempt++;
          if (attempt < 2) {
            throw new Error('Rate limit');
          }
          return 'success';
        },
        {
          // Use 0 for immediate retry to avoid timing-dependent flakiness
          // (non-zero values race against slot queue's resetAt timer)
          getRetryAfter: () => 0,
        },
      );

      // Run all timers to completion
      await vi.runAllTimersAsync();

      await promise;

      expect(events.length).toBe(1);
      expect(events[0].attempt).toBe(1);
      expect(events[0].reason).toBe('ratelimit');
    });

    it('should increment retriedRequests', async () => {
      let attempt = 0;
      const promise = state.executeWithRetry(
        'req-1',
        async () => {
          attempt++;
          if (attempt < 3) {
            throw new Error('Rate limit');
          }
          return 'success';
        },
        {
          // Use 0 for immediate retry to avoid timing-dependent flakiness
          // (non-zero values race against slot queue's resetAt timer)
          getRetryAfter: () => 0,
        },
      );

      // Run all timers to completion
      await vi.runAllTimersAsync();

      await promise;

      const metrics = state.getMetrics();
      expect(metrics.retriedRequests).toBe(2);
    });
  });

  describe('Header parsing and updates', () => {
    it('should update state from rate limit headers', async () => {
      await state.executeWithRetry('req-1', async () => 'success', {
        getHeaders: () => ({
          'x-ratelimit-remaining-requests': '50',
          'x-ratelimit-limit-requests': '100',
        }),
      });

      const metrics = state.getMetrics();
      expect(metrics.completedRequests).toBe(1);
    });

    it('should emit ratelimit:learned only once per provider', async () => {
      const events: any[] = [];
      state.on('ratelimit:learned', (data) => events.push(data));

      // First request with limit headers
      await state.executeWithRetry('req-1', async () => 'success', {
        getHeaders: () => ({
          'x-ratelimit-limit-requests': '100',
        }),
      });

      expect(events.length).toBe(1);

      // Second request with limit headers - should not emit again
      await state.executeWithRetry('req-2', async () => 'success', {
        getHeaders: () => ({
          'x-ratelimit-limit-requests': '100',
        }),
      });

      expect(events.length).toBe(1); // Still 1, not 2
    });
  });

  describe('Adaptive concurrency', () => {
    it('should decrease concurrency on rate limit', async () => {
      // Create a new state with no retries for this test
      const testState = new ProviderRateLimitState({
        rateLimitKey: 'test-adaptive-decrease',
        maxConcurrency: 5,
        minConcurrency: 1,
        retryPolicy: { maxRetries: 0, baseDelayMs: 1, maxDelayMs: 1, jitterFactor: 0 },
      });

      const events: any[] = [];
      testState.on('concurrency:decreased', (data) => events.push(data));

      try {
        await testState.executeWithRetry(
          'req-1',
          async () => {
            throw new Error('Rate limit');
          },
          {
            // Use 0 for immediate retry (not used here since maxRetries=0, but for consistency)
            getRetryAfter: () => 0,
          },
        );
      } catch {}

      testState.dispose();

      expect(events.length).toBe(1);
      expect(events[0].reason).toBe('ratelimit');
    });

    it('should increase concurrency after sustained success', async () => {
      // Create a new state with no retries for this test
      const testState = new ProviderRateLimitState({
        rateLimitKey: 'test-adaptive-increase',
        maxConcurrency: 5,
        minConcurrency: 1,
        retryPolicy: { maxRetries: 0, baseDelayMs: 1, maxDelayMs: 1, jitterFactor: 0 },
      });

      // First decrease concurrency via rate limit
      try {
        await testState.executeWithRetry(
          'req-1',
          async () => {
            throw new Error('Rate limit');
          },
          {
            // Use 0 for immediate retry (not used here since maxRetries=0, but for consistency)
            getRetryAfter: () => 0,
          },
        );
      } catch {}

      // Advance past the rate limit reset time to allow subsequent requests
      vi.advanceTimersByTime(10);

      const events: any[] = [];
      testState.on('concurrency:increased', (data) => events.push(data));

      // 5 consecutive successes trigger recovery
      for (let i = 0; i < 5; i++) {
        await testState.executeWithRetry(`req-${i + 2}`, async () => 'success', {});
      }

      testState.dispose();

      expect(events.length).toBe(1);
      expect(events[0].reason).toBe('recovery');
    });
  });

  describe('Proactive throttling', () => {
    it('should emit warning when approaching limit', async () => {
      const events: any[] = [];
      state.on('ratelimit:warning', (data) => events.push(data));

      await state.executeWithRetry('req-1', async () => 'success', {
        getHeaders: () => ({
          'x-ratelimit-remaining-requests': '5',
          'x-ratelimit-limit-requests': '100',
        }),
      });

      expect(events.length).toBe(1);
      expect(events[0].requestRatio).toBe(0.05);
    });

    it('should proactively decrease concurrency when approaching limit', async () => {
      const events: any[] = [];
      state.on('concurrency:decreased', (data) => events.push(data));

      await state.executeWithRetry('req-1', async () => 'success', {
        getHeaders: () => ({
          'x-ratelimit-remaining-requests': '5',
          'x-ratelimit-limit-requests': '100',
        }),
      });

      expect(events.length).toBe(1);
      expect(events[0].reason).toBe('proactive');
    });
  });

  describe('getQueueDepth', () => {
    it('should return current queue depth', () => {
      const depth = state.getQueueDepth();
      expect(depth).toBe(0);
    });
  });

  describe('getMetrics', () => {
    it('should return all metrics', async () => {
      await state.executeWithRetry('req-1', async () => 'success', {});

      const metrics = state.getMetrics();

      expect(metrics).toMatchObject({
        rateLimitKey: 'test-provider',
        activeRequests: 0,
        maxConcurrency: 5,
        queueDepth: 0,
        totalRequests: 1,
        completedRequests: 1,
        failedRequests: 0,
        rateLimitHits: 0,
        retriedRequests: 0,
      });
      expect(typeof metrics.avgLatencyMs).toBe('number');
      expect(typeof metrics.p50LatencyMs).toBe('number');
      expect(typeof metrics.p99LatencyMs).toBe('number');
    });
  });

  describe('dispose', () => {
    it('should clean up resources', () => {
      state.dispose();

      // Should not throw when disposed
      expect(() => state.getMetrics()).not.toThrow();
    });
  });

  describe('Event emission', () => {
    it('should emit slot:acquired event', async () => {
      const events: any[] = [];
      state.on('slot:acquired', (data) => events.push(data));

      await state.executeWithRetry('req-1', async () => 'success', {});

      expect(events.length).toBe(1);
      expect(events[0].rateLimitKey).toBe('test-provider');
    });

    it('should emit slot:released event', async () => {
      const events: any[] = [];
      state.on('slot:released', (data) => events.push(data));

      await state.executeWithRetry('req-1', async () => 'success', {});

      expect(events.length).toBe(1);
      expect(events[0].rateLimitKey).toBe('test-provider');
    });
  });
});
