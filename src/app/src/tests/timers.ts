import { vi } from 'vitest';

type FakeTimerOptions = Parameters<typeof vi.useFakeTimers>[0];

type RestoreTestTimersOptions = {
  runPending?: boolean;
};

export type TestTimers = ReturnType<typeof useTestTimers>;

function isTimersNotMockedError(error: unknown) {
  return (
    error instanceof Error &&
    /Timers are not mocked|vi\.useFakeTimers|useFakeTimers\(\)/i.test(error.message)
  );
}

export function restoreTestTimers({ runPending = false }: RestoreTestTimersOptions = {}) {
  let pendingTimerError: unknown;

  if (runPending) {
    try {
      vi.runOnlyPendingTimers();
    } catch (error) {
      if (!isTimersNotMockedError(error)) {
        pendingTimerError = error;
      }
    }
  }

  try {
    vi.clearAllTimers();
  } catch (error) {
    if (!isTimersNotMockedError(error) && pendingTimerError === undefined) {
      pendingTimerError = error;
    }
  }

  vi.useRealTimers();

  if (pendingTimerError !== undefined) {
    throw pendingTimerError;
  }
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
