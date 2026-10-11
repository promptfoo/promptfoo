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

  it('retains opted-in standalone resources until evaluation ownership or explicit shutdown', async () => {
    const registry = new ProviderRegistry(false);
    const provider = {
      id: () => 'persistent-direct',
      retainOutsideEvaluation: true,
      shutdown: vi.fn(async () => {}),
    };
    for (let turn = 0; turn < 2; turn++) {
      await registry.withProvider(provider, async () => registry.register(provider));
    }
    expect(provider.shutdown).not.toHaveBeenCalled();
    expect(registry.has(provider)).toBe(true);

    await registry.withEvaluation(() => registry.withProvider(provider, async () => {}));
    expect(provider.shutdown).toHaveBeenCalledOnce();
    expect(registry.has(provider)).toBe(false);

    // A later standalone registration starts a new lifetime, without stale evaluation ownership.
    await registry.withProvider(provider, async () => {});
    expect(registry.has(provider)).toBe(true);
    expect(provider.shutdown).toHaveBeenCalledOnce();
    await registry.shutdownAll();
    expect(provider.shutdown).toHaveBeenCalledTimes(2);
  });

  it('retains default resource cleanup for standalone calls without the opt-in', async () => {
    const registry = new ProviderRegistry(false);
    const provider = { id: () => 'default-direct', shutdown: vi.fn(async () => {}) };
    await registry.withProvider(provider, async () => registry.register(provider));
    await vi.waitFor(() => expect(provider.shutdown).toHaveBeenCalledOnce());
    expect(registry.has(provider)).toBe(false);
  });

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
