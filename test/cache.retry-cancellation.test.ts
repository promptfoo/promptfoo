import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache, withCacheEnabled } from '../src/cache';
import { clearAgentCache } from '../src/util/fetch/index';
import { withFetchRetryContext } from '../src/util/fetch/retryContext';

const transport = vi.hoisted(() => vi.fn());
vi.mock('../src/util/fetch/monkeyPatchFetch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/util/fetch/monkeyPatchFetch')>()),
  monkeyPatchFetch: transport,
}));
vi.mock('../src/logger');

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

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
      const started = deferred<void>();
      const release = deferred<Response>();
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
    const started = deferred<void>();
    const release = deferred<Response>();
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
