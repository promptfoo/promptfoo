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

export function runWithAbort<T>(call: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) {
    return call();
  }
  signal.throwIfAborted();
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    let pendingAbort: NodeJS.Immediate | undefined;
    const finish = (complete: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      signal.removeEventListener('abort', onAbort);
      if (pendingAbort) {
        clearImmediate(pendingAbort);
      }
      complete();
    };
    const onAbort = () => {
      // Preserve an operation failure already unwinding this turn, then stop waiting.
      pendingAbort = setImmediate(() => finish(() => reject(signal.reason)));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    try {
      void call().then(
        (value) => finish(() => resolve(value)),
        (error) => finish(() => reject(error)),
      );
    } catch (error) {
      finish(() => reject(error));
    }
  });
}
