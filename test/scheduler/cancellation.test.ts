import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderGroupedCallQueue } from '../../src/scheduler/providerCallQueue';
import { ProviderRateLimitState } from '../../src/scheduler/providerRateLimitState';
import { wrapProviderWithRateLimiting } from '../../src/scheduler/providerWrapper';
import { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';
import { SlotQueue } from '../../src/scheduler/slotQueue';
import { createDeferred, mockProcessEnv } from '../util/utils';

let restoreEnv: () => void;
beforeEach(() => {
  restoreEnv = mockProcessEnv({ PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER: 'false' });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  restoreEnv();
});

describe('scheduler cancellation', () => {
  it('removes an aborted slot waiter without releasing the active owner', async () => {
    vi.useFakeTimers();
    const queue = new SlotQueue({ maxConcurrency: 1, minConcurrency: 1 });
    const controller = new AbortController();
    const removeListener = vi.spyOn(controller.signal, 'removeEventListener');
    try {
      await queue.acquire('owner');
      const pending = queue.acquire('cancelled', controller.signal);
      const rejected = expect(pending).rejects.toThrow('stop waiting');
      expect(queue.getQueueDepth()).toBe(1);
      controller.abort(new Error('stop waiting'));
      await rejected;
      expect(queue.getQueueDepth()).toBe(0);
      expect(queue.getActiveCount()).toBe(1);
      expect(vi.getTimerCount()).toBe(0);
      expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function));
      queue.release();
      await queue.acquire('next');
      expect(queue.getActiveCount()).toBe(1);
    } finally {
      queue.dispose();
    }
  });

  it('leaves an acquired slot owned until explicitly released', async () => {
    const queue = new SlotQueue({ maxConcurrency: 1, minConcurrency: 1 });
    const controller = new AbortController();
    try {
      await queue.acquire('owner', controller.signal);
      controller.abort();
      expect(queue.getActiveCount()).toBe(1);
      queue.release();
      expect(queue.getActiveCount()).toBe(0);
    } finally {
      queue.dispose();
    }
  });

  it.each(['queued', 'taken'] as const)(
    'does not dispatch an aborted %s grouped call',
    async (phase) => {
      const queue = new ProviderGroupedCallQueue();
      const controller = new AbortController();
      const call = vi.fn().mockResolvedValue('unexpected');
      const pending = queue.enqueue('grader', call, controller.signal);
      const rejected = expect(pending).rejects.toThrow('stop waiting');
      const group = phase === 'taken' ? queue.takeNextGroup() : [];
      controller.abort(new Error('stop waiting'));
      await rejected;
      for (const job of group) {
        await queue.run(job);
      }
      expect(queue.hasJobs()).toBe(false);
      expect(call).not.toHaveBeenCalled();
    },
  );

  it('retains unrelated errors thrown by an already running grouped call', async () => {
    const queue = new ProviderGroupedCallQueue();
    const controller = new AbortController();
    const error = new SyntaxError('invalid grader response');
    const pending = queue.enqueue(
      'grader',
      async () => {
        controller.abort();
        throw error;
      },
      controller.signal,
    );
    const rejected = expect(pending).rejects.toBe(error);
    await queue.run(queue.takeNextGroup()[0]);
    await rejected;
  });

  it.each(['response', 'error'] as const)(
    'aborts %s retry backoff without releasing another request slot',
    async (mode) => {
      const state = new ProviderRateLimitState({
        rateLimitKey: 'grader',
        maxConcurrency: 2,
        minConcurrency: 1,
        retryPolicy: { maxRetries: 3, baseDelayMs: 60_000, maxDelayMs: 60_000, jitterFactor: 0 },
      });
      const controller = new AbortController();
      const ownerEntered = createDeferred<void>();
      const ownerFinished = createDeferred<string>();
      const retrying = createDeferred<void>();
      state.on('request:retrying', () => retrying.resolve());
      const owner = state.executeWithRetry(
        'owner',
        () => {
          ownerEntered.resolve();
          return ownerFinished.promise;
        },
        {},
      );
      await ownerEntered.promise;
      const call = vi.fn(async () => {
        if (mode === 'error') {
          throw new Error('503 unavailable');
        }
        return { limited: true };
      });
      const pending = state.executeWithRetry('cancelled', call, {
        abortSignal: controller.signal,
        isRateLimited: (result) => result?.limited ?? false,
      });
      const rejected = expect(pending).rejects.toThrow('stop retrying');
      try {
        await retrying.promise;
        controller.abort(new Error('stop retrying'));
        await rejected;
        expect(call).toHaveBeenCalledTimes(1);
        expect(state.getMetrics()).toMatchObject({
          activeRequests: 1,
          failedRequests: 1,
          queueDepth: 0,
        });
        ownerFinished.resolve('owner finished');
        await owner;
        expect(state.getMetrics()).toMatchObject({ activeRequests: 0, completedRequests: 1 });
      } finally {
        controller.abort();
        ownerFinished.resolve('cleanup');
        await owner;
        state.dispose();
      }
    },
  );

  it.each([false, true])(
    'prevents cancelled wrapper dispatch with scheduler disabled=%s',
    async (disabled) => {
      vi.stubEnv('PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER', String(disabled));
      const registry = new RateLimitRegistry({ maxConcurrency: 1 });
      const callApi = vi.fn().mockResolvedValue({ output: 'unexpected' });
      const wrapped = wrapProviderWithRateLimiting({ id: () => 'grader', callApi }, registry);
      try {
        await expect(
          wrapped.callApi('prompt', undefined, {
            abortSignal: AbortSignal.abort(new Error('cancelled')),
          }),
        ).rejects.toThrow('cancelled');
        expect(callApi).not.toHaveBeenCalled();
      } finally {
        registry.dispose();
        vi.unstubAllEnvs();
      }
    },
  );
});
