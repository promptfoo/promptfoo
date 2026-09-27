import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { Keyv } from 'keyv';
import { KeyvFile } from 'keyv-file';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDeferred } from './util/utils';

vi.mock('../src/logger', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('../src/util/fetch/index', () => ({
  fetchWithRetries: vi.fn(),
  getFetchWithProxyHeaders: (_url: unknown, options: RequestInit) => options.headers,
}));

// Exercise the real cache-manager, Keyv and disk store implementations.
describe('invocation-scoped cache settings', () => {
  let cache: typeof import('../src/cache');
  let cliState: typeof import('../src/cliState').default;
  let fetchWithRetries: typeof import('../src/util/fetch/index').fetchWithRetries;
  let tempDir: string;

  beforeEach(async () => {
    vi.resetModules();
    cache = await import('../src/cache');
    cliState = (await import('../src/cliState')).default;
    fetchWithRetries = (await import('../src/util/fetch/index')).fetchWithRetries;
    vi.mocked(fetchWithRetries).mockReset();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-cache-env-'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const memory = { PROMPTFOO_CACHE_TYPE: 'memory' };
  const disk = (cachePath: string) => ({
    PROMPTFOO_CACHE_TYPE: 'disk',
    PROMPTFOO_CACHE_PATH: cachePath,
  });

  it.each(['suite', 'file'] as const)(
    'isolates caches under %s config directories without moving global persistence',
    async (scope) => {
      const config = await import('../src/util/config/manage');
      const previous = config.getConfigDirectoryPath();
      const globalDirectory = path.join(tempDir, 'global');
      config.setConfigDirectoryPath(globalDirectory);
      const ready = createDeferred<void>();
      let entered = 0;
      try {
        await Promise.all(
          ['first', 'second'].map((name) => {
            const directory = path.join(tempDir, name);
            const settings = { PROMPTFOO_CONFIG_DIR: directory };
            return cliState.withEnvFileOverrides(scope === 'file' ? settings : {}, () =>
              cliState.withEnv(
                { ...disk(''), ...(scope === 'suite' ? settings : {}) },
                async () => {
                  const handle = cache.getCache();
                  await handle.set('same-key', name);
                  if (++entered === 2) {
                    ready.resolve();
                  }
                  await ready.promise;
                  expect(await handle.get('same-key')).toBe(name);
                  expect(fs.existsSync(path.join(directory, 'cache'))).toBe(true);
                  expect(config.getConfigDirectoryPath()).toBe(globalDirectory);
                },
              ),
            );
          }),
        );
        expect(fs.existsSync(path.join(globalDirectory, 'cache'))).toBe(false);
      } finally {
        config.setConfigDirectoryPath(previous);
      }
    },
  );

  it('keeps an explicit cache path ahead of a scoped config directory', async () => {
    const cachePath = path.join(tempDir, 'explicit');
    const configPath = path.join(tempDir, 'config');
    await cliState.withEnv({ ...disk(cachePath), PROMPTFOO_CONFIG_DIR: configPath }, async () => {
      await cache.getCache().set('fixture', 'value');
      expect(fs.existsSync(cachePath)).toBe(true);
      expect(fs.existsSync(configPath)).toBe(false);
    });
  });

  it('prefers suite config directories and lets an empty suite value mask the file', async () => {
    const config = await import('../src/util/config/manage');
    const previous = config.getConfigDirectoryPath();
    const globalDirectory = path.join(tempDir, 'global');
    config.setConfigDirectoryPath(globalDirectory);
    try {
      await cliState.withEnvFileOverrides(
        { PROMPTFOO_CONFIG_DIR: path.join(tempDir, 'file') },
        async () => {
          for (const name of ['suite', '']) {
            const directory = name ? path.join(tempDir, name) : globalDirectory;
            await cliState.withEnv(
              { ...disk(''), PROMPTFOO_CONFIG_DIR: name ? directory : '' },
              async () => {
                await cache.getCache().set('fixture', directory);
                expect(fs.existsSync(path.join(directory, 'cache'))).toBe(true);
                expect(config.getConfigDirectoryPath()).toBe(globalDirectory);
              },
            );
          }
        },
      );
      expect(fs.existsSync(path.join(tempDir, 'file'))).toBe(false);
    } finally {
      config.setConfigDirectoryPath(previous);
    }
  });

  it('keeps disabled cache handles out of shared memory and disk backends', async () => {
    await cliState.withEnv(memory, async () => {
      await cache.getCache().set('shared', 'enabled');
    });
    await cliState.withEnv(disk(path.join(tempDir, 'disabled')), () =>
      cache.withCacheEnabled(false, async () => {
        const handle = cache.getCache();
        expect(await handle.get('shared')).toBeUndefined();
        await handle.set('shared', 'disabled');
        expect(await handle.get('shared')).toBe('disabled');
        expect(await cache.getCache().get('shared')).toBeUndefined();
      }),
    );
    await cliState.withEnv(memory, async () => {
      expect(await cache.getCache().get('shared')).toBe('enabled');
    });
    expect(fs.existsSync(path.join(tempDir, 'disabled'))).toBe(false);
  });

  it.each(['backend', 'namespace'])(
    'does not let a response from before %s clearing overwrite or detach a newer request',
    async (kind) => {
      const entered = [createDeferred<void>(), createDeferred<void>()];
      const responses = [createDeferred<Response>(), createDeferred<Response>()];
      const fetch = vi
        .mocked(fetchWithRetries)
        .mockImplementation(async () => Response.json('unexpected'));
      for (let index = 0; index < responses.length; index++) {
        fetch.mockImplementationOnce(async () => {
          entered[index].resolve();
          return responses[index].promise;
        });
      }
      await cliState.withEnv(memory, () =>
        cache.withCacheNamespace(kind === 'namespace' ? 'fixture' : undefined, async () => {
          const call = () => cache.fetchWithCache('https://cache-fixture.invalid/clear');
          const first = call();
          await entered[0].promise;
          try {
            await cache.getCache().clear();
            const second = call();
            await new Promise(setImmediate);
            expect(fetch).toHaveBeenCalledTimes(2);
            responses[0].resolve(Response.json('old'));
            expect((await first).data).toBe('old');
            const third = call();
            await new Promise(setImmediate);
            expect(fetch).toHaveBeenCalledTimes(2);
            responses[1].resolve(Response.json('new'));
            expect(await second).toMatchObject({ data: 'new', cached: false });
            expect(await third).toMatchObject({ data: 'new', coalesced: true });
            expect(await call()).toMatchObject({ data: 'new', cached: true });
          } finally {
            responses[0].resolve(Response.json('old'));
            responses[1].resolve(Response.json('new'));
            await first;
          }
        }),
      );
    },
  );

  it('reads late env-file and suite enablement without replacing module state', async () => {
    cliState.withEnvFileOverrides({ PROMPTFOO_CACHE_ENABLED: 'false' }, () => {
      expect(cache.isCacheEnabled()).toBe(false);
      cliState.withEnv({ PROMPTFOO_CACHE_ENABLED: 'true' }, () => {
        expect(cache.isCacheEnabled()).toBe(true);
      });
    });
    await Promise.all([
      cliState.withEnv({ PROMPTFOO_CACHE_ENABLED: 'false' }, async () => {
        await Promise.resolve();
        expect(cache.isCacheEnabled()).toBe(false);
      }),
      cliState.withEnv({ PROMPTFOO_CACHE_ENABLED: 'true' }, async () => {
        await Promise.resolve();
        expect(cache.isCacheEnabled()).toBe(true);
      }),
    ]);
  });

  it.each([
    { cleared: 'first', active: 'first', retained: false },
    { cleared: 'first', active: 'first:child', retained: false },
    { cleared: 'first', active: 'second', retained: true },
    { cleared: 'first:child', active: 'first', retained: true },
    { cleared: undefined, active: 'second', retained: false },
  ])('invalidates only the pending requests covered by $cleared ($active)', async (scenario) => {
    await cliState.withEnv(memory, async () => {
      const entered = createDeferred<void>();
      const release = createDeferred<Response>();
      vi.mocked(fetchWithRetries)
        .mockImplementationOnce(async () => {
          entered.resolve();
          return release.promise;
        })
        .mockResolvedValue(Response.json('fresh'));
      const call = () =>
        cache.withCacheNamespace(scenario.active, () =>
          cache.fetchWithCache('https://cache-fixture.invalid/scoped-clear'),
        );
      const pending = call();
      await entered.promise;
      try {
        await cache.withCacheNamespace(scenario.cleared, () => cache.getCache().clear());
      } finally {
        release.resolve(Response.json('first response'));
        await pending;
      }
      expect(await call()).toMatchObject({
        data: scenario.retained ? 'first response' : 'fresh',
        cached: scenario.retained,
      });
      expect(fetchWithRetries).toHaveBeenCalledTimes(scenario.retained ? 1 : 2);
    });
  });

  it('keeps completed provider-local responses in unrelated namespaces cached', async () => {
    const { AnthropicMessagesProvider } = await import('../src/providers/anthropic/messages');
    const provider = new AnthropicMessagesProvider('claude-3-5-sonnet-20241022', {
      config: { apiKey: 'synthetic-fixture-key' },
    });
    const create = vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
      content: [{ type: 'text', text: 'fixture' }],
    } as never);
    await cliState.withEnv(memory, async () => {
      const call = (namespace: string) =>
        cache.withCacheNamespace(namespace, () => provider.callApi('same prompt'));
      await call('first');
      await call('second');
      await cache.withCacheNamespace('first', () => cache.getCache().clear());
      expect(await call('second')).toMatchObject({ cached: true, output: 'fixture' });
      expect(create).toHaveBeenCalledTimes(2);
      await call('first');
      expect(create).toHaveBeenCalledTimes(3);
      await cache.getCache().clear();
      await call('second');
      expect(create).toHaveBeenCalledTimes(4);
    });
  });

  it.each(['backend', 'namespace'])(
    'waits for an already-started store write before clearing the %s',
    async (kind) => {
      await cliState.withEnv(disk(path.join(tempDir, 'pending-write')), () =>
        cache.withCacheNamespace(kind === 'namespace' ? 'fixture' : undefined, async () => {
          const store = cache.getCache().stores[0];
          const set = store.set.bind(store);
          const entered = createDeferred<void>();
          const release = createDeferred<void>();
          vi.spyOn(store, 'set').mockImplementationOnce(async (...args) => {
            entered.resolve();
            await release.promise;
            return set(...args);
          });
          vi.mocked(fetchWithRetries)
            .mockResolvedValueOnce(Response.json('old'))
            .mockResolvedValueOnce(Response.json('new'));
          const call = () => cache.fetchWithCache('https://cache-fixture.invalid/pending-write');
          const first = call();
          await entered.promise;
          let cleared = false;
          const clearing = cache
            .getCache()
            .clear()
            .then(() => {
              cleared = true;
            });
          try {
            await new Promise(setImmediate);
            expect(cleared).toBe(false);
          } finally {
            release.resolve();
            await Promise.all([first, clearing]);
          }
          expect(await call()).toMatchObject({ data: 'new', cached: false });
          expect(fetchWithRetries).toHaveBeenCalledTimes(2);
        }),
      );
    },
  );

  it('clears a namespace without waiting for another namespace to begin its store write', async () => {
    await cliState.withEnv(disk(path.join(tempDir, 'independent-namespaces')), async () => {
      const first = await cache.withCacheNamespace('first', async () => cache.getCache());
      await first.set('existing', 'old');
      const store = first.stores[0];
      const set = store.set.bind(store);
      const entered = createDeferred<void>();
      const release = createDeferred<void>();
      vi.spyOn(store, 'set').mockImplementationOnce(async (...args) => {
        entered.resolve();
        await release.promise;
        return set(...args);
      });
      vi.mocked(fetchWithRetries).mockResolvedValue(Response.json('second response'));
      const pending = cache.withCacheNamespace('second', () =>
        cache.fetchWithCache('https://cache-fixture.invalid/independent'),
      );
      await entered.promise;
      let cleared = false;
      const clearing = first.clear().then(() => {
        cleared = true;
      });
      try {
        await vi.waitFor(() => expect(cleared).toBe(true));
        expect(await first.get('existing')).toBeUndefined();
      } finally {
        release.resolve();
        await Promise.all([pending, clearing]);
      }
      expect(
        await cache.withCacheNamespace('second', () =>
          cache.fetchWithCache('https://cache-fixture.invalid/independent'),
        ),
      ).toMatchObject({ data: 'second response', cached: true });
      expect(fetchWithRetries).toHaveBeenCalledOnce();
    });
  });

  it.each(['parent', 'ancestor'])(
    'shares a not-yet-created cache through physical %s directory aliases',
    async (kind) => {
      const firstDirectory = path.join(tempDir, 'physical');
      const secondDirectory = path.join(tempDir, 'alias');
      fs.mkdirSync(firstDirectory);
      fs.symlinkSync(firstDirectory, secondDirectory, 'junction');
      const realpath = fs.realpathSync;
      // Bind mounts preserve distinct realpaths. Keep real stat identities and file writes.
      vi.spyOn(fs, 'realpathSync').mockImplementation(((file, options) => {
        const resolved = realpath(file, options as never);
        const filename = String(file);
        return filename === secondDirectory || filename.startsWith(`${secondDirectory}${path.sep}`)
          ? filename
          : resolved;
      }) as typeof fs.realpathSync);
      const suffix = kind === 'ancestor' ? path.join('missing', 'nested') : '';
      const firstPath = path.join(firstDirectory, suffix);
      const secondPath = path.join(secondDirectory, suffix);
      const generation = (cachePath: string) =>
        cliState.withEnv(disk(cachePath), () => cache.getCacheClearGeneration());
      expect(generation(secondPath)).toBe(generation(firstPath));
      const first = cliState.withEnv(disk(firstPath), () => cache.getCache());
      const second = cliState.withEnv(disk(secondPath), () => cache.getCache());
      expect(second.stores[0]).toBe(first.stores[0]);
      await Promise.all([first.set('first', 'one'), second.set('second', 'two')]);
      const persisted = new Keyv({
        store: new KeyvFile({ filename: path.join(firstPath, 'cache.json') }),
      });
      expect(await persisted.get('first')).toBe('one');
      expect(await persisted.get('second')).toBe('two');
      expect(cliState.withEnv(disk(firstPath), () => cache.claimCacheKeyOnce('usage'))).toBe(true);
      expect(cliState.withEnv(disk(secondPath), () => cache.claimCacheKeyOnce('usage'))).toBe(
        false,
      );
    },
  );

  it('shares a physical cache and usage claims through hard-linked file paths', async () => {
    const firstPath = path.join(tempDir, 'first');
    const secondPath = path.join(tempDir, 'second');
    const first = cliState.withEnv(disk(firstPath), () => cache.getCache());
    await first.set('seed', 'seed');
    fs.mkdirSync(secondPath);
    fs.linkSync(path.join(firstPath, 'cache.json'), path.join(secondPath, 'cache.json'));
    const second = cliState.withEnv(disk(secondPath), () => cache.getCache());
    expect(second.stores[0]).toBe(first.stores[0]);
    await Promise.all([first.set('first', 'one'), second.set('second', 'two')]);
    const persisted = new Keyv({
      store: new KeyvFile({ filename: path.join(secondPath, 'cache.json') }),
    });
    expect(await persisted.get('first')).toBe('one');
    expect(await persisted.get('second')).toBe('two');
    expect(cliState.withEnv(disk(firstPath), () => cache.claimCacheKeyOnce('usage'))).toBe(true);
    expect(cliState.withEnv(disk(secondPath), () => cache.claimCacheKeyOnce('usage'))).toBe(false);
    await cache.clearCache(secondPath);
    expect(await first.get('first')).toBeUndefined();
  });

  it('preserves explicit API and nested invocation overrides', async () => {
    cache.disableCache();
    await cliState.withEnv({ PROMPTFOO_CACHE_ENABLED: 'true' }, async () => {
      expect(cache.isCacheEnabled()).toBe(false);
      await cache.withCacheEnabled(true, async () => expect(cache.isCacheEnabled()).toBe(true));
      expect(cache.isCacheEnabled()).toBe(false);
    });
    cache.enableCache();
    await cliState.withEnv({ PROMPTFOO_CACHE_ENABLED: 'false' }, async () => {
      expect(cache.isCacheEnabled()).toBe(true);
      await cache.withCacheEnabled(false, async () => expect(cache.isCacheEnabled()).toBe(false));
    });
  });

  it('selects memory or disk after import and isolates identical keys across paths', async () => {
    const firstPath = path.join(tempDir, 'first');
    const secondPath = path.join(tempDir, 'second');
    await cliState.withEnv(memory, () => cache.getCache().set('key', 'memory'));
    for (const [cachePath, value] of [
      [firstPath, 'first'],
      [secondPath, 'second'],
    ]) {
      await cliState.withEnv(disk(cachePath), () =>
        cache.withCacheNamespace('same', async () => {
          expect(await cache.getCache().get('key')).toBeUndefined();
          await cache.getCache().set('key', value);
          expect(cache.claimCacheKeyOnce('usage')).toBe(true);
        }),
      );
      expect(fs.existsSync(path.join(cachePath, 'cache.json'))).toBe(true);
      expect(fs.readdirSync(path.join(cachePath, 'claims'))).toHaveLength(1);
    }
    await cliState.withEnv(disk(firstPath), () =>
      cache.withCacheNamespace('same', async () => {
        expect(await cache.getCache().get('key')).toBe('first');
        expect(cache.claimCacheKeyOnce('usage')).toBe(false);
      }),
    );
    await cliState.withEnv(disk(secondPath), () =>
      cache.withCacheNamespace('same', async () => {
        expect(await cache.getCache().get('key')).toBe('second');
      }),
    );
    expect(await cliState.withEnv(memory, () => cache.getCache().get('key'))).toBe('memory');
  });

  it('does not create a disk store while the current invocation disables caching', async () => {
    const cachePath = path.join(tempDir, 'disabled');
    await cliState.withEnv({ ...disk(cachePath), PROMPTFOO_CACHE_ENABLED: 'false' }, async () => {
      await cache.getCache().set('key', 'temporary');
      cache.claimCacheKeyOnce('usage');
    });
    expect(fs.existsSync(cachePath)).toBe(false);
    await cliState.withEnv({ ...disk(cachePath), PROMPTFOO_CACHE_ENABLED: 'true' }, async () => {
      expect(await cache.getCache().get('key')).toBeUndefined();
      await cache.getCache().set('key', 'persistent');
    });
    expect(fs.existsSync(path.join(cachePath, 'cache.json'))).toBe(true);
  });

  it.each(['existing', 'new'])(
    'shares a disk writer through %s directory aliases',
    async (kind) => {
      const realParent = path.join(tempDir, 'physical');
      const aliasParent = path.join(tempDir, 'alias');
      fs.mkdirSync(realParent);
      fs.symlinkSync(realParent, aliasParent, 'junction');
      const suffix = kind === 'new' ? path.join('nested', 'cache') : '';
      const realPath = path.join(realParent, suffix);
      const aliasPath = path.join(aliasParent, suffix);

      // Both stores are selected before either writes, exposing competing snapshots.
      const first = cliState.withEnv(disk(aliasPath), () => cache.getCache());
      const second = cliState.withEnv(disk(realPath), () => cache.getCache());
      await Promise.all([first.set('first', 'one'), second.set('second', 'two')]);

      expect(first.stores[0]).toBe(second.stores[0]);
      expect(await first.get('second')).toBe('two');
      expect(await second.get('first')).toBe('one');
      const persisted = new Keyv({
        store: new KeyvFile({ filename: path.join(realPath, 'cache.json') }),
      });
      expect(await persisted.get('first')).toBe('one');
      expect(await persisted.get('second')).toBe('two');
    },
  );

  it.each(['api', 'scope', 'env'])(
    'clears the configured disk cache while disabled by %s',
    async (mode) => {
      const settings = disk(path.join(tempDir, 'clear-disabled'));
      await cliState.withEnv(settings, async () => {
        const instance = cache.getCache();
        await instance.set('key', 'stale');
        expect(cache.claimCacheKeyOnce('usage')).toBe(true);

        if (mode === 'api') {
          cache.disableCache();
          await cache.clearCache();
          cache.enableCache();
        } else if (mode === 'scope') {
          await cache.withCacheEnabled(false, () => cache.clearCache());
        } else {
          await cliState.withEnv({ ...settings, PROMPTFOO_CACHE_ENABLED: 'false' }, () =>
            cache.clearCache(),
          );
        }

        expect(await instance.get('key')).toBeUndefined();
        expect(await cache.getCache().get('key')).toBeUndefined();
        expect(cache.claimCacheKeyOnce('usage')).toBe(true);
      });
    },
  );

  it.each(['existing', 'new'])(
    'shares a writer and claims through %s cache-file symlinks',
    async (kind) => {
      const firstPath = path.join(tempDir, 'first');
      const secondPath = path.join(tempDir, 'second');
      const sharedFile = path.join(tempDir, 'shared.json');
      fs.mkdirSync(firstPath);
      fs.mkdirSync(secondPath);
      if (kind === 'existing') {
        fs.writeFileSync(sharedFile, JSON.stringify({ cache: [], lastExpire: 0 }));
      }
      fs.symlinkSync(sharedFile, path.join(firstPath, 'cache.json'), 'file');
      fs.symlinkSync(sharedFile, path.join(secondPath, 'cache.json'), 'file');
      const first = cliState.withEnv(disk(firstPath), () => cache.getCache());
      const second = cliState.withEnv(disk(secondPath), () => cache.getCache());
      await Promise.all([first.set('first', 'one'), second.set('second', 'two')]);
      expect(first.stores[0]).toBe(second.stores[0]);
      const persisted = new Keyv({ store: new KeyvFile({ filename: sharedFile }) });
      expect(await persisted.get('first')).toBe('one');
      expect(await persisted.get('second')).toBe('two');
      expect(cliState.withEnv(disk(firstPath), () => cache.claimCacheKeyOnce('usage'))).toBe(true);
      expect(cliState.withEnv(disk(secondPath), () => cache.claimCacheKeyOnce('usage'))).toBe(
        false,
      );
      await cliState.withEnv(disk(secondPath), () => cache.clearCache());
      expect(await first.get('first')).toBeUndefined();
      expect(cliState.withEnv(disk(firstPath), () => cache.claimCacheKeyOnce('usage'))).toBe(true);
    },
  );

  it('clears provider-local responses only for the selected backend', async () => {
    const { AnthropicMessagesProvider } = await import('../src/providers/anthropic/messages');
    const provider = new AnthropicMessagesProvider('claude-3-5-sonnet-20241022', {
      config: { apiKey: 'synthetic-fixture-key' },
    });
    const create = vi.spyOn(provider.anthropic.messages, 'create').mockResolvedValue({
      content: [{ type: 'text', text: 'fixture' }],
    } as never);
    await cliState.withEnv(disk(path.join(tempDir, 'provider')), async () => {
      await provider.callApi('same prompt');
      await cliState.withEnv(memory, () => cache.getCache().clear());
      expect(await provider.callApi('same prompt')).toMatchObject({
        cached: true,
        output: 'fixture',
      });
      expect(create).toHaveBeenCalledTimes(1);
      await cache.clearCache();
      await provider.callApi('same prompt');
      expect(create).toHaveBeenCalledTimes(2);
    });
  });

  it('binds namespace invalidation to the backend captured by a retained cache', async () => {
    const firstEnv = disk(path.join(tempDir, 'first'));
    const secondEnv = disk(path.join(tempDir, 'second'));
    const first = await cliState.withEnv(firstEnv, () =>
      cache.withCacheNamespace('same', async () => cache.getCache()),
    );
    const generation = (env: typeof firstEnv) =>
      cliState.withEnv(env, () =>
        cache.withCacheNamespace('same', async () => cache.getCacheClearGeneration()),
      );
    const firstGeneration = await generation(firstEnv);
    const secondGeneration = await generation(secondEnv);
    await cliState.withEnv(secondEnv, () => first.clear());
    expect(await generation(firstEnv)).not.toBe(firstGeneration);
    expect(await generation(secondEnv)).toBe(secondGeneration);
  });

  it('keeps an unlabeled provider cache reusable across overlapping backends', async () => {
    const { AnthropicMessagesProvider } = await import('../src/providers/anthropic/messages');
    const { getEnvString } = await import('../src/envars');
    const provider = new AnthropicMessagesProvider('claude-3-5-sonnet-20241022', {
      config: { apiKey: 'synthetic-fixture-key' },
    });
    const firstPath = path.join(tempDir, 'first');
    const secondPath = path.join(tempDir, 'second');
    const entered = createDeferred<void>();
    const release = createDeferred<void>();
    const create = vi.spyOn(provider.anthropic.messages, 'create').mockImplementation((async () => {
      const selected = getEnvString('PROMPTFOO_CACHE_PATH');
      if (selected === firstPath) {
        entered.resolve();
        await release.promise;
      }
      return { content: [{ type: 'text', text: selected }] };
    }) as never);
    const call = (cachePath: string) =>
      cliState.withEnv(disk(cachePath), () => provider.callApi('same prompt'));
    const first = call(firstPath);
    await entered.promise;
    try {
      expect(await call(secondPath)).toMatchObject({ output: secondPath });
    } finally {
      release.resolve();
    }
    expect(await first).toMatchObject({ output: firstPath });
    for (const cachePath of [firstPath, secondPath, firstPath]) {
      expect(await call(cachePath)).toMatchObject({ output: cachePath, cached: true });
    }
    expect(create).toHaveBeenCalledTimes(2);

    await cliState.withEnv(disk(firstPath), () => cache.getCache().clear());
    expect(await call(firstPath)).toMatchObject({ output: firstPath });
    expect(await call(secondPath)).toMatchObject({ output: secondPath, cached: true });
    expect(create).toHaveBeenCalledTimes(3);
  });

  it.each(['memory', 'disk'])('keeps concurrent TTL defaults on one %s store', async (type) => {
    // Freeze Date only: disk writes still use their ordinary short debounce timer.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const settings = type === 'disk' ? disk(path.join(tempDir, 'ttl')) : memory;
    const getScopedCache = (ttl: string) =>
      cliState.withEnv({ ...settings, PROMPTFOO_CACHE_TTL: ttl }, () =>
        cache.withCacheNamespace('same', async () => cache.getCache()),
      );
    const [short, long] = await Promise.all([getScopedCache('1'), getScopedCache('10')]);
    await Promise.all([short.set('short', 'one'), long.set('long', 'ten')]);
    expect(short.stores[0]).toBe(long.stores[0]);
    expect(await short.get('long')).toBe('ten');
    expect(await long.get('short')).toBe('one');
    vi.setSystemTime(new Date('2026-01-01T00:00:02Z'));
    expect(await short.get('short')).toBeUndefined();
    expect(await long.get('long')).toBe('ten');
    // An explicit per-entry TTL still takes precedence over the environment default.
    await short.set('explicit', 'override', 10000);
    vi.setSystemTime(new Date('2026-01-01T00:00:04Z'));
    expect(await long.get('explicit')).toBe('override');
  });

  it('does not coalesce requests across independently configured disk paths', async () => {
    const { getEnvString } = await import('../src/envars');
    const release = createDeferred<void>();
    vi.mocked(fetchWithRetries).mockImplementation(async () => {
      const cachePath = getEnvString('PROMPTFOO_CACHE_PATH');
      await release.promise;
      return new Response(JSON.stringify({ cachePath }), {
        headers: { 'content-type': 'application/json' },
      });
    });
    const paths = [path.join(tempDir, 'a'), path.join(tempDir, 'b')];
    const pending = paths.map((cachePath) =>
      cliState.withEnv(disk(cachePath), () =>
        cache.fetchWithCache<{ cachePath: string }>('https://cache-fixture.invalid/same'),
      ),
    );
    try {
      await vi.waitFor(() => expect(fetchWithRetries).toHaveBeenCalledTimes(2));
    } finally {
      release.resolve();
    }
    const results = await Promise.all(pending);
    expect(results.map((result) => result.data.cachePath)).toEqual(paths);
    expect(results.every((result) => !result.coalesced)).toBe(true);
  });

  it('clears only the selected backend and its claims', async () => {
    const paths = [path.join(tempDir, 'a'), path.join(tempDir, 'b')];
    for (const cachePath of paths) {
      await cliState.withEnv(disk(cachePath), async () => {
        await cache.getCache().set('key', cachePath);
        expect(cache.claimCacheKeyOnce('usage')).toBe(true);
      });
    }
    await cliState.withEnv(disk(paths[0]), () => cache.getCache().clear());
    await cliState.withEnv(disk(paths[0]), async () => {
      expect(await cache.getCache().get('key')).toBeUndefined();
      expect(cache.claimCacheKeyOnce('usage')).toBe(true);
    });
    await cliState.withEnv(disk(paths[1]), async () => {
      expect(await cache.getCache().get('key')).toBe(paths[1]);
      expect(cache.claimCacheKeyOnce('usage')).toBe(false);
    });
  });

  it('clears completed invocation caches through the public API', async () => {
    const paths = [path.join(tempDir, 'first'), path.join(tempDir, 'second')];
    for (const cachePath of paths) {
      await cliState.withEnv(disk(cachePath), async () => {
        await cache.getCache().set('key', cachePath);
        expect(cache.claimCacheKeyOnce('usage')).toBe(true);
      });
    }
    await cache.clearCache();
    for (const cachePath of paths) {
      await cliState.withEnv(disk(cachePath), async () => {
        expect(await cache.getCache().get('key')).toBeUndefined();
        expect(cache.claimCacheKeyOnce('usage')).toBe(true);
      });
    }
  });

  it('targets a custom cache path without relying on an active invocation', async () => {
    const firstPath = path.join(tempDir, 'first');
    const secondPath = path.join(tempDir, 'second');
    for (const cachePath of [firstPath, secondPath]) {
      await cliState.withEnv(disk(cachePath), () => cache.getCache().set('key', cachePath));
    }
    await cache.clearCache(firstPath);
    expect(
      await cliState.withEnv(disk(firstPath), () => cache.getCache().get('key')),
    ).toBeUndefined();
    expect(await cliState.withEnv(disk(secondPath), () => cache.getCache().get('key'))).toBe(
      secondPath,
    );
  });

  it('keeps retained disk writers shared after backend and TTL eviction', async () => {
    const selected = disk(path.join(tempDir, 'retained'));
    const retained = cliState.withEnv(selected, () => cache.getCache());
    for (let index = 1; index <= 40; index++) {
      cliState.withEnv({ ...selected, PROMPTFOO_CACHE_TTL: String(index) }, () => cache.getCache());
      cliState.withEnv(disk(path.join(tempDir, `other-${index}`)), () => cache.getCache());
    }
    const returned = cliState.withEnv(selected, () => cache.getCache());
    expect(returned.stores[0]).toBe(retained.stores[0]);
    await Promise.all([retained.set('first', 'one'), returned.set('second', 'two')]);
    const persisted = new Keyv({
      store: new KeyvFile({ filename: path.join(selected.PROMPTFOO_CACHE_PATH, 'cache.json') }),
    });
    expect(await persisted.get('first')).toBe('one');
    expect(await persisted.get('second')).toBe('two');
  });

  it('clears every TTL wrapper of the selected backend while preserving other stores', async () => {
    const firstEnv = disk(path.join(tempDir, 'first'));
    const secondEnv = disk(path.join(tempDir, 'second'));
    const namespaced = (env: typeof firstEnv, ttl: string) =>
      cliState.withEnv({ ...env, PROMPTFOO_CACHE_TTL: ttl }, () =>
        cache.withCacheNamespace('run', async () => cache.getCache()),
      );
    const short = await namespaced(firstEnv, '1');
    const long = await namespaced(firstEnv, '10');
    const other = await namespaced(secondEnv, '1');
    await short.set('key', 'stale');
    await other.set('key', 'other backend');

    await cliState.withEnv(firstEnv, () => cache.getCache().clear());

    expect(await long.get('key')).toBeUndefined();
    expect(await other.get('key')).toBe('other backend');
    // Existing callers can retain a wrapper and continue using the same store.
    expect(await short.get('key')).toBeUndefined();
    await short.set('key', 'fresh');
    expect(await (await namespaced(firstEnv, '10')).get('key')).toBe('fresh');
  });
});
