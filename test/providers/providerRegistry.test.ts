import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadApiProviders } from '../../src/providers/index';
import { providerRegistry } from '../../src/providers/providerRegistry';

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function cleanupMethods(
  method: 'shutdown' | 'cleanup',
  implementation: () => Promise<void> | void,
) {
  const callback = vi.fn(implementation);
  return method === 'shutdown' ? { shutdown: callback } : { cleanup: callback };
}

describe.each(['shutdown', 'cleanup'] as const)('provider %s scopes', (method) => {
  afterEach(async () => {
    await providerRegistry.shutdownAll();
  });

  it('waits for an earlier shutdown before reusing a preconstructed provider', async () => {
    const closing = deferred();
    const release = deferred();
    const provider = {
      id: () => 'reused',
      callApi: async () => ({ output: 'ok' }),
      ...cleanupMethods(method, async () => {
        closing.resolve();
        await release.promise;
      }),
    };
    const first = providerRegistry.withScope(async () => {
      await loadApiProviders([provider]);
    });
    await closing.promise;
    let loaded = false;
    const second = providerRegistry.withScope(async () => {
      await loadApiProviders([provider]);
      loaded = true;
    });
    try {
      await Promise.resolve();
      expect(loaded).toBe(false);
    } finally {
      release.resolve();
      await Promise.all([first, second]);
    }
    expect(loaded).toBe(true);
    expect(provider[method]).toHaveBeenCalledTimes(2);
  });

  it('adopts only the preconstructed providers loaded by a run', async () => {
    const used = {
      id: () => 'used',
      callApi: async () => ({ output: 'ok' }),
      ...cleanupMethods(method, async () => {}),
    };
    const unused = cleanupMethods(method, async () => {});
    providerRegistry.register(used);
    providerRegistry.register(unused);
    try {
      await providerRegistry.withScope(async () => {
        await loadApiProviders([used]);
      });
      expect(used[method]).toHaveBeenCalledOnce();
      expect(unused[method]).not.toHaveBeenCalled();
    } finally {
      await providerRegistry.shutdownAll();
    }
  });

  it('keeps a shared preconstructed provider alive until both runs finish', async () => {
    const shared = {
      id: () => 'shared',
      callApi: async () => ({ output: 'ok' }),
      ...cleanupMethods(method, async () => {}),
    };
    providerRegistry.register(shared);
    const entered = deferred();
    const release = deferred();
    const pending = providerRegistry.withScope(async () => {
      await loadApiProviders([shared]);
      entered.resolve();
      await release.promise;
    });
    await entered.promise;
    try {
      await providerRegistry.withScope(async () => {
        await loadApiProviders([shared]);
      });
      expect(shared[method]).not.toHaveBeenCalled();
    } finally {
      release.resolve();
      await pending;
    }
    expect(shared[method]).toHaveBeenCalledOnce();
  });

  it('cleans up a preconstructed provider reused in a later run', async () => {
    const reused = {
      id: () => 'reused',
      callApi: async () => ({ output: 'ok' }),
      ...cleanupMethods(method, async () => {}),
    };
    providerRegistry.register(reused);
    for (let count = 1; count <= 2; count++) {
      await providerRegistry.withScope(async () => {
        await loadApiProviders([reused]);
      });
      expect(reused[method]).toHaveBeenCalledTimes(count);
    }
  });

  it('preserves a run failure when a provider throws synchronously during shutdown', async () => {
    const failed = {
      ...cleanupMethods(method, () => {
        throw new Error('cleanup failed');
      }),
    };
    const healthy = cleanupMethods(method, async () => {});
    await expect(
      providerRegistry.withScope(async () => {
        providerRegistry.register(failed);
        providerRegistry.register(healthy);
        throw new Error('run failed');
      }),
    ).rejects.toThrow('run failed');
    expect(healthy[method]).toHaveBeenCalledOnce();
  });

  it('does not close providers belonging to another overlapping evaluation', async () => {
    const entered = deferred();
    const release = deferred();
    const active = cleanupMethods(method, async () => {});
    const finished = cleanupMethods(method, async () => {});
    const pending = providerRegistry.withScope(async () => {
      providerRegistry.register(active);
      entered.resolve();
      await release.promise;
    });
    await entered.promise;
    try {
      await providerRegistry.withScope(async () => {
        providerRegistry.register(finished);
        await providerRegistry.shutdownAll();
        expect(finished[method]).toHaveBeenCalledOnce();
        expect(active[method]).not.toHaveBeenCalled();
      });
      await providerRegistry.shutdownAll();
      expect(active[method]).not.toHaveBeenCalled();
    } finally {
      release.resolve();
      await pending;
    }
    expect(active[method]).toHaveBeenCalledOnce();
    expect(finished[method]).toHaveBeenCalledOnce();
  });

  it('cleans up providers when loading fails before evaluation starts', async () => {
    const provider = cleanupMethods(method, async () => {});
    await expect(
      providerRegistry.withScope(async () => {
        providerRegistry.register(provider);
        throw new Error('config failed');
      }),
    ).rejects.toThrow('config failed');
    expect(provider[method]).toHaveBeenCalledOnce();
  });
});

it('runs both lifecycle hooks even when shutdown fails', async () => {
  const cleanup = vi.fn(async () => {});
  const provider = {
    shutdown: vi.fn(() => {
      throw new Error('shutdown failed');
    }),
    cleanup,
  };
  await providerRegistry.withScope(async () => {
    providerRegistry.register(provider);
  });
  expect(provider.shutdown).toHaveBeenCalledOnce();
  expect(cleanup).toHaveBeenCalledOnce();
});
