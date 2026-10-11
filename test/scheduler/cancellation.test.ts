import { getEventListeners } from 'node:events';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { sleepWithAbort } from '../../src/scheduler/cancellation';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('sleepWithAbort cleanup', () => {
  it.each(['aborted', 'elapsed'] as const)('clears its own timer when %s', async (outcome) => {
    vi.useFakeTimers();
    const schedule = vi.spyOn(globalThis, 'setTimeout');
    const clear = vi.spyOn(globalThis, 'clearTimeout');
    const controller = new AbortController();
    const reason = new Error('caller stopped');
    const pending = sleepWithAbort(60_000, controller.signal);
    const timer = schedule.mock.results[0].value;
    expect(schedule).toHaveBeenCalledOnce();

    if (outcome === 'aborted') {
      const rejected = expect(pending).rejects.toBe(reason);
      controller.abort(reason);
      await rejected;
    } else {
      await vi.advanceTimersByTimeAsync(60_000);
      await pending;
    }

    expect(clear).toHaveBeenCalledWith(timer);
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
  });
});
