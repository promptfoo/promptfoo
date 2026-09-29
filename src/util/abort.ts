/** Stop waiting without cancelling work shared with another caller. */
export function awaitWithAbort<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) {
    return operation;
  }
  let onAbort!: () => void;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(signal.reason);
    if (signal.aborted) {
      onAbort();
    } else {
      signal.addEventListener('abort', onAbort, { once: true });
    }
  });
  return Promise.race([operation, aborted]).finally(() =>
    signal.removeEventListener('abort', onAbort),
  );
}
