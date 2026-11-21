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

  it.each(['pending timer failure', 'callback expected vi.useFakeTimers'])(
    'preserves the callback error "%s" and restores real timers',
    (message) => {
      const timers = useTestTimers();
      setTimeout(() => {
        throw new Error(message);
      }, 10_000);

      expect(() => timers.restore({ runPending: true })).toThrow(message);
      expect(vi.isFakeTimers()).toBe(false);
    },
  );

  it('can be restored even when a test already switched back to real timers', () => {
    const timers = useTestTimers();

    timers.useRealTimers();

    expect(() => restoreTestTimers({ runPending: true })).not.toThrow();
  });
});
