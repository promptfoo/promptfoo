import { randomUUID } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache, getCache, withCacheEnabled, withCacheNamespace } from '../src/cache';
import { clearAgentCache } from '../src/util/fetch/index';
import { createDeferred } from './util/utils';

import type { FetchWithCacheResult } from '../src/cache';
import type { FetchRateLimitObservation } from '../src/util/fetch/index';

describe('fresh prepared cache response consumers', () => {
  let namespace: string;

  beforeEach(() => {
    namespace = randomUUID();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected fixture transport'));
  });

  afterEach(() => {
    clearAgentCache();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function call<T = { value: string }>(
    options: RequestInit,
    observe: (response: FetchWithCacheResult<T>) => void,
    mode: 'cache' | 'bust' | 'disabled' = 'cache',
    onRateLimitBackoff?: (observation: FetchRateLimitObservation) => void,
    maxRetries = 0,
  ) {
    return withCacheNamespace(namespace, () =>
      withCacheEnabled(mode !== 'disabled', () =>
        fetchWithCache<T>(
          'https://prepared-cache.fixture.test/result',
          options,
          1000,
          'json',
          mode === 'bust',
          maxRetries,
          observe,
          onRateLimitBackoff,
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

  it.each([
    { mode: 'cache', status: 200, cancel: true },
    { mode: 'bust', status: 200, cancel: true },
    { mode: 'disabled', status: 200, cancel: true },
    { mode: 'cache', status: 200, cancel: false },
    { mode: 'bust', status: 200, cancel: false },
    { mode: 'disabled', status: 200, cancel: false },
    { mode: 'cache', status: 400, cancel: true },
  ] as const)(
    'retains a fully prepared body error with $mode, status $status, cancel $cancel',
    async ({ mode, status, cancel }) => {
      const payload = { error: { code: 'provider_failure', message: 'completed diagnostic' } };
      const headers = { 'content-type': 'application/json', 'x-request-id': 'completed-error' };
      const statusText = status === 200 ? 'OK' : 'Bad Request';
      const response = new Response(JSON.stringify(payload), { status, statusText, headers });
      const nextResponse = new Response(JSON.stringify(payload), { status, statusText, headers });
      vi.mocked(globalThis.fetch)
        .mockResolvedValueOnce(response)
        .mockResolvedValueOnce(nextResponse);
      const cache = getCache();
      const writes = vi.fn();
      cache.on('set', writes);
      const prepared = createDeferred<FetchWithCacheResult<typeof payload>>();
      const observe = vi.fn((result: FetchWithCacheResult<typeof payload>) => {
        prepared.resolve(result);
      });
      const controller = new AbortController();
      const reason = Object.freeze(
        new DOMException('caller stopped after preparation', 'AbortError'),
      );
      const pending = call(cancel ? { signal: controller.signal } : {}, observe, mode).catch(
        (error: unknown) => error,
      );

      try {
        // This continuation is separate from the observer. Only the real cache
        // parser can release it, after the native response body is fully read.
        const observed = await prepared.promise;
        expect(response.bodyUsed).toBe(true);
        expect(observed).toMatchObject({
          cached: false,
          data: payload,
          status,
          statusText,
          headers,
          latencyMs: expect.any(Number),
        });
        expect(observed.coalesced).toBeUndefined();
        if (cancel) {
          controller.abort(reason);
        }

        const result = await pending;
        expect(result).toBe(observed);
        expect(observe).toHaveBeenCalledExactlyOnceWith(result);
        expect(writes).not.toHaveBeenCalled();
        expect(globalThis.fetch).toHaveBeenCalledOnce();

        // A finished noncacheable request must leave no stored response or stale
        // inflight entry for the next live request with exactly the same key.
        const nextObserver = vi.fn();
        const next = await call({}, nextObserver, mode);
        expect(next).toMatchObject({ cached: false, data: payload, status, statusText, headers });
        expect(next.coalesced).toBeUndefined();
        expect(nextObserver).toHaveBeenCalledExactlyOnceWith(next);
        expect(nextResponse.bodyUsed).toBe(true);
        expect(globalThis.fetch).toHaveBeenCalledTimes(2);
        expect(writes).not.toHaveBeenCalled();
      } finally {
        await pending;
        cache.off('set', writes);
      }
    },
  );

  it('retains each coalesced prepared body error after its caller continuation cancels', async () => {
    const payload = { error: 'completed diagnostic' };
    const headers = { 'content-type': 'application/json', 'x-request-id': 'shared-error' };
    const response = new Response(JSON.stringify(payload), {
      status: 200,
      statusText: 'OK',
      headers,
    });
    const transport = createDeferred<Response>();
    vi.mocked(globalThis.fetch)
      .mockReturnValueOnce(transport.promise)
      .mockResolvedValueOnce(new Response(JSON.stringify(payload), { headers }));
    const cache = getCache();
    const writes = vi.fn();
    cache.on('set', writes);
    const prepared = createDeferred<FetchWithCacheResult<typeof payload>>();
    const firstObserver = vi.fn((result: FetchWithCacheResult<typeof payload>) => {
      prepared.resolve(result);
    });
    const secondObserver = vi.fn();
    const controller = new AbortController();
    const reason = Object.freeze(new DOMException('shared caller stopped', 'AbortError'));
    const options = { signal: controller.signal };
    const first = call(options, firstObserver).catch((error: unknown) => error);
    const second = call(options, secondObserver).catch((error: unknown) => error);

    try {
      await new Promise<void>((resolve) => setImmediate(resolve));
      expect(globalThis.fetch).toHaveBeenCalledOnce();
      transport.resolve(response);
      const observed = await prepared.promise;
      expect(response.bodyUsed).toBe(true);
      expect(observed).toMatchObject({ cached: false, data: payload, status: 200, headers });
      expect(observed.coalesced).toBeUndefined();
      expect(secondObserver).toHaveBeenCalledOnce();
      const coalesced = secondObserver.mock.calls[0][0];
      expect(coalesced).toMatchObject({
        cached: false,
        coalesced: true,
        data: payload,
        status: 200,
        headers,
        latencyMs: observed.latencyMs,
      });
      controller.abort(reason);

      expect(await first).toBe(observed);
      expect(await second).toBe(coalesced);
      expect(firstObserver).toHaveBeenCalledExactlyOnceWith(observed);
      expect(secondObserver).toHaveBeenCalledExactlyOnceWith(coalesced);
      expect(writes).not.toHaveBeenCalled();
      const next = await call({}, vi.fn());
      expect(next).toMatchObject({ cached: false, data: payload });
      expect(next.coalesced).toBeUndefined();
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
      expect(writes).not.toHaveBeenCalled();
    } finally {
      transport.resolve(response);
      await Promise.all([first, second]);
      cache.off('set', writes);
    }
  });

  it.each([{ value: 'ordinary' }, { value: 'falsy-error', error: false }])(
    'still cancels cacheable prepared success $value and completes its real publication',
    async (payload) => {
      const response = new Response(JSON.stringify(payload), {
        headers: { 'content-type': 'application/json', 'x-request-id': 'cacheable-success' },
      });
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(response);
      const cache = getCache();
      const writes = vi.fn();
      cache.on('set', writes);
      const prepared = createDeferred<FetchWithCacheResult<typeof payload>>();
      const observe = vi.fn((result: FetchWithCacheResult<typeof payload>) => {
        prepared.resolve(result);
      });
      const controller = new AbortController();
      const reason = Object.freeze(new DOMException('discard completed success', 'AbortError'));
      const pending = call({ signal: controller.signal }, observe).catch((error: unknown) => error);

      try {
        const observed = await prepared.promise;
        expect(response.bodyUsed).toBe(true);
        expect(observed).toMatchObject({ cached: false, data: payload, status: 200 });
        controller.abort(reason);
        expect(await pending).toBe(reason);
        // Drain the unmodified publication after the cancellation assertion.
        await new Promise<void>((resolve) => setImmediate(resolve));
        // cache-manager emits once per store and once for the completed set.
        expect(writes).toHaveBeenCalledTimes(cache.stores.length + 1);
        expect(writes.mock.calls.filter(([event]) => event.store === undefined)).toHaveLength(1);
        expect(writes.mock.calls.every(([event]) => event.error === undefined)).toBe(true);
        const cachedObserver = vi.fn();
        expect(await call({}, cachedObserver)).toMatchObject({ cached: true, data: payload });
        expect(cachedObserver).not.toHaveBeenCalled();
        expect(observe).toHaveBeenCalledOnce();
        expect(globalThis.fetch).toHaveBeenCalledOnce();
      } finally {
        await pending;
        cache.off('set', writes);
      }
    },
  );

  it.each([
    { mode: 'cache', lateFailure: false },
    { mode: 'bust', lateFailure: false },
    { mode: 'disabled', lateFailure: false },
    { mode: 'cache', lateFailure: true },
    { mode: 'bust', lateFailure: true },
    { mode: 'disabled', lateFailure: true },
  ] as const)(
    'isolates a $mode backoff observer failure from transport retries, late failure $lateFailure',
    async ({ mode, lateFailure }) => {
      vi.useFakeTimers();
      const limitedResponse = () =>
        new Response('{"error":{"code":"rate_limit_exceeded"}}', {
          status: 429,
          headers: { 'retry-after': '2' },
        });
      vi.mocked(globalThis.fetch)
        .mockResolvedValueOnce(limitedResponse())
        .mockResolvedValueOnce(limitedResponse());
      if (lateFailure) {
        vi.mocked(globalThis.fetch).mockRejectedValueOnce(new Error('late transport failure'));
      } else {
        vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response('{"value":"published"}'));
      }
      vi.mocked(globalThis.fetch).mockResolvedValueOnce(new Response('{"value":"fresh"}'));
      const selected = createDeferred<FetchRateLimitObservation>();
      const failure = new Error('network timeout in the observer');
      const observeBackoff = vi.fn((observation: FetchRateLimitObservation) => {
        selected.resolve(observation);
        throw failure;
      });
      const prepared = vi.fn();
      const options = { method: 'POST', body: '{}' };
      const unhandled = vi.fn();
      process.on('unhandledRejection', unhandled);
      const pending = call(options, prepared, mode, observeBackoff, 2).catch(
        (error: unknown) => error,
      );

      try {
        await vi.advanceTimersByTimeAsync(0);
        const observation = await selected.promise;
        expect(observation).toMatchObject({ status: 429, headers: { 'retry-after': '2' } });
        expect(observation.resetAt).toBe(Date.now() + 2000);
        expect(await pending).toBe(failure);
        expect(globalThis.fetch).toHaveBeenCalledOnce();
        expect(prepared).not.toHaveBeenCalled();

        // The detached transport keeps its two real selected retries. The
        // observer's network-like error must not enter transport retry handling.
        await vi.advanceTimersByTimeAsync(6000);
        expect(globalThis.fetch).toHaveBeenCalledTimes(3);
        expect(observeBackoff).toHaveBeenCalledOnce();
        expect(prepared).not.toHaveBeenCalled();
        expect(unhandled).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);

        const laterObserver = vi.fn();
        const laterPrepared = vi.fn();
        const later = await call(options, laterPrepared, mode, laterObserver);
        const stored = mode === 'cache' && !lateFailure;
        expect(later).toMatchObject({
          cached: stored,
          data: { value: stored ? 'published' : 'fresh' },
        });
        expect(later.coalesced).toBeUndefined();
        expect(laterObserver).not.toHaveBeenCalled();
        expect(laterPrepared).toHaveBeenCalledTimes(stored ? 0 : 1);
        expect(globalThis.fetch).toHaveBeenCalledTimes(stored ? 3 : 4);
      } finally {
        await vi.advanceTimersByTimeAsync(6000);
        await pending;
        process.off('unhandledRejection', unhandled);
      }
    },
  );

  it.each(['active', 'expired'] as const)(
    'keeps coalesced backoff observers independent and replays only an %s window',
    async (window) => {
      vi.useFakeTimers();
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const firstTransport = createDeferred<Response>();
      vi.mocked(globalThis.fetch)
        .mockReturnValueOnce(firstTransport.promise)
        .mockResolvedValueOnce(
          new Response('{"error":{"code":"rate_limit_exceeded"}}', {
            status: 429,
            headers: { 'retry-after': '2' },
          }),
        )
        .mockResolvedValueOnce(new Response('{"value":"shared"}'));
      const selected = createDeferred<FetchRateLimitObservation>();
      const failure = new Error('only this observer failed');
      const failedObserver = vi.fn((observation: FetchRateLimitObservation) => {
        selected.resolve(observation);
        throw failure;
      });
      const survivorObserver = vi.fn();
      const failedPrepared = vi.fn();
      const survivorPrepared = vi.fn();
      const options = { signal: new AbortController().signal, method: 'POST', body: '{}' };
      const first = call(options, failedPrepared, 'cache', failedObserver, 2).catch(
        (error: unknown) => error,
      );
      const survivor = call(options, survivorPrepared, 'cache', survivorObserver, 2);
      let joined: ReturnType<typeof call> | undefined;

      try {
        await vi.advanceTimersByTimeAsync(0);
        expect(globalThis.fetch).toHaveBeenCalledOnce();
        firstTransport.resolve(
          new Response('{"error":{"code":"rate_limit_exceeded"}}', {
            status: 429,
            headers: { 'retry-after': '2' },
          }),
        );
        await vi.advanceTimersByTimeAsync(0);
        const observation = await selected.promise;
        expect(await first).toBe(failure);
        expect(Object.isFrozen(observation)).toBe(true);
        expect(Object.isFrozen(observation.headers)).toBe(true);
        expect(() => Object.assign(observation.headers, { 'retry-after': '999' })).toThrow(
          TypeError,
        );
        expect(observation.headers['retry-after']).toBe('2');
        expect(survivorObserver).toHaveBeenCalledExactlyOnceWith(observation);
        expect(failedPrepared).not.toHaveBeenCalled();

        if (window === 'expired') {
          // The quota deadline expires before the fixed 500 ms retry jitter.
          await vi.advanceTimersByTimeAsync(observation.resetAt - Date.now());
          expect(globalThis.fetch).toHaveBeenCalledOnce();
        }
        const joinedObserver = vi.fn();
        const joinedPrepared = vi.fn();
        joined = call(options, joinedPrepared, 'cache', joinedObserver, 2);
        await vi.advanceTimersByTimeAsync(0);
        if (window === 'active') {
          expect(joinedObserver).toHaveBeenCalledExactlyOnceWith(observation);
          expect(joinedObserver.mock.calls[0][0]).toBe(observation);
        } else {
          expect(joinedObserver).not.toHaveBeenCalled();
        }
        expect(globalThis.fetch).toHaveBeenCalledOnce();

        await vi.advanceTimersByTimeAsync(6000);
        const [survivorResult, joinedResult] = await Promise.all([survivor, joined]);
        expect(survivorResult).toMatchObject({
          cached: false,
          coalesced: true,
          data: { value: 'shared' },
        });
        expect(joinedResult).toMatchObject({
          cached: false,
          coalesced: true,
          data: { value: 'shared' },
        });
        expect(survivorPrepared).toHaveBeenCalledExactlyOnceWith(survivorResult);
        expect(joinedPrepared).toHaveBeenCalledExactlyOnceWith(joinedResult);
        expect(failedObserver).toHaveBeenCalledOnce();
        expect(survivorObserver).toHaveBeenCalledTimes(2);
        expect(joinedObserver).toHaveBeenCalledTimes(window === 'active' ? 2 : 1);
        expect(joinedObserver.mock.calls.at(-1)?.[0]).toBe(survivorObserver.mock.calls[1][0]);
        expect(globalThis.fetch).toHaveBeenCalledTimes(3);
        expect(vi.getTimerCount()).toBe(0);

        const cachedObserver = vi.fn();
        expect(await call(options, vi.fn(), 'cache', cachedObserver)).toMatchObject({
          cached: true,
        });
        expect(cachedObserver).not.toHaveBeenCalled();
        expect(globalThis.fetch).toHaveBeenCalledTimes(3);
      } finally {
        firstTransport.resolve(new Response('{"value":"cleanup"}'));
        await vi.advanceTimersByTimeAsync(6000);
        await Promise.allSettled([first, survivor, ...(joined ? [joined] : [])]);
      }
    },
  );
});
