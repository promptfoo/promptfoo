import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import logger from '../../src/logger';
import { executeProviderFunctionCallback } from '../../src/providers/functionCallbackUtils';

vi.mock('../../src/logger');

describe('custom callback failure and caller cancellation', () => {
  beforeEach(() => {
    vi.mocked(logger.error).mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(['AbortError', 'AbortException'])(
    'preserves an unrelated callback-local %s after caller cancellation',
    async (name) => {
      const controller = new AbortController();
      const failure = Object.assign(new Error('callback private operation failed'), {
        name,
        cause: new Error('independent operation'),
      });
      const callback = vi.fn(async () => {
        controller.abort(new Error('caller stopped'));
        throw failure;
      });

      await expect(
        executeProviderFunctionCallback({
          functionName: 'lookup',
          args: '{}',
          callbacks: { lookup: callback },
          cache: {},
          abortSignal: controller.signal,
        }),
      ).rejects.toBe(failure);
      expect(callback).toHaveBeenCalledOnce();
      expect(logger.error).toHaveBeenCalledWith(
        "Error executing function 'lookup': callback private operation failed",
      );
    },
  );

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
