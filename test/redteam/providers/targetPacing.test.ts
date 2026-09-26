import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../../src/cliState';
import { callTargetProvider, getTargetResponse } from '../../../src/redteam/providers/shared';
import { withProviderCallExecutionContext } from '../../../src/scheduler/providerCallExecutionContext';
import { sleep } from '../../../src/util/time';
import { createDeferred } from '../../util/utils';

import type { ApiProvider, ProviderResponse } from '../../../src/types';

describe('delegated target pacing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('serializes request starts for one delayed target', async () => {
    const starts: number[] = [];
    const provider: ApiProvider = {
      id: () => 'fixture',
      delay: 100,
      callApi: async () => {
        starts.push(Date.now());
        return { output: 'ok' };
      },
    };
    const results = Promise.all(
      ['one', 'two', 'three'].map((prompt) => callTargetProvider(provider, prompt)),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(starts).toEqual([0]);
    await vi.advanceTimersByTimeAsync(300);
    await results;
    expect(starts).toEqual([0, 100, 200]);
  });

  it.each(['distinct', 'shared', 'undefined'])(
    'keeps invocations independent with %s environment values',
    async (mode) => {
      const starts: number[] = [];
      const provider: ApiProvider = {
        id: () => 'fixture',
        delay: 100,
        callApi: async () => {
          starts.push(Date.now());
          return { output: 'ok' };
        },
      };
      const sharedEnv = { PROMPTFOO_DELAY_MS: '100' };
      const results = Promise.all(
        ['first', 'second'].map((label) =>
          cliState.withEnv(
            mode === 'undefined'
              ? undefined
              : mode === 'shared'
                ? sharedEnv
                : { PROMPTFOO_CACHE_PATH: label },
            () => callTargetProvider(provider, label),
          ),
        ),
      );
      await vi.advanceTimersByTimeAsync(0);
      expect(starts).toEqual([0, 0]);
      await vi.advanceTimersByTimeAsync(100);
      await results;
    },
  );

  it('lets cached responses release the next call without a delay', async () => {
    const callApi = vi.fn().mockResolvedValue({ output: 'ok', cached: true });
    const provider: ApiProvider = { id: () => 'fixture', delay: 100, callApi };
    await Promise.all([callTargetProvider(provider, 'one'), callTargetProvider(provider, 'two')]);
    expect(callApi).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([0, 100])('keeps provider instances independent with delay %i', async (delay) => {
    const pending = createDeferred<ProviderResponse>();
    const callApi = vi.fn().mockReturnValue(pending.promise);
    const first: ApiProvider = { id: () => 'same-id', delay, callApi };
    const second: ApiProvider = { id: () => 'same-id', delay: 100, callApi };
    const results = Promise.all([
      callTargetProvider(first, 'one'),
      callTargetProvider(first, 'two'),
      callTargetProvider(second, 'three'),
    ]);
    await vi.advanceTimersByTimeAsync(0);
    expect(callApi).toHaveBeenCalledTimes(delay === 0 ? 3 : 2);
    pending.resolve({ output: 'ok' });
    await vi.advanceTimersByTimeAsync(200);
    await results;
  });

  it('waits exactly once when the target applies its own delay', async () => {
    const starts: number[] = [];
    const provider: ApiProvider = {
      id: () => 'fixture',
      delay: 100,
      handlesOwnDelay: true,
      callApi: async () => {
        starts.push(Date.now());
        await sleep(100);
        return { output: 'ok' };
      },
    };
    const results = Promise.all([
      callTargetProvider(provider, 'one'),
      callTargetProvider(provider, 'two'),
    ]);
    await vi.advanceTimersByTimeAsync(200);
    await results;
    expect(starts).toEqual([0, 100]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['options', 'execution context'])(
    'propagates %s cancellation during the post-response wait',
    async (source) => {
      const controller = new AbortController();
      const provider: ApiProvider = {
        id: () => 'fixture',
        delay: 60000,
        callApi: vi.fn().mockResolvedValue({ output: 'ok' }),
      };
      const result =
        source === 'options'
          ? getTargetResponse(provider, 'hello', undefined, { abortSignal: controller.signal })
          : withProviderCallExecutionContext({ abortSignal: controller.signal }, () =>
              getTargetResponse(provider, 'hello'),
            );
      const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' });
      await vi.advanceTimersByTimeAsync(0);
      expect(provider.callApi).toHaveBeenCalledTimes(1);
      controller.abort();
      await rejected;
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('uses the invocation delay when a self-delaying provider has no configured delay', async () => {
    const callApi = vi.fn().mockResolvedValue({ output: 'ok' });
    const provider: ApiProvider = { id: () => 'fixture', handlesOwnDelay: true, callApi };
    const result = withProviderCallExecutionContext(
      { providerDelay: { provider, delay: 100 } },
      () => Promise.all([callTargetProvider(provider, 'one'), callTargetProvider(provider, 'two')]),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(callApi).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(200);
    await result;
    expect(callApi).toHaveBeenCalledTimes(2);
  });

  it('cancels queued work promptly without blocking subsequent calls', async () => {
    const first = createDeferred<ProviderResponse>();
    const callApi = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue({ output: 'ok' });
    const provider: ApiProvider = { id: () => 'fixture', delay: 100, callApi };
    const controller = new AbortController();
    const running = callTargetProvider(provider, 'one');
    const queued = callTargetProvider(provider, 'two', undefined, {
      abortSignal: controller.signal,
    });
    const rejected = expect(queued).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await rejected;
    expect(callApi).toHaveBeenCalledTimes(1);
    const next = callTargetProvider(provider, 'three');
    first.resolve({ output: 'ok' });
    await vi.advanceTimersByTimeAsync(200);
    await Promise.all([running, next]);
    expect(callApi.mock.calls.map((call) => call[0])).toEqual(['one', 'three']);
  });

  it('recovers the queue after a provider failure', async () => {
    const callApi = vi
      .fn()
      .mockRejectedValueOnce(new Error('fixture failure'))
      .mockResolvedValue({ output: 'ok', cached: true });
    const provider: ApiProvider = { id: () => 'fixture', delay: 100, callApi };
    const first = expect(callTargetProvider(provider, 'one')).rejects.toThrow('fixture failure');
    const second = callTargetProvider(provider, 'two');
    await first;
    await expect(second).resolves.toMatchObject({ output: 'ok' });
    expect(callApi).toHaveBeenCalledTimes(2);
  });
});
