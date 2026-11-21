import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { KeyvFile } from 'keyv-file';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDiskCache } from '../../src/cache/storage';
import type { Cache } from 'cache-manager';

describe('disk cache storage', () => {
  let directory: string;
  let filename: string;
  let caches: Cache[];

  const open = (ttl = 60_000) => {
    const cache = createDiskCache(filename, ttl);
    caches.push(cache);
    return cache;
  };

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-disk-cache-'));
    filename = path.join(directory, 'cache.json');
    caches = [];
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(caches.map((cache) => cache.disconnect()));
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it('reads old files and persists one compatible envelope across reopening', async () => {
    const expires = Date.now() + 60_000;
    fs.writeFileSync(
      filename,
      JSON.stringify({
        cache: [
          ['keyv:old', { expire: expires, value: JSON.stringify({ value: 'old', expires }) }],
        ],
        lastExpire: Date.now(),
      }),
    );
    const cache = open();
    await expect(cache.get('old')).resolves.toBe('old');
    await expect(cache.ttl('old')).resolves.toBe(expires);
    await cache.set('new', { output: ':base64:literal', bytes: Buffer.from('response') });
    const file = new KeyvFile({ filename });
    const serialized: unknown = await file.get('keyv:new');
    expect(typeof serialized).toBe('string');
    if (typeof serialized !== 'string') {
      throw new Error('Expected a serialized disk envelope');
    }
    expect(JSON.parse(serialized)).toEqual({
      value: { output: '::base64:literal', bytes: ':base64:cmVzcG9uc2U=' },
      expires: expect.any(Number),
    });
    const reopened = open();
    await expect(reopened.get('new')).resolves.toEqual({
      output: ':base64:literal',
      bytes: Buffer.from('response'),
    });
    expect(
      JSON.parse(fs.readFileSync(filename, 'utf8')).cache.map(([key]: [string, unknown]) => key),
    ).toEqual(['keyv:old', 'keyv:new']);
  });

  it('preserves absolute expiry and reloads wrapped values only after expiration', async () => {
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    const cache = open();
    const load = vi.fn().mockResolvedValue('new');
    await cache.set('response', 'old', 1_000);
    await expect(cache.ttl('response')).resolves.toBe(now + 1_000);
    await expect(cache.wrap('response', load, { ttl: 1_000, raw: true })).resolves.toEqual({
      value: 'old',
      expires: now + 1_000,
    });
    expect(load).not.toHaveBeenCalled();
    clock.mockReturnValue(now + 1_001);
    await expect(cache.wrap('response', load, { ttl: 1_000, raw: true })).resolves.toEqual({
      value: 'new',
      expires: now + 2_001,
    });
    expect(load).toHaveBeenCalledOnce();
  });

  it('reads legacy null expiry without expiring or nesting the value', async () => {
    fs.writeFileSync(
      filename,
      JSON.stringify({
        cache: [['keyv:forever', { value: JSON.stringify({ value: 'legacy', expires: null }) }]],
        lastExpire: Date.now(),
      }),
    );
    const cache = open();
    await expect(cache.get('forever')).resolves.toBe('legacy');
    await expect(cache.wrap('forever', () => 'unexpected', { raw: true })).resolves.toEqual({
      value: 'legacy',
      expires: null,
    });
    await cache.set('forever', 'updated', 0);
    await expect(open().get('forever')).resolves.toBe('updated');
  });

  it('honors the facade namespace and unprefixed iterator without changing literal keys', async () => {
    const cache = open();
    const facade = cache.stores[0];
    await cache.set('original', 'default');
    facade.namespace = 'custom';
    await cache.set('nested:key', 'custom');
    const entries: Array<[string, unknown]> = [];
    for await (const entry of facade.iterator!(undefined)) {
      entries.push(entry);
    }
    expect(entries).toEqual([['nested:key', 'custom']]);
    facade.useKeyPrefix = false;
    const all: Array<[string, unknown]> = [];
    for await (const entry of facade.iterator!(undefined)) {
      all.push(entry);
    }
    expect(all).toEqual([
      ['keyv:original', 'default'],
      ['custom:nested:key', 'custom'],
    ]);
  });

  it.each([null, [], 'value', { value: 'value', expires: 'invalid' }])(
    'rejects malformed storage envelopes (%j)',
    async (value) => {
      const cache = open();
      await expect(cache.stores[0].opts.store.set('invalid', value)).rejects.toThrow(
        'value/expiry envelope',
      );
    },
  );

  it('preserves the exposed store default TTL and zero-TTL entries', async () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const cache = open(500);
    await cache.stores[0].set('direct', 'value');
    await expect(cache.ttl('direct')).resolves.toBe(now + 500);
    await cache.set('forever', null, 0);
    await expect(cache.get('forever')).resolves.toBeNull();
    await expect(cache.ttl('forever')).resolves.toBeUndefined();
  });

  it('preserves bulk ordering, misses, falsy values and literal namespace separators', async () => {
    const cache = open();
    await cache.mset<unknown>([
      { key: 'run:a', value: 0 },
      { key: 'run:nested:repeat:2:b', value: false },
      { key: 'runner:a', value: '' },
      { key: 'plain', value: null },
    ]);
    await expect(cache.mget(['run:a', 'missing', 'run:a', 'runner:a', 'plain'])).resolves.toEqual([
      0,
      undefined,
      0,
      '',
      null,
    ]);
    const entries: Array<[string, unknown]> = [];
    for await (const [key, value] of cache.stores[0].iterator!(undefined)) {
      entries.push([key, value]);
    }
    expect(entries).toEqual([
      ['run:a', 0],
      ['run:nested:repeat:2:b', false],
      ['runner:a', ''],
      ['plain', null],
    ]);
    await cache.mdel(entries.filter(([key]) => key.startsWith('run:')).map(([key]) => key));
    await expect(
      cache.mget(['run:a', 'run:nested:repeat:2:b', 'runner:a', 'plain']),
    ).resolves.toEqual([undefined, undefined, '', null]);
  });

  it('coalesces concurrent loads and retries a rejected loader', async () => {
    const cache = open();
    const load = vi.fn().mockResolvedValue('loaded');
    await expect(
      Promise.all([cache.wrap('same', load), cache.wrap('same', load)]),
    ).resolves.toEqual(['loaded', 'loaded']);
    expect(load).toHaveBeenCalledOnce();
    const retry = vi
      .fn()
      .mockRejectedValueOnce(new Error('provider failed'))
      .mockResolvedValue('retry');
    await expect(cache.wrap('retry', retry)).rejects.toThrow('provider failed');
    await expect(cache.wrap('retry', retry)).resolves.toBe('retry');
    expect(retry).toHaveBeenCalledTimes(2);
  });

  it('refreshes in the background using the cached value and absolute deadline', async () => {
    const now = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now);
    const cache = open();
    await cache.set('refresh', 'old', 1_000);
    clock.mockReturnValue(now + 900);
    const refreshed = new Promise<void>((resolve) => cache.on('refresh', () => resolve()));
    await expect(
      cache.wrap('refresh', () => 'new', { ttl: 1_000, refreshThreshold: 200 }),
    ).resolves.toBe('old');
    await refreshed;
    await expect(cache.get('refresh')).resolves.toBe('new');
    await expect(cache.ttl('refresh')).resolves.toBe(now + 1_900);
  });

  it.each(['adapter', 'file'] as const)('treats %s read failures as misses', async (boundary) => {
    const cache = open();
    const store = boundary === 'adapter' ? cache.stores[0].opts.store : KeyvFile.prototype;
    vi.spyOn(store, 'get').mockRejectedValueOnce(new Error('disk read failed'));
    const load = vi.fn().mockResolvedValue('computed');
    await expect(cache.wrap('response', load)).resolves.toBe('computed');
    await expect(cache.wrap('response', load)).resolves.toBe('computed');
    expect(load).toHaveBeenCalledOnce();
  });

  it.each(['adapter', 'file'] as const)(
    'returns computed values and retries after %s write errors',
    async (boundary) => {
      const cache = open();
      const store = boundary === 'adapter' ? cache.stores[0].opts.store : KeyvFile.prototype;
      vi.spyOn(store, 'set').mockRejectedValueOnce(new Error('disk write failed'));
      const load = vi.fn().mockResolvedValue('computed');
      await expect(cache.wrap('response', load)).resolves.toBe('computed');
      await expect(cache.get('response')).resolves.toBeUndefined();
      await expect(cache.wrap('response', load)).resolves.toBe('computed');
      expect(load).toHaveBeenCalledTimes(2);
    },
  );

  it('preserves false write/delete results and does not cache a failed write', async () => {
    const cache = open();
    vi.spyOn(KeyvFile.prototype, 'set').mockResolvedValueOnce(false);
    await expect(cache.stores[0].set('failed', 'value')).resolves.toBe(false);
    await expect(cache.get('failed')).resolves.toBeUndefined();
    await expect(cache.stores[0].deleteMany(['missing'])).resolves.toBe(false);
  });

  it('returns computed values on a disk save failure and persists them after recovery', async () => {
    const cache = open();
    const failed = vi.fn();
    cache.stores[0].on('error', failed);
    // A directory at the file path forces the real filesystem write to fail.
    fs.mkdirSync(filename);
    await expect(cache.wrap('response', () => 'computed')).resolves.toBe('computed');
    expect(failed).toHaveBeenCalledOnce();
    // KeyvFile retains its in-memory entry when saving fails, as it did before the upgrade.
    await expect(cache.get('response')).resolves.toBe('computed');
    fs.rmdirSync(filename);
    await expect(open().get('response')).resolves.toBeUndefined();
    await cache.set('recovery', 'saved');
    await expect(open().mget(['response', 'recovery'])).resolves.toEqual(['computed', 'saved']);
  });

  it('propagates iteration failures instead of silently clearing part of a namespace', async () => {
    const cache = open();
    await cache.set('run:a', 'keep');
    vi.spyOn(KeyvFile.prototype, 'iterator').mockImplementation(async function* () {
      throw new Error('disk iteration failed');
    });
    const iterate = async () => {
      for await (const _entry of cache.stores[0].iterator!(undefined)) {
        // Reading the actual iterator must surface a storage failure.
      }
    };
    await expect(iterate()).rejects.toThrow('disk iteration failed');
    await expect(cache.get('run:a')).resolves.toBe('keep');
  });

  it('clears persisted data and closes the cache', async () => {
    const cache = open();
    await cache.set('entry', 'value');
    await expect(cache.clear()).resolves.toBe(true);
    await expect(open().get('entry')).resolves.toBeUndefined();
    await expect(cache.disconnect()).resolves.toBeUndefined();
  });
});
