import { afterEach, describe, expect, it, vi } from 'vitest';
import { callGradingProvider, callProviderWithContext } from '../../src/matchers/providers';
import {
  withProviderCallExecutionContext,
  withProviderCallTracingContext,
} from '../../src/scheduler/providerCallExecutionContext';
import { ProviderGroupedCallQueue } from '../../src/scheduler/providerCallQueue';
import { wrapProviderWithRateLimiting } from '../../src/scheduler/providerWrapper';
import { createMockProvider } from '../factories/provider';

import type { ProviderCallTracingContext } from '../../src/scheduler/providerCallExecutionContext';
import type { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';
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

  it('queues provider calls when a provider call queue is available', async () => {
    const response = { output: 'queued response' };
    const provider = createProvider(response);
    const providerCallQueue = new ProviderGroupedCallQueue();

    const promise = withProviderCallExecutionContext({ providerCallQueue }, () =>
      callProviderWithContext(provider, 'grade this', 'rubric', vars),
    );

    expect(provider.callApi).not.toHaveBeenCalled();
    const group = providerCallQueue.takeNextGroup();
    expect(group).toHaveLength(1);
    expect(group[0].providerId).toBe('test-grader');

    await providerCallQueue.run(group[0]);
    await expect(promise).resolves.toBe(response);
    expect(provider.callApi).toHaveBeenCalledWith('grade this', {
      prompt: { raw: 'grade this', label: 'rubric' },
      vars,
    });
  });
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
