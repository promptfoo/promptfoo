import { afterEach, describe, expect, it, vi } from 'vitest';
import logger from '../../src/logger';
import { providerRegistry } from '../../src/providers/providerRegistry';
import { createDeferred } from '../util/utils';

describe('provider lifecycle registry', () => {
  afterEach(async () => {
    await providerRegistry.shutdownAll();
    vi.restoreAllMocks();
  });

  it('preserves providers first registered while an earlier shutdown is pending', async () => {
    const pending = createDeferred<void>();
    const current = { shutdown: vi.fn(() => pending.promise) };
    const next = { shutdown: vi.fn(async () => {}) };
    providerRegistry.register(current);

    const firstShutdown = providerRegistry.shutdownAll();
    providerRegistry.register(next);
    expect(current.shutdown).toHaveBeenCalledOnce();
    expect(next.shutdown).not.toHaveBeenCalled();
    pending.resolve();
    await firstShutdown;

    await providerRegistry.shutdownAll();
    await providerRegistry.shutdownAll();
    expect(current.shutdown).toHaveBeenCalledOnce();
    expect(next.shutdown).toHaveBeenCalledOnce();
  });

  it('preserves a provider that registers itself again while shutting down', async () => {
    const pending = createDeferred<void>();
    const provider = { shutdown: vi.fn<() => Promise<void>>() };
    provider.shutdown
      .mockImplementationOnce(async () => {
        providerRegistry.register(provider);
        await pending.promise;
      })
      .mockResolvedValue(undefined);
    providerRegistry.register(provider);

    const firstShutdown = providerRegistry.shutdownAll();
    expect(provider.shutdown).toHaveBeenCalledOnce();
    pending.resolve();
    await firstShutdown;

    await providerRegistry.shutdownAll();
    await providerRegistry.shutdownAll();
    expect(provider.shutdown).toHaveBeenCalledTimes(2);
  });

  it('does not repeat a pending shutdown or run an explicitly unregistered provider', async () => {
    const pending = createDeferred<void>();
    const current = { shutdown: vi.fn(() => pending.promise) };
    const removed = { shutdown: vi.fn(async () => {}) };
    providerRegistry.register(current);
    providerRegistry.register(removed);
    providerRegistry.unregister(removed);

    const firstShutdown = providerRegistry.shutdownAll();
    await providerRegistry.shutdownAll();
    pending.resolve();
    await firstShutdown;

    expect(current.shutdown).toHaveBeenCalledOnce();
    expect(removed.shutdown).not.toHaveBeenCalled();
  });

  it('keeps an asynchronous evaluation owner alive while unrelated scopes still close legacy providers', async () => {
    const registered = createDeferred<void>();
    const continueEvaluation = createDeferred<void>();
    const scoped = { shutdown: vi.fn(async () => {}) };
    const legacy = { shutdown: vi.fn(async () => {}) };
    const owner = providerRegistry.withEvaluationScope(async () => {
      await Promise.resolve();
      providerRegistry.registerScoped(scoped);
      registered.resolve();
      await continueEvaluation.promise;
      providerRegistry.registerScoped(scoped);
    });
    await registered.promise;

    try {
      await providerRegistry.withEvaluationScope(async () => {
        providerRegistry.register(legacy);
      });
      expect(legacy.shutdown).toHaveBeenCalledOnce();
      expect(scoped.shutdown).not.toHaveBeenCalled();
    } finally {
      continueEvaluation.resolve();
      await owner;
    }

    expect(scoped.shutdown).toHaveBeenCalledOnce();
    expect(legacy.shutdown).toHaveBeenCalledOnce();
  });

  it('releases a shared provider only when the last concurrent evaluation completes', async () => {
    const registeredFirst = createDeferred<void>();
    const registeredSecond = createDeferred<void>();
    const continueFirst = createDeferred<void>();
    const continueSecond = createDeferred<void>();
    const shared = { shutdown: vi.fn(async () => {}) };
    const first = providerRegistry.withEvaluationScope(async () => {
      providerRegistry.registerScoped(shared);
      registeredFirst.resolve();
      await continueFirst.promise;
    });
    const second = providerRegistry.withEvaluationScope(async () => {
      providerRegistry.registerScoped(shared);
      registeredSecond.resolve();
      await continueSecond.promise;
    });
    await Promise.all([registeredFirst.promise, registeredSecond.promise]);

    try {
      continueFirst.resolve();
      await first;
      expect(shared.shutdown).not.toHaveBeenCalled();
      continueSecond.resolve();
      await second;
      expect(shared.shutdown).toHaveBeenCalledOnce();
    } finally {
      continueFirst.resolve();
      continueSecond.resolve();
      await Promise.all([first, second]);
    }
  });

  it('still lets an explicit global shutdown close a provider owned by an active evaluation', async () => {
    const provider = { shutdown: vi.fn(async () => {}) };

    await providerRegistry.withEvaluationScope(async () => {
      providerRegistry.registerScoped(provider);
      await providerRegistry.shutdownAll();
      expect(provider.shutdown).toHaveBeenCalledOnce();
      providerRegistry.registerScoped(provider);
    });

    expect(provider.shutdown).toHaveBeenCalledTimes(2);
  });

  it('releases scoped ownership when the evaluation exits early with an exception', async () => {
    const warning = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const provider = {
      shutdown: vi.fn(() => {
        throw new Error('secondary synchronous cleanup error');
      }),
    };

    await expect(
      providerRegistry.withEvaluationScope(async () => {
        providerRegistry.registerScoped(provider);
        throw new Error('original evaluation error');
      }),
    ).rejects.toThrow('original evaluation error');

    expect(provider.shutdown).toHaveBeenCalledOnce();
    expect(warning).toHaveBeenCalledWith(
      'Error shutting down provider: Error: secondary synchronous cleanup error',
    );
  });

  it('logs a failed provider without preventing another provider from shutting down', async () => {
    const warning = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const failed = { shutdown: vi.fn().mockRejectedValue(new Error('expected shutdown failure')) };
    const other = { shutdown: vi.fn(async () => {}) };
    providerRegistry.register(failed);
    providerRegistry.register(other);

    await expect(providerRegistry.shutdownAll()).resolves.toBeUndefined();
    await providerRegistry.shutdownAll();

    expect(failed.shutdown).toHaveBeenCalledOnce();
    expect(other.shutdown).toHaveBeenCalledOnce();
    expect(warning).toHaveBeenCalledWith(
      'Error shutting down provider: Error: expected shutdown failure',
    );
  });
});
