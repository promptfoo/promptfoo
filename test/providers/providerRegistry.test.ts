import { afterEach, describe, expect, it, vi } from 'vitest';
import logger from '../../src/logger';
import { ProviderRegistry, providerRegistry } from '../../src/providers/providerRegistry';
import { createDeferred } from '../util/utils';

vi.mock('../../src/logger');

afterEach(async () => {
  await providerRegistry.shutdownAll();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('providerRegistry', () => {
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

  it('cleans up on SIGTERM without ending the process for a host that handles it', async () => {
    // Only this test's listeners may see the emitted signal.
    const saved = process.rawListeners('SIGTERM') as NodeJS.SignalsListener[];
    process.removeAllListeners('SIGTERM');
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true);
    const registry = new ProviderRegistry();
    const cleanedUp = createDeferred<void>();
    const hostCleanup = createDeferred<void>();
    try {
      registry.register({ shutdown: vi.fn(async () => cleanedUp.resolve()) });
      // A host's one-shot handler with async cleanup: Node removes it before calling it.
      const host = vi.fn(() => hostCleanup.promise);
      process.once('SIGTERM', host);

      process.emit('SIGTERM');
      await cleanedUp.promise;
      // Let any follow-up from the registry's listener run before checking it did nothing more.
      await new Promise((resolve) => setImmediate(resolve));

      expect(host).toHaveBeenCalledTimes(1);
      expect(kill).not.toHaveBeenCalled();
    } finally {
      hostCleanup.resolve();
      await registry.shutdownAll();
      process.removeAllListeners('SIGTERM');
      for (const listener of saved) {
        process.on('SIGTERM', listener);
      }
    }
  });
});
