import { getEventListeners } from 'node:events';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as esm from '../../src/esm';
import logger from '../../src/logger';
import { executeProviderFunctionCallback } from '../../src/providers/functionCallbackUtils';
import * as shared from '../../src/providers/shared';
import { createDeferred } from '../util/utils';

vi.mock('../../src/logger');

const nextTurn = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('custom callback failure and caller cancellation', () => {
  beforeEach(() => {
    vi.mocked(logger.error).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(['Error', 'AbortError', 'AbortException'])(
    'preserves a completed callback-local %s when the caller later cancels',
    async (name) => {
      const controller = new AbortController();
      const failure = Object.assign(new Error('callback private operation failed'), {
        name,
        cause: new Error('independent operation'),
      });
      const callback = vi.fn(async () => {
        throw failure;
      });
      const pending = executeProviderFunctionCallback({
        functionName: 'lookup',
        args: '{}',
        callbacks: { lookup: callback },
        cache: {},
        abortSignal: controller.signal,
      });
      await expect(pending).rejects.toBe(failure);
      controller.abort(new Error('caller stopped'));
      await expect(pending).rejects.toBe(failure);
      expect(callback).toHaveBeenCalledOnce();
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
      expect(logger.error).toHaveBeenCalledWith(
        "Error executing function 'lookup': callback private operation failed",
      );
    },
  );

  it.each(['Error', 'AbortError', 'AbortException'])(
    'preserves the selected callback-local %s when abort precedes its outer catch',
    async (name) => {
      const controller = new AbortController();
      const reason = new Error('caller stopped after failure selection');
      const failure = Object.assign(new Error('selected callback failure'), {
        name,
        cause: new Error('independent callback operation'),
      });
      const selected = vi.fn();
      const realWait = shared.waitForPromiseWithAbort;
      vi.spyOn(shared, 'waitForPromiseWithAbort').mockImplementation(
        <T>(promise: PromiseLike<T>, signal?: AbortSignal | null): Promise<T> => {
          const waiting = realWait(promise, signal);
          // Observe the real wait's selection before its caller's await resumes.
          void waiting.catch((error: unknown) => {
            if (error === failure) {
              selected(error);
              controller.abort(reason);
            }
          });
          return waiting;
        },
      );

      await expect(
        executeProviderFunctionCallback({
          functionName: 'lookup',
          args: '{}',
          callbacks: {
            lookup: async () => {
              throw failure;
            },
          },
          cache: {},
          abortSignal: controller.signal,
        }),
      ).rejects.toBe(failure);
      expect(selected).toHaveBeenCalledExactlyOnceWith(failure);
      expect(controller.signal.reason).toBe(reason);
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
      expect(logger.error).toHaveBeenCalledExactlyOnceWith(
        "Error executing function 'lookup': selected callback failure",
      );
    },
  );

  it.each([new Error('caller stopped'), 'caller stopped'])(
    'rejects while the active callback remains held and observes a late failure (%s)',
    async (reason) => {
      const started = createDeferred<void>();
      const result = createDeferred<string>();
      const controller = new AbortController();
      const callback = vi.fn(() => {
        started.resolve();
        return result.promise;
      });
      const rejected = vi.fn();
      const resolved = vi.fn();
      const done = executeProviderFunctionCallback({
        functionName: 'lookup',
        args: '{}',
        callbacks: { lookup: callback },
        cache: {},
        abortSignal: controller.signal,
      }).then(resolved, rejected);
      await started.promise;
      try {
        controller.abort(reason);
        await nextTurn();
        expect(rejected).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({ name: 'AbortError', cause: reason }),
        );
        expect(resolved).not.toHaveBeenCalled();
        expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
      } finally {
        result.reject(new Error('late callback failure'));
        await done;
        await nextTurn();
      }
      expect(rejected).toHaveBeenCalledOnce();
      expect(logger.error).not.toHaveBeenCalled();
    },
  );

  it.each(['resolve', 'reject'])(
    'rejects while callback import remains held, then observes its late %s',
    async (settlement) => {
      const loading = createDeferred<void>();
      const module = createDeferred<Function>();
      const callback = vi.fn(async () => 'loaded result');
      const importModule = vi.spyOn(esm, 'importModule').mockImplementationOnce(() => {
        loading.resolve();
        return module.promise;
      });
      const cache: Record<string, Function> = {};
      const controller = new AbortController();
      const reason = new Error('caller stopped loading');
      const rejected = vi.fn();
      const done = executeProviderFunctionCallback({
        functionName: 'lookup',
        args: '{}',
        callbacks: { lookup: 'file://held-callback.js' },
        cache,
        abortSignal: controller.signal,
      }).then(vi.fn(), rejected);
      await loading.promise;
      try {
        controller.abort(reason);
        await nextTurn();
        expect(rejected).toHaveBeenCalledExactlyOnceWith(
          expect.objectContaining({ name: 'AbortError', cause: reason }),
        );
        expect(callback).not.toHaveBeenCalled();
        expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
      } finally {
        if (settlement === 'resolve') {
          module.resolve(callback);
        } else {
          module.reject(new Error('late import failure'));
        }
        await done;
        await nextTurn();
      }
      expect(callback).not.toHaveBeenCalled();
      expect(rejected).toHaveBeenCalledOnce();
      expect(logger.error).not.toHaveBeenCalled();
      if (settlement === 'resolve') {
        await expect(
          executeProviderFunctionCallback({
            functionName: 'lookup',
            args: '{}',
            callbacks: { lookup: 'file://held-callback.js' },
            cache,
          }),
        ).resolves.toBe('loaded result');
        expect(importModule).toHaveBeenCalledOnce();
        expect(callback).toHaveBeenCalledOnce();
      }
    },
  );

  it('returns successful callback output and removes its caller listener', async () => {
    const controller = new AbortController();
    await expect(
      executeProviderFunctionCallback({
        functionName: 'lookup',
        args: '{}',
        callbacks: { lookup: async () => ({ answer: 42 }) },
        cache: {},
        abortSignal: controller.signal,
      }),
    ).resolves.toBe('{"answer":42}');
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('preserves a cancellation cause supplied by the callback', async () => {
    const controller = new AbortController();
    const reason = new Error('caller stopped');
    const callback = vi.fn(async () => {
      controller.abort(reason);
      throw new Error('callback observed cancellation', { cause: reason });
    });

    await expect(
      executeProviderFunctionCallback({
        functionName: 'lookup',
        args: '{}',
        callbacks: { lookup: callback },
        cache: {},
        abortSignal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError', message: reason.message, cause: reason });
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('lets caller cancellation supersede successful callback completion', async () => {
    const controller = new AbortController();
    const reason = new Error('caller stopped');
    await expect(
      executeProviderFunctionCallback({
        functionName: 'lookup',
        args: '{}',
        callbacks: {
          lookup: async () => {
            controller.abort(reason);
            return 'completed';
          },
        },
        cache: {},
        abortSignal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'AbortError', message: reason.message, cause: reason });
    expect(logger.error).not.toHaveBeenCalled();
  });
});
