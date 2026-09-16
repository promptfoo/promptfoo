import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerCleanupHandlers } from '../../../src/codeScan/scanner/cleanup';

describe('registerCleanupHandlers', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('aborts the scan for each registered termination signal', () => {
    const handlers = new Map<string, () => void>();
    vi.spyOn(process, 'once').mockImplementation(((event, listener) => {
      if (typeof event === 'string' && typeof listener === 'function') {
        handlers.set(event, listener as () => void);
      }
      return process;
    }) as typeof process.once);
    const abortController = new AbortController();
    const abortSpy = vi.spyOn(abortController, 'abort');

    registerCleanupHandlers(abortController);
    for (const signal of ['SIGINT', 'SIGTERM', 'SIGQUIT']) {
      handlers.get(signal)?.();
    }

    expect([...handlers.keys()]).toEqual(['SIGINT', 'SIGTERM', 'SIGQUIT']);
    expect(abortSpy).toHaveBeenCalledTimes(3);
  });
});
