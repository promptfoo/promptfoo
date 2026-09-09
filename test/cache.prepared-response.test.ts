import { randomUUID } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache, getCache, withCacheEnabled, withCacheNamespace } from '../src/cache';
import { clearAgentCache } from '../src/util/fetch/index';
import { createDeferred } from './util/utils';

import type { FetchWithCacheResult } from '../src/cache';

describe('fresh prepared cache response consumers', () => {
  let namespace: string;

  beforeEach(() => {
    namespace = randomUUID();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected fixture transport'));
  });

  afterEach(() => {
    clearAgentCache();
    vi.restoreAllMocks();
  });

  function call(
    options: RequestInit,
    observe: (response: FetchWithCacheResult<{ value: string }>) => void,
    mode: 'cache' | 'bust' | 'disabled' = 'cache',
  ) {
    return withCacheNamespace(namespace, () =>
      withCacheEnabled(mode !== 'disabled', () =>
        fetchWithCache<{ value: string }>(
          'https://prepared-cache.fixture.test/result',
          options,
          1000,
          'json',
          mode === 'bust',
          0,
          observe,
        ),
      ),
    );
  }

  it.each(['cache', 'bust', 'disabled'] as const)(
    'observes the parsed fresh %s response once with its final header identity',
    async (mode) => {
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(
        new Response('{"value":"fresh"}', { headers: { 'x-request-id': 'fresh-fixture' } }),
      );
      const observe = vi.fn();
      const result = await call({}, observe, mode);
      expect(observe).toHaveBeenCalledExactlyOnceWith(result);
      expect(observe.mock.calls[0][0].headers).toBe(result.headers);
      expect(result).toMatchObject({
        cached: false,
        data: { value: 'fresh' },
        headers: { 'x-request-id': 'fresh-fixture' },
      });
      expect(globalThis.fetch).toHaveBeenCalledOnce();
      if (mode === 'cache') {
        const cachedObserver = vi.fn();
        expect(await call({}, cachedObserver)).toMatchObject({ cached: true });
        expect(cachedObserver).not.toHaveBeenCalled();
        expect(globalThis.fetch).toHaveBeenCalledOnce();
      }
    },
  );

  it.each(['resolve', 'reject'] as const)(
    'notifies each coalesced consumer before cancellation and observes late publication %s',
    async (settlement) => {
      const transport = createDeferred<Response>();
      const publishing = createDeferred<void>();
      const publication = createDeferred<string>();
      const cache = getCache();
      const set = cache.set.bind(cache);
      vi.spyOn(cache, 'set').mockImplementationOnce((key, value) => {
        publishing.resolve();
        return publication.promise.then(() => set(key, value));
      });
      vi.mocked(globalThis.fetch).mockReturnValueOnce(transport.promise);
      const controller = new AbortController();
      const reason = Object.freeze(
        new DOMException('caller stopped during publication', 'AbortError'),
      );
      const firstObserver = vi.fn();
      const secondObserver = vi.fn();
      const first = call({ signal: controller.signal }, firstObserver).catch((error) => error);
      const second = call({ signal: controller.signal }, secondObserver).catch((error) => error);
      try {
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(globalThis.fetch).toHaveBeenCalledOnce();
        transport.resolve(
          new Response('{"value":"shared"}', { headers: { 'ratelimit-remaining': '0' } }),
        );
        await publishing.promise;
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(firstObserver).toHaveBeenCalledOnce();
        expect(secondObserver).toHaveBeenCalledOnce();
        expect(firstObserver.mock.calls[0][0]).toMatchObject({
          cached: false,
          data: { value: 'shared' },
        });
        expect(firstObserver.mock.calls[0][0].coalesced).toBeUndefined();
        expect(secondObserver.mock.calls[0][0]).toMatchObject({
          cached: false,
          coalesced: true,
          data: { value: 'shared' },
        });
        controller.abort(reason);
        expect(await first).toBe(reason);
        expect(await second).toBe(reason);
        if (settlement === 'resolve') {
          publication.resolve('saved');
        } else {
          publication.reject(new Error('late publication failure'));
        }
        // A late rejected write must stay observed after both consumers leave.
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(firstObserver).toHaveBeenCalledOnce();
        expect(secondObserver).toHaveBeenCalledOnce();
        if (settlement === 'resolve') {
          const cachedObserver = vi.fn();
          expect(await call({}, cachedObserver)).toMatchObject({ cached: true });
          expect(cachedObserver).not.toHaveBeenCalled();
        }
      } finally {
        publication.resolve('cleanup');
        transport.resolve(new Response('{}'));
        await Promise.all([first, second]);
      }
    },
  );

  it.each(['signal', 'authorization'] as const)(
    'keeps independently owned %s responses and their observers isolated',
    async (boundary) => {
      const firstTransport = createDeferred<Response>();
      const secondTransport = createDeferred<Response>();
      vi.mocked(globalThis.fetch)
        .mockReturnValueOnce(firstTransport.promise)
        .mockReturnValueOnce(secondTransport.promise);
      const controller = new AbortController();
      const firstObserver = vi.fn();
      const secondObserver = vi.fn();
      const first = call(
        { signal: controller.signal, headers: { Authorization: 'Bearer fixture-a' } },
        firstObserver,
      );
      const second = call(
        {
          signal: boundary === 'signal' ? new AbortController().signal : controller.signal,
          headers: {
            Authorization: boundary === 'authorization' ? 'Bearer fixture-b' : 'Bearer fixture-a',
          },
        },
        secondObserver,
      );
      try {
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(globalThis.fetch).toHaveBeenCalledTimes(2);
        firstTransport.resolve(new Response('{"value":"first"}'));
        secondTransport.resolve(new Response('{"value":"second"}'));
        const [firstResult, secondResult] = await Promise.all([first, second]);
        expect(firstObserver).toHaveBeenCalledExactlyOnceWith(firstResult);
        expect(secondObserver).toHaveBeenCalledExactlyOnceWith(secondResult);
        expect(firstResult.data).toEqual({ value: 'first' });
        expect(secondResult.data).toEqual({ value: 'second' });
        expect(firstResult.coalesced).toBeUndefined();
        expect(secondResult.coalesced).toBeUndefined();
      } finally {
        firstTransport.resolve(new Response('{}'));
        secondTransport.resolve(new Response('{}'));
        await Promise.all([first, second]);
      }
    },
  );
});
