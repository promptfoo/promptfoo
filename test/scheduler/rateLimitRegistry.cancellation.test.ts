import { getEventListeners } from 'node:events';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderRateLimitState } from '../../src/scheduler/providerRateLimitState';
import {
  createProviderRateLimitOptions,
  wrapProviderWithRateLimiting,
} from '../../src/scheduler/providerWrapper';
import { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';
import { getFetchRetryContextMaxRetries } from '../../src/util/fetch/retryContext';

import type { ApiProvider, ProviderResponse } from '../../src/types/providers';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function rateLimited(retryAfterMs: number): ProviderResponse {
  return {
    error: '429 rate limit',
    metadata: {
      http: {
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'retry-after-ms': String(retryAfterMs) },
      },
    },
  };
}

describe('RateLimitRegistry cancellation during scheduling', () => {
  const registries: RateLimitRegistry[] = [];
  const provider: ApiProvider = {
    id: () => 'cancel-test',
    callApi: vi.fn<ApiProvider['callApi']>().mockResolvedValue({ output: 'ok' }),
  };

  function createRegistry(maxConcurrency = 1, queueTimeoutMs = 900000) {
    const registry = new RateLimitRegistry({ maxConcurrency, queueTimeoutMs });
    registries.push(registry);
    return registry;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv('PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER', 'false');
    vi.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    for (const registry of registries.splice(0)) {
      registry.dispose();
    }
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it.each([false, true])(
    'rejects pre-aborted calls without dispatch (disabled=%s)',
    async (disabled) => {
      vi.stubEnv('PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER', String(disabled));
      const registry = createRegistry();
      const controller = new AbortController();
      controller.abort('caller stopped');
      const invoke = vi.fn().mockResolvedValue({ output: 'must not run' });

      await expect(
        registry.execute(provider, invoke, createProviderRateLimitOptions(controller.signal)),
      ).rejects.toMatchObject({ name: 'AbortError', cause: 'caller stopped' });
      expect(invoke).not.toHaveBeenCalled();
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('releases a granted slot when cancellation wins before invocation', async () => {
    const registry = createRegistry();
    const controller = new AbortController();
    const cancelledCall = vi.fn().mockResolvedValue({ output: 'cancelled' });
    const pending = registry.execute(
      provider,
      cancelledCall,
      createProviderRateLimitOptions(controller.signal),
    );
    let caught: unknown;
    const rejection = pending.catch((error) => {
      caught = error;
    });
    // acquire has allocated capacity synchronously, but execute has not resumed.
    expect(Object.values(registry.getMetrics())[0].activeRequests).toBe(1);
    controller.abort();
    const survivor = vi.fn().mockResolvedValue({ output: 'survivor' });
    const next = registry.execute(provider, survivor);

    await vi.advanceTimersByTimeAsync(0);
    expect(caught).toMatchObject({ name: 'AbortError' });
    await rejection;
    await expect(next).resolves.toEqual({ output: 'survivor' });
    expect(cancelledCall).not.toHaveBeenCalled();
    expect(survivor).toHaveBeenCalledOnce();
    expect(Object.values(registry.getMetrics())[0]).toMatchObject({
      activeRequests: 0,
      queueDepth: 0,
      failedRequests: 1,
      completedRequests: 1,
    });
  });

  it('removes only a cancelled capacity waiter and keeps the active slot and next caller', async () => {
    const registry = createRegistry();
    const active = deferred<ProviderResponse>();
    const first = registry.execute(provider, () => active.promise);
    await vi.advanceTimersByTimeAsync(0);
    const controller = new AbortController();
    const cancelledCall = vi.fn().mockResolvedValue({ output: 'cancelled' });
    const cancelled = registry.execute(
      provider,
      cancelledCall,
      createProviderRateLimitOptions(controller.signal),
    );
    let caught: unknown;
    const rejection = cancelled.catch((error) => {
      caught = error;
    });
    const survivor = vi.fn().mockResolvedValue({ output: 'survivor' });
    const next = registry.execute(provider, survivor);

    controller.abort(new Error('network timeout from caller'));
    await vi.advanceTimersByTimeAsync(0);
    expect(caught).toMatchObject({ name: 'AbortError' });
    await rejection;
    expect(Object.values(registry.getMetrics())[0]).toMatchObject({
      activeRequests: 1,
      queueDepth: 1,
    });
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    expect(survivor).not.toHaveBeenCalled();

    active.resolve({ output: 'first' });
    await vi.advanceTimersByTimeAsync(0);
    await first;
    await expect(next).resolves.toEqual({ output: 'survivor' });
    expect(cancelledCall).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels quota acquisition after capped backoff and preserves another quota waiter', async () => {
    const registry = createRegistry();
    const controller = new AbortController();
    const invoke = vi
      .fn()
      .mockResolvedValueOnce(rateLimited(600000))
      .mockResolvedValue({ output: 'retry' });
    const pending = registry.execute(
      provider,
      invoke,
      createProviderRateLimitOptions(controller.signal),
    );
    let caught: unknown;
    const rejection = pending.catch((error) => {
      caught = error;
    });
    await vi.advanceTimersByTimeAsync(60000);
    expect(invoke).toHaveBeenCalledOnce();
    expect(Object.values(registry.getMetrics())[0].queueDepth).toBe(1);

    const survivor = vi.fn().mockResolvedValue({ output: 'survivor' });
    const next = registry.execute(provider, survivor);
    controller.abort();
    await vi.advanceTimersByTimeAsync(0);
    expect(caught).toMatchObject({ name: 'AbortError' });
    await rejection;
    expect(Object.values(registry.getMetrics())[0].queueDepth).toBe(1);
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(540000);
    await expect(next).resolves.toEqual({ output: 'survivor' });
    expect(invoke).toHaveBeenCalledOnce();
    expect(survivor).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['result', 'exception'] as const)(
    'cancels %s backoff promptly without retrying',
    async (kind) => {
      const registry = createRegistry();
      const controller = new AbortController();
      const invoke = vi.fn().mockResolvedValue({ output: 'would retry' });
      if (kind === 'result') {
        invoke.mockResolvedValueOnce(rateLimited(60000));
      } else {
        invoke.mockRejectedValueOnce(new Error('network timeout'));
      }
      const pending = registry.execute(
        provider,
        invoke,
        createProviderRateLimitOptions(controller.signal),
      );
      let caught: unknown;
      const rejection = pending.catch((error) => {
        caught = error;
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(Object.values(registry.getMetrics())[0].retriedRequests).toBe(1);
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(1);

      controller.abort();
      await vi.advanceTimersByTimeAsync(0);
      expect(caught).toMatchObject({ name: 'AbortError' });
      await rejection;
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
      expect(vi.getTimerCount()).toBe(0);
      await vi.advanceTimersByTimeAsync(120000);
      expect(invoke).toHaveBeenCalledOnce();
      expect(Object.values(registry.getMetrics())[0]).toMatchObject({
        activeRequests: 0,
        queueDepth: 0,
        failedRequests: 1,
      });
    },
  );

  it('does not release another active caller when a result-backoff wait is aborted', async () => {
    const registry = createRegistry(2);
    const controller = new AbortController();
    const limitedCall = vi.fn().mockResolvedValue(rateLimited(60000));
    const limited = registry.execute(
      provider,
      limitedCall,
      createProviderRateLimitOptions(controller.signal),
    );
    let caught: unknown;
    const rejection = limited.catch((error) => {
      caught = error;
    });
    const held = deferred<ProviderResponse>();
    const active = registry.execute(provider, () => held.promise);
    await vi.advanceTimersByTimeAsync(0);
    expect(Object.values(registry.getMetrics())[0].activeRequests).toBe(1);

    const queuedCall = vi.fn().mockResolvedValue({ output: 'queued' });
    const queued = registry.execute(provider, queuedCall);
    controller.abort();
    await vi.advanceTimersByTimeAsync(0);
    expect(caught).toMatchObject({ name: 'AbortError' });
    await rejection;
    expect(Object.values(registry.getMetrics())[0].activeRequests).toBe(1);
    // The quota reset must not admit queuedCall while the surviving call owns capacity.
    await vi.advanceTimersByTimeAsync(60000);
    expect(queuedCall).not.toHaveBeenCalled();
    expect(Object.values(registry.getMetrics())[0]).toMatchObject({
      activeRequests: 1,
      queueDepth: 1,
    });

    held.resolve({ output: 'held' });
    await vi.advanceTimersByTimeAsync(0);
    await active;
    await expect(queued).resolves.toEqual({ output: 'queued' });
    expect(limitedCall).toHaveBeenCalledOnce();
    expect(Object.values(registry.getMetrics())[0].activeRequests).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('forwards a wrapped provider caller signal into the actual registry wait', async () => {
    const registry = createRegistry();
    const controller = new AbortController();
    const callApi = vi
      .fn()
      .mockResolvedValueOnce(rateLimited(60000))
      .mockResolvedValue({ output: 'retry' });
    const wrapped = wrapProviderWithRateLimiting({ id: provider.id, callApi }, registry);
    const pending = wrapped.callApi('prompt', undefined, { abortSignal: controller.signal });
    let caught: unknown;
    const rejection = pending.catch((error) => {
      caught = error;
    });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await vi.advanceTimersByTimeAsync(0);
    expect(caught).toMatchObject({ name: 'AbortError' });
    await rejection;
    await vi.advanceTimersByTimeAsync(120000);
    expect(callApi).toHaveBeenCalledExactlyOnceWith('prompt', undefined, {
      abortSignal: controller.signal,
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves ordinary retries and removes listeners after normal settlement', async () => {
    const registry = createRegistry();
    const controller = new AbortController();
    const invoke = vi
      .fn()
      .mockResolvedValueOnce(rateLimited(1000))
      .mockResolvedValue({ output: 'ok' });
    const pending = registry.execute(
      provider,
      invoke,
      createProviderRateLimitOptions(controller.signal),
    );
    await vi.advanceTimersByTimeAsync(1000);
    await expect(pending).resolves.toEqual({ output: 'ok' });
    controller.abort();
    expect(invoke).toHaveBeenCalledTimes(2);
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([false, true])(
    'preserves maxRetries: 0 and fetch retry context (disabled=%s)',
    async (disabled) => {
      vi.stubEnv('PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER', String(disabled));
      const registry = createRegistry();
      const configured = { ...provider, config: { maxRetries: 0 } };
      const invoke = vi.fn(async () => {
        expect(getFetchRetryContextMaxRetries()).toBe(0);
        return rateLimited(60000);
      });
      const pending = registry.execute(configured, invoke, createProviderRateLimitOptions());
      if (disabled) {
        await expect(pending).resolves.toEqual(rateLimited(60000));
      } else {
        await expect(pending).rejects.toThrow('after 1 attempts');
      }
      expect(invoke).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('does not classify caller queue cancellation as a queue timeout', async () => {
    const state = new ProviderRateLimitState({
      rateLimitKey: 'events',
      maxConcurrency: 1,
      minConcurrency: 1,
      queueTimeoutMs: 100,
    });
    const timeout = vi.fn();
    state.on('queue:timeout', timeout);
    const active = deferred<ProviderResponse>();
    const first = state.executeWithRetry('active', () => active.promise, {});
    const controller = new AbortController();
    const cancelled = state.executeWithRetry('cancelled', vi.fn(), {
      abortSignal: controller.signal,
    });
    const rejected = expect(cancelled).rejects.toMatchObject({ name: 'AbortError' });
    try {
      controller.abort();
      await vi.advanceTimersByTimeAsync(0);
      await rejected;
      expect(timeout).not.toHaveBeenCalled();
      const timedOut = state.executeWithRetry('timeout', vi.fn(), {});
      const timeoutRejected = expect(timedOut).rejects.toThrow('timed out after 100ms');
      await vi.advanceTimersByTimeAsync(100);
      await timeoutRejected;
      expect(timeout).toHaveBeenCalledOnce();
      expect(state.getMetrics()).toMatchObject({ activeRequests: 1, failedRequests: 2 });
    } finally {
      active.resolve({ output: 'done' });
      await first;
      state.dispose();
    }
  });
});
