import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isCallerAbortError,
  throwIfAborted,
  waitForPromiseWithAbort,
} from '../../src/providers/shared';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('caller cancellation while waiting for shared work', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('releases one caller without canceling shared work or another caller', async () => {
    const work = deferred<string>();
    const first = new AbortController();
    const second = new AbortController();
    const removeFirst = vi.spyOn(first.signal, 'removeEventListener');
    const removeSecond = vi.spyOn(second.signal, 'removeEventListener');
    const canceled = waitForPromiseWithAbort(work.promise, first.signal);
    const survivor = waitForPromiseWithAbort(work.promise, second.signal);
    const cancellation = expect(canceled).rejects.toMatchObject({ name: 'AbortError' });

    first.abort();
    await cancellation;
    expect(removeFirst).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(second.signal.aborted).toBe(false);
    work.resolve('shared result');
    await expect(survivor).resolves.toBe('shared result');
    await expect(work.promise).resolves.toBe('shared result');
    expect(removeSecond).toHaveBeenCalledWith('abort', expect.any(Function));
  });

  it.each([false, true])(
    'observes late failure after caller abort (preaborted=%s)',
    async (preaborted) => {
      const work = deferred<string>();
      const controller = new AbortController();
      if (preaborted) {
        controller.abort();
      }
      const canceled = waitForPromiseWithAbort(work.promise, controller.signal);
      const cancellation = expect(canceled).rejects.toMatchObject({ name: 'AbortError' });
      controller.abort();
      await cancellation;
      work.reject(new Error('shared setup failed later'));
      await Promise.resolve();
    },
  );

  it('preserves unrelated failures and removes the caller listener', async () => {
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');
    const error = new Error('ordinary setup failure');
    await expect(waitForPromiseWithAbort(Promise.reject(error), controller.signal)).rejects.toBe(
      error,
    );
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    controller.abort();
    expect(isCallerAbortError(error, controller.signal)).toBe(false);
  });

  it.each([new Error('custom cancellation'), 'custom cancellation'])(
    'normalizes a custom caller reason and preserves its provenance',
    async (reason) => {
      const controller = new AbortController();
      controller.abort(reason);
      const error = await waitForPromiseWithAbort(
        Promise.resolve('unused'),
        controller.signal,
      ).catch((caught: unknown) => caught);
      expect(error).toMatchObject({
        name: 'AbortError',
        message: 'custom cancellation',
        cause: reason,
      });
      expect(isCallerAbortError(error, controller.signal)).toBe(true);
      expect(isCallerAbortError(reason, controller.signal)).toBe(true);
    },
  );

  it.each(['AbortError', 'AbortException'])('preserves the caller %s reason', (name) => {
    const controller = new AbortController();
    const reason = Object.assign(new Error('caller stopped'), { name });
    controller.abort(reason);
    expect(() => throwIfAborted(controller.signal)).toThrow(reason);
    expect(isCallerAbortError(reason, controller.signal)).toBe(true);
    expect(isCallerAbortError(reason)).toBe(false);
    expect(isCallerAbortError(reason, new AbortController().signal)).toBe(false);
  });

  it('keeps no-signal work and its error unchanged', async () => {
    await expect(waitForPromiseWithAbort(Promise.resolve('ok'))).resolves.toBe('ok');
    const error = Object.assign(new Error('synthetic noncaller failure'), { name: 'AbortError' });
    await expect(waitForPromiseWithAbort(Promise.reject(error))).rejects.toBe(error);
    expect(isCallerAbortError(error)).toBe(false);
  });
});
