import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { callProviderWithContext } from '../../src/matchers/providers';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { createXAIProvider } from '../../src/providers/xai/chat';
import { withProviderCallExecutionContext } from '../../src/scheduler/providerCallExecutionContext';
import {
  createProviderRateLimitOptions,
  wrapProviderWithRateLimiting,
} from '../../src/scheduler/providerWrapper';
import { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';
import { SlotQueue } from '../../src/scheduler/slotQueue';
import { getFetchRetryContextMaxRetries } from '../../src/util/fetch/retryContext';
import { createDeferred } from '../util/utils';

import type { ApiProvider, ProviderResponse } from '../../src/types/providers';

describe('scheduler rate-limit ordering and failure diagnostics', () => {
  const registries: RateLimitRegistry[] = [];

  function createRegistry() {
    const registry = new RateLimitRegistry({ maxConcurrency: 1 });
    registries.push(registry);
    return registry;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv('PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER', 'false');
    vi.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    for (const registry of registries.splice(0)) {
      registry.dispose();
    }
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it.each([
    { kind: 'returned', resetMs: 60000 },
    { kind: 'thrown', resetMs: 2000 },
  ] as const)(
    'records a $kind rate-limit window before granting the next slot',
    async ({ kind, resetMs }) => {
      const registry = createRegistry();
      const firstResponse = createDeferred<ProviderResponse>();
      const callApi = vi
        .fn<ApiProvider['callApi']>()
        .mockImplementationOnce(() => firstResponse.promise)
        .mockResolvedValue({ output: 'second caller' });
      const provider: ApiProvider = {
        id: () => 'shared-rate-limit-pool',
        config: { maxRetries: 0 },
        callApi,
      };
      const wrapped = wrapProviderWithRateLimiting(provider, registry);
      const first = wrapped.callApi('first').catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(0);
      expect(callApi).toHaveBeenCalledOnce();
      const second = wrapped.callApi('second');
      expect(Object.values(registry.getMetrics())[0]).toMatchObject({
        activeRequests: 1,
        queueDepth: 1,
      });

      if (kind === 'returned') {
        // No headers: the scheduler must apply its conservative rate-limit window.
        firstResponse.resolve({ error: '429 rate limit exceeded' });
      } else {
        firstResponse.reject(new Error('429 rate limit; retry after 2 seconds'));
      }
      await vi.advanceTimersByTimeAsync(0);
      expect(await first).toBeInstanceOf(Error);
      expect(callApi).toHaveBeenCalledOnce();
      expect(Object.values(registry.getMetrics())[0]).toMatchObject({
        activeRequests: 0,
        queueDepth: 1,
        retriedRequests: 0,
      });

      await vi.advanceTimersByTimeAsync(resetMs - 1);
      expect(callApi).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(1);
      await expect(second).resolves.toEqual({ output: 'second caller' });
      expect(callApi).toHaveBeenCalledTimes(2);
      expect(Object.values(registry.getMetrics())[0]).toMatchObject({
        activeRequests: 0,
        queueDepth: 0,
      });
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each([true, false])(
    'learns completed success quota before releasing its slot (caller cancelled: %s)',
    async (cancelled) => {
      const registry = createRegistry();
      const controller = new AbortController();
      const secondController = new AbortController();
      const removeListener = vi.spyOn(secondController.signal, 'removeEventListener');
      const releaseSlot = vi.spyOn(SlotQueue.prototype, 'release');
      const learned = vi.fn();
      registry.on('ratelimit:learned', learned);
      const response = createDeferred<ProviderResponse>();
      const callApi = vi
        .fn<ApiProvider['callApi']>()
        .mockImplementationOnce(() => response.promise)
        .mockResolvedValue({ output: 'unaffected caller' });
      const provider: ApiProvider = {
        id: () => 'completed-quota-pool',
        config: { maxRetries: 3 },
        callApi,
      };
      const wrapped = wrapProviderWithRateLimiting(provider, registry);
      const first = wrapped
        .callApi('first', undefined, { abortSignal: controller.signal })
        .catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(0);
      expect(callApi).toHaveBeenCalledOnce();
      const second = wrapped.callApi('second', undefined, {
        abortSignal: secondController.signal,
      });
      expect(Object.values(registry.getMetrics())[0]).toMatchObject({
        activeRequests: 1,
        queueDepth: 1,
      });
      const reason = new Error('cancel completed caller');
      if (cancelled) {
        controller.abort(reason);
      }
      response.resolve({
        output: 'completed first response',
        metadata: {
          http: {
            status: 200,
            statusText: 'OK',
            headers: {
              'x-ratelimit-limit-requests': '10',
              'x-ratelimit-remaining-requests': '0',
              'x-ratelimit-reset-requests': '2s',
            },
          },
        },
      });
      await vi.advanceTimersByTimeAsync(0);
      if (cancelled) {
        expect(await first).toMatchObject({ name: 'AbortError', message: reason.message });
      } else {
        expect(await first).toMatchObject({ output: 'completed first response' });
      }
      expect(learned).toHaveBeenCalledOnce();
      expect(releaseSlot).toHaveBeenCalledOnce();
      expect(callApi).toHaveBeenCalledOnce();
      expect(Object.values(registry.getMetrics())[0]).toMatchObject({
        activeRequests: 0,
        queueDepth: 1,
        completedRequests: cancelled ? 0 : 1,
        failedRequests: cancelled ? 1 : 0,
        retriedRequests: 0,
      });

      await vi.advanceTimersByTimeAsync(1999);
      expect(callApi).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(1);
      await expect(second).resolves.toEqual({ output: 'unaffected caller' });
      expect(callApi).toHaveBeenCalledTimes(2);
      expect(releaseSlot).toHaveBeenCalledTimes(2);
      expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function));
      expect(Object.values(registry.getMetrics())[0]).toMatchObject({
        totalRequests: 2,
        activeRequests: 0,
        queueDepth: 0,
        completedRequests: cancelled ? 1 : 2,
        failedRequests: cancelled ? 1 : 0,
        retriedRequests: 0,
      });
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each(['registry', 'wrapper', 'grader'] as const)(
    'preserves an unrelated returned error and metadata through the %s after caller abort',
    async (boundary) => {
      const registry = createRegistry();
      const controller = new AbortController();
      const response = createDeferred<ProviderResponse>();
      const callApi = vi.fn<ApiProvider['callApi']>().mockImplementation(() => response.promise);
      const provider: ApiProvider = {
        id: () => 'diagnostic-provider',
        config: { maxRetries: 3 },
        callApi,
      };
      const options = { abortSignal: controller.signal };
      const pending =
        boundary === 'registry'
          ? registry.execute(
              provider,
              () => provider.callApi('fixture', undefined, options),
              createProviderRateLimitOptions(controller.signal),
            )
          : boundary === 'wrapper'
            ? wrapProviderWithRateLimiting(provider, registry).callApi(
                'fixture',
                undefined,
                options,
              )
            : withProviderCallExecutionContext(
                { abortSignal: controller.signal, rateLimitRegistry: registry },
                () => callProviderWithContext(provider, 'fixture', 'rubric', {}),
              );
      let settled: ProviderResponse | undefined;
      let rejected: unknown;
      const observed = pending.then(
        (value) => {
          settled = value;
        },
        (error) => {
          rejected = error;
        },
      );
      await vi.advanceTimersByTimeAsync(0);
      expect(callApi).toHaveBeenCalledOnce();
      controller.abort(new Error('independent caller cancellation'));
      const failure: ProviderResponse = {
        error: '429 backend failure: preserve this original diagnostic',
        metadata: {
          http: {
            status: 429,
            statusText: 'Too Many Requests',
            headers: { 'retry-after-ms': '60000' },
          },
          requestId: 'diagnostic-request',
          upstreamDetail: { code: 'fixture_failure' },
        },
      };
      response.resolve(failure);
      await vi.advanceTimersByTimeAsync(0);
      await observed;

      expect(rejected).toBeUndefined();
      expect(settled).toBe(failure);
      expect(settled?.metadata).toBe(failure.metadata);
      expect(Object.values(registry.getMetrics())[0]).toMatchObject({
        activeRequests: 0,
        queueDepth: 0,
        retriedRequests: 0,
      });
      await vi.advanceTimersByTimeAsync(120000);
      expect(callApi).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('preserves the actual xAI preparation failure through a provider wrapper and registry', async () => {
    const registry = createRegistry();
    const controller = new AbortController();
    const target = createXAIProvider('xai:grok-4', {
      config: { config: { apiKey: 'fixture-key', maxRetries: 3 } },
    });
    if (!(target instanceof OpenAiChatCompletionProvider)) {
      throw new Error('The xAI fixture must use its OpenAI-compatible provider implementation');
    }
    const preparation = createDeferred<Awaited<ReturnType<typeof target.getOpenAiBody>>>();
    const prepare = vi
      .spyOn(target, 'getOpenAiBody')
      .mockImplementationOnce(() => preparation.promise);
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('Unexpected transport dispatch'));
    const wrapped = wrapProviderWithRateLimiting(target, registry);
    let result: ProviderResponse | undefined;
    let rejected: unknown;
    const pending = wrapped.callApi('fixture', undefined, { abortSignal: controller.signal }).then(
      (value) => {
        result = value;
      },
      (error) => {
        rejected = error;
      },
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(prepare).toHaveBeenCalledOnce();
    controller.abort(new Error('independent caller cancellation'));
    preparation.reject(new Error('xAI preparation failed'));
    await vi.advanceTimersByTimeAsync(0);
    await pending;

    expect(rejected).toBeUndefined();
    expect(result).toEqual({
      error:
        'x.ai API error: xAI preparation failed\n\nIf this persists, verify your API key at https://x.ai/',
    });
    await vi.advanceTimersByTimeAsync(120000);
    expect(prepare).toHaveBeenCalledOnce();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('preserves an unrelated thrown failure and retry context after caller abort', async () => {
    const registry = createRegistry();
    const controller = new AbortController();
    const response = createDeferred<ProviderResponse>();
    const callApi = vi.fn<ApiProvider['callApi']>().mockImplementation(() => {
      expect(getFetchRetryContextMaxRetries()).toBe(3);
      return response.promise;
    });
    const provider: ApiProvider = {
      id: () => 'throwing-provider',
      config: { maxRetries: 3 },
      callApi,
    };
    const wrapped = wrapProviderWithRateLimiting(provider, registry);
    const pending = wrapped
      .callApi('fixture', undefined, { abortSignal: controller.signal })
      .catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(0);
    const failure = new Error('unrelated network timeout');
    controller.abort('caller cancellation');
    response.reject(failure);
    await vi.advanceTimersByTimeAsync(0);
    expect(await pending).toBe(failure);
    await vi.advanceTimersByTimeAsync(120000);
    expect(callApi).toHaveBeenCalledOnce();
    expect(Object.values(registry.getMetrics())[0]).toMatchObject({
      activeRequests: 0,
      failedRequests: 1,
      retriedRequests: 0,
    });
  });

  it('still allows caller cancellation to supersede a successful response', async () => {
    const registry = createRegistry();
    const controller = new AbortController();
    const response = createDeferred<ProviderResponse>();
    const provider: ApiProvider = {
      id: () => 'successful-provider',
      callApi: vi.fn<ApiProvider['callApi']>().mockImplementation(() => response.promise),
    };
    const pending = wrapProviderWithRateLimiting(provider, registry)
      .callApi('fixture', undefined, { abortSignal: controller.signal })
      .catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    response.resolve({ output: 'late success' });
    await vi.advanceTimersByTimeAsync(0);
    expect(await pending).toMatchObject({ name: 'AbortError' });
    expect(Object.values(registry.getMetrics())[0]).toMatchObject({
      activeRequests: 0,
      failedRequests: 1,
      retriedRequests: 0,
    });
  });
});
