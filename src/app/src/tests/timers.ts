import { vi } from 'vitest';

type FakeTimerOptions = Parameters<typeof vi.useFakeTimers>[0];

type RestoreTestTimersOptions = {
  runPending?: boolean;
};

export type TestTimers = ReturnType<typeof useTestTimers>;

export function restoreTestTimers({ runPending = false }: RestoreTestTimersOptions = {}) {
  if (runPending) {
    try {
      vi.runOnlyPendingTimers();
    } catch {
      // Real timers are already active.
    }
  }

  try {
    vi.clearAllTimers();
  } catch {
    // Real timers are already active.
  }

  vi.useRealTimers();
}

export function useTestTimers(options?: FakeTimerOptions) {
  vi.useFakeTimers(options);

  return {
    advanceBy: (milliseconds: number) => vi.advanceTimersByTime(milliseconds),
    advanceByAsync: (milliseconds: number) => vi.advanceTimersByTimeAsync(milliseconds),
    getTimerCount: () => vi.getTimerCount(),
    restore: restoreTestTimers,
    runPending: () => vi.runOnlyPendingTimers(),
    useFakeTimers: (nextOptions: FakeTimerOptions = options) => vi.useFakeTimers(nextOptions),
    useRealTimers: () => vi.useRealTimers(),
  };
}
