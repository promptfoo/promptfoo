export async function sleepForGeminiRetry(delayMs: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    throw signal.reason;
  }

  await new Promise<void>((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timeout);
      reject(signal?.reason);
    };
    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
