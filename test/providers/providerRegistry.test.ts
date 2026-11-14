import { afterEach, describe, expect, it, vi } from 'vitest';
import logger from '../../src/logger';
import { ProviderRegistry, providerRegistry } from '../../src/providers/providerRegistry';
import { publishScriptProviderCacheWrite } from '../../src/providers/scriptResult';
import { createDeferred } from '../util/utils';

vi.mock('../../src/logger');

afterEach(async () => {
  await providerRegistry.shutdownAll();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('providerRegistry', () => {
  it('waits for pending script-provider cache writes from another module copy at shutdown', async () => {
    vi.resetModules();
    const library = await import('../../src/providers/scriptResult');
    expect(library.publishScriptProviderCacheWrite).not.toBe(publishScriptProviderCacheWrite);
    const registry = new ProviderRegistry();
    const write = createDeferred<void>();
    library.publishScriptProviderCacheWrite(
      { set: () => write.promise },
      'shutdown-flush-key',
      '{"output":"x"}',
      'TestProvider',
    );

    let settled = false;
    const shutdown = registry.shutdownForProcess().then(() => {
      settled = true;
    });
    // Let the empty active-call drain finish; only the detached write should block now.
    await new Promise((resolve) => setImmediate(resolve));
    try {
      expect(settled).toBe(false);
    } finally {
      write.resolve();
      await shutdown;
    }
    expect(settled).toBe(true);
  });

  it.each([
    { reuse: false, reject: false },
    { reuse: false, reject: true },
    { reuse: true, reject: false },
    { reuse: true, reject: true },
  ])(
    'preserves registrations during shutdown (reuse=$reuse, reject=$reject)',
    async ({ reuse, reject }) => {
      const closing = createDeferred<void>();
      const previous = { shutdown: vi.fn().mockResolvedValue(undefined) };
      previous.shutdown.mockReturnValueOnce(closing.promise);
      const replacement = reuse ? previous : { shutdown: vi.fn().mockResolvedValue(undefined) };
      providerRegistry.register(previous);

      const shutdown = providerRegistry.shutdownAll();
      expect(previous.shutdown).toHaveBeenCalledTimes(1);
      expect(providerRegistry.has(previous)).toBe(false);
      providerRegistry.register(replacement);

      if (reject) {
        closing.reject(new Error('cleanup failed'));
      } else {
        closing.resolve();
      }
      await shutdown;
      expect(providerRegistry.has(replacement)).toBe(true);
      expect(replacement.shutdown).toHaveBeenCalledTimes(reuse ? 1 : 0);
      if (reject) {
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('cleanup failed'));
      }

      await providerRegistry.shutdownAll();
      expect(replacement.shutdown).toHaveBeenCalledTimes(reuse ? 2 : 1);
      expect(providerRegistry.has(replacement)).toBe(false);
    },
  );

  it('continues cleanup when a provider throws synchronously', async () => {
    const failing = {
      shutdown: vi.fn(() => {
        throw new Error('synchronous cleanup failure');
      }),
    };
    const other = { shutdown: vi.fn().mockResolvedValue(undefined) };
    providerRegistry.register(failing);
    providerRegistry.register(other);

    await expect(providerRegistry.shutdownAll()).resolves.toBeUndefined();

    expect(other.shutdown).toHaveBeenCalledTimes(1);
    expect(providerRegistry.has(failing)).toBe(false);
    expect(providerRegistry.has(other)).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('synchronous cleanup failure'),
    );
  });
});
