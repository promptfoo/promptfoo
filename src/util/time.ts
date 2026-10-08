export function getCurrentTimestamp() {
  return Math.floor(new Date().getTime() / 1000);
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Sleep that can be interrupted by an abort signal.
 * Throws 'cancelled by user' if signal is already aborted or aborts during sleep.
 */
export async function sleepWithAbort(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) {
    throw new Error('cancelled by user');
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timeout);
      reject(new Error('cancelled by user'));
    };

    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** Wait for pending work to settle up to the timeout, then release the timer. */
export async function waitForSettled(pending: Iterable<Promise<unknown>>, timeoutMs: number) {
  const timer = new AbortController();
  try {
    await Promise.race([Promise.allSettled(pending), sleepWithAbort(timeoutMs, timer.signal)]);
  } finally {
    timer.abort();
  }
}
