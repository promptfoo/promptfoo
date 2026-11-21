/** Decode at most maxBytes. Require a stream when a polyfill's text() fallback is unsafe. */
export async function readBoundedText(
  response: Response,
  maxBytes: number,
  {
    requireStream,
    requireComplete,
    signal,
  }: { requireStream?: boolean; requireComplete?: boolean; signal?: AbortSignal } = {},
): Promise<string> {
  if (!response.body) {
    signal?.throwIfAborted();
    const length = Number.parseInt(response.headers?.get?.('content-length') ?? '', 10);
    return requireComplete || requireStream || length > maxBytes
      ? ''
      : (await response.text()).slice(0, maxBytes);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let remaining = maxBytes;
  // A cloned response's cancel promise can depend on the other branch of the tee.
  const cancel = () => void reader.cancel().catch(() => {});
  signal?.addEventListener('abort', cancel, { once: true });
  try {
    while (remaining > 0) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) {
        break;
      }
      text += decoder.decode(value.subarray(0, remaining), { stream: true });
      remaining -= value.byteLength;
    }
    // At the byte limit EOF is unconfirmed. Truncated JSON cannot be safely redacted.
    return requireComplete && remaining <= 0 ? '' : text + decoder.decode();
  } finally {
    signal?.removeEventListener('abort', cancel);
    cancel();
    reader.releaseLock();
  }
}

export async function readBoundedErrorBody(
  response: Response,
  signal: AbortSignal,
): Promise<unknown> {
  const text = await readBoundedText(response, 64 * 1024, { requireComplete: true, signal });
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
