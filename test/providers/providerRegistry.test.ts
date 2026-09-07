import { afterEach, describe, expect, it, vi } from 'vitest';
import logger from '../../src/logger';
import { providerRegistry } from '../../src/providers/providerRegistry';
import { createDeferred } from '../util/utils';

vi.mock('../../src/logger');

afterEach(async () => {
  await providerRegistry.shutdownAll();
  vi.restoreAllMocks();
});

describe('providerRegistry', () => {
  it('supports cleanup and preserves legacy shutdown hooks', async () => {
    const cleanup = vi.fn();
    const shutdown = vi.fn().mockResolvedValue(undefined);
    providerRegistry.register({ cleanup });
    providerRegistry.register({ shutdown, cleanup: vi.fn() });
    await providerRegistry.shutdownAll();
    expect(cleanup).toHaveBeenCalledOnce();
    expect(shutdown).toHaveBeenCalledOnce();
  });

  it('continues cleanup after synchronous and asynchronous failures', async () => {
    const cleanup = vi.fn();
    providerRegistry.register({
      cleanup: () => {
        throw new Error('sync');
      },
    });
    providerRegistry.register({ shutdown: () => Promise.reject(new Error('async')) });
    providerRegistry.register({ cleanup });
    await expect(providerRegistry.shutdownAll()).resolves.toBeUndefined();
    expect(cleanup).toHaveBeenCalledOnce();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('sync'));
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('async'));
  });

  it('shares an in-flight shutdown and preserves providers registered during cleanup', async () => {
    const pending = createDeferred<void>();
    const cleanup = vi.fn(() => pending.promise);
    const laterCleanup = vi.fn();
    providerRegistry.register({ cleanup });
    const first = providerRegistry.shutdownAll();
    providerRegistry.register({ cleanup: laterCleanup });
    const second = providerRegistry.shutdownAll();
    expect(second).toBe(first);
    pending.resolve();
    await Promise.all([first, second]);
    expect(cleanup).toHaveBeenCalledOnce();
    expect(laterCleanup).not.toHaveBeenCalled();
    await providerRegistry.shutdownAll();
    expect(laterCleanup).toHaveBeenCalledOnce();
  });

  it('does not clean up unregistered providers', async () => {
    const provider = { cleanup: vi.fn() };
    providerRegistry.register(provider);
    providerRegistry.unregister(provider);
    await providerRegistry.shutdownAll();
    expect(provider.cleanup).not.toHaveBeenCalled();
  });
});
