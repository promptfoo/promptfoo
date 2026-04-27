import { afterEach, describe, expect, it, vi } from 'vitest';
import { callProviderWithContext } from '../../src/matchers/providers';
import { withProviderCallExecutionContext } from '../../src/scheduler/providerCallExecutionContext';
import { ProviderGroupedCallQueue } from '../../src/scheduler/providerCallQueue';
import { wrapProviderWithRateLimiting } from '../../src/scheduler/providerWrapper';
import { createMockProvider } from '../factories/provider';

import type { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';
import type {
  ApiProvider,
  ProviderResponse,
  RateLimitRegistryRef,
  VarValue,
} from '../../src/types/index';

function createProvider(response: ProviderResponse = { output: 'ok' }): ApiProvider {
  return createMockProvider({ id: 'test-grader', response });
}

function createRegistry(): RateLimitRegistryRef & {
  execute: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
} {
  return {
    execute: vi.fn(async (_provider, callFn) => callFn()),
    dispose: vi.fn(),
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

    expect(registry.execute).toHaveBeenCalledWith(
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

  it('keeps scheduler execution context scoped to its callback', async () => {
    const provider = createProvider();
    const registry = createRegistry();

    await withProviderCallExecutionContext({ rateLimitRegistry: registry }, () =>
      callProviderWithContext(provider, 'scheduled', 'rubric', vars),
    );
    await callProviderWithContext(provider, 'direct', 'rubric', vars);

    expect(registry.execute).toHaveBeenCalledTimes(1);
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

    expect(contextRegistry.execute).not.toHaveBeenCalled();
    expect(wrapperRegistry.execute).toHaveBeenCalledTimes(1);
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
