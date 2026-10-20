import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createProviderRateLimitOptions,
  wrapProviderWithRateLimiting,
} from '../../src/scheduler/providerWrapper';
import { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';
import { mockProcessEnv } from '../util/utils';

import type { ApiProvider, ProviderResponse } from '../../src/types/providers';

const throttled = (): ProviderResponse => ({
  error: 'Rate limit exceeded: tool continuation throttled',
  output: 'partial',
  tokenUsage: { prompt: 100, completion: 10, total: 110, numRequests: 2 },
  metadata: {
    costIncomplete: true,
    knownCost: 0.001,
    http: { status: 429, statusText: 'Too Many Requests', headers: { 'retry-after-ms': '0' } },
  },
});

describe('provider results after rate-limit exhaustion', () => {
  let registry: RateLimitRegistry;
  let restoreEnv: () => void;
  beforeEach(() => {
    restoreEnv = mockProcessEnv({ PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER: 'false' });
    registry = new RateLimitRegistry({ maxConcurrency: 1 });
  });
  afterEach(() => {
    registry.dispose();
    restoreEnv();
    vi.useRealTimers();
  });
  const provider = (callApi: ApiProvider['callApi'], maxRetries = 0): ApiProvider => ({
    id: () => 'fixture-provider',
    callApi,
    config: { maxRetries },
  });

  it('preserves the original provider error, partial output, usage, and HTTP metadata', async () => {
    const response = throttled();
    const callApi = vi.fn().mockResolvedValue(response);
    const failed = vi.fn();
    const completed = vi.fn();
    registry.on('request:failed', failed);
    registry.on('request:completed', completed);
    const wrapped = wrapProviderWithRateLimiting(provider(callApi), registry);
    expect(await wrapped.callApi('hello')).toBe(response);
    expect(callApi).toHaveBeenCalledOnce();
    expect(failed).toHaveBeenCalledOnce();
    expect(completed).not.toHaveBeenCalled();
    expect(Object.values(registry.getMetrics())[0]).toMatchObject({
      failedRequests: 1,
      completedRequests: 0,
      activeRequests: 0,
      retriedRequests: 0,
    });
  });

  it('adds an error to a status-only 429 without mutating or discarding the result', async () => {
    const response = { ...throttled(), error: undefined };
    const result = await registry.execute(
      provider(vi.fn<ApiProvider['callApi']>()),
      async () => response,
      createProviderRateLimitOptions(),
    );
    expect(result.error).toContain('after 1 attempts');
    expect(result).toMatchObject({
      output: 'partial',
      tokenUsage: response.tokenUsage,
      metadata: response.metadata,
    });
    expect(response.error).toBeUndefined();
  });

  it('keeps generic scheduler exhaustion throwing unless the caller opts into returning a result', async () => {
    const callApi = vi.fn(async () => ({ status: 429 }));
    await expect(
      registry.execute(provider(vi.fn<ApiProvider['callApi']>()), callApi, {
        isRateLimited: (result) => result?.status === 429,
      }),
    ).rejects.toMatchObject({ name: 'RateLimitExhaustedError' });
    expect(callApi).toHaveBeenCalledOnce();
    expect(Object.values(registry.getMetrics())[0]).toMatchObject({
      failedRequests: 1,
      activeRequests: 0,
    });
  });

  it('preserves thrown transport errors rather than converting them to response values', async () => {
    const error = new Error('HTTP 429');
    const wrapped = wrapProviderWithRateLimiting(
      provider(vi.fn().mockRejectedValue(error)),
      registry,
    );
    await expect(wrapped.callApi('hello')).rejects.toBe(error);
    expect(Object.values(registry.getMetrics())[0]).toMatchObject({
      failedRequests: 1,
      activeRequests: 0,
    });
  });

  it('preserves retry policy and returns a success after a transient response', async () => {
    vi.useFakeTimers();
    const success = { output: 'done' };
    const callApi = vi.fn().mockResolvedValueOnce(throttled()).mockResolvedValueOnce(success);
    const wrapped = wrapProviderWithRateLimiting(provider(callApi, 1), registry);
    const result = wrapped.callApi('hello');
    await vi.runAllTimersAsync();
    expect(await result).toBe(success);
    expect(callApi).toHaveBeenCalledTimes(2);
    expect(Object.values(registry.getMetrics())[0]).toMatchObject({
      failedRequests: 0,
      completedRequests: 1,
      activeRequests: 0,
      retriedRequests: 1,
    });
  });

  it('returns the last structured failure when a configured retry is exhausted', async () => {
    vi.useFakeTimers();
    const final = { ...throttled(), output: 'last attempt' };
    const callApi = vi.fn().mockResolvedValueOnce(throttled()).mockResolvedValueOnce(final);
    const result = wrapProviderWithRateLimiting(provider(callApi, 1), registry).callApi('hello');
    await vi.runAllTimersAsync();
    expect(await result).toBe(final);
    expect(callApi).toHaveBeenCalledTimes(2);
    expect(Object.values(registry.getMetrics())[0]).toMatchObject({
      failedRequests: 1,
      completedRequests: 0,
      activeRequests: 0,
      retriedRequests: 1,
    });
  });

  it('keeps hard-quota responses non-retryable', async () => {
    const response = { ...throttled(), metadata: { rateLimitKind: 'quota' } };
    const callApi = vi.fn().mockResolvedValue(response);
    expect(
      await wrapProviderWithRateLimiting(provider(callApi, 3), registry).callApi('hello'),
    ).toBe(response);
    expect(callApi).toHaveBeenCalledOnce();
  });

  it('preserves the same response when adaptive scheduling is disabled', async () => {
    restoreEnv();
    restoreEnv = mockProcessEnv({ PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER: 'true' });
    registry.dispose();
    registry = new RateLimitRegistry({ maxConcurrency: 1 });
    const response = throttled();
    const callApi = vi.fn().mockResolvedValue(response);
    expect(await wrapProviderWithRateLimiting(provider(callApi), registry).callApi('hello')).toBe(
      response,
    );
    expect(callApi).toHaveBeenCalledOnce();
    expect(registry.getMetrics()).toEqual({});
  });
});
