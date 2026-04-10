import { describe, expect, it, vi } from 'vitest';
import { restoreTestTimers, useTestTimers } from './timers';

describe('test timers', () => {
  it('advances scheduled callbacks through a shared timer controller', () => {
    const timers = useTestTimers();
    const callback = vi.fn();

    setTimeout(callback, 250);
    timers.advanceBy(249);
    expect(callback).not.toHaveBeenCalled();

    timers.advanceBy(1);
    expect(callback).toHaveBeenCalledTimes(1);

    timers.restore();
  });

  it('can flush pending timers before restoring real timers', () => {
    const timers = useTestTimers();
    const callback = vi.fn();

    setTimeout(callback, 10_000);
    timers.restore({ runPending: true });

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('preserves errors thrown while flushing pending timers', () => {
    const timers = useTestTimers();

    setTimeout(() => {
      throw new Error('pending timer failure');
    }, 10_000);

    expect(() => timers.restore({ runPending: true })).toThrow('pending timer failure');
    expect(() => restoreTestTimers()).not.toThrow();
  });

  it('can be restored even when a test already switched back to real timers', () => {
    const timers = useTestTimers();

    timers.useRealTimers();

    expect(() => restoreTestTimers()).not.toThrow();
  });
});
