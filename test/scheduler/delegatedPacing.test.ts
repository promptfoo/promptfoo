import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../src/cliState';
import {
  callProviderWithContext,
  waitForProviderCall,
  withProviderCallExecutionContext,
} from '../../src/scheduler/providerCallExecutionContext';

import type { ApiProvider } from '../../src/types/index';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('delegated pacing after cancellation', () => {
  it.each([false, true])(
    'preserves the interval for a live successor (enclosing owner=%s)',
    async (owned) => {
      await cliState.withEnv({}, async () => {
        const starts: number[] = [];
        const provider: ApiProvider = {
          id: () => 'offline-paced-target',
          callApi: vi.fn(async () => {
            starts.push(Date.now());
            return { output: 'done' };
          }),
        };
        const aborted = new AbortController();
        const invoke = (signal?: AbortSignal) =>
          withProviderCallExecutionContext(
            {
              providerDelay: { provider, delay: 100 },
              providerCallOwned: owned,
              abortSignal: signal,
            },
            () => waitForProviderCall(callProviderWithContext(provider, 'hello'), signal),
          );
        const first = invoke(aborted.signal);
        const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' });
        const second = invoke();
        await vi.advanceTimersByTimeAsync(10);
        aborted.abort();
        await rejected;
        await vi.advanceTimersByTimeAsync(89);
        expect(starts).toEqual([0]);
        await vi.advanceTimersByTimeAsync(1);
        expect(starts).toEqual([0, 100]);
        await vi.advanceTimersByTimeAsync(100);
        await expect(second).resolves.toEqual({ output: 'done' });
        expect(vi.getTimerCount()).toBe(0);
      });
    },
  );

  it('carries the prior interval through a canceled queued call', async () => {
    await cliState.withEnv({}, async () => {
      const starts: number[] = [];
      const provider: ApiProvider = {
        id: () => 'offline-canceled-waiter',
        delay: 100,
        callApi: vi.fn(async () => {
          starts.push(Date.now());
          return { output: 'done' };
        }),
      };
      const firstController = new AbortController();
      const queuedController = new AbortController();
      const first = callProviderWithContext(provider, 'first', undefined, {
        abortSignal: firstController.signal,
      });
      const firstRejected = expect(first).rejects.toMatchObject({ name: 'AbortError' });
      const queued = callProviderWithContext(provider, 'canceled', undefined, {
        abortSignal: queuedController.signal,
      });
      const queuedRejected = expect(queued).rejects.toMatchObject({ name: 'AbortError' });
      const last = callProviderWithContext(provider, 'last');
      await vi.advanceTimersByTimeAsync(10);
      firstController.abort();
      await firstRejected;
      queuedController.abort();
      await queuedRejected;
      await vi.advanceTimersByTimeAsync(89);
      expect(starts).toEqual([0]);
      await vi.advanceTimersByTimeAsync(101);
      await expect(last).resolves.toEqual({ output: 'done' });
      expect(starts).toEqual([0, 100]);
      expect(provider.callApi).toHaveBeenNthCalledWith(2, 'last', undefined, undefined);
      expect(vi.getTimerCount()).toBe(0);
    });
  });

  it('clears aborted timers while retaining the interval for a later call', async () => {
    const provider: ApiProvider = {
      id: () => 'offline-reused-paced-target',
      delay: 100,
      callApi: vi.fn().mockResolvedValue({ output: 'done' }),
    };
    const controller = new AbortController();
    const first = callProviderWithContext(provider, 'first', undefined, {
      abortSignal: controller.signal,
    });
    const rejected = expect(first).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(10);
    controller.abort();
    await rejected;
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(40);
    const next = callProviderWithContext(provider, 'next');
    await vi.advanceTimersByTimeAsync(49);
    expect(provider.callApi).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(101);
    await expect(next).resolves.toEqual({ output: 'done' });
    expect(provider.callApi).toHaveBeenCalledTimes(2);
  });

  it('does not add pacing after a rejected request or a cached response', async () => {
    const failure = new Error('ordinary provider failure');
    const provider: ApiProvider = {
      id: () => 'offline-failed-or-cached',
      delay: 100,
      callApi: vi
        .fn()
        .mockRejectedValueOnce(failure)
        .mockResolvedValue({ output: 'cached', cached: true }),
    };
    await expect(callProviderWithContext(provider, 'failure')).rejects.toBe(failure);
    await expect(callProviderWithContext(provider, 'cached')).resolves.toEqual({
      output: 'cached',
      cached: true,
    });
    expect(vi.getTimerCount()).toBe(0);
  });
});
