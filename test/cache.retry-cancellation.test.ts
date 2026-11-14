import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache, withCacheEnabled } from '../src/cache';
import { clearAgentCache } from '../src/util/fetch/index';
import { withFetchRetryContext } from '../src/util/fetch/retryContext';
import { createDeferred } from './util/utils';

const transport = vi.hoisted(() => vi.fn());
vi.mock('../src/util/fetch/monkeyPatchFetch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/util/fetch/monkeyPatchFetch')>()),
  monkeyPatchFetch: transport,
}));
vi.mock('../src/logger');

describe('fetchWithCache retry budget and Request cancellation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    transport.mockReset();
  });

  afterEach(() => {
    clearAgentCache();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it.each([
    { explicit: 0, context: undefined, attempts: 1 },
    { explicit: undefined, context: 0, attempts: 1 },
    { explicit: 1, context: 0, attempts: 2 },
    { explicit: undefined, context: 1, attempts: 2 },
    { explicit: undefined, context: undefined, attempts: 3 },
  ])(
    'limits body-read attempts to $attempts with explicit=$explicit and context=$context',
    async ({ explicit, context, attempts }) => {
      const bodyError = new Error('ECONNRESET while reading response');
      transport.mockImplementation(
        async () =>
          new Response(
            new ReadableStream({
              start(controller) {
                controller.error(bodyError);
              },
            }),
            { status: 200, statusText: 'OK' },
          ),
      );

      const outcome = withFetchRetryContext(context, () =>
        fetchWithCache('https://cache.test/retry-budget', {}, 10_000, 'json', true, explicit),
      ).catch((error: unknown) => error);
      await vi.runAllTimersAsync();

      expect(await outcome).toMatchObject({ cause: bodyError });
      expect(transport).toHaveBeenCalledTimes(attempts);
    },
  );

  it.each(['bust', 'disabled'] as const)(
    'forwards an in-flight Request signal through the %s transport path',
    async (bypass) => {
      const controller = new AbortController();
      const reason = new Error('request owner stopped');
      const started = createDeferred<void>();
      const release = createDeferred<Response>();
      let transportSignal: AbortSignal | null | undefined;
      transport.mockImplementation((_url, options: RequestInit) => {
        transportSignal = options.signal;
        started.resolve();
        return new Promise<Response>((resolve, reject) => {
          options.signal?.addEventListener('abort', () => reject(options.signal?.reason), {
            once: true,
          });
          release.promise.then(resolve, reject);
        });
      });
      const request = new Request('https://cache.test/request-signal', {
        signal: controller.signal,
      });
      const outcome = withCacheEnabled(bypass !== 'disabled', () =>
        fetchWithCache(request, {}, 10_000, 'json', bypass === 'bust', 0),
      ).catch((error: unknown) => error);

      try {
        await started.promise;
        controller.abort(reason);
        expect(transportSignal?.aborted).toBe(true);
        expect(await outcome).toMatchObject({ name: 'AbortError', message: reason.message });
        expect(transport).toHaveBeenCalledOnce();
      } finally {
        release.resolve(new Response('{}'));
        await outcome;
      }
    },
  );

  it('lets an explicit RequestInit signal override the Request signal', async () => {
    const requestOwner = new AbortController();
    const explicitOwner = new AbortController();
    const started = createDeferred<void>();
    const release = createDeferred<Response>();
    let transportSignal: AbortSignal | null | undefined;
    transport.mockImplementation((_url, options: RequestInit) => {
      transportSignal = options.signal;
      started.resolve();
      return release.promise;
    });
    const pending = fetchWithCache(
      new Request('https://cache.test/override', { signal: requestOwner.signal }),
      { signal: explicitOwner.signal },
      10_000,
      'json',
      true,
      0,
    );
    try {
      await started.promise;
      requestOwner.abort('shadowed request signal');
      expect(transportSignal?.aborted).toBe(false);
      release.resolve(new Response('{"ok":true}'));
      await expect(pending).resolves.toMatchObject({ data: { ok: true }, cached: false });
    } finally {
      release.resolve(new Response('{}'));
      await pending;
    }
  });

  it.each([
    { status: 200, body: { ok: true }, expected: { data: { ok: true } } },
    {
      status: 429,
      body: { error: { code: 'insufficient_quota' } },
      expected: { kind: 'quota', code: 'insufficient_quota' },
    },
  ])(
    'reads an HTTP $status body with a templated request timeout',
    async ({ status, body, expected }) => {
      const clock = vi.spyOn(performance, 'now').mockReturnValue(10.5);
      transport.mockImplementation(() => {
        clock.mockReturnValue(12.5);
        return Response.json(body, { status });
      });
      const result = await fetchWithCache(
        'https://cache.test/templated-timeout',
        {},
        '650',
        'json',
        true,
        0,
      ).catch((error: unknown) => error);

      expect(result).toMatchObject(expected);
    },
  );

  it.each([
    {
      status: 200,
      headers: undefined,
      maxRetries: 2,
      expected: { message: expect.stringMatching(/timed out after 1000 ms/i) },
    },
    {
      status: 429,
      headers: { 'Retry-After': '7' },
      maxRetries: 0,
      expected: { name: 'HttpRateLimitError', status: 429, kind: 'rate_limit', retryAfterMs: 7000 },
    },
  ])(
    'aborts a partial HTTP $status POST response at the original request deadline',
    async ({ status, headers, maxRetries, expected }) => {
      const headersReady = createDeferred<void>();
      let wireSignal: AbortSignal | null | undefined;
      transport.mockImplementation(async (_url, options: RequestInit) => {
        wireSignal = options.signal;
        await headersReady.promise;
        return new Response(
          new ReadableStream<Uint8Array>({
            start(stream) {
              stream.enqueue(new TextEncoder().encode('partial body'));
              options.signal?.addEventListener(
                'abort',
                () => stream.error(options.signal?.reason),
                {
                  once: true,
                },
              );
            },
          }),
          { status, headers },
        );
      });
      const outcome = fetchWithCache(
        'https://cache.test/stalled-body',
        { method: 'POST' },
        1000,
        'text',
        true,
        maxRetries,
      ).catch((error: unknown) => error);

      await vi.advanceTimersByTimeAsync(600);
      headersReady.resolve();
      await vi.advanceTimersByTimeAsync(399);
      expect(wireSignal?.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);

      expect(wireSignal?.aborted).toBe(true);
      expect(await outcome).toMatchObject(expected);
      expect(transport).toHaveBeenCalledOnce();
    },
  );

  it.each([
    [100, 1000],
    [1000, 100],
  ])(
    'isolates concurrent %i ms and %i ms deadlines but shares the stored result',
    async (first, second) => {
      const releaseBody = createDeferred<void>();
      transport.mockImplementation(
        () =>
          new Response(
            new ReadableStream<Uint8Array>({
              async start(stream) {
                await releaseBody.promise;
                stream.enqueue(new TextEncoder().encode('ok'));
                stream.close();
              },
            }),
          ),
      );
      const read = (timeout: number) =>
        fetchWithCache(
          `https://cache.test/shared-deadline/${first}`,
          {},
          timeout,
          'text',
          false,
          0,
        );
      const leader = read(first);
      await vi.advanceTimersByTimeAsync(0);
      const follower = read(second);
      const outcomes = Promise.allSettled(first < second ? [leader, follower] : [follower, leader]);

      await vi.advanceTimersByTimeAsync(200);
      releaseBody.resolve();

      expect(await outcomes).toMatchObject([
        {
          status: 'rejected',
          reason: { message: expect.stringMatching(/timed out after 100 ms/i) },
        },
        { status: 'fulfilled', value: { data: 'ok', cached: false } },
      ]);
      await expect(read(100)).resolves.toMatchObject({ data: 'ok', cached: true });
      expect(transport).toHaveBeenCalledTimes(2);
    },
  );

  it('coalesces equal numeric and templated deadlines into one transport', async () => {
    const release = createDeferred<void>();
    transport.mockImplementation(async () => {
      await release.promise;
      return new Response('ok');
    });
    const url = 'https://cache.test/equivalent-deadlines';
    const leader = fetchWithCache(url, {}, 1000, 'text');
    await vi.advanceTimersByTimeAsync(0);
    const follower = fetchWithCache(url, {}, '1e3', 'text');
    await vi.advanceTimersByTimeAsync(0);
    release.resolve();

    const outcomes = await Promise.all([leader, follower]);
    expect(transport).toHaveBeenCalledOnce();
    expect(outcomes).toMatchObject([{ data: 'ok' }, { data: 'ok', coalesced: true }]);
  });

  it('retries a GET whose response body hits its deadline', async () => {
    transport
      .mockResolvedValueOnce(new Response(new ReadableStream()))
      .mockResolvedValueOnce(new Response('ok'));
    const outcome = fetchWithCache(
      'https://cache.test/stalled-get',
      {},
      100,
      'text',
      true,
      1,
    ).catch((error: unknown) => error);

    await vi.runAllTimersAsync();

    expect(await outcome).toMatchObject({ data: 'ok' });
    expect(transport).toHaveBeenCalledTimes(2);
    expect(transport.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it('does not replay a consumed PUT request body when its response stalls', async () => {
    const request = new Request('https://cache.test/single-use-put', {
      method: 'PUT',
      body: 'data',
    });
    transport.mockImplementationOnce(async () => {
      await request.text();
      return new Response(new ReadableStream());
    });
    const outcome = fetchWithCache(request, {}, 100, 'text', true, 1).catch(
      (error: unknown) => error,
    );

    await vi.runAllTimersAsync();

    expect(await outcome).toMatchObject({
      message: expect.stringContaining('timed out after 100 ms'),
    });
    expect(request.bodyUsed).toBe(true);
    expect(transport).toHaveBeenCalledOnce();
  });

  it('gives a successful retry its own deadline and clears it when the body finishes', async () => {
    let retrySignal: AbortSignal | null | undefined;
    transport
      .mockRejectedValueOnce(new Error('connection reset'))
      .mockImplementationOnce(async (_url, options: RequestInit) => {
        retrySignal = options.signal;
        return new Response(
          new ReadableStream<Uint8Array>({
            start(stream) {
              setTimeout(() => {
                stream.enqueue(new TextEncoder().encode('ok'));
                stream.close();
              }, 500);
            },
          }),
        );
      });
    const pending = fetchWithCache('https://cache.test/retry-body', {}, 1000, 'text', true, 1);
    const result = expect(pending).resolves.toMatchObject({ data: 'ok' });

    await vi.runAllTimersAsync();

    await result;
    expect(transport).toHaveBeenCalledTimes(2);
    expect(retrySignal?.aborted).toBe(false);
  });

  it('stops a pending body retry before another transport dispatch', async () => {
    const controller = new AbortController();
    const reason = new Error('stop retrying this request');
    transport.mockImplementation(
      async () =>
        new Response(
          new ReadableStream({
            start(stream) {
              stream.error(new Error('ECONNRESET while reading response'));
            },
          }),
        ),
    );
    const outcome = fetchWithCache(
      'https://cache.test/retry-abort',
      {
        signal: controller.signal,
      },
      10_000,
      'json',
      true,
    ).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(0);
    expect(transport).toHaveBeenCalledOnce();

    controller.abort(reason);
    expect(await outcome).toMatchObject({
      name: 'AbortError',
      message: reason.message,
      cause: reason,
    });
    await vi.runAllTimersAsync();
    expect(transport).toHaveBeenCalledOnce();
  });

  it('preserves an independent body failure after abort without retrying it', async () => {
    const controller = new AbortController();
    const bodyError = new Error('ECONNRESET from an independent body failure');
    let body!: ReadableStreamDefaultController;
    transport.mockImplementation(
      async () =>
        new Response(
          new ReadableStream({
            start(stream) {
              body = stream;
            },
          }),
        ),
    );
    const outcome = fetchWithCache(
      'https://cache.test/failed-body-abort',
      {
        signal: controller.signal,
      },
      10_000,
      'json',
      true,
    ).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(0);
    controller.abort(new Error('independent caller cancellation'));
    body.error(bodyError);

    expect(await outcome).toMatchObject({ cause: bodyError });
    expect(transport).toHaveBeenCalledOnce();
  });
});
