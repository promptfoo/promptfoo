import { afterEach, describe, expect, it, vi } from 'vitest';
import { createProviderRateLimitOptions } from '../../src/scheduler/providerWrapper';
import { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';
import { getFetchRetryContextMaxRetries } from '../../src/util/fetch/retryContext';

import type { ApiProvider, ProviderResponse } from '../../src/types/providers';

function createProvider(maxRetries?: unknown, id = 'test-provider'): ApiProvider {
  const config = maxRetries === undefined ? {} : { maxRetries };
  return {
    id: () => id,
    config,
    callApi: vi.fn(),
  } as unknown as ApiProvider;
}

async function runRateLimitedCall(maxRetries?: unknown): Promise<number> {
  const registry = new RateLimitRegistry({
    maxConcurrency: 1,
    queueTimeoutMs: 100,
  });
  const provider = createProvider(maxRetries);
  const callFn = vi.fn().mockResolvedValue({ status: 429 });

  try {
    await expect(
      registry.execute(provider, callFn, {
        isRateLimited: (result) => (result as { status?: number } | undefined)?.status === 429,
        getRetryAfter: () => 0,
      }),
    ).rejects.toThrow('Rate limit exceeded');
  } finally {
    registry.dispose();
  }

  return callFn.mock.calls.length;
}

describe('RateLimitRegistry integration - provider maxRetries', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
    vi.unstubAllEnvs();
  });

  it.each([false, true])(
    'preserves opted-out failure evidence without retries or a shared cooldown (scheduler disabled: %s)',
    async (disabled) => {
      vi.useFakeTimers();
      vi.stubEnv('PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER', String(disabled));
      const registry = new RateLimitRegistry({ maxConcurrency: 1, queueTimeoutMs: 100 });
      const provider = createProvider();
      const historical: ProviderResponse = {
        error: 'Recorded 429 rate limit',
        retryable: false,
        incurredCost: 0,
        metadata: {
          recordedCost: 0.12,
          rateLimitKind: 'rate_limit',
          http: {
            status: 429,
            statusText: 'Too Many Requests',
            headers: {
              'retry-after': '3600',
              'x-ratelimit-remaining-requests': '0',
              'x-ratelimit-reset-requests': '3600s',
            },
          },
        },
      };
      const call = vi.fn().mockResolvedValue(historical);
      try {
        const pending = registry.execute(provider, call, createProviderRateLimitOptions());
        const preserved = expect(pending).resolves.toBe(historical);
        await vi.runAllTimersAsync();
        await preserved;
        expect(call).toHaveBeenCalledOnce();

        // A replay cannot delay the next request on the same provider's shared rate-limit key.
        await expect(
          registry.execute(
            provider,
            async () => ({ output: 'Fresh response' }),
            createProviderRateLimitOptions(),
          ),
        ).resolves.toEqual({ output: 'Fresh response' });
        if (!disabled) {
          expect(Object.values(registry.getMetrics())[0]).toMatchObject({
            rateLimitHits: 0,
            retriedRequests: 0,
            activeRequests: 0,
          });
        }
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        registry.dispose();
      }
    },
  );

  it('still retries a live rate-limit response with ordinary retry detection', async () => {
    vi.useFakeTimers();
    vi.stubEnv('PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER', 'false');
    const registry = new RateLimitRegistry({ maxConcurrency: 1, queueTimeoutMs: 100 });
    const call = vi
      .fn<() => Promise<ProviderResponse>>()
      .mockResolvedValueOnce({
        error: 'HTTP 429 rate limit',
        retryable: true,
        metadata: { headers: { 'retry-after': '0' } },
      })
      .mockResolvedValue({ output: 'Recovered response' });
    try {
      const pending = registry.execute(createProvider(1), call, createProviderRateLimitOptions());
      await vi.runAllTimersAsync();

      await expect(pending).resolves.toEqual({ output: 'Recovered response' });
      expect(call).toHaveBeenCalledTimes(2);
      expect(Object.values(registry.getMetrics())[0]).toMatchObject({
        rateLimitHits: 1,
        retriedRequests: 1,
      });
    } finally {
      registry.dispose();
    }
  });

  it('should propagate provider maxRetries into the fetch retry context', async () => {
    const registry = new RateLimitRegistry({
      maxConcurrency: 1,
      queueTimeoutMs: 100,
    });
    const provider = createProvider(0);
    const callFn = vi.fn().mockImplementation(async () => getFetchRetryContextMaxRetries());

    try {
      const contextValue = await registry.execute(provider, callFn);
      expect(contextValue).toBe(0);
    } finally {
      registry.dispose();
    }
  });

  it('should clear an outer retry context when a nested provider has no maxRetries', async () => {
    // Use distinct provider ids so the outer and inner calls map to separate
    // ProviderRateLimitState instances — otherwise shared slot queue state
    // could mask the ALS-scope behavior we're asserting.
    const registry = new RateLimitRegistry({
      maxConcurrency: 2,
      queueTimeoutMs: 100,
    });
    const outerProvider = createProvider(0, 'outer-provider');
    const innerProvider = createProvider(undefined, 'inner-provider');

    try {
      const contextValue = await registry.execute(outerProvider, () =>
        registry.execute(innerProvider, async () => getFetchRetryContextMaxRetries()),
      );
      expect(contextValue).toBeUndefined();
    } finally {
      registry.dispose();
    }
  });

  it('should propagate fetch retry context when scheduler is disabled', async () => {
    vi.stubEnv('PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER', 'true');
    try {
      const registry = new RateLimitRegistry({
        maxConcurrency: 1,
        queueTimeoutMs: 100,
      });
      const provider = createProvider(0);
      const callFn = vi.fn().mockImplementation(async () => getFetchRetryContextMaxRetries());

      try {
        const contextValue = await registry.execute(provider, callFn);
        expect(contextValue).toBe(0);
      } finally {
        registry.dispose();
      }
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('should not retry when provider maxRetries is 0', async () => {
    expect(await runRateLimitedCall(0)).toBe(1);
  });

  it('should retry provider maxRetries + 1 total attempts', async () => {
    expect(await runRateLimitedCall(2)).toBe(3);
  });

  it('should parse numeric string maxRetries values', async () => {
    expect(await runRateLimitedCall('2')).toBe(3);
  });

  it('should use default scheduler retries (4 attempts) when provider maxRetries is not set', async () => {
    expect(await runRateLimitedCall(undefined)).toBe(4);
  });

  it('should ignore negative maxRetries and use default scheduler retries', async () => {
    expect(await runRateLimitedCall(-1)).toBe(4);
  });

  it('should ignore non-integer string maxRetries values', async () => {
    expect(await runRateLimitedCall('2.5')).toBe(4);
  });

  it('should ignore non-integer number maxRetries values', async () => {
    expect(await runRateLimitedCall(2.5)).toBe(4);
  });

  it('should isolate retry context per concurrent provider', async () => {
    const registry = new RateLimitRegistry({
      maxConcurrency: 4,
      queueTimeoutMs: 100,
    });

    async function capture(): Promise<number | undefined> {
      const ctx = getFetchRetryContextMaxRetries();
      // Yield so both calls can interleave before returning — guards against
      // a regression where the context from the later call leaks into the earlier.
      await new Promise((resolve) => setImmediate(resolve));
      return ctx;
    }

    try {
      const [a, b] = await Promise.all([
        registry.execute(createProvider(0, 'p0'), capture),
        registry.execute(createProvider(5, 'p5'), capture),
      ]);
      expect(a).toBe(0);
      expect(b).toBe(5);
    } finally {
      registry.dispose();
    }
  });
});
