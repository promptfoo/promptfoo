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

const scopedCache = (namespace: string) => withCacheNamespace(namespace, async () => getCache());

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SageMaker cache coordination across clears', () => {
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
