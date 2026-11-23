import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockProcessEnv } from './util/utils';

import type * as CacheModule from '../src/cache';

describe('cache storage compatibility', () => {
  let cacheModule: typeof CacheModule;
  let cacheDirectory: string;
  let restoreEnvironment: () => void;

  beforeEach(async () => {
    vi.resetModules();
    cacheDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-cache-storage-'));
    restoreEnvironment = mockProcessEnv({
      PROMPTFOO_CACHE_TYPE: 'disk',
      PROMPTFOO_CACHE_PATH: cacheDirectory,
      PROMPTFOO_CACHE_ENABLED: 'true',
    });
    cacheModule = await import('../src/cache');
  });

  afterEach(async () => {
    await cacheModule.getCache().disconnect();
    vi.restoreAllMocks();
    restoreEnvironment();
    fs.rmSync(cacheDirectory, { recursive: true, force: true });
  });

  it('uses the disk factory instead of silently falling back to memory', async () => {
    await cacheModule.getCache().set('disk-selection', 'persisted');
    const contents = JSON.parse(fs.readFileSync(path.join(cacheDirectory, 'cache.json'), 'utf8'));
    expect(contents.cache).toEqual([
      ['keyv:disk-selection', expect.objectContaining({ value: expect.any(String) })],
    ]);
  });

  it('reads responses persisted with the existing disk cache envelope', async () => {
    const response = JSON.stringify({ data: { output: 'previous response' }, status: 200 });
    const expires = Date.now() + 60_000;
    // Fixture from the on-disk format: the adapter wraps a serialized Keyv value.
    fs.writeFileSync(
      path.join(cacheDirectory, 'cache.json'),
      JSON.stringify({
        cache: [
          [
            'keyv:response',
            { expire: expires, value: JSON.stringify({ value: response, expires }) },
          ],
        ],
        lastExpire: Date.now(),
      }),
    );

    const cache = cacheModule.getCache();
    await expect(cache.get('response')).resolves.toBe(response);
    await expect(cache.ttl('response')).resolves.toBe(expires);
  });

  it('returns absolute expiry and reuses wrapped values until their TTL expires', async () => {
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    const cache = cacheModule.getCache();
    const load = vi.fn().mockResolvedValue('refreshed response');

    await cache.set('response', 'cached response', 1_000);
    await expect(cache.ttl('response')).resolves.toBe(now + 1_000);
    await expect(cache.wrap('response', load, { ttl: 1_000, raw: true })).resolves.toEqual({
      value: 'cached response',
      expires: now + 1_000,
    });
    expect(load).not.toHaveBeenCalled();

    clock.mockReturnValue(now + 1_001);
    await expect(cache.wrap('response', load, { ttl: 1_000, raw: true })).resolves.toEqual({
      value: 'refreshed response',
      expires: now + 2_001,
    });
    await expect(cache.get('response')).resolves.toBe('refreshed response');
    expect(load).toHaveBeenCalledOnce();
  });

  it('isolates bulk operations and iterator-based clearing to the selected namespace', async () => {
    const cache = cacheModule.getCache();
    const first = await cacheModule.withCacheNamespace('run', async () => cacheModule.getCache());
    const second = await cacheModule.withCacheNamespace('runner', async () =>
      cacheModule.getCache(),
    );
    await cache.set('response', 'unscoped');
    await second.set('response', 'other run');
    await first.mset([
      { key: 'response', value: 'first response' },
      { key: 'extra', value: 'second response' },
    ]);

    await expect(first.mget(['response', 'extra', 'missing'])).resolves.toEqual([
      'first response',
      'second response',
      undefined,
    ]);
    await first.mdel(['extra']);
    await expect(first.get('extra')).resolves.toBeUndefined();
    await first.clear();

    await expect(first.get('response')).resolves.toBeUndefined();
    await expect(second.get('response')).resolves.toBe('other run');
    await expect(cache.get('response')).resolves.toBe('unscoped');
  });

  it('treats a failed disk read as a miss and caches the computed response', async () => {
    const cache = cacheModule.getCache();
    vi.spyOn(cache.stores[0].store, 'get').mockRejectedValueOnce(new Error('disk read failed'));
    const load = vi.fn().mockResolvedValue('computed response');

    await expect(cache.wrap('response', load)).resolves.toBe('computed response');
    await expect(cache.get('response')).resolves.toBe('computed response');
    await expect(cache.wrap('response', load)).resolves.toBe('computed response');
    expect(load).toHaveBeenCalledOnce();
  });

  it('returns the computed response after a failed disk write and retries on the next miss', async () => {
    const cache = cacheModule.getCache();
    vi.spyOn(cache.stores[0].store, 'set').mockRejectedValueOnce(new Error('disk write failed'));
    const load = vi.fn().mockResolvedValue('computed response');

    await expect(cache.wrap('response', load)).resolves.toBe('computed response');
    await expect(cache.get('response')).resolves.toBeUndefined();
    await expect(cache.wrap('response', load)).resolves.toBe('computed response');
    await expect(cache.get('response')).resolves.toBe('computed response');
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe('clearCache with disk storage', () => {
  let cacheDirectory: string;
  let restoreEnvironment: () => void;

  beforeEach(() => {
    vi.resetModules();
    cacheDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-cache-clear-'));
    restoreEnvironment = mockProcessEnv({
      PROMPTFOO_CACHE_TYPE: 'disk',
      PROMPTFOO_CACHE_PATH: cacheDirectory,
      PROMPTFOO_CACHE_ENABLED: 'true',
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    restoreEnvironment();
    fs.rmSync(cacheDirectory, { recursive: true, force: true });
  });

  it('removes persisted responses when caching loads disabled', async () => {
    const cacheFile = path.join(cacheDirectory, 'cache.json');

    // Seed a real on-disk response while caching is enabled.
    const seed = await import('../src/cache');
    await seed.getCache().set('stale', 'stale response');
    expect(fs.existsSync(cacheFile)).toBe(true);
    await seed.getCache().disconnect();

    // A fresh module that loads with caching disabled builds a memory cache;
    // clearing it must still reach the stale file on disk.
    const restoreDisabled = mockProcessEnv({ PROMPTFOO_CACHE_ENABLED: 'false' });
    vi.resetModules();
    const disabled = await import('../src/cache');
    expect(disabled.isCacheEnabled()).toBe(false);
    await disabled.clearCache();
    restoreDisabled();

    // A later enabled process must not reuse the stale response.
    vi.resetModules();
    const later = await import('../src/cache');
    await expect(later.getCache().get('stale')).resolves.toBeUndefined();
    await later.getCache().disconnect();
  });

  it('still clears the active disk cache when caching is enabled', async () => {
    const enabled = await import('../src/cache');
    await enabled.getCache().set('fresh', 'value');
    await expect(enabled.getCache().get('fresh')).resolves.toBe('value');

    await enabled.clearCache();

    await expect(enabled.getCache().get('fresh')).resolves.toBeUndefined();
    await enabled.getCache().disconnect();
  });
});
