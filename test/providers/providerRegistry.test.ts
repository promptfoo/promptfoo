import { afterEach, describe, expect, it, vi } from 'vitest';
import logger from '../../src/logger';
import { ProviderRegistry } from '../../src/providers/providerRegistry';

vi.mock('../../src/logger');

afterEach(() => {
  vi.resetAllMocks();
});

function createRegistry(): ProviderRegistry {
  return new ProviderRegistry({ registerProcessHandlers: false });
}

describe('ProviderRegistry', () => {
  it('cleans up duplicate registrations only once', async () => {
    const cleanup = vi.fn();
    const resource = { cleanup };
    const registry = createRegistry();

    registry.register(resource);
    registry.register(resource);

    await registry.shutdownAll();

    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('prefers shutdown when both lifecycle methods are present', async () => {
    const shutdown = vi.fn();
    const cleanup = vi.fn();
    const registry = createRegistry();

    registry.register({ shutdown, cleanup });

    await registry.shutdownAll();

    expect(shutdown).toHaveBeenCalledTimes(1);
    expect(cleanup).not.toHaveBeenCalled();
  });

  it('supports synchronous and asynchronous lifecycle methods', async () => {
    const syncCleanup = vi.fn();
    const asyncShutdown = vi.fn().mockResolvedValue(undefined);
    const registry = createRegistry();

    registry.register({ cleanup: syncCleanup });
    registry.register({ shutdown: asyncShutdown });

    await registry.shutdownAll();

    expect(syncCleanup).toHaveBeenCalledTimes(1);
    expect(asyncShutdown).toHaveBeenCalledTimes(1);
  });

  it('logs lifecycle failures and continues cleaning up other resources', async () => {
    const syncFailure = vi.fn(() => {
      throw new Error('sync failure');
    });
    const asyncFailure = vi.fn().mockRejectedValue(new Error('async failure'));
    const successfulCleanup = vi.fn();
    const registry = createRegistry();

    registry.register({ cleanup: syncFailure });
    registry.register({ shutdown: asyncFailure });
    registry.register({ cleanup: successfulCleanup });

    await expect(registry.shutdownAll()).resolves.toBeUndefined();

    expect(syncFailure).toHaveBeenCalledTimes(1);
    expect(asyncFailure).toHaveBeenCalledTimes(1);
    expect(successfulCleanup).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Error cleaning up registered resource: Error: sync failure'),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Error cleaning up registered resource: Error: async failure'),
    );
  });

  it('does not install process handlers when disabled', async () => {
    const listenerCounts = {
      SIGINT: process.listenerCount('SIGINT'),
      SIGTERM: process.listenerCount('SIGTERM'),
      beforeExit: process.listenerCount('beforeExit'),
    };
    const registry = createRegistry();

    registry.register({ cleanup: vi.fn() });

    expect(process.listenerCount('SIGINT')).toBe(listenerCounts.SIGINT);
    expect(process.listenerCount('SIGTERM')).toBe(listenerCounts.SIGTERM);
    expect(process.listenerCount('beforeExit')).toBe(listenerCounts.beforeExit);

    await registry.shutdownAll();
  });

  it('returns an idempotent disposer for a registration', async () => {
    const cleanup = vi.fn();
    const registry = createRegistry();
    const dispose = registry.register({ cleanup });

    dispose();
    dispose();
    await registry.shutdownAll();

    expect(cleanup).not.toHaveBeenCalled();
  });

  it('preserves resources registered while shutdown is in progress', async () => {
    const laterCleanup = vi.fn();
    const registry = createRegistry();
    let releaseFirstCleanup: (() => void) | undefined;
    const firstCleanup = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseFirstCleanup = resolve;
        }),
    );

    registry.register({ cleanup: firstCleanup });
    const firstShutdown = registry.shutdownAll();
    registry.register({ cleanup: laterCleanup });
    releaseFirstCleanup?.();
    await firstShutdown;

    expect(firstCleanup).toHaveBeenCalledOnce();
    expect(laterCleanup).not.toHaveBeenCalled();

    await registry.shutdownAll();

    expect(laterCleanup).toHaveBeenCalledOnce();
  });

  it('preserves the same resource when it re-registers during shutdown', async () => {
    const registry = createRegistry();
    let registrations = 0;
    const resource = {
      cleanup: vi.fn(() => {
        registrations++;
        if (registrations === 1) {
          registry.register(resource);
        }
      }),
    };
    registry.register(resource);

    await registry.shutdownAll();
    expect(resource.cleanup).toHaveBeenCalledOnce();

    await registry.shutdownAll();
    expect(resource.cleanup).toHaveBeenCalledTimes(2);
  });

  it('makes concurrent shutdown callers wait for cleanup already in progress', async () => {
    const registry = createRegistry();
    let releaseCleanup: (() => void) | undefined;
    const cleanup = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseCleanup = resolve;
        }),
    );
    registry.register({ cleanup });

    const firstShutdown = registry.shutdownAll();
    const secondShutdown = registry.shutdownAll();
    let secondResolved = false;
    void secondShutdown.then(() => {
      secondResolved = true;
    });

    await Promise.resolve();
    expect(secondResolved).toBe(false);
    expect(cleanup).toHaveBeenCalledOnce();

    releaseCleanup?.();
    await Promise.all([firstShutdown, secondShutdown]);

    expect(secondResolved).toBe(true);
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('queues newly registered resources for a concurrent shutdown request', async () => {
    const registry = createRegistry();
    let releaseFirstCleanup: (() => void) | undefined;
    const firstCleanup = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseFirstCleanup = resolve;
        }),
    );
    const laterCleanup = vi.fn();
    registry.register({ cleanup: firstCleanup });

    const firstShutdown = registry.shutdownAll();
    registry.register({ cleanup: laterCleanup });
    const secondShutdown = registry.shutdownAll();
    releaseFirstCleanup?.();
    await Promise.all([firstShutdown, secondShutdown]);

    expect(firstCleanup).toHaveBeenCalledOnce();
    expect(laterCleanup).toHaveBeenCalledOnce();
  });
});
