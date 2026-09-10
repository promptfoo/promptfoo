import { afterEach, describe, expect, it, vi } from 'vitest';
import { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';
import { getFetchRetryContextMaxRetries } from '../../src/util/fetch/retryContext';
import { createDeferred } from '../util/utils';

import type { ApiProvider } from '../../src/types/providers';

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
    vi.resetAllMocks();
    vi.unstubAllEnvs();
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

describe('RateLimitRegistry integration - cancellation', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it.each(
    ['AbortError', 'AbortException'].flatMap((name) =>
      ['request timeout', 'network disconnected', '429 rate limit exceeded'].flatMap((message) =>
        [false, true].map((disabled) => ({ name, message, disabled })),
      ),
    ),
  )(
    'ends $name "$message" without retrying (disabled=$disabled)',
    async ({ name, message, disabled }) => {
      vi.useFakeTimers();
      vi.stubEnv('PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER', String(disabled));
      const registry = new RateLimitRegistry({ maxConcurrency: 1 });
      const provider = createProvider();
      const reason = Object.assign(new Error(message), { name });
      const callFn = vi.fn().mockRejectedValue(reason);
      const retrying = vi.fn();
      const isRateLimited = vi.fn().mockReturnValue(true);
      const getRetryAfter = vi.fn().mockReturnValue(60000);
      registry.on('request:retrying', retrying);
      let caught: unknown;

      try {
        const pending = registry
          .execute(provider, callFn, { isRateLimited, getRetryAfter })
          .catch((error) => {
            caught = error;
          });
        await vi.advanceTimersByTimeAsync(0);
        expect(caught).toBe(reason);
        await pending;
        expect(callFn).toHaveBeenCalledOnce();
        expect(retrying).not.toHaveBeenCalled();
        expect(isRateLimited).not.toHaveBeenCalled();
        expect(getRetryAfter).not.toHaveBeenCalled();
        if (!disabled) {
          expect(Object.values(registry.getMetrics())[0]).toMatchObject({
            activeRequests: 0,
            failedRequests: 1,
            retriedRequests: 0,
            rateLimitHits: 0,
          });
        }

        // The aborted call must release its slot without blocking the next call.
        const result = { output: 'after cancellation' };
        let completed: unknown;
        const next = registry
          .execute(provider, async () => result)
          .then((value) => {
            completed = value;
          });
        await vi.advanceTimersByTimeAsync(0);
        expect(completed).toBe(result);
        await next;
      } finally {
        registry.dispose();
      }
    },
  );

  it.each(['request timeout', 'network temporarily unavailable'])(
    'still retries an ordinary %s and returns the next success',
    async (message) => {
      vi.useFakeTimers();
      const registry = new RateLimitRegistry({ maxConcurrency: 1 });
      const error = new Error(message);
      const result = { output: 'recovered' };
      const callFn = vi.fn().mockRejectedValueOnce(error).mockResolvedValue(result);
      const retrying = vi.fn();
      registry.on('request:retrying', retrying);

      try {
        const pending = registry.execute(createProvider(), callFn);
        await vi.advanceTimersByTimeAsync(0);
        expect(callFn).toHaveBeenCalledOnce();
        expect(retrying).toHaveBeenCalledOnce();
        const { delayMs } = retrying.mock.calls[0][0];
        expect(delayMs).toBeGreaterThanOrEqual(2000);
        await vi.advanceTimersByTimeAsync(delayMs);
        await expect(pending).resolves.toBe(result);
        expect(callFn).toHaveBeenCalledTimes(2);
      } finally {
        registry.dispose();
      }
    },
  );

  it('preserves an ordinary timeout error after the configured retry is exhausted', async () => {
    vi.useFakeTimers();
    const registry = new RateLimitRegistry({ maxConcurrency: 1 });
    const reason = new Error('request timeout');
    const callFn = vi.fn().mockRejectedValue(reason);
    const retrying = vi.fn();
    registry.on('request:retrying', retrying);
    let caught: unknown;

    try {
      const pending = registry.execute(createProvider(1), callFn).catch((error) => {
        caught = error;
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(caught).toBeUndefined();
      expect(retrying).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(retrying.mock.calls[0][0].delayMs);
      await pending;
      expect(caught).toBe(reason);
      expect(callFn).toHaveBeenCalledTimes(2);
      expect(retrying).toHaveBeenCalledOnce();
    } finally {
      registry.dispose();
    }
  });

  it('preserves a permanent error without retrying', async () => {
    const registry = new RateLimitRegistry({ maxConcurrency: 1 });
    const reason = new Error('invalid fixture request');
    const callFn = vi.fn().mockRejectedValue(reason);
    try {
      await expect(registry.execute(createProvider(), callFn)).rejects.toBe(reason);
      expect(callFn).toHaveBeenCalledOnce();
    } finally {
      registry.dispose();
    }
  });

  it('stops an active retry delay when the caller aborts', async () => {
    vi.useFakeTimers();
    const registry = new RateLimitRegistry({ maxConcurrency: 1 });
    const controller = new AbortController();
    const reason = new Error('cancel retry wait');
    const callFn = vi.fn().mockRejectedValue(new Error('network temporarily unavailable'));

    try {
      const pending = registry.execute(createProvider(), callFn, {
        abortSignal: controller.signal,
      });
      const rejected = expect(pending).rejects.toBe(reason);
      await vi.advanceTimersByTimeAsync(0);
      controller.abort(reason);
      await rejected;
      await vi.advanceTimersByTimeAsync(60_000);
      expect(callFn).toHaveBeenCalledOnce();
    } finally {
      registry.dispose();
    }
  });

  it('removes an aborted caller from the slot queue', async () => {
    const registry = new RateLimitRegistry({ maxConcurrency: 1 });
    const first = createDeferred<void>();
    const firstCall = registry.execute(createProvider(), () => first.promise);
    const controller = new AbortController();
    const queuedCall = vi.fn();
    const queued = registry.execute(createProvider(), queuedCall, {
      abortSignal: controller.signal,
    });
    const reason = new Error('cancel queued call');

    try {
      controller.abort(reason);
      await expect(queued).rejects.toBe(reason);
      first.resolve();
      await firstCall;
      expect(queuedCall).not.toHaveBeenCalled();
    } finally {
      registry.dispose();
    }
  });
});
