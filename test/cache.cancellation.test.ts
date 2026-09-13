import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { KeyvFile } from 'keyv-file';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as CacheModule from '../src/cache';

const diskWriteBoundary = KeyvFile.prototype as unknown as {
  saveToDisk: () => Promise<void>;
};

const fetchWithRetries = vi.hoisted(() => vi.fn());
vi.mock('../src/util/fetch/index', () => ({
  fetchWithRetries,
  getFetchWithProxyHeaders: () => ({}),
}));
vi.mock('../src/logger');

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('fetchWithCache caller cancellation at cache boundaries', () => {
  let cacheModule: typeof CacheModule;
  let cacheDirectory: string;
  let releasePendingWork: Array<() => void>;

  beforeEach(async () => {
    vi.resetModules();
    cacheDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'promptfoo-cache-cancellation-'));
    vi.stubEnv('PROMPTFOO_CACHE_TYPE', 'disk');
    vi.stubEnv('PROMPTFOO_CACHE_PATH', cacheDirectory);
    vi.stubEnv('PROMPTFOO_CACHE_ENABLED', 'true');
    vi.stubEnv('PROMPTFOO_CACHE_TTL', '1');
    cacheModule = await import('../src/cache');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-09T00:00:00Z'));
    releasePendingWork = [];
    fetchWithRetries.mockReset();
    fetchWithRetries.mockImplementation(
      async () => new Response(JSON.stringify({ output: 'cached result' }), { status: 200 }),
    );
    // Keep the real Keyv/KeyvFile get/set/delete and delayed-save machinery.
    // The filesystem write is the controlled harmless boundary for these tests.
    vi.spyOn(diskWriteBoundary, 'saveToDisk').mockResolvedValue(undefined);
  });

  afterEach(async () => {
    for (const release of releasePendingWork) {
      release();
    }
    await vi.runAllTimersAsync();
    await cacheModule.getCache().disconnect();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    fs.rmSync(cacheDirectory, { recursive: true, force: true });
  });

  async function warmCache(url: string) {
    const pending = cacheModule.fetchWithCache(url);
    await vi.runAllTimersAsync();
    return pending;
  }

  it('cancels an expired-entry cleanup wait before disk save completes or miss fetch starts', async () => {
    const url = 'https://cache.test/expired';
    await warmCache(url);
    const save = deferred<void>();
    const saveStarted = deferred<void>();
    releasePendingWork.push(() => save.resolve());
    vi.mocked(diskWriteBoundary.saveToDisk).mockImplementationOnce(() => {
      saveStarted.resolve();
      return save.promise;
    });
    const originalGet = KeyvFile.prototype.get;
    vi.spyOn(KeyvFile.prototype, 'get').mockImplementationOnce(async function (
      this: KeyvFile,
      key,
    ) {
      const value = await originalGet.call(this, key);
      // Cross expiry after the File memory lookup but before Keyv checks its
      // inner expiry. Keyv then awaits delete -> delayed disk save.
      vi.setSystemTime(Date.now() + 1001);
      return value;
    });
    const controller = new AbortController();
    const pending = cacheModule.fetchWithCache(url, { signal: controller.signal });
    const canceled = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(100);
    await saveStarted.promise;

    controller.abort();
    await canceled;
    expect(fetchWithRetries).toHaveBeenCalledTimes(1);
    save.resolve();
    await vi.runAllTimersAsync();
    expect(fetchWithRetries).toHaveBeenCalledTimes(1);
    await expect(warmCache(url)).resolves.toMatchObject({ cached: false });
    expect(fetchWithRetries).toHaveBeenCalledTimes(2);
  });

  it('releases a caller during a real cache save while preserving the entry for other callers', async () => {
    const url = 'https://cache.test/save';
    const save = deferred<void>();
    const saveStarted = deferred<void>();
    releasePendingWork.push(() => save.resolve());
    vi.mocked(diskWriteBoundary.saveToDisk).mockImplementationOnce(() => {
      saveStarted.resolve();
      return save.promise;
    });
    const controller = new AbortController();
    const pending = cacheModule.fetchWithCache(url, { signal: controller.signal });
    const canceled = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(100);
    await saveStarted.promise;

    controller.abort();
    await canceled;
    await expect(cacheModule.fetchWithCache(url)).resolves.toMatchObject({
      cached: true,
      data: { output: 'cached result' },
    });
    save.resolve();
    await vi.runAllTimersAsync();
    await expect(cacheModule.fetchWithCache(url)).resolves.toMatchObject({ cached: true });
    expect(fetchWithRetries).toHaveBeenCalledTimes(1);
  });

  it.each(['miss', 'hit', 'failure'] as const)(
    'observes a late lookup %s without resuming the canceled caller',
    async (outcome) => {
      const url = `https://cache.test/late-${outcome}`;
      await warmCache(url);
      const cache = cacheModule.getCache();
      const originalGet = cache.get.bind(cache);
      const lookup = deferred<unknown>();
      let requestedKey = '';
      vi.spyOn(cache, 'get').mockImplementationOnce((key) => {
        requestedKey = key;
        return lookup.promise;
      });
      const controller = new AbortController();
      const remove = vi.spyOn(controller.signal, 'removeEventListener');
      const pending = cacheModule.fetchWithCache(url, { signal: controller.signal });
      const canceled = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      controller.abort();
      await canceled;
      expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));

      if (outcome === 'failure') {
        lookup.reject(new Error('synthetic late lookup failure'));
      } else {
        lookup.resolve(outcome === 'hit' ? await originalGet(requestedKey) : undefined);
      }
      await Promise.resolve();
      expect(fetchWithRetries).toHaveBeenCalledTimes(1);
      await expect(cacheModule.fetchWithCache(url)).resolves.toMatchObject({ cached: true });
    },
  );

  it('uses a Request signal and rejects pre-aborted callers before cache work', async () => {
    const controller = new AbortController();
    const request = new Request('https://cache.test/request-signal', { signal: controller.signal });
    const cacheGet = vi.spyOn(cacheModule.getCache(), 'get');
    controller.abort('request canceled');
    await expect(cacheModule.fetchWithCache(request)).rejects.toMatchObject({
      name: 'AbortError',
      message: 'request canceled',
    });
    expect(cacheGet).not.toHaveBeenCalled();
    expect(fetchWithRetries).not.toHaveBeenCalled();
  });

  it('preserves an ordinary no-signal cache error', async () => {
    const error = new Error('synthetic store read failure');
    vi.spyOn(cacheModule.getCache(), 'get').mockRejectedValueOnce(error);
    await expect(cacheModule.fetchWithCache('https://cache.test/error')).rejects.toBe(error);
    expect(fetchWithRetries).not.toHaveBeenCalled();
  });
});
