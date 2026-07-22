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
  let debug: ReturnType<typeof vi.fn<(message: string, context: Record<string, unknown>) => void>>;

  beforeEach(() => {
    vi.useFakeTimers();
    debug = vi.fn<(message: string, context: Record<string, unknown>) => void>();
    state = new ProviderRateLimitState({
      rateLimitKey: 'test-provider',
      maxConcurrency: 5,
      minConcurrency: 1,
      retryPolicy: FAST_RETRY_POLICY,
      onDebug: debug,
    });
  });

  afterEach(() => {
    state.dispose();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with provided options', () => {
      expect(state.rateLimitKey).toBe('test-provider');
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
        onDebug: debug,
      });
    });

    afterEach(() => {
      noRetryState.dispose();
    });

    it('should detect rate limit via isRateLimited callback', async () => {
      await expect(
        noRetryState.executeWithRetry('req-1', async () => ({ status: 429 }), {
          isRateLimited: (result) => result?.status === 429,
        }),
      ).rejects.toThrow('Rate limit exceeded for test-provider-no-retry after 1 attempts');
    });

    it.each([
      'Rate limit exceeded',
      'HTTP 429: Too Many Requests',
      'Too many requests',
    ])('detects rate-limit error %s', async (message) => {
      await expect(
        noRetryState.executeWithRetry(
          'req-1',
          async () => {
            throw new Error(message);
          },
          {},
        ),
      ).rejects.toThrow(message);

      expect(debug).toHaveBeenCalledWith(
        '[Scheduler] Rate limit hit for test-provider-no-retry',
        expect.objectContaining({ resetAt: expect.any(Number) }),
      );
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
    });

    it('back-compat: substring matcher detects HttpRateLimitError (rate_limit kind)', async () => {
      // The transport-layer HttpRateLimitError is unknown to the scheduler,
      // so the scheduler relies on its substring matcher to detect rate-limit
      // hits. The HttpRateLimitError contract requires the rendered message
      // to contain `429` and a rate-limit token; verify the scheduler still
      // counts these as ratelimit:hit events.
      const { HttpRateLimitError } = await import('../../src/util/fetch/errors');
      await expect(
        noRetryState.executeWithRetry(
          'req-1',
          async () => {
            throw new HttpRateLimitError({
              status: 429,
              code: 'rate_limit_exceeded',
              retryAfterMs: 5000,
            });
          },
          {},
        ),
      ).rejects.toThrow();

      expect(debug).toHaveBeenCalledWith(
        '[Scheduler] Rate limit hit for test-provider-no-retry',
        expect.any(Object),
      );
    });

    it('back-compat: substring matcher detects HttpRateLimitError (quota kind)', async () => {
      const { HttpRateLimitError } = await import('../../src/util/fetch/errors');
      await expect(
        noRetryState.executeWithRetry(
          'req-1',
          async () => {
            throw new HttpRateLimitError({
              status: 429,
              code: 'insufficient_quota',
            });
          },
          {},
        ),
      ).rejects.toThrow();

      expect(debug).toHaveBeenCalledWith(
        '[Scheduler] Rate limit hit for test-provider-no-retry',
        expect.any(Object),
      );
    });

    it('result-path: kind=quota in result.metadata short-circuits retry', async () => {
      // The PR's transport-layer fail-fast is undermined when a provider
      // catches HttpRateLimitError and folds it into ProviderResponse.error
      // (the standard pattern across most providers). The default
      // isRateLimited callback for ProviderResponse must honor the
      // structured `metadata.rateLimitKind: 'quota'` signal so the scheduler
      // doesn't retry hard quotas through the result path.
      const { isProviderResponseRateLimited } = await import('../../src/scheduler/types');
      let callCount = 0;
      const result = await state.executeWithRetry(
        'req-quota',
        async () => {
          callCount++;
          return {
            error: 'Quota exceeded: HTTP 429 Too Many Requests (code: insufficient_quota).',
            metadata: { rateLimitKind: 'quota' as const },
          };
        },
        {
          isRateLimited: isProviderResponseRateLimited,
        },
      );

      // With kind=quota, the classifier returns false, so the scheduler
      // sees a "successful" result and returns it without retrying.
      expect(callCount).toBe(1);
      expect((result as { error?: string }).error).toContain('Quota exceeded');
    });

    it('result-path: "Quota exceeded:" prefix short-circuits retry even without metadata', async () => {
      // String-fallback path for providers that don't populate metadata but
      // still emit the canonical formatRateLimitErrorMessage prefix.
      const { isProviderResponseRateLimited } = await import('../../src/scheduler/types');
      let callCount = 0;
      const result = await state.executeWithRetry(
        'req-quota-nometa',
        async () => {
          callCount++;
          return {
            error: 'Quota exceeded: HTTP 429 Too Many Requests (code: insufficient_quota).',
          };
        },
        {
          isRateLimited: isProviderResponseRateLimited,
        },
      );

      expect(callCount).toBe(1);
      expect((result as { error?: string }).error).toContain('Quota exceeded');
    });

    it('result-path: kind=rate_limit still triggers retry', async () => {
      // Symmetric verification: per-window rate limits must still retry.
      const { isProviderResponseRateLimited } = await import('../../src/scheduler/types');
      let callCount = 0;
      const promise = state.executeWithRetry(
        'req-ratelimit',
        async () => {
          callCount++;
          if (callCount < 2) {
            return {
              error:
                'Rate limit exceeded: HTTP 429 Too Many Requests (code: rate_limit_exceeded) [retry after 0s]',
              metadata: { rateLimitKind: 'rate_limit' as const },
            };
          }
          return { output: 'recovered' };
        },
        {
          isRateLimited: isProviderResponseRateLimited,
          getRetryAfter: () => 0,
        },
      );

      await vi.runAllTimersAsync();
      const result = await promise;

      expect(callCount).toBe(2);
      expect((result as { output?: string }).output).toBe('recovered');
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

    it('retries until a subsequent attempt succeeds', async () => {
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

      expect(attempt).toBe(3);
    });
  });

  describe('Header parsing and updates', () => {
    it('logs learned rate limits only once per provider', async () => {
      // First request with limit headers
      await state.executeWithRetry('req-1', async () => 'success', {
        getHeaders: () => ({
          'x-ratelimit-limit-requests': '100',
        }),
      });

      // Second request with limit headers - should not emit again
      await state.executeWithRetry('req-2', async () => 'success', {
        getHeaders: () => ({
          'x-ratelimit-limit-requests': '100',
        }),
      });

      const learnedLogs = debug.mock.calls.filter(([message]) =>
        String(message).includes('Learned rate limits'),
      );
      expect(learnedLogs).toHaveLength(1);
    });

    it('should not call markRateLimited for successful responses with retry-after headers', async () => {
      // If a provider or proxy includes retry-after headers in successful (200) responses,
      // the queue should NOT be blocked. Only rate-limited responses should trigger blocking.
      const state2 = new ProviderRateLimitState({
        rateLimitKey: 'test-no-block',
        maxConcurrency: 5,
        minConcurrency: 1,
        retryPolicy: FAST_RETRY_POLICY,
      });

      // First request: successful response with retry-after-ms header
      await state2.executeWithRetry('req-1', async () => 'success', {
        getHeaders: () => ({
          'retry-after-ms': '5000',
          'x-ratelimit-remaining-requests': '50',
          'x-ratelimit-limit-requests': '100',
        }),
        isRateLimited: () => false, // Response is NOT rate-limited
      });

      // Second request should succeed immediately without being blocked
      // If markRateLimited was incorrectly called, remainingRequests would be 0
      // and the queue would block until the reset timer fires
      const result = await state2.executeWithRetry('req-2', async () => 'second-success', {
        getHeaders: () => ({
          'x-ratelimit-remaining-requests': '49',
          'x-ratelimit-limit-requests': '100',
        }),
        isRateLimited: () => false,
      });

      expect(result).toBe('second-success');
      state2.dispose();
    });

    it('should call markRateLimited for rate-limited responses with retry-after headers', async () => {
      const state2 = new ProviderRateLimitState({
        rateLimitKey: 'test-block-on-429',
        maxConcurrency: 5,
        minConcurrency: 1,
        retryPolicy: { maxRetries: 0, baseDelayMs: 1, maxDelayMs: 1, jitterFactor: 0 },
        onDebug: debug,
      });

      // Rate-limited response with retry-after-ms header
      try {
        await state2.executeWithRetry('req-1', async () => 'rate-limited-result', {
          getHeaders: () => ({
            'retry-after-ms': '5000',
          }),
          isRateLimited: () => true, // Response IS rate-limited
        });
      } catch {
        // Expected - rate limit exhausted with maxRetries=0
      }

      expect(debug).toHaveBeenCalledWith(
        '[Scheduler] Rate limit hit for test-block-on-429',
        expect.objectContaining({ retryAfterMs: undefined }),
      );
      state2.dispose();
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
        onDebug: debug,
      });

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

      expect(debug).toHaveBeenCalledWith(
        '[Scheduler] Concurrency decreased for test-adaptive-decrease',
        { previous: 5, current: 2 },
      );
    });

    it('should increase concurrency after sustained success', async () => {
      // Create a new state with no retries for this test
      const testState = new ProviderRateLimitState({
        rateLimitKey: 'test-adaptive-increase',
        maxConcurrency: 5,
        minConcurrency: 1,
        retryPolicy: { maxRetries: 0, baseDelayMs: 1, maxDelayMs: 1, jitterFactor: 0 },
        onDebug: debug,
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

      // 5 consecutive successes trigger recovery
      for (let i = 0; i < 5; i++) {
        await testState.executeWithRetry(`req-${i + 2}`, async () => 'success', {});
      }

      testState.dispose();

      expect(debug).toHaveBeenCalledWith(
        '[Scheduler] Concurrency increased for test-adaptive-increase',
        expect.objectContaining({ current: 3 }),
      );
    });
  });

  describe('Proactive throttling', () => {
    it('should proactively decrease concurrency when approaching limit', async () => {
      await state.executeWithRetry('req-1', async () => 'success', {
        getHeaders: () => ({
          'x-ratelimit-remaining-requests': '5',
          'x-ratelimit-limit-requests': '100',
        }),
      });

      expect(debug).toHaveBeenCalledWith('[Scheduler] Concurrency decreased for test-provider', {
        previous: 5,
        current: 2,
      });
    });
  });
});
