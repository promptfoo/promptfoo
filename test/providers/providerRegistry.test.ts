import { afterEach, describe, expect, it, vi } from 'vitest';
import { providerRegistry } from '../../src/providers/providerRegistry';

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
  vi.resetAllMocks();
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
