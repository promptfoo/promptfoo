import { afterEach, describe, expect, it, vi } from 'vitest';
import logger from '../../src/logger';
import { providerRegistry } from '../../src/providers/providerRegistry';
import { createDeferred } from '../util/utils';

vi.mock('../../src/logger');

const releases: Array<() => void> = [];
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  releases.push(resolve);
  return { promise, resolve };
}

afterEach(async () => {
  for (const release of releases.splice(0)) {
    release();
  }
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
    expect(providerRegistry.has(failing)).toBe(true);
    providerRegistry.unregister(failing);
    expect(providerRegistry.has(other)).toBe(false);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('synchronous cleanup failure'),
    );
  });
});

describe('provider registry cleanup ownership', () => {
  it('continues cleanup after a provider throws before returning a promise', async () => {
    const first = {
      shutdown: vi.fn(() => {
        throw new Error('synchronous cleanup failure');
      }),
    };
    const second = { shutdown: vi.fn().mockResolvedValue(undefined) };
    providerRegistry.register(first);
    providerRegistry.register(second);

    await expect(providerRegistry.shutdownAll()).resolves.toBeUndefined();
    expect(second.shutdown).toHaveBeenCalledOnce();
    providerRegistry.unregister(first);
  });

  it('makes concurrent callers wait for cleanup already in progress', async () => {
    const closing = deferred();
    const provider = { shutdown: vi.fn(() => closing.promise) };
    providerRegistry.register(provider);
    const first = providerRegistry.shutdownAll();
    const second = providerRegistry.shutdownAll();
    let finished = false;
    void second.then(() => {
      finished = true;
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(finished).toBe(false);
    expect(provider.shutdown).toHaveBeenCalledOnce();
    closing.resolve();
    await Promise.all([first, second]);
    expect(finished).toBe(true);
  });

  it.each([false, true])(
    'retains registrations during failed cleanup (same provider: %s)',
    async (sameProvider) => {
      const closing = deferred();
      const firstProvider = {
        shutdown: vi
          .fn()
          .mockImplementationOnce(async () => {
            await closing.promise;
            throw new Error('cleanup failed');
          })
          .mockResolvedValue(undefined),
      };
      const newProvider = sameProvider
        ? firstProvider
        : { shutdown: vi.fn().mockResolvedValue(undefined) };
      providerRegistry.register(firstProvider);
      const stopping = providerRegistry.shutdownAll();
      providerRegistry.register(newProvider);
      closing.resolve();
      await expect(stopping).resolves.toBeUndefined();

      await providerRegistry.shutdownAll();
      expect(newProvider.shutdown).toHaveBeenCalledTimes(sameProvider ? 2 : 1);
    },
  );
});
