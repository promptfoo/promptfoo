import { getCallerAbortError } from '../util/fetch/requestSignal';

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw getCallerAbortError(signal, 'The operation was aborted.');
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
      reject(getCallerAbortError(signal!, 'The operation was aborted.'));
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
