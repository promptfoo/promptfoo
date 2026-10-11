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

  describe('explicit resource cleanup', () => {
    it('cancels a waiting evaluation without rejoining cleanup or interrupting another caller', async () => {
      const registry = new ProviderRegistry(false);
      const finishCleanup = createDeferred<void>();
      const provider = {
        id: () => 'explicit-cleanup-waiters',
        retainOutsideEvaluation: true,
        shutdown: vi.fn(async () => registry.unregister(provider)),
      };
      registry.register(provider);
      const cleanup = finishCleanup.promise.then(() => registry.unregister(provider));
      registry.trackResourceCleanup(provider, cleanup);
      const controller = new AbortController();
      const reason = new Error('cancel waiting evaluation');
      const abandoned = vi.fn(async () => 'abandoned');
      const resumed = vi.fn(async () => 'resumed');
      const evaluation = registry.withEvaluation(() =>
        registry.withProvider(provider, abandoned, controller.signal),
      );
      let failure: unknown;
      void evaluation.catch((error) => {
        failure = error;
      });
      const live = registry.withProvider(provider, resumed);

      try {
        controller.abort(reason);
        await vi.waitFor(() => expect(failure).toBe(reason));
        expect(abandoned).not.toHaveBeenCalled();
        expect(resumed).not.toHaveBeenCalled();
        expect(provider.shutdown).not.toHaveBeenCalled();

        finishCleanup.resolve();
        await expect(live).resolves.toBe('resumed');
        expect(resumed).toHaveBeenCalledOnce();
        expect(abandoned).not.toHaveBeenCalled();
        expect(registry.has(provider)).toBe(true);
      } finally {
        finishCleanup.resolve();
        await Promise.allSettled([cleanup, evaluation, live]);
        await registry.shutdownAll();
      }
    });

    it('ends an evaluation while its unawaited resource reservation is waiting for explicit cleanup', async () => {
      const registry = new ProviderRegistry(false);
      const finishCleanup = createDeferred<void>();
      const finishEvaluation = createDeferred<void>();
      const reservationStarted = createDeferred<void>();
      const resource = { shutdown: vi.fn(async () => registry.unregister(resource)) };
      registry.register(resource);
      const cleanup = finishCleanup.promise.then(() => registry.unregister(resource));
      registry.trackResourceCleanup(resource, cleanup);
      const run = vi.fn();
      let reservation: Promise<void> | undefined;
      let reservationError: unknown;
      const evaluation = registry.withEvaluation(async () => {
        reservation = registry.withProvider({ id: () => 'resource-waiter' }, async () => {
          const ready = registry.useResource(resource);
          reservationStarted.resolve();
          await ready;
          run();
        });
        void reservation.catch((error) => {
          reservationError = error;
        });
        await finishEvaluation.promise;
      });
      let ended = false;
      void evaluation.then(() => {
        ended = true;
      });

      try {
        await reservationStarted.promise;
        finishEvaluation.resolve();
        await vi.waitFor(() => {
          expect(ended).toBe(true);
          expect(reservationError).toMatchObject({ name: 'AbortError' });
        });
        expect(run).not.toHaveBeenCalled();
        expect(resource.shutdown).not.toHaveBeenCalled();
      } finally {
        finishCleanup.resolve();
        finishEvaluation.resolve();
        await Promise.allSettled([cleanup, evaluation, ...(reservation ? [reservation] : [])]);
        await registry.shutdownAll();
      }
    });

    it.each(['shutdownAll', 'shutdownForProcess'] as const)(
      '%s waits for explicit cleanup without starting shutdown again',
      async (method) => {
        const registry = new ProviderRegistry(false);
        const finishCleanup = createDeferred<void>();
        const resource = { shutdown: vi.fn(async () => registry.unregister(resource)) };
        registry.register(resource);
        const cleanup = finishCleanup.promise.then(() => registry.unregister(resource));
        registry.trackResourceCleanup(resource, cleanup);
        let ended = false;
        const shutdown = registry[method]().then(() => {
          ended = true;
        });

        try {
          await new Promise<void>((resolve) => setImmediate(resolve));
          expect(ended).toBe(false);
          expect(resource.shutdown).not.toHaveBeenCalled();
          finishCleanup.resolve();
          await shutdown;
          expect(ended).toBe(true);
          expect(registry.has(resource)).toBe(false);
          expect(resource.shutdown).not.toHaveBeenCalled();
        } finally {
          finishCleanup.resolve();
          await Promise.allSettled([cleanup, shutdown]);
        }
      },
    );

    it('allows reuse and a shutdown retry after an explicit cleanup fails', async () => {
      const registry = new ProviderRegistry(false);
      const finishCleanup = createDeferred<void>();
      const provider = {
        id: () => 'retry-explicit-cleanup',
        retainOutsideEvaluation: true,
        shutdown: vi.fn(async () => registry.unregister(provider)),
      };
      registry.register(provider);
      const cleanup = finishCleanup.promise.catch((error) => {
        registry.retainForProcessShutdown(provider);
        throw error;
      });
      registry.trackResourceCleanup(provider, cleanup);
      const failure = new Error('explicit cleanup failed');
      const rejection = expect(cleanup).rejects.toBe(failure);
      const run = vi.fn(async () => 'reused after cleanup failure');
      let reuse: Promise<string> | undefined;

      try {
        finishCleanup.reject(failure);
        await rejection;
        expect(registry.has(provider)).toBe(true);
        reuse = registry.withProvider(provider, run);
        await vi.waitFor(() => expect(run).toHaveBeenCalledOnce());
        await expect(reuse).resolves.toBe('reused after cleanup failure');
        await registry.shutdownAll();
        expect(provider.shutdown).toHaveBeenCalledOnce();
        expect(registry.has(provider)).toBe(false);
      } finally {
        finishCleanup.resolve();
        await Promise.allSettled([cleanup, ...(reuse ? [reuse] : [])]);
        await registry.shutdownAll();
      }
    });

    it('can track cleanup from inside a registry-owned shutdown without blocking later reuse', async () => {
      const registry = new ProviderRegistry(false);
      const finishCleanup = createDeferred<void>();
      const provider = {
        id: () => 'shutdown-tracks-own-cleanup',
        retainOutsideEvaluation: true,
        shutdown: vi.fn(() => {
          const cleanup = finishCleanup.promise.then(() => registry.unregister(provider));
          registry.trackResourceCleanup(provider, cleanup);
          return cleanup;
        }),
      };
      registry.register(provider);
      const shutdown = registry.shutdownAll();
      const otherShutdown = registry.shutdownAll();
      const run = vi.fn(async () => 'reused');
      let reuse: Promise<string> | undefined;

      try {
        expect(provider.shutdown).toHaveBeenCalledOnce();
        finishCleanup.resolve();
        await Promise.all([shutdown, otherShutdown]);
        expect(registry.has(provider)).toBe(false);
        reuse = registry.withProvider(provider, run);
        await vi.waitFor(() => expect(run).toHaveBeenCalledOnce());
        await expect(reuse).resolves.toBe('reused');
        await registry.shutdownAll();
        expect(provider.shutdown).toHaveBeenCalledTimes(2);
        expect(registry.has(provider)).toBe(false);
      } finally {
        finishCleanup.resolve();
        await Promise.allSettled([shutdown, otherShutdown, ...(reuse ? [reuse] : [])]);
        await registry.shutdownAll();
      }
    });
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
