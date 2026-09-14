/** Keep caller cancellation recognizable even when abort() receives a custom reason. */
export function getAbortError(signal: AbortSignal): Error {
  const reason: unknown = signal.reason;
  if (
    reason instanceof Error &&
    (reason.name === 'AbortError' || reason.name === 'AbortException')
  ) {
    return reason;
  }
  const message =
    reason instanceof Error
      ? reason.message
      : typeof reason === 'string'
        ? reason
        : 'The operation was aborted.';
  return Object.assign(new Error(message), {
    name: 'AbortError',
    cause: reason,
  });
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw getAbortError(signal);
  }
}

export function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    throwIfAborted(signal);
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      cleanup();
      reject(getAbortError(signal!));
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
