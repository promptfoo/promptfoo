import { getEventListeners } from 'node:events';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withCacheEnabled } from '../../src/cache';
import logger from '../../src/logger';
import { loadApiProvider } from '../../src/providers';
import { OpenRouterProvider } from '../../src/providers/openrouter';
import { SnowflakeCortexProvider } from '../../src/providers/snowflake';
import { wrapProviderWithRateLimiting } from '../../src/scheduler/providerWrapper';
import { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';
import { DEFAULT_RETRY_POLICY } from '../../src/scheduler/retryPolicy';
import { SlotQueue } from '../../src/scheduler/slotQueue';
import { withFetchRetryContext } from '../../src/util/fetch/retryContext';
import { createDeferred, mockProcessEnv } from '../util/utils';

import type { ApiProvider } from '../../src/types/providers';

vi.mock('../../src/logger');

const routes = [
  {
    id: 'openrouter:fixture-model',
    providerClass: OpenRouterProvider,
    url: 'https://openrouter.ai/api/v1/chat/completions',
  },
  {
    id: 'snowflake:fixture-model',
    providerClass: SnowflakeCortexProvider,
    url: 'https://fixture-account.snowflakecomputing.com/api/v2/cortex/inference:complete',
  },
] as const;

function successResponse() {
  return new Response(
    JSON.stringify({
      choices: [
        { message: { role: 'assistant', content: 'live B succeeded' }, finish_reason: 'stop' },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

describe('public Chat overrides preserve caller cancellation through the scheduler', () => {
  let restoreEnvironment: () => void;
  const providers: ApiProvider[] = [];
  const registries: RateLimitRegistry[] = [];
  const controllers: AbortController[] = [];
  const pendingCalls: Promise<unknown>[] = [];
  const pendingTransports: Promise<Response>[] = [];
  const settleTransports: (() => void)[] = [];

  beforeEach(() => {
    restoreEnvironment = mockProcessEnv({
      OPENROUTER_API_KEY: 'fixture-openrouter-key',
      SNOWFLAKE_API_KEY: 'fixture-snowflake-key',
      SNOWFLAKE_ACCOUNT_IDENTIFIER: 'fixture-account',
      PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER: 'false',
      PROMPTFOO_DISABLE_REMOTE_GENERATION: 'true',
      PROMPTFOO_RETRY_5XX: 'false',
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-10T01:00:00.000Z'));
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected fixture request'));
  });

  afterEach(async () => {
    const drained = Promise.allSettled([...pendingCalls.splice(0), ...pendingTransports.splice(0)]);
    for (const controller of controllers.splice(0)) {
      controller.abort();
    }
    for (const settle of settleTransports.splice(0)) {
      settle();
    }
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

  async function createTarget(id: string, config: Record<string, unknown> = {}) {
    const provider = await loadApiProvider(id, { options: { config } });
    providers.push(provider);
    const registry = new RateLimitRegistry({ maxConcurrency: 1 });
    registries.push(registry);
    return { provider, registry, wrapped: wrapProviderWithRateLimiting(provider, registry) };
  }

  function holdNextFetch() {
    const started = createDeferred<AbortSignal | null | undefined>();
    const response = createDeferred<Response>();
    settleTransports.push(() => response.resolve(successResponse()));
    vi.mocked(globalThis.fetch).mockImplementationOnce((_url, options) => {
      const signal = options?.signal;
      const onAbort = () => response.reject(signal?.reason);
      signal?.addEventListener('abort', onAbort, { once: true });
      const transport = response.promise.finally(() => {
        signal?.removeEventListener('abort', onAbort);
      });
      pendingTransports.push(transport);
      started.resolve(signal);
      return transport;
    });
    return { started: started.promise, response };
  }

  it.each(routes)(
    '$id preserves the original selected backoff while releasing canceled A',
    async ({ id, url }) => {
      const { registry, wrapped } = await createTarget(id, { maxRetries: 1 });
      const selected = createDeferred<void>();
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      vi.mocked(logger.debug).mockImplementation((message) => {
        if (typeof message === 'string' && message.startsWith('Rate limited, waiting 5500ms')) {
          selected.resolve();
        }
        return logger;
      });
      const a = new AbortController();
      const b = new AbortController();
      controllers.push(a, b);
      const reason = Object.freeze(
        Object.assign(new Error('cancel selected override wait'), { name: 'AbortError' }),
      );
      const dispatches: { at: number; prompt: string }[] = [];
      const onResponseHeaders = vi.fn();
      const firstResponse = new Response('{}', {
        status: 429,
        headers: { 'retry-after': '5', 'content-type': 'application/json' },
      });
      vi.mocked(globalThis.fetch).mockImplementation(async (input, options) => {
        expect(String(input)).toBe(url);
        dispatches.push({
          at: Date.now(),
          prompt: JSON.parse(String(options?.body)).messages[0].content,
        });
        return dispatches.length === 1 ? firstResponse : successResponse();
      });
      const release = vi.spyOn(SlotQueue.prototype, 'release');
      const retrying = vi.fn();
      registry.on('request:retrying', retrying);
      const startedAt = Date.now();
      const first = withCacheEnabled(false, () =>
        wrapped.callApi('A', undefined, { abortSignal: a.signal, onResponseHeaders }),
      ).catch((error) => error);
      pendingCalls.push(first);
      await selected.promise;
      const second = withCacheEnabled(false, () =>
        wrapped.callApi('B', undefined, { abortSignal: b.signal }),
      );
      void second.catch(() => {});
      pendingCalls.push(second);
      expect(Object.values(registry.getMetrics())[0]).toMatchObject({
        activeRequests: 1,
        queueDepth: 1,
      });
      await vi.advanceTimersByTimeAsync(1000);
      a.abort(reason);
      await vi.advanceTimersByTimeAsync(0);
      expect(await first).toBe(reason);
      expect(release).toHaveBeenCalledOnce();
      expect(dispatches).toEqual([{ at: startedAt, prompt: 'A' }]);
      expect(onResponseHeaders).toHaveBeenCalledExactlyOnceWith(
        Object.fromEntries(firstResponse.headers.entries()),
        {
          headers: Object.fromEntries(firstResponse.headers.entries()),
          status: 429,
          resetAt: startedAt + 5000,
        },
      );
      expect(Object.values(registry.getMetrics())[0]).toMatchObject({
        activeRequests: 0,
        queueDepth: 1,
        failedRequests: 1,
        retriedRequests: 0,
      });
      expect(getEventListeners(a.signal, 'abort')).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(3999);
      expect(dispatches).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      await expect(second).resolves.toMatchObject({
        output: 'live B succeeded',
        tokenUsage: { total: 3, numRequests: 1 },
      });
      expect(dispatches).toEqual([
        { at: startedAt, prompt: 'A' },
        { at: startedAt + 5000, prompt: 'B' },
      ]);
      expect(release).toHaveBeenCalledTimes(2);
      expect(retrying).not.toHaveBeenCalled();
      expect(b.signal.aborted).toBe(false);
      expect(getEventListeners(b.signal, 'abort')).toHaveLength(0);
      expect(Object.values(registry.getMetrics())[0]).toMatchObject({
        activeRequests: 0,
        queueDepth: 0,
        completedRequests: 1,
        failedRequests: 1,
      });
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each(routes)(
    '$id forwards fresh quota headers even when no lower retry is selected',
    async ({ id }) => {
      const { registry, wrapped } = await createTarget(id, { maxRetries: 0 });
      const a = new AbortController();
      const b = new AbortController();
      controllers.push(a, b);
      const onResponseHeaders = vi.fn();
      const response = successResponse();
      response.headers.set('ratelimit-remaining', '0');
      response.headers.set('ratelimit-reset', '5s');
      vi.mocked(globalThis.fetch)
        .mockResolvedValueOnce(response)
        .mockResolvedValueOnce(successResponse());
      const startedAt = Date.now();
      const first = withCacheEnabled(false, () =>
        wrapped.callApi('A', undefined, { abortSignal: a.signal, onResponseHeaders }),
      );
      pendingCalls.push(first);
      await expect(first).resolves.toMatchObject({ output: 'live B succeeded', cached: false });
      expect(onResponseHeaders).toHaveBeenCalledExactlyOnceWith(
        Object.fromEntries(response.headers.entries()),
      );
      const second = withCacheEnabled(false, () =>
        wrapped.callApi('B', undefined, { abortSignal: b.signal }),
      );
      void second.catch(() => {});
      pendingCalls.push(second);
      await vi.advanceTimersByTimeAsync(4999);
      expect(globalThis.fetch).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(1);
      await expect(second).resolves.toMatchObject({ output: 'live B succeeded' });
      expect(Date.now()).toBe(startedAt + 5000);
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
      expect(Object.values(registry.getMetrics())[0]).toMatchObject({
        activeRequests: 0,
        queueDepth: 0,
        completedRequests: 2,
        retriedRequests: 0,
      });
    },
  );

  it.each(
    routes.flatMap((route) => ['hard quota', 'zero retries'].map((mode) => ({ ...route, mode }))),
  )('$id emits no selected-backoff event for $mode', async ({ id, mode }) => {
    const { provider } = await createTarget(id);
    const maxRetries = mode === 'zero retries' ? 0 : 1;
    const onResponseHeaders = vi.fn();
    const body =
      mode === 'hard quota'
        ? { error: { code: 'insufficient_quota', message: 'Fixture hard quota' } }
        : {};
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(body), {
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'content-type': 'application/json', 'retry-after': '5' },
      }),
    );
    const call = withFetchRetryContext(maxRetries, () =>
      withCacheEnabled(false, () => provider.callApi('A', undefined, { onResponseHeaders })),
    );
    pendingCalls.push(call);
    // Exercise lower selection without the scheduler's separate final-error retry policy.
    await vi.advanceTimersByTimeAsync(0);
    const result = await call;
    expect(result.error).toContain('429');
    expect(onResponseHeaders).not.toHaveBeenCalled();
    expect(globalThis.fetch).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(routes)(
    '$id normalizes a custom caller reason without retrying and releases capacity for live B',
    async ({ id, providerClass, url }) => {
      const { provider, registry, wrapped } = await createTarget(id);
      expect(provider).toBeInstanceOf(providerClass);
      // Use the real positive retry allowance, so zero retries is not a result
      // of configuring maxRetries: 0 around a retry-shaped caller reason.
      expect(DEFAULT_RETRY_POLICY.maxRetries).toBeGreaterThan(0);
      const firstController = new AbortController();
      const secondController = new AbortController();
      controllers.push(firstController, secondController);
      const reason = Object.freeze(new Error('network timeout from caller'));
      const originalReason = Object.getOwnPropertyDescriptors(reason);
      const release = vi.spyOn(SlotQueue.prototype, 'release');
      const retrying = vi.fn();
      registry.on('request:retrying', retrying);
      const firstTransport = holdNextFetch();
      const secondTransport = holdNextFetch();

      let firstSettled = false;
      const first = withCacheEnabled(false, () =>
        wrapped.callApi('cancel A', undefined, { abortSignal: firstController.signal }),
      )
        .catch((error: unknown) => error)
        .then((result) => {
          firstSettled = true;
          return result;
        });
      pendingCalls.push(first);
      const firstSignal = await firstTransport.started;
      expect(firstSignal?.aborted).toBe(false);
      expect(globalThis.fetch).toHaveBeenCalledOnce();
      expect(vi.mocked(globalThis.fetch).mock.calls[0][0]).toBe(url);
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
      expect(release).not.toHaveBeenCalled();

      firstController.abort(reason);
      await vi.advanceTimersByTimeAsync(0);
      expect(firstSettled).toBe(true);
      const firstResult = await first;
      expect(firstResult).toBeInstanceOf(Error);
      expect(firstResult).not.toBe(reason);
      expect(firstResult).toMatchObject({
        name: 'AbortError',
        message: 'network timeout from caller',
        cause: reason,
      });
      expect((firstResult as Error & { cause?: unknown }).cause).toBe(reason);
      expect(firstController.signal.reason).toBe(reason);
      expect(Object.getOwnPropertyDescriptors(reason)).toEqual(originalReason);
      expect(reason.name).toBe('Error');
      expect(firstSignal?.aborted).toBe(true);
      expect(release).toHaveBeenCalledOnce();
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
      expect(vi.mocked(globalThis.fetch).mock.calls[1][0]).toBe(url);
      const secondSignal = await secondTransport.started;
      expect(secondSignal?.aborted).toBe(false);
      expect(secondController.signal.aborted).toBe(false);
      expect(secondSignal).not.toBe(firstSignal);
      expect(retrying).not.toHaveBeenCalled();
      expect(Object.values(registry.getMetrics())[0]).toMatchObject({
        activeRequests: 1,
        queueDepth: 0,
        totalRequests: 2,
        completedRequests: 0,
        failedRequests: 1,
        retriedRequests: 0,
        rateLimitHits: 0,
        avgLatencyMs: 1000,
      });

      const response = successResponse();
      secondTransport.response.resolve(response);
      await vi.advanceTimersByTimeAsync(0);
      await expect(second).resolves.toMatchObject({
        output: 'live B succeeded',
        cached: false,
        tokenUsage: { total: 3, prompt: 1, completion: 2, numRequests: 1 },
      });
      expect(response.bodyUsed).toBe(true);
      expect(secondController.signal.aborted).toBe(false);
      expect(release).toHaveBeenCalledTimes(2);
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
      expect(retrying).not.toHaveBeenCalled();
      expect(Object.values(registry.getMetrics())[0]).toMatchObject({
        activeRequests: 0,
        queueDepth: 0,
        totalRequests: 2,
        completedRequests: 1,
        failedRequests: 1,
        retriedRequests: 0,
        rateLimitHits: 0,
        avgLatencyMs: 500,
      });
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each(routes)(
    '$id retains the override envelope for an unrelated transport AbortError with no caller signal',
    async ({ id, providerClass, url }) => {
      const { provider, registry, wrapped } = await createTarget(id);
      expect(provider).toBeInstanceOf(providerClass);
      const transportError = Object.freeze(
        Object.assign(new Error('independent transport timeout'), { name: 'AbortError' }),
      );
      const originalError = Object.getOwnPropertyDescriptors(transportError);
      vi.mocked(globalThis.fetch).mockRejectedValueOnce(transportError);
      const release = vi.spyOn(SlotQueue.prototype, 'release');
      const retrying = vi.fn();
      registry.on('request:retrying', retrying);

      const pending = withCacheEnabled(false, () => wrapped.callApi('independent failure'));
      pendingCalls.push(pending);
      await expect(pending).resolves.toEqual({
        error: 'API call error: AbortError: independent transport timeout',
      });
      expect(Object.getOwnPropertyDescriptors(transportError)).toEqual(originalError);
      expect(transportError).not.toHaveProperty('cause');
      expect(globalThis.fetch).toHaveBeenCalledOnce();
      expect(vi.mocked(globalThis.fetch).mock.calls[0][0]).toBe(url);
      expect(release).toHaveBeenCalledOnce();
      expect(retrying).not.toHaveBeenCalled();
      expect(Object.values(registry.getMetrics())).toHaveLength(1);
      expect(Object.values(registry.getMetrics())[0]).toMatchObject({
        activeRequests: 0,
        queueDepth: 0,
        totalRequests: 1,
        completedRequests: 1,
        failedRequests: 0,
        retriedRequests: 0,
        rateLimitHits: 0,
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(vi.getTimerCount()).toBe(0);
    },
  );
});
