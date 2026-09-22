import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearCache, getCache, withCacheNamespace } from '../../src/cache';
import { SageMakerCompletionProvider } from '../../src/providers/sagemaker';
import type { Cache } from 'cache-manager';

class CacheProbe extends SageMakerCompletionProvider {
  constructor() {
    super('cache-coordination', { config: { modelType: 'custom' } });
  }

  read(cache: Cache, key: string) {
    return this.readRuntimeCache(cache, key, new AbortController().signal);
  }

  write(cache: Cache, key: string, value: string, signal = new AbortController().signal) {
    return this.writeRuntimeCache(cache, key, value, signal);
  }
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function pausePublication(backing: Cache, expectedKey: string) {
  const entered = deferred();
  const release = deferred();
  const original = backing.set.bind(backing);
  vi.spyOn(backing, 'set').mockImplementation(
    async <T>(key: string, value: T, ttl?: number): Promise<T> => {
      if (key === expectedKey && value === 'stale') {
        entered.resolve();
        await release.promise;
      }
      return original(key, value, ttl);
    },
  );
  return { entered: entered.promise, release: release.resolve };
}

function pausePreload(backing: Cache, expectedKey: string) {
  const entered = deferred();
  const release = deferred();
  const original = backing.get.bind(backing);
  let paused = false;
  vi.spyOn(backing, 'get').mockImplementation(async <T>(key: string): Promise<T | undefined> => {
    const value = await original<T>(key);
    if (key === expectedKey && !paused) {
      paused = true;
      entered.resolve();
      await release.promise;
    }
    return value;
  });
  return { entered: entered.promise, release: release.resolve };
}

const scopedCache = (namespace: string) => withCacheNamespace(namespace, async () => getCache());

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SageMaker cache coordination across clears', () => {
  it('discards a preloading write before a parent namespace clear finishes scanning storage', async () => {
    const parent = 'sagemaker-clear-in-progress';
    const namespace = `${parent}:child`;
    const expectedKey = `${namespace}:entry`;
    const cache = await scopedCache(namespace);
    const backing = getCache();
    const paused = pausePreload(backing, expectedKey);
    const publication = vi.spyOn(backing, 'set');
    const store = backing.stores[0];
    const iterate = store.iterator?.bind(store);
    if (!iterate) {
      throw new Error('Expected the cache test store to support namespace iteration');
    }
    const scanned = deferred();
    const releaseScan = deferred();
    vi.spyOn(store, 'iterator').mockImplementation(async function* (storeNamespace) {
      for await (const entry of iterate(storeNamespace)) {
        yield entry;
      }
      scanned.resolve();
      await releaseScan.promise;
    });
    const write = new CacheProbe().write(cache, 'entry', 'stale');
    let clearing: Promise<boolean> | undefined;

    try {
      await paused.entered;
      clearing = (await scopedCache(parent)).clear();
      await scanned.promise;
      paused.release();
      await write;
      expect(publication.mock.calls.filter(([key]) => key === expectedKey)).toEqual([]);

      releaseScan.resolve();
      await clearing;
      expect(await cache.get('entry')).toBeUndefined();
    } finally {
      paused.release();
      releaseScan.resolve();
      await Promise.allSettled([write, ...(clearing ? [clearing] : [])]);
    }
  });

  it.each(['global', 'parent namespace', 'unrelated namespace'] as const)(
    'handles a %s clear while a write preloads and another is queued',
    async (scope) => {
      const parent = `sagemaker-clear-preload-${scope}`;
      const namespace = `${parent}:child`;
      const expectedKey = `${namespace}:entry`;
      const oldCache = await scopedCache(namespace);
      await oldCache.set('entry', 'before clear');
      const backing = getCache();
      const paused = pausePreload(backing, expectedKey);
      const publication = vi.spyOn(backing, 'set');
      const first = new CacheProbe().write(oldCache, 'entry', 'stale');
      let queued: Promise<void> | undefined;

      try {
        await paused.entered;
        queued = new CacheProbe().write(oldCache, 'entry', 'queued');
        if (scope === 'global') {
          await clearCache();
        } else {
          await (
            await scopedCache(scope === 'parent namespace' ? parent : `${parent}-other`)
          ).clear();
        }
        paused.release();
        await Promise.all([first, queued]);

        const newCache = await scopedCache(namespace);
        const publishedValues = publication.mock.calls
          .filter(([key]) => key === expectedKey)
          .map(([, value]) => value);
        if (scope === 'unrelated namespace') {
          expect(publishedValues).toEqual(['stale', 'queued']);
          expect(await newCache.get('entry')).toBe('queued');
        } else {
          expect(publishedValues).toEqual([]);
          expect(await newCache.get('entry')).toBeUndefined();
        }

        await new CacheProbe().write(newCache, 'entry', 'fresh');
        expect(await oldCache.get('entry')).toBe('fresh');
      } finally {
        paused.release();
        await Promise.allSettled([first, ...(queued ? [queued] : [])]);
      }
    },
  );

