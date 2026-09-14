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
