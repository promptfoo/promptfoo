import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withCacheEnabled } from '../../src/cache';
import { loadApiProvider } from '../../src/providers';
import { OpenRouterProvider } from '../../src/providers/openrouter';
import { SnowflakeCortexProvider } from '../../src/providers/snowflake';
import { wrapProviderWithRateLimiting } from '../../src/scheduler/providerWrapper';
import { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';
import { DEFAULT_RETRY_POLICY } from '../../src/scheduler/retryPolicy';
import { SlotQueue } from '../../src/scheduler/slotQueue';
import { createDeferred, mockProcessEnv } from '../util/utils';

import type { ApiProvider } from '../../src/types/providers';

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

  async function createTarget(id: string) {
    const provider = await loadApiProvider(id);
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
