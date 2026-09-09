import { randomUUID } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCacheTtlMs, withCacheEnabled, withCacheNamespace } from '../../src/cache';
import { loadApiProvider } from '../../src/providers';
import { wrapProviderWithRateLimiting } from '../../src/scheduler/providerWrapper';
import { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';
import { SlotQueue } from '../../src/scheduler/slotQueue';
import { createDeferred, mockProcessEnv } from '../util/utils';

import type { ApiProvider } from '../../src/types';

const resetWindowMs = 60_000;
const cacheAgeMs = 61_000;
const quotaHeaders = {
  'content-type': 'application/json',
  'x-request-id': 'original-quota-window',
  'ratelimit-limit': '10',
  'ratelimit-remaining': '0',
  'ratelimit-reset': '60',
};
const toolPayload = {
  choices: [
    {
      message: {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: 'call-held', type: 'function', function: { name: 'held', arguments: '{}' } },
        ],
      },
      finish_reason: 'tool_calls',
    },
  ],
  usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
};

function successResponse() {
  return new Response(
    JSON.stringify({
      choices: [
        { message: { role: 'assistant', content: 'live B output' }, finish_reason: 'stop' },
      ],
    }),
    { headers: { 'content-type': 'application/json' } },
  );
}

describe('Chat cached quota through the real rate-limit wrapper', () => {
  const providers: ApiProvider[] = [];
  const registries: RateLimitRegistry[] = [];
  let restoreEnvironment: () => void;
  let namespace: string;

  beforeEach(() => {
    restoreEnvironment = mockProcessEnv({
      PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER: 'false',
      PROMPTFOO_RETRY_5XX: 'false',
      PROMPTFOO_CACHE_TTL: '120',
    });
    namespace = randomUUID();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-09T12:00:00.000Z'));
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected fixture request'));
  });

  afterEach(async () => {
    for (const registry of registries.splice(0)) {
      registry.dispose();
    }
    for (const provider of providers.splice(0)) {
      await provider.cleanup?.();
    }
    vi.restoreAllMocks();
    restoreEnvironment();
    vi.useRealTimers();
  });

  function withEnabledCache<T>(run: () => Promise<T>) {
    return withCacheNamespace(namespace, () => withCacheEnabled(true, run));
  }

  function quotaResponse(events: string[], label: string) {
    const response = new Response(JSON.stringify(toolPayload), {
      status: 200,
      statusText: 'OK',
      headers: quotaHeaders,
    });
    const read = response.text.bind(response);
    response.text = async () => {
      const text = await read();
      events.push(`${label} body complete`);
      return text;
    };
    return response;
  }

  async function warmCache() {
    const events: string[] = [];
    const callbackStarted = createDeferred<void>();
    const callbackResult = createDeferred<string>();
    const callback = vi
      .fn<() => Promise<string>>()
      .mockImplementationOnce(async () => {
        events.push('warmup callback completed');
        return 'warmup callback output';
      })
      .mockImplementationOnce(() => {
        events.push('A callback started');
        callbackStarted.resolve();
        return callbackResult.promise;
      });
    const target = await loadApiProvider('openai:chat:gpt-4o-mini', {
      options: {
        config: {
          apiBaseUrl: 'https://cached-quota.fixture.test/v1',
          apiKey: 'fixture-key',
          maxRetries: 2,
          functionToolCallbacks: { held: callback },
        },
      },
    });
    providers.push(target);
    const response = quotaResponse(events, 'warmup');
    const warmupStartedAt = Date.now();
    vi.mocked(globalThis.fetch).mockImplementationOnce(async () => {
      events.push('warmup dispatched');
      return response;
    });
    const warmup = await withEnabledCache(() => target.callApi('cached A prompt'));
    expect(warmup).toMatchObject({
      output: 'warmup callback output',
      cached: false,
      metadata: { http: { status: 200, statusText: 'OK', headers: quotaHeaders } },
    });
    expect(response.bodyUsed).toBe(true);
    expect(callback).toHaveBeenCalledOnce();
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    expect(events).toEqual([
      'warmup dispatched',
      'warmup body complete',
      'warmup callback completed',
    ]);

    // The real provider window has expired, while the real cache entry is live.
    expect(cacheAgeMs).toBeGreaterThan(resetWindowMs);
    expect(cacheAgeMs).toBeLessThan(getCacheTtlMs());
    await vi.advanceTimersByTimeAsync(cacheAgeMs);
    expect(Date.now()).toBe(warmupStartedAt + cacheAgeMs);
    events.push('original quota window expired');
    const registry = new RateLimitRegistry({ maxConcurrency: 1 });
    registries.push(registry);
    return {
      events,
      callback,
      callbackStarted,
      callbackResult,
      registry,
      wrapped: wrapProviderWithRateLimiting(target, registry),
    };
  }

  it.each([
    { source: 'cache hit', reasonName: 'AbortError' },
    { source: 'cache hit', reasonName: 'AbortException' },
    { source: 'cache hit', reasonName: 'Error' },
    { source: 'fresh response', reasonName: 'AbortError' },
  ])(
    'uses only fresh completed quota after cancelled $source with $reasonName',
    async ({ source, reasonName }) => {
      const { events, callback, callbackStarted, callbackResult, registry, wrapped } =
        await warmCache();
      const firstController = new AbortController();
      const secondController = new AbortController();
      const reason = Object.freeze(
        Object.assign(new Error('custom held callback cancellation'), { name: reasonName }),
      );
      const fresh = source === 'fresh response';
      const firstStartedAt = Date.now();
      const freshResetAt = firstStartedAt + resetWindowMs;
      const release = vi.spyOn(SlotQueue.prototype, 'release');
      const learned = vi.fn();
      const retrying = vi.fn();
      registry.on('ratelimit:learned', learned);
      registry.on('request:retrying', retrying);
      const secondTransport = createDeferred<Response>();
      let secondDispatchAt: number | undefined;
      if (fresh) {
        const response = quotaResponse(events, 'A fresh');
        vi.mocked(globalThis.fetch).mockImplementationOnce(async () => {
          events.push('A fresh dispatched');
          return response;
        });
      }
      vi.mocked(globalThis.fetch).mockImplementationOnce(() => {
        events.push('B dispatched');
        secondDispatchAt = Date.now();
        return secondTransport.promise;
      });
      const first = withEnabledCache(() =>
        wrapped.callApi(fresh ? 'fresh A prompt' : 'cached A prompt', undefined, {
          abortSignal: firstController.signal,
        }),
      ).catch((error: unknown) => error);
      let second: Promise<unknown> | undefined;
      try {
        await callbackStarted.promise;
        // A's cached path has no transport beyond the completed warmup request.
        expect(globalThis.fetch).toHaveBeenCalledTimes(fresh ? 2 : 1);
        expect(callback).toHaveBeenCalledTimes(2);
        expect(events.at(-1)).toBe('A callback started');
        await vi.advanceTimersByTimeAsync(1000);
        firstController.abort(reason);
        events.push('A aborted');
        second = withEnabledCache(() =>
          wrapped.callApi('distinct live B prompt', undefined, {
            abortSignal: secondController.signal,
          }),
        ).catch((error: unknown) => error);
        events.push('B queued');
        expect(Object.values(registry.getMetrics())).toHaveLength(1);
        expect(Object.values(registry.getMetrics())[0]).toMatchObject({
          activeRequests: 1,
          queueDepth: 1,
          totalRequests: 2,
        });
        expect(release).not.toHaveBeenCalled();
        expect(secondController.signal.aborted).toBe(false);

        await vi.advanceTimersByTimeAsync(100);
        events.push('A callback settled');
        callbackResult.resolve('held callback output');
        await vi.advanceTimersByTimeAsync(0);
        const firstResult = await first;
        if (reasonName === 'Error') {
          expect(firstResult).toMatchObject({
            name: 'AbortError',
            message: reason.message,
            cause: reason,
          });
        } else {
          expect(firstResult).toBe(reason);
        }
        expect(reason.name).toBe(reasonName);
        expect(Object.isFrozen(reason)).toBe(true);
        expect(release).toHaveBeenCalledOnce();
        expect(callback).toHaveBeenCalledTimes(2);
        if (fresh) {
          expect(secondDispatchAt).toBeUndefined();
          expect(learned).toHaveBeenCalledOnce();
          expect(Object.values(registry.getMetrics())[0]).toMatchObject({
            activeRequests: 0,
            queueDepth: 1,
          });
          await vi.advanceTimersByTimeAsync(freshResetAt - Date.now() - 1);
          expect(secondDispatchAt).toBeUndefined();
          await vi.advanceTimersByTimeAsync(1);
          expect(secondDispatchAt).toBe(freshResetAt);
        } else {
          // Do not advance through a replayed window to make this assertion pass.
          expect(secondDispatchAt).toBe(firstStartedAt + 1100);
          expect(learned).not.toHaveBeenCalled();
        }
        expect(events.indexOf('B dispatched')).toBeGreaterThan(
          events.indexOf('A callback settled'),
        );
        expect(secondController.signal.aborted).toBe(false);
        expect(Object.values(registry.getMetrics())[0]).toMatchObject({
          activeRequests: 1,
          queueDepth: 0,
        });
        expect(globalThis.fetch).toHaveBeenCalledTimes(fresh ? 3 : 2);
        secondTransport.resolve(successResponse());
        await expect(second).resolves.toMatchObject({ output: 'live B output', cached: false });
        expect(release).toHaveBeenCalledTimes(2);
        expect(retrying).not.toHaveBeenCalled();
        expect(Object.values(registry.getMetrics())[0]).toMatchObject({
          activeRequests: 0,
          queueDepth: 0,
          totalRequests: 2,
          completedRequests: 1,
          failedRequests: 1,
          retriedRequests: 0,
          rateLimitHits: 0,
        });
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        // RED can leave B behind the erroneous quota window. Cancel and observe it
        // without advancing the verification clock through that window.
        firstController.abort(reason);
        secondController.abort(new DOMException('fixture cleanup', 'AbortError'));
        callbackResult.resolve('cleanup');
        secondTransport.resolve(successResponse());
        await Promise.all([first, second]);
      }
    },
  );

  it('retains metadata and existing final-header learning for an uncancelled cache hit', async () => {
    const { callback, callbackStarted, callbackResult, registry, wrapped } = await warmCache();
    const firstController = new AbortController();
    const secondController = new AbortController();
    const release = vi.spyOn(SlotQueue.prototype, 'release');
    const learned = vi.fn();
    const retrying = vi.fn();
    registry.on('ratelimit:learned', learned);
    registry.on('request:retrying', retrying);
    const resetAt = Date.now() + resetWindowMs;
    let secondDispatchAt: number | undefined;
    vi.mocked(globalThis.fetch).mockImplementationOnce(async () => {
      secondDispatchAt = Date.now();
      return successResponse();
    });
    const first = withEnabledCache(() =>
      wrapped.callApi('cached A prompt', undefined, { abortSignal: firstController.signal }),
    );
    let second: Promise<unknown> | undefined;
    try {
      await callbackStarted.promise;
      expect(globalThis.fetch).toHaveBeenCalledOnce();
      callbackResult.resolve('cached callback output');
      await expect(first).resolves.toMatchObject({
        output: 'cached callback output',
        cached: true,
        metadata: { http: { status: 200, statusText: 'OK', headers: quotaHeaders } },
      });
      expect(release).toHaveBeenCalledOnce();
      expect(learned).toHaveBeenCalledOnce();
      expect(callback).toHaveBeenCalledTimes(2);
      second = withEnabledCache(() =>
        wrapped.callApi('distinct live B prompt', undefined, {
          abortSignal: secondController.signal,
        }),
      ).catch((error: unknown) => error);
      expect(Object.values(registry.getMetrics())).toHaveLength(1);
      expect(Object.values(registry.getMetrics())[0]).toMatchObject({
        activeRequests: 0,
        queueDepth: 1,
      });
      await vi.advanceTimersByTimeAsync(resetWindowMs - 1);
      expect(secondDispatchAt).toBeUndefined();
      await vi.advanceTimersByTimeAsync(1);
      await expect(second).resolves.toMatchObject({ output: 'live B output', cached: false });
      expect(secondDispatchAt).toBe(resetAt);
      expect(secondController.signal.aborted).toBe(false);
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
      expect(release).toHaveBeenCalledTimes(2);
      expect(retrying).not.toHaveBeenCalled();
      expect(Object.values(registry.getMetrics())[0]).toMatchObject({
        activeRequests: 0,
        queueDepth: 0,
        totalRequests: 2,
        completedRequests: 2,
        failedRequests: 0,
        retriedRequests: 0,
      });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      firstController.abort(new DOMException('fixture cleanup', 'AbortError'));
      secondController.abort(new DOMException('fixture cleanup', 'AbortError'));
      callbackResult.resolve('cleanup');
      await Promise.allSettled([first, second]);
    }
  });
});
