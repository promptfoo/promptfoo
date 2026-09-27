import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { providerRegistry } from '../../src/providers/providerRegistry';
import { PythonProvider } from '../../src/providers/pythonCompletion';

const mocks = vi.hoisted(() => ({
  createPool: vi.fn(),
  processConfig: vi.fn(),
}));

vi.mock('../../src/python/workerPool', () => ({
  PythonWorkerPool: vi.fn(function () {
    return mocks.createPool();
  }),
}));
vi.mock('../../src/util/fileReference', () => ({
  processConfigFileReferences: mocks.processConfig,
}));
vi.mock('../../src/cache', () => ({
  getCache: () => ({}),
  isCacheEnabled: () => false,
}));

function createPool() {
  return {
    initialize: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
    execute: vi.fn(async (api: string) => {
      if (api === 'call_embedding_api') {
        return { embedding: [1, 2] };
      }
      if (api === 'call_classification_api') {
        return { classification: { positive: 1 } };
      }
      return { output: 'ready' };
    }),
  };
}

const releases: Array<() => void> = [];
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  releases.push(resolve);
  return { promise, resolve };
}

const providers: PythonProvider[] = [];
function createProvider() {
  const provider = new PythonProvider(
    path.resolve('test/smoke/fixtures/providers/echo_provider.py'),
    { config: { workers: 1 } },
  );
  providers.push(provider);
  return provider;
}

beforeEach(() => {
  mocks.createPool.mockReset();
  mocks.createPool.mockImplementation(createPool);
  mocks.processConfig.mockReset();
  mocks.processConfig.mockImplementation(async (config) => config);
});

afterEach(async () => {
  for (const release of releases.splice(0)) {
    release();
  }
  await Promise.allSettled(providers.splice(0).map((provider) => provider.shutdown()));
  await providerRegistry.shutdownAll();
  vi.resetAllMocks();
});

describe('Python provider resource lifetime', () => {
  it.each(['callApi', 'callEmbeddingApi', 'callClassificationApi'] as const)(
    'recreates its pool for %s after shutdown',
    async (api) => {
      const first = createPool();
      const second = createPool();
      mocks.createPool.mockReturnValueOnce(first).mockReturnValueOnce(second);
      const provider = createProvider();

      await provider[api]('first');
      await provider.shutdown();
      await provider[api]('second');

      expect(first.shutdown).toHaveBeenCalledOnce();
      expect(second.initialize).toHaveBeenCalledOnce();
      expect(second.execute).toHaveBeenCalledOnce();
      expect(mocks.createPool).toHaveBeenCalledTimes(2);
    },
  );

  it('joins initialization before releasing the pool on shutdown', async () => {
    const pool = createPool();
    const ready = deferred();
    const started = deferred();
    pool.initialize.mockImplementation(() => {
      started.resolve();
      return ready.promise;
    });
    mocks.createPool.mockReturnValue(pool);
    const provider = createProvider();
    const initializing = provider.initialize();
    await started.promise;
    expect(pool.initialize).toHaveBeenCalledOnce();

    const stopping = provider.shutdown();
    let stopped = false;
    void stopping.then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(pool.shutdown).not.toHaveBeenCalled();
    expect(stopped).toBe(false);

    ready.resolve();
    await Promise.all([initializing, stopping]);
    expect(pool.shutdown).toHaveBeenCalledOnce();
  });

  it('coalesces shutdown and waits for it before initializing a new pool', async () => {
    const first = createPool();
    const second = createPool();
    const closing = deferred();
    const closeStarted = deferred();
    first.shutdown.mockImplementation(() => {
      closeStarted.resolve();
      return closing.promise;
    });
    mocks.createPool.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const provider = createProvider();
    await provider.initialize();

    const stopping = provider.shutdown();
    const alsoStopping = provider.shutdown();
    const restarting = provider.initialize();
    await closeStarted.promise;
    expect(first.shutdown).toHaveBeenCalledOnce();
    expect(second.initialize).not.toHaveBeenCalled();

    closing.resolve();
    await Promise.all([stopping, alsoStopping, restarting]);
    expect(second.initialize).toHaveBeenCalledOnce();
    await provider.callApi('reused');
    expect(second.execute).toHaveBeenCalledOnce();
    await providerRegistry.shutdownAll();
    expect(second.shutdown).toHaveBeenCalledOnce();
  });

  it('cleans failed initialization before allowing another attempt', async () => {
    const first = createPool();
    const second = createPool();
    first.initialize.mockRejectedValue(new Error('startup failed'));
    mocks.createPool.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const provider = createProvider();

    await expect(provider.initialize()).rejects.toThrow('startup failed');
    expect(first.shutdown).toHaveBeenCalledOnce();
    await provider.initialize();
    expect(second.initialize).toHaveBeenCalledOnce();
    await providerRegistry.shutdownAll();
    expect(second.shutdown).toHaveBeenCalledOnce();
  });

  it('keeps a restarted pool registered while global cleanup waits for another provider', async () => {
    const first = createPool();
    const second = createPool();
    mocks.createPool.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const provider = createProvider();
    await provider.initialize();
    const slowCleanup = deferred();
    providerRegistry.register({ shutdown: () => slowCleanup.promise });

    const stopping = providerRegistry.shutdownAll();
    await provider.initialize();
    expect(first.shutdown).toHaveBeenCalledOnce();
    expect(second.initialize).toHaveBeenCalledOnce();
    slowCleanup.resolve();
    await stopping;

    await providerRegistry.shutdownAll();
    expect(second.shutdown).toHaveBeenCalledOnce();
  });

  it('preserves the startup error if cleanup also fails and permits a retry', async () => {
    const first = createPool();
    const second = createPool();
    first.initialize.mockRejectedValue(new Error('startup failed'));
    first.shutdown.mockRejectedValue(new Error('cleanup failed'));
    mocks.createPool.mockReturnValueOnce(first).mockReturnValueOnce(second);
    const provider = createProvider();

    await expect(provider.initialize()).rejects.toThrow('startup failed');
    await provider.initialize();
    await provider.callApi('retry');
    expect(second.execute).toHaveBeenCalledOnce();
  });
});
