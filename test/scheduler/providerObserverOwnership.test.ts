import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { wrapProviderWithRateLimiting } from '../../src/scheduler/providerWrapper';
import { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';
import { createDeferred, mockProcessEnv } from '../util/utils';

import type {
  ApiProvider,
  CallApiOptionsParams,
  ProviderResponse,
} from '../../src/types/providers';

const headers = { 'ratelimit-limit': '10', 'ratelimit-remaining': '0', 'ratelimit-reset': '5' };
const response: ProviderResponse = { output: 'harmless result', metadata: { headers } };

describe('scheduler observer ownership through provider delegation', () => {
  const registries: RateLimitRegistry[] = [];
  let restoreEnv: () => void;

  beforeEach(() => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER: 'false' });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-10T18:00:00Z'));
  });

  afterEach(() => {
    for (const registry of registries.splice(0)) {
      registry.dispose();
    }
    vi.restoreAllMocks();
    vi.useRealTimers();
    restoreEnv();
  });

  function registry(maxConcurrency = 3) {
    const result = new RateLimitRegistry({ maxConcurrency });
    registries.push(result);
    return result;
  }

  function provider(id: string, callApi: ApiProvider['callApi']): ApiProvider {
    return { id: () => id, config: { maxRetries: 0 }, callApi };
  }

  it('delivers exact caller payloads after only the child quota observation', async () => {
    const state = registry();
    const order: string[] = [];
    const selected = { headers, status: 429, resetAt: Date.now() + 5000 };
    state.on('ratelimit:hit', ({ rateLimitKey }) => order.push(rateLimitKey));
    const explicit = vi.fn((received, backoff) => {
      expect(received).toBe(headers);
      expect(backoff).toBe(selected);
      order.push('caller');
    });
    const child = wrapProviderWithRateLimiting(
      provider('child', async (_prompt, _context, options) => {
        options?.onResponseHeaders?.(headers, selected);
        return { output: 'child' };
      }),
      state,
    );
    const parent = wrapProviderWithRateLimiting(
      provider('parent', async (prompt, context, options) =>
        child.callApi(prompt, context, options),
      ),
      state,
    );
    await expect(
      parent.callApi('harmless', undefined, { onResponseHeaders: explicit }),
    ).resolves.toEqual({ output: 'child' });
    expect(explicit).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['child', 'caller']);
    expect(state.getMetrics().parent.rateLimitHits).toBe(0);
    expect(state.getMetrics().child.rateLimitHits).toBe(1);
  });

  it('preserves an explicit callback exception without retry or leaked slots', async () => {
    const state = registry();
    const error = new Error('caller observer failed');
    const childCall = vi.fn<ApiProvider['callApi']>(async (_prompt, _context, options) => {
      options?.onResponseHeaders?.(headers);
      return response;
    });
    const child = wrapProviderWithRateLimiting(provider('child', childCall), state);
    const parent = wrapProviderWithRateLimiting(
      provider('parent', (p, c, o) => child.callApi(p, c, o)),
      state,
    );
    const explicit = vi.fn(() => {
      throw error;
    });
    await expect(
      parent.callApi('harmless', undefined, { onResponseHeaders: explicit }),
    ).rejects.toBe(error);
    expect(explicit).toHaveBeenCalledTimes(1);
    expect(childCall).toHaveBeenCalledTimes(1);
    for (const metrics of Object.values(state.getMetrics())) {
      expect(metrics).toMatchObject({
        activeRequests: 0,
        queueDepth: 0,
        failedRequests: 1,
        retriedRequests: 0,
      });
    }
  });

  it.each(['fresh headers', 'selected absolute deadline'])(
    'observes same-pool delegation once for %s without rebasing its reset',
    async (kind) => {
      const state = registry();
      const warnings = vi.fn();
      const hits = vi.fn();
      state.on('ratelimit:warning', warnings);
      state.on('ratelimit:hit', hits);
      const observed = createDeferred<void>();
      const complete = createDeferred<void>();
      const backoff =
        kind === 'fresh headers' ? undefined : { headers, status: 429, resetAt: Date.now() + 5000 };
      const raw = provider('same-pool', async (_prompt, _context, options) => {
        options?.onResponseHeaders?.(headers, backoff);
        observed.resolve();
        await complete.promise;
        return backoff ? { output: 'selected' } : response;
      });
      const inner = wrapProviderWithRateLimiting(raw, state);
      // A delegating object with the same real quota key, not a double-wrapped object.
      const outer = wrapProviderWithRateLimiting(
        provider(raw.id(), (p, c, o) => inner.callApi(p, c, o)),
        state,
      );
      const explicit = vi.fn();
      const pending = outer.callApi('harmless', undefined, { onResponseHeaders: explicit });
      await observed.promise;
      await vi.advanceTimersByTimeAsync(1000);
      complete.resolve();
      await pending;
      const followup = vi.fn(async () => ({ output: 'next' }));
      const queued = state.execute(raw, followup);
      await vi.advanceTimersByTimeAsync(3999);
      expect(followup).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      await queued;
      expect(followup).toHaveBeenCalledTimes(1);
      expect(explicit).toHaveBeenCalledExactlyOnceWith(headers, backoff);
      expect(warnings).toHaveBeenCalledTimes(1);
      expect(hits).toHaveBeenCalledTimes(backoff ? 1 : 0);
      expect(state.getMetrics()[raw.id()]).toMatchObject({
        activeRequests: 0,
        queueDepth: 0,
        completedRequests: 3,
      });
    },
  );

  it('keeps equal textual keys in different registries independent', async () => {
    const outerRegistry = registry();
    const innerRegistry = registry();
    const raw = provider('same-key', async (_prompt, _context, options) => {
      options?.onResponseHeaders?.(headers);
      return { output: 'child' };
    });
    const inner = wrapProviderWithRateLimiting(raw, innerRegistry);
    const outer = wrapProviderWithRateLimiting(
      provider(raw.id(), (p, c, o) => inner.callApi(p, c, o)),
      outerRegistry,
    );
    const explicit = vi.fn();
    await outer.callApi('harmless', undefined, { onResponseHeaders: explicit });
    const unaffectedCall = vi.fn(async () => ({ output: 'unaffected' }));
    const unaffected = outerRegistry.execute(raw, unaffectedCall);
    await vi.advanceTimersByTimeAsync(0);
    const startsBeforeReset = unaffectedCall.mock.calls.length;
    await vi.advanceTimersByTimeAsync(5000);
    await unaffected;
    expect(startsBeforeReset).toBe(1);
    expect(explicit).toHaveBeenCalledExactlyOnceWith(headers);
    expect(Object.keys(outerRegistry.getMetrics())).toEqual([raw.id()]);
    expect(Object.keys(innerRegistry.getMetrics())).toEqual([raw.id()]);
  });

  it('retains pre-aborted cancellation and already-wrapped provider identity', async () => {
    const state = registry();
    const rawCall = vi.fn(async () => ({ output: 'unexpected' }));
    const wrapped = wrapProviderWithRateLimiting(provider('child', rawCall), state);
    expect(wrapProviderWithRateLimiting(wrapped, state)).toBe(wrapped);
    const controller = new AbortController();
    controller.abort('caller stopped');
    const explicit = vi.fn();
    await expect(
      wrapped.callApi('harmless', undefined, {
        abortSignal: controller.signal,
        onResponseHeaders: explicit,
      }),
    ).rejects.toMatchObject({
      name: 'AbortError',
      message: 'caller stopped',
      cause: 'caller stopped',
    });
    expect(rawCall).not.toHaveBeenCalled();
    expect(explicit).not.toHaveBeenCalled();
    expect(state.getMetrics().child).toMatchObject({
      activeRequests: 0,
      queueDepth: 0,
      failedRequests: 1,
    });
  });

  it('preserves the original options when adaptive scheduling is disabled', async () => {
    const restore = mockProcessEnv({ PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER: 'true' });
    try {
      const state = registry();
      const options: CallApiOptionsParams = { onResponseHeaders: vi.fn(), includeLogProbs: true };
      const raw = vi.fn<ApiProvider['callApi']>(async (_prompt, _context, actual) => {
        expect(actual).toBe(options);
        actual?.onResponseHeaders?.(headers);
        return response;
      });
      await wrapProviderWithRateLimiting(provider('disabled', raw), state).callApi(
        'harmless',
        undefined,
        options,
      );
      expect(options.onResponseHeaders).toHaveBeenCalledExactlyOnceWith(headers);
      expect(state.getMetrics()).toEqual({});
    } finally {
      restore();
    }
  });
});
