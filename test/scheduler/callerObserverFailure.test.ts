import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withCacheEnabled, withCacheNamespace } from '../../src/cache';
import { loadApiProvider } from '../../src/providers';
import { callTargetProvider } from '../../src/redteam/providers/shared';
import { withProviderCallExecutionContext } from '../../src/scheduler/providerCallExecutionContext';
import { wrapProviderWithRateLimiting } from '../../src/scheduler/providerWrapper';
import { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';
import { isResponseHeadersObserverErrorResponse } from '../../src/scheduler/responseHeadersObserver';
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

  it.each(
    ['openai:chat:gpt-4o-mini', 'openrouter:fixture-model', 'snowflake:fixture-model'].flatMap(
      (providerPath) => [0, 1].map((maxRetries) => ({ providerPath, maxRetries })),
    ),
  )(
    'does not retry a real $providerPath converted observer exception with maxRetries=$maxRetries',
    async ({ providerPath, maxRetries }) => {
      const raw = await loadApiProvider(providerPath, {
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
        expect(String(url)).toBe(
          providerPath.startsWith('snowflake:')
            ? 'https://observer-failure.fixture.test/v1/api/v2/cortex/inference:complete'
            : 'https://observer-failure.fixture.test/v1/chat/completions',
        );
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
      expect(isResponseHeadersObserverErrorResponse(outcome?.value)).toBe(true);
      expect(observer.mock.results[0]).toMatchObject({ type: 'throw', value: failure });
      expect(observer.mock.results[0].value).toBe(failure);
      const symbols = Object.getOwnPropertySymbols(outcome!.value!);
      expect(symbols).toHaveLength(1);
      expect(Object.getOwnPropertyDescriptor(outcome!.value!, symbols[0])?.enumerable).toBe(false);
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

  it.each(['openrouter:fixture-model', 'snowflake:fixture-model'])(
    'stored %s hits do not replay a fresh-response observer',
    async (providerPath) => {
      const raw = await loadApiProvider(providerPath, {
        options: {
          config: {
            apiBaseUrl: 'https://stored-observer.fixture.test',
            apiKey: 'fixture-key',
            maxRetries: 1,
          },
        },
      });
      providers.push(raw);
      const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(
        async () =>
          new Response(JSON.stringify({ choices: [{ message: { content: 'Hello.' } }] }), {
            headers: { 'content-type': 'application/json' },
          }),
      );
      const quiet = vi.fn();
      const throwing = vi.fn(() => {
        throw new Error('metrics rate limit exceeded');
      });
      const wrapped = wrapProviderWithRateLimiting(raw, registry);
      const done = withCacheNamespace(`stored-observer-${providerPath}`, () =>
        withCacheEnabled(true, async () => {
          const first = await wrapped.callApi('Hello', undefined, { onResponseHeaders: quiet });
          const hit = await wrapped.callApi('Hello', undefined, { onResponseHeaders: throwing });
          expect(first.output).toBe('Hello.');
          expect(hit).toMatchObject({ output: 'Hello.', cached: true });
          expect(isResponseHeadersObserverErrorResponse(hit)).toBe(false);
        }),
      );
      await vi.runAllTimersAsync();
      await done;
      expect(fetch).toHaveBeenCalledOnce();
      expect(quiet).toHaveBeenCalledOnce();
      expect(throwing).not.toHaveBeenCalled();
      expect(Object.values(registry.getMetrics())).toMatchObject([
        { rateLimitHits: 0, retriedRequests: 0, activeRequests: 0, queueDepth: 0 },
      ]);
    },
  );

  it.each(['openrouter:fixture-model', 'snowflake:fixture-model'])(
    'does not pause a queued same-key caller after a %s observer failure',
    async (providerPath) => {
      const raw = await loadApiProvider(providerPath, {
        options: {
          config: {
            apiBaseUrl: 'https://queued-observer.fixture.test',
            apiKey: 'fixture-key',
            maxRetries: 0,
          },
        },
      });
      providers.push(raw);
      let release!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
        if (fetch.mock.calls.length === 1) {
          await held;
        }
        return new Response(JSON.stringify({ choices: [{ message: { content: 'Hello.' } }] }), {
          headers: { 'content-type': 'application/json' },
        });
      });
      const failure = Object.freeze(new Error('metrics rate limit exceeded'));
      const observer = vi.fn(() => {
        throw failure;
      });
      const wrapped = wrapProviderWithRateLimiting(raw, registry);
      let queuedResult: ProviderResponse | undefined;
      let firstResult: ProviderResponse | undefined;
      let firstError: unknown;
      const first = withCacheEnabled(false, () =>
        wrapped.callApi('First', undefined, {
          onResponseHeaders: observer,
        }),
      ).then(
        (value) => {
          firstResult = value;
        },
        (error) => {
          firstError = error;
        },
      );
      let second: Promise<void> | undefined;
      try {
        await vi.advanceTimersByTimeAsync(0);
        expect(fetch).toHaveBeenCalledOnce();
        second = withCacheEnabled(false, () => wrapped.callApi('Second')).then((value) => {
          queuedResult = value;
        });
        await vi.advanceTimersByTimeAsync(0);
        expect(Object.values(registry.getMetrics())).toMatchObject([
          { activeRequests: 1, queueDepth: 1 },
        ]);
        const other: ApiProvider = {
          id: () => 'unrelated-observer-owner',
          callApi: vi.fn(async () => ({ output: 'Other' })),
        };
        expect(await wrapProviderWithRateLimiting(other, registry).callApi('Hello')).toEqual({
          output: 'Other',
        });
        expect(queuedResult).toBeUndefined();
        release();
        await vi.advanceTimersByTimeAsync(0);
        expect(firstError).toBeUndefined();
        expect(firstResult?.error).toBe(`API call error: ${String(failure)}`);
        expect(queuedResult?.output).toBe('Hello.');
        expect(fetch).toHaveBeenCalledTimes(2);
        expect(observer).toHaveBeenCalledOnce();
        for (const metrics of Object.values(registry.getMetrics())) {
          expect(metrics).toMatchObject({
            activeRequests: 0,
            queueDepth: 0,
            rateLimitHits: 0,
            retriedRequests: 0,
          });
        }
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        release();
        await vi.runAllTimersAsync();
        await Promise.all([first, second]);
      }
    },
  );

  it.each(
    ['openrouter:fixture-model', 'snowflake:fixture-model'].flatMap((providerPath) =>
      ['independent', 'quota', 'cancel'].map((mode) => ({ providerPath, mode })),
    ),
  )(
    'preserves $mode behavior in $providerPath with a quiet observer',
    async ({ providerPath, mode }) => {
      const raw = await loadApiProvider(providerPath, {
        options: {
          config: {
            apiBaseUrl: 'https://observer-controls.fixture.test',
            apiKey: 'fixture-key',
            maxRetries: 1,
          },
        },
      });
      providers.push(raw);
      const controller = new AbortController();
      const reason = Object.freeze(
        Object.assign(new Error('caller cancelled'), { name: 'AbortException' }),
      );
      let calls = 0;
      const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, options) => {
        calls++;
        if (mode === 'cancel') {
          return new Promise<Response>((_resolve, reject) => {
            options?.signal?.addEventListener('abort', () => reject(options.signal?.reason), {
              once: true,
            });
          });
        }
        if (calls === 1 && mode === 'quota') {
          return new Response(JSON.stringify({ error: { message: 'Provider quota' } }), {
            status: 429,
            statusText: 'Too Many Requests',
            headers: { 'content-type': 'application/json', 'retry-after': '1' },
          });
        }
        return new Response(
          JSON.stringify(
            calls === 1 && mode === 'independent'
              ? { error: { message: 'metrics rate limit exceeded' } }
              : { choices: [{ message: { content: 'Hello.' } }] },
          ),
          { headers: { 'content-type': 'application/json' } },
        );
      });
      const observer = vi.fn();
      let result: ProviderResponse | undefined;
      let rejection: unknown;
      const done = withCacheEnabled(false, () =>
        wrapProviderWithRateLimiting(raw, registry).callApi('Hello', undefined, {
          abortSignal: controller.signal,
          onResponseHeaders: observer,
        }),
      ).then(
        (value) => {
          result = value;
        },
        (error) => {
          rejection = error;
        },
      );
      await vi.advanceTimersByTimeAsync(0);
      if (mode === 'cancel') {
        controller.abort(reason);
      }
      await vi.runAllTimersAsync();
      await done;
      expect(fetch).toHaveBeenCalledTimes(mode === 'cancel' ? 1 : 2);
      if (mode === 'cancel') {
        expect(rejection).toBe(reason);
        expect(result).toBeUndefined();
        expect(observer).not.toHaveBeenCalled();
      } else {
        expect(rejection).toBeUndefined();
        expect(result?.output).toBe('Hello.');
        expect(isResponseHeadersObserverErrorResponse(result)).toBe(false);
        expect(observer).toHaveBeenCalledTimes(2);
      }
      for (const metrics of Object.values(registry.getMetrics())) {
        expect(metrics).toMatchObject({ activeRequests: 0, queueDepth: 0 });
        expect(metrics.rateLimitHits).toBe(mode === 'cancel' ? 0 : 1);
        expect(metrics.retriedRequests).toBe(mode === 'independent' ? 1 : 0);
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
