import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import logger from '../../../src/logger';
import { HttpRateLimitError } from '../../../src/util/fetch/errors';
import { fetchWithRetries } from '../../../src/util/fetch/index';
import { createDeferred, mockProcessEnv, PROXY_ENV_KEYS } from '../utils';

import type { FetchRateLimitObservation } from '../../../src/util/fetch/index';

const transport = vi.hoisted(() => vi.fn());
vi.mock('../../../src/util/fetch/monkeyPatchFetch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/util/fetch/monkeyPatchFetch')>()),
  monkeyPatchFetch: transport,
}));
vi.mock('../../../src/logger');

const now = Date.UTC(2026, 8, 10);
const url = 'http://127.0.0.1/fetch-observation';
const success = () => new Response('ok', { status: 200 });
const rateLimit = (status = 429, headers: Record<string, string> = { 'retry-after': '5' }) =>
  new Response('{}', { status, headers });

/** Observe the existing selected wait without replacing its calculation or sleep. */
function observeSelectedWait(count = 1) {
  const selected = createDeferred<void>();
  let seen = 0;
  vi.mocked(logger.debug).mockImplementation((message) => {
    if (typeof message === 'string' && message.startsWith('Rate limited, waiting ')) {
      seen++;
      if (seen === count) {
        selected.resolve();
      }
    }
    return logger;
  });
  return selected.promise;
}

