import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache, getCache, withCacheEnabled } from '../src/cache';
import { clearAgentCache } from '../src/util/fetch/index';
import { createDeferred } from './util/utils';

const transport = vi.hoisted(() => vi.fn());
vi.mock('../src/util/fetch/monkeyPatchFetch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/util/fetch/monkeyPatchFetch')>()),
  monkeyPatchFetch: transport,
}));
vi.mock('../src/logger');

describe('fetchWithCache effective Request signal', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    transport.mockReset();
  });

  afterEach(() => {
    clearAgentCache();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each(['bust', 'disabled', 'cache'] as const)(
    'detaches a pre-aborted Request with signal: null through the %s path',
    async (mode) => {
      const controller = new AbortController();
      controller.abort(new Error('request owner stopped'));
      const request = new Request(`https://cache.test/null-pre-aborted-${mode}`, {
        signal: controller.signal,
      });
      transport.mockResolvedValue(new Response('{"ok":true}'));
      await expect(
        withCacheEnabled(mode !== 'disabled', () =>
          fetchWithCache(request, { signal: null }, 1000, 'json', mode === 'bust', 0),
        ),
      ).resolves.toMatchObject({ data: { ok: true }, cached: false });
      expect(transport).toHaveBeenCalledOnce();
      expect(transport.mock.calls[0][1].signal.aborted).toBe(false);
      if (mode === 'cache') {
        await expect(fetchWithCache(request, { signal: null })).resolves.toMatchObject({
          data: { ok: true },
          cached: true,
        });
        expect(transport).toHaveBeenCalledOnce();
      }
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each(['bust', 'disabled', 'cache'] as const)(
    'keeps a detached %s transport alive when the Request owner aborts later',
    async (mode) => {
      const controller = new AbortController();
      const response = createDeferred<Response>();
      transport.mockImplementation((_url, options: RequestInit) => {
        const onAbort = () => response.reject(options.signal?.reason);
        options.signal?.addEventListener('abort', onAbort, { once: true });
        return response.promise.finally(() =>
          options.signal?.removeEventListener('abort', onAbort),
        );
      });
      const pending = withCacheEnabled(mode !== 'disabled', () =>
        fetchWithCache(
          new Request(`https://cache.test/null-later-${mode}`, { signal: controller.signal }),
          { signal: null },
          1000,
          'json',
          mode === 'bust',
          0,
        ),
      ).catch((error: unknown) => error);
      try {
        await vi.advanceTimersByTimeAsync(0);
        expect(transport).toHaveBeenCalledOnce();
        controller.abort(new Error('request owner stopped later'));
        expect(transport.mock.calls[0][1].signal.aborted).toBe(false);
        response.resolve(new Response('{"ok":true}'));
        expect(await pending).toMatchObject({ data: { ok: true }, cached: false });
      } finally {
        response.resolve(new Response('{}'));
        await pending;
      }
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('keeps a detached cache lookup waiting after the Request owner aborts', async () => {
    const controller = new AbortController();
    const lookup = createDeferred<undefined>();
    vi.spyOn(getCache(), 'get').mockImplementationOnce(() => lookup.promise);
    transport.mockResolvedValue(new Response('{"ok":true}'));
    let settled = false;
    const pending = fetchWithCache(
      new Request('https://cache.test/null-lookup', { signal: controller.signal }),
      { signal: null },
    ).then(
      (value) => {
        settled = true;
        return value;
      },
      (error: unknown) => {
        settled = true;
        return error;
      },
    );
    try {
      controller.abort('request owner stopped during lookup');
      await vi.advanceTimersByTimeAsync(0);
      expect(settled).toBe(false);
      expect(transport).not.toHaveBeenCalled();
      lookup.resolve(undefined);
      expect(await pending).toMatchObject({ data: { ok: true } });
    } finally {
      lookup.resolve(undefined);
      await pending;
    }
    expect(vi.getTimerCount()).toBe(0);
  });

  it('isolates inherited and detached in-flight transports for the same Request', async () => {
    const controller = new AbortController();
    const request = new Request('https://cache.test/null-inflight-isolation', {
      signal: controller.signal,
    });
    const responses = [createDeferred<Response>(), createDeferred<Response>()];
    let calls = 0;
    transport.mockImplementation((_url, options: RequestInit) => {
      const response = responses[calls++];
      const onAbort = () => response.reject(options.signal?.reason);
      options.signal?.addEventListener('abort', onAbort, { once: true });
      return response.promise.finally(() => options.signal?.removeEventListener('abort', onAbort));
    });
    const inherited = fetchWithCache(request, {}, 1000, 'json', false, 0).catch(
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(0);
    const detached = fetchWithCache(request, { signal: null }, 1000, 'json', false, 0).catch(
      (error: unknown) => error,
    );
    // Two detached callers should still coalesce with each other.
    const coalesced = fetchWithCache(request, { signal: null }, 1000, 'json', false, 0).catch(
      (error: unknown) => error,
    );
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(transport).toHaveBeenCalledTimes(2);
      controller.abort(new Error('inherited owner stopped'));
      expect(await inherited).toMatchObject({ name: 'AbortError' });
      expect(transport.mock.calls[1][1].signal.aborted).toBe(false);
      responses[1].resolve(new Response('{"detached":true}'));
      expect(await detached).toMatchObject({ data: { detached: true }, cached: false });
      expect(await coalesced).toMatchObject({
        data: { detached: true },
        cached: false,
        coalesced: true,
      });
      await expect(fetchWithCache(request, { signal: null })).resolves.toMatchObject({
        data: { detached: true },
        cached: true,
      });
      expect(transport).toHaveBeenCalledTimes(2);
    } finally {
      responses.forEach((response) => response.resolve(new Response('{}')));
      await Promise.all([inherited, detached, coalesced]);
    }
    expect(vi.getTimerCount()).toBe(0);
  });

  it('retries an independent transport failure without inheriting the detached Request abort', async () => {
    const controller = new AbortController();
    controller.abort('detached Request owner stopped');
    transport
      .mockRejectedValueOnce(new Error('independent connection failure'))
      .mockResolvedValueOnce(new Response('{"retried":true}'));
    const pending = fetchWithCache(
      new Request('https://cache.test/null-retry', { signal: controller.signal }),
      { signal: null },
      1000,
      'json',
      true,
      1,
    ).catch((error: unknown) => error);
    await vi.runAllTimersAsync();
    expect(await pending).toMatchObject({ data: { retried: true } });
    expect(transport).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['replacement', 'timeout'] as const)(
    'still enforces the %s signal when the Request signal is overridden',
    async (mode) => {
      const controller = new AbortController();
      const replacement = new AbortController();
      const response = createDeferred<Response>();
      controller.abort('shadowed Request signal');
      transport.mockImplementation((_url, options: RequestInit) => {
        const onAbort = () => response.reject(options.signal?.reason);
        options.signal?.addEventListener('abort', onAbort, { once: true });
        return response.promise.finally(() =>
          options.signal?.removeEventListener('abort', onAbort),
        );
      });
      const pending = fetchWithCache(
        new Request(`https://cache.test/null-control-${mode}`, { signal: controller.signal }),
        { signal: mode === 'replacement' ? replacement.signal : null },
        1000,
        'json',
        true,
        0,
      ).catch((error: unknown) => error);
      try {
        await vi.advanceTimersByTimeAsync(0);
        expect(transport).toHaveBeenCalledOnce();
        if (mode === 'replacement') {
          replacement.abort(new Error('replacement owner stopped'));
          expect(await pending).toMatchObject({ name: 'AbortError' });
        } else {
          await vi.advanceTimersByTimeAsync(1000);
          expect(await pending).toMatchObject({ message: expect.stringContaining('timed out') });
        }
        expect(transport.mock.calls[0][1].signal.aborted).toBe(true);
      } finally {
        response.resolve(new Response('{}'));
        await pending;
      }
      expect(vi.getTimerCount()).toBe(0);
    },
  );
});
