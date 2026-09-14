import { getEventListeners } from 'node:events';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { callGradingProvider, callProviderWithContext } from '../../src/matchers/providers';
import {
  withProviderCallExecutionContext,
  withProviderCallTracingContext,
} from '../../src/scheduler/providerCallExecutionContext';
import { ProviderGroupedCallQueue } from '../../src/scheduler/providerCallQueue';
import { wrapProviderWithRateLimiting } from '../../src/scheduler/providerWrapper';
import { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';
import { createMockProvider } from '../factories/provider';

import type { ProviderCallTracingContext } from '../../src/scheduler/providerCallExecutionContext';
import type {
  ApiProvider,
  ProviderClassificationResponse,
  ProviderEmbeddingResponse,
  ProviderResponse,
  RateLimitRegistryRef,
  VarValue,
} from '../../src/types/index';

function createProvider(response: ProviderResponse = { output: 'ok' }): ApiProvider {
  return createMockProvider({ id: 'test-grader', response });
}

function createRegistry(): RateLimitRegistryRef & {
  executeSpy: ReturnType<typeof vi.fn>;
  disposeSpy: ReturnType<typeof vi.fn>;
} {
  const executeSpy = vi.fn();
  const disposeSpy = vi.fn();

  return {
    async execute(provider, callFn, options) {
      executeSpy(provider, callFn, options);
      return callFn();
    },
    dispose() {
      disposeSpy();
    },
    executeSpy,
    disposeSpy,
  };
}

describe('callProviderWithContext', () => {
  const vars: Record<string, VarValue> = { question: 'What is two plus two?' };

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('calls the provider directly without scheduler execution context', async () => {
    const response = { output: 'direct response' };
    const provider = createProvider(response);

    await expect(callProviderWithContext(provider, 'grade this', 'rubric', vars)).resolves.toBe(
      response,
    );

    expect(provider.callApi).toHaveBeenCalledWith('grade this', {
      prompt: { raw: 'grade this', label: 'rubric' },
      vars,
    });
  });

  it('uses the scheduler execution context when available', async () => {
    const provider = createProvider();
    const registry = createRegistry();

    await withProviderCallExecutionContext({ rateLimitRegistry: registry }, () =>
      callProviderWithContext(provider, 'grade this', 'rubric', vars),
    );

    expect(registry.executeSpy).toHaveBeenCalledWith(
      provider,
      expect.any(Function),
      expect.objectContaining({
        getHeaders: expect.any(Function),
        isRateLimited: expect.any(Function),
        getRetryAfter: expect.any(Function),
      }),
    );
    expect(provider.callApi).toHaveBeenCalledWith('grade this', {
      prompt: { raw: 'grade this', label: 'rubric' },
      vars,
    });
  });

  it('propagates abort signals from the scheduler execution context', async () => {
    const provider = createProvider();
    const registry = createRegistry();
    const abortController = new AbortController();

    await withProviderCallExecutionContext(
      { abortSignal: abortController.signal, rateLimitRegistry: registry },
      () => callProviderWithContext(provider, 'grade this', 'rubric', vars),
    );

    expect(registry.executeSpy).toHaveBeenCalledWith(
      provider,
      expect.any(Function),
      expect.objectContaining({ abortSignal: abortController.signal }),
    );
    expect(provider.callApi).toHaveBeenCalledWith(
      'grade this',
      {
        prompt: { raw: 'grade this', label: 'rubric' },
        vars,
      },
      { abortSignal: abortController.signal },
    );
  });

  it('traces grading providers while preserving scheduler and cancellation context', async () => {
    const provider = createProvider();
    const registry = createRegistry();
    const abortController = new AbortController();
    const traceparent = '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01';
    const withProviderSpan: ProviderCallTracingContext['withProviderSpan'] = async (
      { callContext },
      invoke,
    ) => invoke({ ...callContext!, traceparent });
    const providerSpan = vi.fn(withProviderSpan);

    await withProviderCallExecutionContext(
      { abortSignal: abortController.signal, rateLimitRegistry: registry },
      () =>
        withProviderCallTracingContext(
          {
            getActiveTraceparent: () => traceparent,
            withGraderSpan: async (_options, invoke) => invoke(),
            withProviderSpan: providerSpan,
          },
          () => callProviderWithContext(provider, 'grade this', 'rubric', vars),
        ),
    );

    expect(registry.executeSpy).toHaveBeenCalledTimes(1);
    expect(providerSpan).toHaveBeenCalledWith(
      expect.objectContaining({ provider, role: 'grader', promptLabel: 'rubric' }),
      expect.any(Function),
    );
    expect(provider.callApi).toHaveBeenCalledWith(
      'grade this',
      {
        prompt: { raw: 'grade this', label: 'rubric' },
        vars,
        traceparent,
      },
      { abortSignal: abortController.signal },
    );
  });

  it('keeps scheduler execution context scoped to its callback', async () => {
    const provider = createProvider();
    const registry = createRegistry();

    await withProviderCallExecutionContext({ rateLimitRegistry: registry }, () =>
      callProviderWithContext(provider, 'scheduled', 'rubric', vars),
    );
    await callProviderWithContext(provider, 'direct', 'rubric', vars);

    expect(registry.executeSpy).toHaveBeenCalledTimes(1);
    expect(provider.callApi).toHaveBeenCalledTimes(2);
    expect(provider.callApi).toHaveBeenLastCalledWith('direct', {
      prompt: { raw: 'direct', label: 'rubric' },
      vars,
    });
  });

  it('does not double schedule providers that are already rate-limit wrapped', async () => {
    const provider = createProvider();
    const wrapperRegistry = createRegistry();
    const contextRegistry = createRegistry();
    const wrappedProvider = wrapProviderWithRateLimiting(
      provider,
      wrapperRegistry as unknown as RateLimitRegistry,
    );

    await withProviderCallExecutionContext({ rateLimitRegistry: contextRegistry }, () =>
      callProviderWithContext(wrappedProvider, 'grade this', 'rubric', vars),
    );

    expect(contextRegistry.executeSpy).not.toHaveBeenCalled();
    expect(wrapperRegistry.executeSpy).toHaveBeenCalledTimes(1);
    expect(provider.callApi).toHaveBeenCalledWith(
      'grade this',
      {
        prompt: { raw: 'grade this', label: 'rubric' },
        vars,
      },
      undefined,
    );
  });

  it.each([false, true])(
    'queues provider calls while preserving cancellation, signal=%s',
    async (withSignal) => {
      const abortSignal = withSignal ? new AbortController().signal : undefined;
      const response = { output: 'queued response' };
      const provider = createProvider(response);
      const providerCallQueue = new ProviderGroupedCallQueue();

      const promise = withProviderCallExecutionContext({ providerCallQueue, abortSignal }, () =>
        callProviderWithContext(provider, 'grade this', 'rubric', vars),
      );

      expect(provider.callApi).not.toHaveBeenCalled();
      const group = providerCallQueue.takeNextGroup();
      expect(group).toHaveLength(1);
      expect(group[0].providerId).toBe('test-grader');

      await providerCallQueue.run(group[0]);
      await expect(promise).resolves.toBe(response);
      expect(vi.mocked(provider.callApi).mock.calls[0]).toEqual([
        'grade this',
        { prompt: { raw: 'grade this', label: 'rubric' }, vars },
        ...(abortSignal ? [{ abortSignal }] : []),
      ]);
    },
  );
});

describe('callGradingProvider', () => {
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('traces non-text grading calls without changing their response shape', async () => {
    const provider = createProvider();
    const response: ProviderClassificationResponse = { classification: { safe: 0.9 } };
    const traceparent = '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01';
    const providerSpan = vi.fn<ProviderCallTracingContext['withProviderSpan']>(
      async ({ callContext }, invoke) => invoke(callContext),
    );

    await expect(
      withProviderCallTracingContext(
        {
          getActiveTraceparent: () => traceparent,
          withGraderSpan: async (_options, invoke) => invoke(),
          withProviderSpan: providerSpan,
        },
        () => callGradingProvider(provider, 'classification', async () => response),
      ),
    ).resolves.toBe(response);

    expect(providerSpan).toHaveBeenCalledWith(
      expect.objectContaining({ provider, role: 'grader', promptLabel: 'classification' }),
      expect.any(Function),
    );
  });

  it('reuses rate limiting and grouped execution for embedding calls', async () => {
    const provider = createProvider();
    const registry = createRegistry();
    const providerCallQueue = new ProviderGroupedCallQueue();
    const invoke = vi.fn(
      async (): Promise<ProviderEmbeddingResponse> => ({
        embedding: [1, 0, 0],
      }),
    );

    const promise = withProviderCallExecutionContext(
      { providerCallQueue, rateLimitRegistry: registry },
      () => callGradingProvider(provider, 'similarity.embedding', invoke),
    );

    expect(invoke).not.toHaveBeenCalled();
    const [group] = providerCallQueue.takeNextGroup();
    await providerCallQueue.run(group);

    await expect(promise).resolves.toEqual({ embedding: [1, 0, 0] });
    expect(registry.executeSpy).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});

describe('grading cancellation through real scheduler boundaries', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('settles a text grading call when its caller aborts during registry backoff', async () => {
    vi.useFakeTimers();
    vi.stubEnv('PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER', 'false');
    const registry = new RateLimitRegistry({ maxConcurrency: 1 });
    const controller = new AbortController();
    const provider = createProvider();
    vi.mocked(provider.callApi).mockResolvedValueOnce({
      error: '429 rate limit',
      metadata: {
        http: {
          status: 429,
          statusText: 'Too Many Requests',
          headers: { 'retry-after-ms': '60000' },
        },
      },
    });
    const pending = withProviderCallExecutionContext(
      { rateLimitRegistry: registry, abortSignal: controller.signal },
      () => callProviderWithContext(provider, 'grade this', 'rubric', {}),
    );
    let caught: unknown;
    const rejection = pending.catch((error) => {
      caught = error;
    });
    try {
      await vi.advanceTimersByTimeAsync(0);
      expect(provider.callApi).toHaveBeenCalledOnce();
      controller.abort();
      await vi.advanceTimersByTimeAsync(0);
      expect(vi.getTimerCount()).toBe(0);
      expect(caught).toMatchObject({ name: 'AbortError' });
      await rejection;
      await vi.advanceTimersByTimeAsync(120000);
      expect(provider.callApi).toHaveBeenCalledOnce();
      expect(Object.values(registry.getMetrics())[0].activeRequests).toBe(0);
    } finally {
      registry.dispose();
    }
  });

  it.each([false, true])(
    'cancels grouped non-text grading before invocation (group already selected=%s)',
    async (selected) => {
      const controller = new AbortController();
      const survivorController = new AbortController();
      const provider = createProvider();
      const providerCallQueue = new ProviderGroupedCallQueue();
      const cancelledInvoke = vi.fn(
        async (): Promise<ProviderEmbeddingResponse> => ({ embedding: [0, 1] }),
      );
      const survivorInvoke = vi.fn(
        async (): Promise<ProviderEmbeddingResponse> => ({ embedding: [1, 0] }),
      );
      const pending = withProviderCallExecutionContext(
        { providerCallQueue, abortSignal: controller.signal },
        () => callGradingProvider(provider, 'cancelled.embedding', cancelledInvoke),
      );
      let caught: unknown;
      const rejection = pending.catch((error) => {
        caught = error;
      });
      const survivor = withProviderCallExecutionContext(
        { providerCallQueue, abortSignal: survivorController.signal },
        () => callGradingProvider(provider, 'survivor.embedding', survivorInvoke),
      );
      const selectedJobs = selected ? providerCallQueue.takeNextGroup() : undefined;
      controller.abort();
      await Promise.resolve();
      expect(caught).toMatchObject({ name: 'AbortError' });
      await rejection;
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
      const group = selectedJobs ?? providerCallQueue.takeNextGroup();
      expect(group).toHaveLength(selected ? 2 : 1);
      for (const job of group) {
        await providerCallQueue.run(job);
      }
      await expect(survivor).resolves.toEqual({ embedding: [1, 0] });
      expect(cancelledInvoke).not.toHaveBeenCalled();
      expect(survivorInvoke).toHaveBeenCalledOnce();
      expect(getEventListeners(survivorController.signal, 'abort')).toHaveLength(0);
      expect(providerCallQueue.hasJobs()).toBe(false);
    },
  );
});
