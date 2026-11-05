export function getCallerAbortError(
  signal: AbortSignal,
  defaultMessage = 'Request was aborted',
): Error {
  const reason: unknown = signal.reason;
  if (
    reason instanceof Error &&
    (reason.name === 'AbortError' || reason.name === 'AbortException')
  ) {
    return reason;
  }
  const message =
    reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : defaultMessage;
  return Object.assign(new Error(message), { name: 'AbortError', cause: reason });
}

export function getEffectiveRequestSignal(url: RequestInfo, options: RequestInit) {
  // An explicit null detaches the Request signal; only undefined inherits it.
  return options.signal === undefined && url instanceof Request ? url.signal : options.signal;
}

/** Match caller cancellation, requiring a reason link outside owned transport calls. */
export function isCallerAbortError(
  error: unknown,
  signal?: AbortSignal | null,
  { requireReasonMatch = false }: { requireReasonMatch?: boolean } = {},
): boolean {
  if (!signal?.aborted) {
    return false;
  }
  return (
    error === signal.reason ||
    (error instanceof Error &&
      ((!requireReasonMatch && (error.name === 'AbortError' || error.name === 'AbortException')) ||
        (signal.reason !== undefined &&
          (error as Error & { cause?: unknown }).cause === signal.reason)))
  );
}

/** Stop only this caller's wait; shared work keeps running and its rejection is observed. */
export function waitForPromiseWithAbort<T>(
  promise: PromiseLike<T>,
  signal?: AbortSignal | null,
): Promise<T> {
  if (!signal) {
    return Promise.resolve(promise);
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener('abort', onAbort);
      reject(getCallerAbortError(signal));
    };
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve(promise).then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
    if (signal.aborted) {
      onAbort();
    }
  });
}