  it('keeps a new wrapper from publishing until the old cancelled write has drained', async () => {
    const namespace = 'sagemaker-clear-fresh';
    const oldCache = await scopedCache(namespace);
    const paused = pausePublication(getCache(), `${namespace}:entry`);
    const abort = new AbortController();
    const reason = new Error('old request stopped');
    const oldWrite = new CacheProbe()
      .write(oldCache, 'entry', 'stale', abort.signal)
      .catch((error) => error);
    let newWrite: Promise<void> | undefined;

    try {
      await paused.entered;
      await clearCache();
      const newCache = await scopedCache(namespace);
      expect(newCache).not.toBe(oldCache);

      const independent = await scopedCache('sagemaker-clear-independent');
      await new CacheProbe().write(independent, 'entry', 'independent');
      expect(await independent.get('entry')).toBe('independent');

      const published = vi.fn();
      newWrite = new CacheProbe().write(newCache, 'entry', 'fresh').then(published);
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(published).not.toHaveBeenCalled();

      abort.abort(reason);
      paused.release();
      expect(await oldWrite).toBe(reason);
      await newWrite;
      expect(await newCache.get('entry')).toBe('fresh');
      expect(await new CacheProbe().read(oldCache, 'entry')).toBe('fresh');
    } finally {
      paused.release();
      await oldWrite;
      await newWrite;
    }
  });

  it.each(['global', 'parent namespace'] as const)(
    'does not restore a value from before a %s clear',
    async (scope) => {
      const parent = `sagemaker-clear-snapshot-${scope}`;
      const namespace = `${parent}:child`;
      const oldCache = await scopedCache(namespace);
      await oldCache.set('entry', 'before clear');
      const paused = pausePublication(getCache(), `${namespace}:entry`);
      const abort = new AbortController();
      const reason = new Error('request stopped');
      const oldWrite = new CacheProbe()
        .write(oldCache, 'entry', 'stale', abort.signal)
        .catch((error) => error);

      try {
        await paused.entered;
        if (scope === 'global') {
          await clearCache();
        } else {
          await (await scopedCache(parent)).clear();
        }
        abort.abort(reason);
        paused.release();
        expect(await oldWrite).toBe(reason);
        const newCache = await scopedCache(namespace);
        expect(await newCache.get('entry')).toBeUndefined();
        expect(await new CacheProbe().read(newCache, 'entry')).toBeUndefined();
      } finally {
        paused.release();
        await oldWrite;
      }
    },
  );

  it('restores the previous value if only an unrelated namespace was cleared', async () => {
    const namespace = 'sagemaker-clear-unrelated';
    const oldCache = await scopedCache(namespace);
    await oldCache.set('entry', 'previous');
    const paused = pausePublication(getCache(), `${namespace}:entry`);
    const abort = new AbortController();
    const reason = new Error('request stopped');
    const oldWrite = new CacheProbe()
      .write(oldCache, 'entry', 'stale', abort.signal)
      .catch((error) => error);

    try {
      await paused.entered;
      await (await scopedCache('sagemaker-clear-other')).clear();
      abort.abort(reason);
      paused.release();
      expect(await oldWrite).toBe(reason);
      expect(await oldCache.get('entry')).toBe('previous');
    } finally {
      paused.release();
      await oldWrite;
    }
  });

  it.each(['global', 'parent namespace'] as const)(
    'does not restore a previous value for an uncancelled write crossing a %s clear',
    async (scope) => {
      const parent = `sagemaker-clear-active-${scope}`;
      const namespace = `${parent}:child`;
      const oldCache = await scopedCache(namespace);
      await oldCache.set('entry', 'before clear');
      const paused = pausePublication(getCache(), `${namespace}:entry`);
      const oldWrite = new CacheProbe().write(oldCache, 'entry', 'stale');

      try {
        await paused.entered;
        if (scope === 'global') {
          await clearCache();
        } else {
          await (await scopedCache(parent)).clear();
        }
        paused.release();
        await oldWrite;
        const newCache = await scopedCache(namespace);
        expect(await newCache.get('entry')).toBeUndefined();
        await new CacheProbe().write(newCache, 'entry', 'fresh');
        expect(await oldCache.get('entry')).toBe('fresh');
      } finally {
        paused.release();
        await oldWrite;
      }
    },
  );
});
