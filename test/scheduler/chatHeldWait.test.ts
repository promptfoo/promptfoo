import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withCacheEnabled } from '../../src/cache';
import { loadApiProvider } from '../../src/providers';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { wrapProviderWithRateLimiting } from '../../src/scheduler/providerWrapper';
import { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';
import { SlotQueue } from '../../src/scheduler/slotQueue';
import { createDeferred, mockProcessEnv } from '../util/utils';

import type { ApiProvider } from '../../src/types/providers';

const responseHeaders = {
  'content-type': 'application/json',
  'x-request-id': 'held-callback-scheduler-fixture',
};
const usage = { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 };
const toolPayload = {
  choices: [
    {
      message: {
        role: 'assistant',
        content: null,
        tool_calls: [
          { id: 'call-held', type: 'function', function: { name: 'held', arguments: '{}' } },
          { id: 'call-later', type: 'function', function: { name: 'later', arguments: '{}' } },
        ],
      },
      finish_reason: 'tool_calls',
    },
  ],
  usage,
};
const successPayload = {
  choices: [{ message: { role: 'assistant', content: 'live B output' }, finish_reason: 'stop' }],
  usage,
};

describe('public Chat callback cancellation releases its scheduler wait', () => {
  let restoreEnvironment: () => void;
  const registries: RateLimitRegistry[] = [];
  const providers: ApiProvider[] = [];
  const controllers: AbortController[] = [];
  const pendingCalls: Promise<unknown>[] = [];
  const settleCallbacks: (() => void)[] = [];

  beforeEach(() => {
    restoreEnvironment = mockProcessEnv({
      OPENAI_API_KEY: 'fixture-key',
      PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER: 'false',
      PROMPTFOO_DISABLE_REMOTE_GENERATION: 'true',
      PROMPTFOO_RETRY_5XX: 'false',
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-09T12:00:00.000Z'));
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected fixture request'));
  });

  afterEach(async () => {
    for (const controller of controllers.splice(0)) {
      controller.abort();
    }
    for (const settle of settleCallbacks.splice(0)) {
      settle();
    }
    const drained = Promise.allSettled(pendingCalls.splice(0));
    await vi.advanceTimersByTimeAsync(0);
    await drained;
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

  it.each([
    { exhausted: false, late: 'resolve' },
    { exhausted: false, late: 'reject' },
    { exhausted: true, late: 'resolve' },
    { exhausted: true, late: 'reject' },
  ] as const)(
    'releases A before callback settlement and respects quota for live B (exhausted=$exhausted, late=$late)',
    async ({ exhausted, late }) => {
      const started = createDeferred<void>();
      const callbackResult = createDeferred<string>();
      settleCallbacks.push(() => callbackResult.resolve('callback cleanup'));
      const events: string[] = [];
      let callbackSettled = false;
      const callback = vi.fn(async () => {
        events.push('A callback started');
        started.resolve();
        try {
          return await callbackResult.promise;
        } finally {
          callbackSettled = true;
          events.push('A callback settled');
        }
      });
      const laterCallback = vi.fn(() => 'must not run after cancellation');
      const target = await loadApiProvider('openai:chat:gpt-4o-mini', {
        options: {
          config: {
            apiBaseUrl: 'https://held-callback.fixture.test/v1',
            apiKey: 'fixture-key',
            maxRetries: 0,
            functionToolCallbacks: { held: callback, later: laterCallback },
          },
        },
      });
      providers.push(target);
      expect(target).toBeInstanceOf(OpenAiChatCompletionProvider);
      const registry = new RateLimitRegistry({ maxConcurrency: 1 });
      registries.push(registry);
      const wrapped = wrapProviderWithRateLimiting(target, registry);
      const firstController = new AbortController();
      const secondController = new AbortController();
      controllers.push(firstController, secondController);
      const cause = Object.freeze(new Error('original caller cause'));
      const reason = Object.freeze(
        Object.assign(new Error('caller stopped the active callback', { cause }), {
          name: late === 'reject' ? 'AbortException' : 'AbortError',
        }),
      );
      const originalRelease = SlotQueue.prototype.release;
      const release = vi.spyOn(SlotQueue.prototype, 'release').mockImplementation(function (
        this: SlotQueue,
      ) {
        events.push('slot released');
        return originalRelease.call(this);
      });
      const updateQuota = vi.spyOn(SlotQueue.prototype, 'updateRateLimitState');
      const observed = vi.fn(() => events.push('A headers observed'));
      const learned = vi.fn();
      const retrying = vi.fn();
      registry.on('ratelimit:learned', learned);
      registry.on('request:retrying', retrying);
      const resetAt = Date.now() + 1500;
      const emptyQuotaState = {
        remainingRequests: undefined,
        remainingTokens: undefined,
        limitRequests: undefined,
        limitTokens: undefined,
      };
      const firstQuotaState = exhausted
        ? { ...emptyQuotaState, remainingRequests: 0, limitRequests: 10, resetAt }
        : emptyQuotaState;
      const firstHeaders = exhausted
        ? {
            ...responseHeaders,
            'ratelimit-limit': '10',
            'ratelimit-remaining': '0',
            'ratelimit-reset': new Date(resetAt).toISOString(),
          }
        : responseHeaders;
      // Both response bodies are native and static. Callback entry proves A's
      // real parser completed before caller cancellation; no response mutator
      // creates the ordering being tested.
      const firstResponse = new Response(JSON.stringify(toolPayload), {
        status: 200,
        statusText: 'OK',
        headers: firstHeaders,
      });
      const secondResponse = new Response(JSON.stringify(successPayload), {
        status: 200,
        statusText: 'OK',
        headers: responseHeaders,
      });
      let secondDispatchAt: number | undefined;
      vi.mocked(globalThis.fetch)
        .mockImplementationOnce(async () => {
          events.push('A dispatched');
          return firstResponse;
        })
        .mockImplementationOnce(async () => {
          events.push('B dispatched');
          secondDispatchAt = Date.now();
          return secondResponse;
        });

      let firstSettled = false;
      const first = withCacheEnabled(false, () =>
        wrapped.callApi('held A', undefined, {
          abortSignal: firstController.signal,
          onResponseHeaders: observed,
        }),
      )
        .catch((error: unknown) => error)
        .then((result) => {
          firstSettled = true;
          return result;
        });
      pendingCalls.push(first);
      await started.promise;
      expect(firstResponse.bodyUsed).toBe(true);
      expect(callbackSettled).toBe(false);
      expect(observed).toHaveBeenCalledOnce();
      expect(observed).toHaveBeenCalledWith(firstHeaders);
      expect(updateQuota).toHaveBeenCalledOnce();
      expect(updateQuota).toHaveBeenNthCalledWith(1, firstQuotaState);
      expect(release).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1000);

      const second = withCacheEnabled(false, () =>
        wrapped.callApi('live B', undefined, { abortSignal: secondController.signal }),
      );
      pendingCalls.push(second);
      expect(Object.values(registry.getMetrics())).toHaveLength(1);
      expect(Object.values(registry.getMetrics())[0]).toMatchObject({
        activeRequests: 1,
        queueDepth: 1,
        totalRequests: 2,
      });
      firstController.abort(reason);
      events.push('A aborted');
      await vi.advanceTimersByTimeAsync(0);

      // Fail deterministically before awaiting first: neither the callback nor
      // its eventual failure may hold the caller's promise or scheduler slot.
      expect(firstSettled).toBe(true);
      expect(await first).toBe(reason);
      expect(reason.cause).toBe(cause);
      expect(callbackSettled).toBe(false);
      expect(laterCallback).not.toHaveBeenCalled();
      expect(secondController.signal.aborted).toBe(false);
      expect(observed.mock.invocationCallOrder[0]).toBeLessThan(
        release.mock.invocationCallOrder[0],
      );
      expect(updateQuota.mock.invocationCallOrder[0]).toBeLessThan(
        release.mock.invocationCallOrder[0],
      );
      if (exhausted) {
        expect(release).toHaveBeenCalledOnce();
        expect(globalThis.fetch).toHaveBeenCalledOnce();
        expect(updateQuota).toHaveBeenCalledOnce();
        expect(learned).toHaveBeenCalledOnce();
        expect(updateQuota).toHaveBeenCalledWith({
          remainingRequests: 0,
          remainingTokens: undefined,
          limitRequests: 10,
          limitTokens: undefined,
          resetAt,
        });
        expect(updateQuota.mock.invocationCallOrder[0]).toBeLessThan(
          release.mock.invocationCallOrder[0],
        );
        expect(Object.values(registry.getMetrics())[0]).toMatchObject({
          activeRequests: 0,
          queueDepth: 1,
          completedRequests: 0,
          failedRequests: 1,
          retriedRequests: 0,
          rateLimitHits: 0,
          avgLatencyMs: 1000,
        });
        await vi.advanceTimersByTimeAsync(499);
        expect(globalThis.fetch).toHaveBeenCalledOnce();
        expect(callbackSettled).toBe(false);
        await vi.advanceTimersByTimeAsync(1);
        expect(secondDispatchAt).toBe(resetAt);
      } else {
        expect(secondDispatchAt).toBe(resetAt - 500);
        expect(updateQuota).toHaveBeenCalledTimes(2);
        expect(learned).not.toHaveBeenCalled();
      }
      await expect(second).resolves.toMatchObject({ output: 'live B output' });
      expect(secondResponse.bodyUsed).toBe(true);
      expect(callbackSettled).toBe(false);
      expect(events.indexOf('slot released')).toBeLessThan(events.indexOf('B dispatched'));
      expect(events.indexOf('B dispatched')).toBeLessThan(events.lastIndexOf('slot released'));
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
      expect(release).toHaveBeenCalledTimes(2);
      expect(updateQuota).toHaveBeenCalledTimes(2);
      expect(updateQuota).toHaveBeenNthCalledWith(1, firstQuotaState);
      expect(updateQuota).toHaveBeenNthCalledWith(2, emptyQuotaState);
      expect(retrying).not.toHaveBeenCalled();
      const metrics = registry.getMetrics();
      expect(Object.values(metrics)[0]).toMatchObject({
        activeRequests: 0,
        queueDepth: 0,
        totalRequests: 2,
        completedRequests: 1,
        failedRequests: 1,
        retriedRequests: 0,
        rateLimitHits: 0,
        avgLatencyMs: 500,
      });

      // This is intentionally abort-first. A late independent rejection stays
      // observed without replacing cancellation or starting the second tool.
      if (late === 'reject') {
        callbackResult.reject(new Error('independent callback failure after cancellation'));
      } else {
        callbackResult.resolve('late callback output');
      }
      await vi.advanceTimersByTimeAsync(0);
      expect(callbackSettled).toBe(true);
      expect(await first).toBe(reason);
      expect(callback).toHaveBeenCalledOnce();
      expect(laterCallback).not.toHaveBeenCalled();
      expect(registry.getMetrics()).toEqual(metrics);
      expect(release).toHaveBeenCalledTimes(2);
      expect(observed).toHaveBeenCalledOnce();
      expect(updateQuota).toHaveBeenCalledTimes(2);
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
      expect(vi.getTimerCount()).toBe(0);
    },
  );
});
