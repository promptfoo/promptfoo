import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

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
    await cliState.withEnv(disk(paths[0]), () => cache.clearCache());
    await cliState.withEnv(disk(paths[0]), async () => {
      expect(await cache.getCache().get('key')).toBeUndefined();
      expect(cache.claimCacheKeyOnce('usage')).toBe(true);
    });
    await cliState.withEnv(disk(paths[1]), async () => {
      expect(await cache.getCache().get('key')).toBe(paths[1]);
      expect(cache.claimCacheKeyOnce('usage')).toBe(false);
    });
  });
});
