import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withCacheEnabled } from '../../src/cache';
import { loadApiProvider } from '../../src/providers';
import { callTargetProvider } from '../../src/redteam/providers/shared';
import { withProviderCallExecutionContext } from '../../src/scheduler/providerCallExecutionContext';
import { wrapProviderWithRateLimiting } from '../../src/scheduler/providerWrapper';
import { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';
import { mockProcessEnv } from '../util/utils';

import type { ApiProvider, ProviderResponse } from '../../src/types/providers';

vi.mock('../../src/logger');

describe('caller observer exceptions at actual provider retry boundaries', () => {
  let registry: RateLimitRegistry;
  let restore: () => void;
  const providers: ApiProvider[] = [];
  beforeEach(() => {
    restore = mockProcessEnv({
      PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER: 'false',
      PROMPTFOO_RETRY_5XX: 'false',
      OPENAI_API_KEY: 'fixture-key',
    });
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    registry = new RateLimitRegistry({ maxConcurrency: 1 });
  });
  afterEach(async () => {
    registry.dispose();
    for (const provider of providers.splice(0)) {
      await provider.cleanup?.();
    }
    vi.restoreAllMocks();
    vi.useRealTimers();
    restore();
  });

  it.each([0, 1])(
    'does not retry a real Chat converted observer exception with maxRetries=%i',
    async (maxRetries) => {
      const raw = await loadApiProvider('openai:chat:gpt-4o-mini', {
        options: {
          config: {
            apiBaseUrl: 'https://observer-failure.fixture.test/v1',
            apiKey: 'fixture-key',
            maxRetries,
          },
        },
      });
      providers.push(raw);
      const headers = {
        'content-type': 'application/json',
        'ratelimit-limit': '10',
        'ratelimit-remaining': '9',
      };
      const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url) => {
        expect(String(url)).toBe('https://observer-failure.fixture.test/v1/chat/completions');
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: 'Hello.', role: 'assistant' }, finish_reason: 'stop' }],
          }),
          { headers },
        );
      });
      const failure = Object.freeze(new Error('metrics rate limit exceeded'));
      const before = Object.getOwnPropertyDescriptors(failure);
      const observer = vi.fn(() => {
        throw failure;
      });
      const hits = vi.fn();
      const retries = vi.fn();
      registry.on('ratelimit:hit', hits);
      registry.on('request:retrying', retries);
      let outcome: { value?: ProviderResponse; error?: unknown } | undefined;
      const done = withCacheEnabled(false, () =>
        wrapProviderWithRateLimiting(raw, registry).callApi('Hello', undefined, {
          onResponseHeaders: observer,
        }),
      ).then(
        (value) => {
          outcome = { value };
        },
        (error: unknown) => {
          outcome = { error };
        },
      );
      await vi.runAllTimersAsync();
      await done;
      expect(fetch).toHaveBeenCalledOnce();
      expect(observer).toHaveBeenCalledOnce();
      expect(outcome?.error).toBeUndefined();
      expect(outcome?.value?.error).toBe(`API call error: ${String(failure)}`);
      expect(hits).not.toHaveBeenCalled();
      expect(retries).not.toHaveBeenCalled();
      expect(Object.getOwnPropertyDescriptors(failure)).toEqual(before);
      for (const metrics of Object.values(registry.getMetrics())) {
        expect(metrics).toMatchObject({
          activeRequests: 0,
          queueDepth: 0,
          retriedRequests: 0,
          rateLimitHits: 0,
        });
      }
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each(['metrics rate limit exceeded', 'observer network timeout'])(
    'preserves the raw frozen exception and skips retry for %s',
    async (message) => {
      const failure = Object.freeze(new Error(message));
      const descriptors = Object.getOwnPropertyDescriptors(failure);
      const raw: ApiProvider = {
        id: () => 'raw-observer-fixture',
        config: { maxRetries: 1 },
        callApi: vi.fn(async (_prompt, _context, options) => {
          options?.onResponseHeaders?.({ 'ratelimit-limit': '10', 'ratelimit-remaining': '9' });
          return { output: 'unused' };
        }),
      };
      const observer = vi.fn(() => {
        throw failure;
      });
      const hits = vi.fn();
      const retries = vi.fn();
      registry.on('ratelimit:hit', hits);
      registry.on('request:retrying', retries);
      let caught: unknown;
      const done = wrapProviderWithRateLimiting(raw, registry)
        .callApi('Hello', undefined, { onResponseHeaders: observer })
        .catch((error: unknown) => {
          caught = error;
        });
      await vi.runAllTimersAsync();
      await done;
      expect(raw.callApi).toHaveBeenCalledOnce();
      expect(observer).toHaveBeenCalledOnce();
      expect(caught).toBe(failure);
      expect(Object.getOwnPropertyDescriptors(failure)).toEqual(descriptors);
      expect(hits).not.toHaveBeenCalled();
      expect(retries).not.toHaveBeenCalled();
      expect(Object.values(registry.getMetrics())).toMatchObject([
        {
          failedRequests: 1,
          activeRequests: 0,
          queueDepth: 0,
          rateLimitHits: 0,
          retriedRequests: 0,
        },
      ]);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('retains caller provenance when a structural registry supplies its observer', async () => {
    const target = await loadApiProvider('openai:chat:gpt-4o-mini', {
      options: {
        config: {
          apiBaseUrl: 'https://observer-failure.fixture.test/v1',
          apiKey: 'fixture-key',
          maxRetries: 1,
        },
      },
    });
    providers.push(target);
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(
        async () =>
          new Response(
            JSON.stringify({ choices: [{ message: { content: 'Hello.', role: 'assistant' } }] }),
            { headers: { 'content-type': 'application/json' } },
          ),
      );
    const error = Object.freeze(new Error('caller metrics rate limit'));
    const observer = vi.fn(() => {
      throw error;
    });
    const structural = {
      execute: registry.execute.bind(registry),
      dispose: registry.dispose.bind(registry),
    };
    // Forward every argument through a plain function, as a structural registry may.
    structural.execute = (provider, call, options) =>
      registry.execute(provider, (owned) => call((...args) => owned?.(...args)), options);
    let value: ProviderResponse | undefined;
    const pending = withCacheEnabled(false, () =>
      withProviderCallExecutionContext({ rateLimitRegistry: structural }, () =>
        callTargetProvider(target, 'Hello', undefined, { onResponseHeaders: observer }),
      ),
    ).then((result) => {
      value = result;
    });
    await vi.runAllTimersAsync();
    await pending;
    expect(value?.error).toBe(`API call error: ${String(error)}`);
    expect(fetch).toHaveBeenCalledOnce();
    expect(observer).toHaveBeenCalledOnce();
    expect(Object.values(registry.getMetrics())).toMatchObject([
      { rateLimitHits: 0, retriedRequests: 0, activeRequests: 0, queueDepth: 0 },
    ]);
  });

  it('still retries a genuine model quota result after the provider handles a caller exception', async () => {
    const error = Object.freeze(new Error('caller metrics failed'));
    const observer = vi.fn(() => {
      throw error;
    });
    let attempt = 0;
    const raw: ApiProvider = {
      id: () => 'real-quota-after-observer',
      config: { maxRetries: 1 },
      callApi: vi.fn(async (_prompt, _context, options) => {
        if (attempt++ === 0) {
          try {
            options?.onResponseHeaders?.({ 'ratelimit-limit': '10', 'ratelimit-remaining': '9' });
          } catch (caught) {
            expect(caught).toBe(error);
          }
          return {
            error: 'actual model rate limit',
            metadata: {
              http: {
                status: 429,
                statusText: 'Too Many Requests',
                headers: { 'retry-after-ms': '1' },
              },
            },
          };
        }
        return { output: 'Recovered model result' };
      }),
    };
    let result: ProviderResponse | undefined;
    const pending = wrapProviderWithRateLimiting(raw, registry)
      .callApi('Hello', undefined, { onResponseHeaders: observer })
      .then((value) => {
        result = value;
      });
    await vi.runAllTimersAsync();
    await pending;
    expect(result?.output).toBe('Recovered model result');
    expect(raw.callApi).toHaveBeenCalledTimes(2);
    expect(observer).toHaveBeenCalledOnce();
    expect(Object.values(registry.getMetrics())).toMatchObject([
      { rateLimitHits: 1, retriedRequests: 1, activeRequests: 0, queueDepth: 0 },
    ]);
  });
});