describe('explicit selected rate-limit backoff observation', () => {
  let restoreEnvironment: () => void;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(now);
    transport.mockReset();
    vi.mocked(logger.debug).mockReset();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    restoreEnvironment = mockProcessEnv({
      ...Object.fromEntries(PROXY_ENV_KEYS.map((key) => [key, undefined])),
      PROMPTFOO_REQUEST_BACKOFF_MS: '1000',
      PROMPTFOO_RETRY_5XX: 'true',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    restoreEnvironment();
  });

  it.each<{ name: string; status: number; headers: Record<string, string> }>([
    { name: 'Retry-After-only 429', status: 429, headers: { 'retry-after': '5' } },
    {
      name: 'soft200 zero/reset',
      status: 200,
      headers: { 'x-ratelimit-remaining-requests': '0', 'x-ratelimit-reset-requests': '5s' },
    },
  ])(
    'records $name before abort without moving its deadline or retrying',
    async ({ status, headers }) => {
      const response = rateLimit(status, headers);
      transport.mockResolvedValueOnce(response);
      const selected = observeSelectedWait();
      const observe = vi.fn<(event: FetchRateLimitObservation) => void>();
      const controller = new AbortController();
      const reason = Object.assign(new Error('cancel selected wait'), { name: 'AbortError' });
      const outcome = fetchWithRetries(
        url,
        { signal: controller.signal },
        10_000,
        1,
        observe,
      ).catch((error: unknown) => error);
      try {
        await selected;
        expect(observe).toHaveBeenCalledExactlyOnceWith({
          headers: Object.fromEntries(response.headers.entries()),
          status,
          resetAt: now + 5000,
        });
        const event = observe.mock.calls[0][0];
        await vi.advanceTimersByTimeAsync(2000);
        response.headers.set('retry-after', '99');
        controller.abort(reason);
        expect(await outcome).toBe(reason);
        expect(event.resetAt).toBe(now + 5000);
        expect(event.headers['retry-after']).not.toBe('99');
        expect(observe).toHaveBeenCalledOnce();
        await vi.runAllTimersAsync();
        expect(transport).toHaveBeenCalledOnce();
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        controller.abort(reason);
        await outcome;
      }
    },
  );

  it('excludes jitter from the observation while retaining the existing retry instant', async () => {
    transport.mockResolvedValueOnce(rateLimit()).mockResolvedValueOnce(success());
    const selected = observeSelectedWait();
    const observe = vi.fn<(event: FetchRateLimitObservation) => void>();
    const controller = new AbortController();
    const pending = fetchWithRetries(url, { signal: controller.signal }, 10_000, 1, observe);
    const outcome = pending.catch((error: unknown) => error);
    try {
      await selected;
      expect(observe.mock.calls[0]?.[0].resetAt).toBe(now + 5000);
      await vi.advanceTimersByTimeAsync(5499);
      expect(transport).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(1);
      await expect(pending).resolves.toMatchObject({ status: 200 });
      expect(transport).toHaveBeenCalledTimes(2);
      expect(observe).toHaveBeenCalledOnce();
    } finally {
      controller.abort();
      await outcome;
    }
  });

  it.each<{
    name: string;
    status: number;
    body: string;
    headers: Record<string, string>;
    retries: number;
  }>([
    { name: 'ordinary success', status: 200, body: '{}', headers: {}, retries: 1 },
    { name: 'exhausted429', status: 429, body: '{}', headers: { 'retry-after': '5' }, retries: 0 },
    {
      name: 'hard quota with short Retry-After',
      status: 429,
      body: '{"error":{"code":"insufficient_quota"}}',
      headers: { 'retry-after': '5' },
      retries: 3,
    },
  ])('emits nothing for $name', async ({ status, body, headers, retries }) => {
    transport.mockResolvedValueOnce(new Response(body, { status, headers }));
    const observe = vi.fn();
    const result = await fetchWithRetries(url, {}, 10_000, retries, observe).catch(
      (error: unknown) => error,
    );
    if (status === 429) {
      expect(result).toBeInstanceOf(HttpRateLimitError);
    } else {
      expect(result).toMatchObject({ status });
    }
    expect(observe).not.toHaveBeenCalled();
    expect(transport).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not emit another event for the final exhausted response', async () => {
    transport.mockResolvedValueOnce(rateLimit()).mockResolvedValueOnce(rateLimit());
    const selected = observeSelectedWait();
    const observe = vi.fn();
    const controller = new AbortController();
    const outcome = fetchWithRetries(url, { signal: controller.signal }, 10_000, 1, observe).catch(
      (error: unknown) => error,
    );
    try {
      await selected;
      await vi.advanceTimersByTimeAsync(5500);
      expect(await outcome).toBeInstanceOf(HttpRateLimitError);
      expect(observe).toHaveBeenCalledOnce();
      expect(transport).toHaveBeenCalledTimes(2);
    } finally {
      controller.abort();
      await outcome;
    }
  });

  it('does not emit for an already-aborted effective caller', async () => {
    transport.mockResolvedValueOnce(rateLimit(200, { 'x-ratelimit-remaining-requests': '0' }));
    const controller = new AbortController();
    const reason = Object.assign(new Error('already cancelled'), { name: 'AbortError' });
    controller.abort(reason);
    const observe = vi.fn();
    await expect(
      fetchWithRetries(url, { signal: controller.signal }, 10_000, 1, observe),
    ).rejects.toBe(reason);
    expect(observe).not.toHaveBeenCalled();
    expect(transport).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['network', '5xx'] as const)(
    'does not report generic %s backoff as rate-limit quota',
    async (kind) => {
      if (kind === 'network') {
        transport.mockRejectedValueOnce(new Error('temporary network failure'));
      } else {
        transport.mockResolvedValueOnce(new Response('unavailable', { status: 503 }));
      }
      transport.mockResolvedValueOnce(success());
      const observe = vi.fn();
      const controller = new AbortController();
      const pending = fetchWithRetries(url, { signal: controller.signal }, 10_000, 1, observe);
      const outcome = pending.catch((error: unknown) => error);
      try {
        await vi.advanceTimersByTimeAsync(0);
        expect(transport).toHaveBeenCalledOnce();
        expect(observe).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(1500);
        await expect(pending).resolves.toMatchObject({ status: 200 });
        expect(transport).toHaveBeenCalledTimes(2);
        expect(observe).not.toHaveBeenCalled();
      } finally {
        controller.abort();
        await outcome;
      }
    },
  );

  it('emits nothing while a 429 body is held or after its owner aborts', async () => {
    let body!: ReadableStreamDefaultController<Uint8Array>;
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(stream) {
          body = stream;
        },
      }),
      { status: 429, headers: { 'retry-after': '5' } },
    );
    transport.mockResolvedValueOnce(response);
    const peekStarted = createDeferred<void>();
    const clone = response.clone.bind(response);
    vi.spyOn(response, 'clone').mockImplementation(() => {
      peekStarted.resolve();
      return clone();
    });
    const observe = vi.fn();
    const controller = new AbortController();
    const reason = Object.assign(new Error('cancel incomplete429'), { name: 'AbortError' });
    const outcome = fetchWithRetries(url, { signal: controller.signal }, 10_000, 1, observe).catch(
      (error: unknown) => error,
    );
    try {
      await peekStarted.promise;
      expect(observe).not.toHaveBeenCalled();
      controller.abort(reason);
      body.error(reason);
      expect(await outcome).toBe(reason);
      expect(observe).not.toHaveBeenCalled();
      expect(transport).toHaveBeenCalledOnce();
    } finally {
      controller.abort(reason);
      body.error(reason);
      await outcome;
    }
  });

  it.each(['inherited', 'explicit', 'null'] as const)(
    'respects the %s Request signal for a selected wait',
    async (mode) => {
      transport.mockResolvedValueOnce(rateLimit()).mockResolvedValueOnce(success());
      const requestOwner = new AbortController();
      const explicitOwner = new AbortController();
      const request = new Request(url, { signal: requestOwner.signal });
      const options =
        mode === 'inherited' ? {} : { signal: mode === 'null' ? null : explicitOwner.signal };
      const selected = observeSelectedWait();
      const observe = vi.fn();
      const pending = fetchWithRetries(request, options, 10_000, 1, observe);
      const outcome = pending.catch((error: unknown) => error);
      try {
        await selected;
        expect(observe).toHaveBeenCalledOnce();
        const reason = Object.assign(new Error('Request owner cancelled'), { name: 'AbortError' });
        requestOwner.abort(reason);
        if (mode === 'inherited') {
          expect(await outcome).toBe(reason);
          expect(transport).toHaveBeenCalledOnce();
        } else {
          await vi.advanceTimersByTimeAsync(5500);
          await expect(pending).resolves.toMatchObject({ status: 200 });
          expect(transport).toHaveBeenCalledTimes(2);
        }
        expect(observe.mock.calls[0][0].resetAt).toBe(now + 5000);
      } finally {
        requestOwner.abort();
        explicitOwner.abort();
        await vi.runAllTimersAsync();
        await outcome;
      }
    },
  );

  it('does not notify an observer about a concurrent fetch that omitted it', async () => {
    const softLimit = () =>
      rateLimit(200, {
        'x-ratelimit-remaining-requests': '0',
        'x-ratelimit-reset-requests': '5s',
      });
    transport.mockImplementation(async () => softLimit());
    const selected = observeSelectedWait(2);
    const observe = vi.fn();
    const targetOwner = new AbortController();
    const auxiliaryOwner = new AbortController();
    const target = fetchWithRetries(url, { signal: targetOwner.signal }, 10_000, 1, observe).catch(
      (error: unknown) => error,
    );
    const auxiliary = fetchWithRetries(
      `${url}/auxiliary`,
      { signal: auxiliaryOwner.signal },
      10_000,
      1,
    ).catch((error: unknown) => error);
    try {
      await selected;
      expect(observe).toHaveBeenCalledOnce();
      expect(observe.mock.calls[0][0]).toMatchObject({ status: 200, resetAt: now + 5000 });
    } finally {
      targetOwner.abort();
      auxiliaryOwner.abort();
      await Promise.all([target, auxiliary]);
    }
    expect(transport).toHaveBeenCalledTimes(2);
  });
});
