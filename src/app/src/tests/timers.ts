import { vi } from 'vitest';

type FakeTimerOptions = Parameters<typeof vi.useFakeTimers>[0];
type SystemTime = Parameters<typeof vi.setSystemTime>[0];

type RestoreTestTimersOptions = {
  runPending?: boolean;
};

export type TestTimers = ReturnType<typeof useTestTimers>;

export function restoreTestTimers({ runPending = false }: RestoreTestTimersOptions = {}) {
  try {
    if (runPending && vi.isFakeTimers()) {
      vi.runOnlyPendingTimers();
    }
  } finally {
    vi.useRealTimers();
  }
}

export function useTestTimers(options?: FakeTimerOptions) {
  vi.useFakeTimers(options);

  return {
    advanceBy: (milliseconds: number) => vi.advanceTimersByTime(milliseconds),
    advanceByAsync: (milliseconds: number) => vi.advanceTimersByTimeAsync(milliseconds),
    getTimerCount: () => vi.getTimerCount(),
    restore: restoreTestTimers,
    runAll: () => vi.runAllTimers(),
    runAllAsync: () => vi.runAllTimersAsync(),
    runPending: () => vi.runOnlyPendingTimers(),
    setSystemTime: (time: SystemTime) => vi.setSystemTime(time),
    useFakeTimers: (nextOptions: FakeTimerOptions = options) => vi.useFakeTimers(nextOptions),
    useRealTimers: () => vi.useRealTimers(),
  };
}
