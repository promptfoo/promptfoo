import { getEventListeners } from 'node:events';

import { context, propagation, SpanStatusCode, trace } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withCacheEnabled, withCacheNamespace } from '../../src/cache';
import { loadApiProvider } from '../../src/providers';
import {
  calculateDeepSeekCost,
  createDeepSeekProvider,
  DEEPSEEK_CHAT_MODELS,
} from '../../src/providers/deepseek';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { wrapProviderWithRateLimiting } from '../../src/scheduler/providerWrapper';
import { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';
import { createDeferred, mockProcessEnv } from '../util/utils';
import type { SpanProcessor } from '@opentelemetry/sdk-trace-base';

import type { ApiProvider, ProviderResponse } from '../../src/types/providers';

describe('DeepSeek usage boundaries', () => {
  it('bills input-only and output-only responses and preserves valid zero usage', () => {
    expect(calculateDeepSeekCost('deepseek-chat', { inputCost: 0.01 }, 10, 0)).toBeCloseTo(0.1);
    expect(calculateDeepSeekCost('deepseek-chat', { outputCost: 0.02 }, 0, 10)).toBeCloseTo(0.2);
    expect(calculateDeepSeekCost('deepseek-chat', {}, 0, 0)).toBe(0);
  });

  it.each([undefined, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid usage %s',
    (count) => {
      expect(calculateDeepSeekCost('deepseek-chat', {}, count, 1)).toBeUndefined();
      expect(calculateDeepSeekCost('deepseek-chat', {}, 1, count)).toBeUndefined();
    },
  );
});

describe('calculateDeepSeekCost', () => {
  it('should calculate cost without cache', () => {
    const cost = calculateDeepSeekCost('deepseek-chat', {}, 1000000, 1000000);
    expect(cost).toBeCloseTo(0.42); // (0.14 + 0.28)
  });

  it('should calculate cost with cache hits', () => {
    const cost = calculateDeepSeekCost('deepseek-chat', {}, 1000000, 1000000, 500000);
    expect(cost).toBeCloseTo(0.3514); // (0.14 * 0.5 + 0.0028 * 0.5 + 0.28)
  });

  it('should calculate cost for deepseek-reasoner', () => {
    const cost = calculateDeepSeekCost('deepseek-reasoner', {}, 1000000, 1000000);
    expect(cost).toBeCloseTo(0.42); // Same pricing as deepseek-chat
  });

  it('should calculate cost for deepseek-v4-pro', () => {
    const cost = calculateDeepSeekCost('deepseek-v4-pro', {}, 1000000, 1000000);
    expect(cost).toBeCloseTo(1.305); // (0.435 + 0.87)
  });

  it('should return undefined if promptTokens is missing', () => {
    const cost = calculateDeepSeekCost('deepseek-chat', {}, undefined, 1000000);
    expect(cost).toBeUndefined();
  });

  it('should return undefined if completionTokens is missing', () => {
    const cost = calculateDeepSeekCost('deepseek-chat', {}, 1000000, undefined);
    expect(cost).toBeUndefined();
  });

  it('should use custom cost from config', () => {
    const config = { cost: 1.0 / 1e6 };
    const cost = calculateDeepSeekCost('deepseek-chat', config, 1000000, 1000000);
    expect(cost).toBeCloseTo(2.0); // (1.0 + 1.0) from config override
  });

  it('should use separate custom input and output costs from config', () => {
    const config = { inputCost: 1.0 / 1e6, outputCost: 3.0 / 1e6 };
    const cost = calculateDeepSeekCost('deepseek-chat', config, 1000000, 1000000);
    expect(cost).toBeCloseTo(4.0);
  });

  it('should use separate custom input and output costs with cache hits', () => {
    const config = { inputCost: 1.0 / 1e6, outputCost: 3.0 / 1e6 };
    const cost = calculateDeepSeekCost('deepseek-chat', config, 1000000, 1000000, 500000);
    expect(cost).toBeCloseTo(3.5014);
  });

  it('should prefer separate custom costs over custom cost', () => {
    const config = { cost: 5.0 / 1e6, inputCost: 1.0 / 1e6, outputCost: 3.0 / 1e6 };
    const cost = calculateDeepSeekCost('deepseek-chat', config, 1000000, 1000000);
    expect(cost).toBeCloseTo(4.0);
  });

  it('should return undefined when an unknown model has no pricing', () => {
    const cost = calculateDeepSeekCost('unknown-model', {}, 1000000, 1000000);
    expect(cost).toBeUndefined();
  });

  it('should calculate cost with 100% cache hits', () => {
    const cost = calculateDeepSeekCost('deepseek-chat', {}, 1000000, 1000000, 1000000);
    expect(cost).toBeCloseTo(0.2828); // (0.0028 + 0.28) - all input tokens are cached
  });

  it('should clamp cached tokens that exceed prompt tokens', () => {
    const cost = calculateDeepSeekCost('deepseek-chat', {}, 1000000, 1000000, 1500000);
    expect(cost).toBeCloseTo(0.2828); // capped at all-cached price, never negative
  });

  it('should clamp negative cached tokens to zero', () => {
    const cost = calculateDeepSeekCost('deepseek-chat', {}, 1000000, 1000000, -500000);
    expect(cost).toBeCloseTo(0.42); // (0.14 + 0.28) - treated as no cache hits
  });

  it('should treat non-finite cached tokens as no cache hits', () => {
    const cost = calculateDeepSeekCost('deepseek-chat', {}, 1000000, 1000000, Number.NaN);
    expect(cost).toBeCloseTo(0.42); // (0.14 + 0.28) - same as no cachedTokens
  });
});

describe('DEEPSEEK_CHAT_MODELS', () => {
  it('should have correct pricing for deepseek-v4-flash', () => {
    const model = DEEPSEEK_CHAT_MODELS.find((m) => m.id === 'deepseek-v4-flash');
    expect(model).toBeDefined();
    expect(model!.cost.input).toBeCloseTo(0.14 / 1e6);
    expect(model!.cost.output).toBeCloseTo(0.28 / 1e6);
    expect(model!.cost.cache_read).toBeCloseTo(0.0028 / 1e6);
  });

  it('should have correct pricing for deepseek-v4-pro', () => {
    const model = DEEPSEEK_CHAT_MODELS.find((m) => m.id === 'deepseek-v4-pro');
    expect(model).toBeDefined();
    expect(model!.cost.input).toBeCloseTo(0.435 / 1e6);
    expect(model!.cost.output).toBeCloseTo(0.87 / 1e6);
    expect(model!.cost.cache_read).toBeCloseTo(0.003625 / 1e6);
  });

  it('should have correct pricing for deepseek-chat', () => {
    const model = DEEPSEEK_CHAT_MODELS.find((m) => m.id === 'deepseek-chat');
    expect(model).toBeDefined();
    expect(model!.cost.input).toBeCloseTo(0.14 / 1e6);
    expect(model!.cost.output).toBeCloseTo(0.28 / 1e6);
    expect(model!.cost.cache_read).toBeCloseTo(0.0028 / 1e6);
  });

  it('should have correct pricing for deepseek-reasoner', () => {
    const model = DEEPSEEK_CHAT_MODELS.find((m) => m.id === 'deepseek-reasoner');
    expect(model).toBeDefined();
    expect(model!.cost.input).toBeCloseTo(0.14 / 1e6);
    expect(model!.cost.output).toBeCloseTo(0.28 / 1e6);
    expect(model!.cost.cache_read).toBeCloseTo(0.0028 / 1e6);
  });
});

describe('createDeepSeekProvider', () => {
  it('should preserve the historical non-thinking default', () => {
    expect(createDeepSeekProvider('deepseek').id()).toBe('deepseek:deepseek-chat');
  });
});

// These five postprocessors share the real Chat callback boundary. Keep its
// public-loader regression together rather than mock super.callApi in each suite.
describe('completed model callback billing', () => {
  const cases = [
    { route: 'deepseek:deepseek-chat', cost: 1.12e-6, config: {} },
    { route: 'hyperbolic:deepseek-ai/DeepSeek-R1', cost: 7.54e-6, config: {} },
    { route: 'meta:chat:muse-spark-1.3', cost: 15.25e-6, config: {} },
    {
      route: 'fireworks:accounts/fireworks/models/llama-v3p3-70b-instruct',
      cost: 13e-6,
      config: { inputCost: 2e-6, outputCost: 3e-6 },
    },
    {
      route: 'nvidia:meta/llama-3.1-8b-instruct',
      cost: 13e-6,
      config: { inputCost: 2e-6, outputCost: 3e-6 },
    },
  ];
  type Case = (typeof cases)[number];
  type Outcome = 'success' | 'fallback' | 'selected-error' | 'caller-error' | 'success-abort';
  const cleanups: Array<() => Promise<void>> = [];
  let restoreEnvironment: () => void;

  beforeEach(() => {
    restoreEnvironment = mockProcessEnv({
      OPENAI_API_KEY: undefined,
      OPENAI_API_HOST: undefined,
      OPENAI_API_BASE_URL: undefined,
      OPENAI_BASE_URL: undefined,
      OPENAI_ORGANIZATION: undefined,
      PROMPTFOO_DISABLE_ADAPTIVE_SCHEDULER: 'false',
      PROMPTFOO_DISABLE_REMOTE_GENERATION: 'true',
      PROMPTFOO_DISABLE_TELEMETRY: 'true',
      PROMPTFOO_RETRY_5XX: 'false',
    });
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
  });

  afterEach(async () => {
    for (const cleanup of cleanups.splice(0).reverse()) {
      await cleanup();
    }
    trace.disable();
    context.disable();
    propagation.disable();
    vi.restoreAllMocks();
    vi.useRealTimers();
    restoreEnvironment();
  });

  async function setup(
    item: Case,
    overrides: {
      config?: Record<string, unknown>;
      promptConfig?: Record<string, unknown>;
      usage?: Record<string, unknown> | null;
      headers?: Record<string, string>;
    } = {},
  ) {
    const usage =
      overrides.usage === undefined
        ? { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 }
        : overrides.usage;
    const failure = Object.freeze(new Error('Independent lookup returned 429 rate limit'));
    let active: {
      controller: AbortController;
      outcome: Outcome;
      events: string[];
      completed: ReturnType<typeof createDeferred<void>>;
    };
    const processor: SpanProcessor = {
      onStart() {},
      onEnd(span) {
        if (span.name === 'execute_tool lookup') {
          if (active.outcome !== 'caller-error') {
            expect(active.controller.signal.aborted).toBe(false);
          }
          expect(span.status.code).toBe(
            active.outcome === 'success' || active.outcome === 'success-abort'
              ? SpanStatusCode.OK
              : SpanStatusCode.ERROR,
          );
          active.events.push('tool span ended');
          active.completed.resolve();
        }
      },
      async forceFlush() {},
      async shutdown() {},
    };
    const tracer = new NodeTracerProvider({ spanProcessors: [processor] });
    tracer.register();
    const registry = new RateLimitRegistry({ maxConcurrency: 1, minConcurrency: 1 });
    let target: ApiProvider | undefined;
    const pending: Promise<unknown>[] = [];
    cleanups.push(async () => {
      active?.controller.abort();
      active?.completed.resolve();
      await Promise.allSettled(pending);
      registry.dispose();
      await target?.cleanup?.();
      await tracer.shutdown();
    });
    const callback = vi.fn(async () => {
      expect(trace.getActiveSpan()?.isRecording()).toBe(true);
      expect(active.controller.signal.aborted).toBe(false);
      if (active.outcome === 'caller-error') {
        active.controller.abort(failure);
        throw failure;
      }
      if (active.outcome === 'success' || active.outcome === 'success-abort') {
        active.events.push('callback succeeded');
        return 'Hello from lookup';
      }
      active.events.push('callback rejected');
      throw failure;
    });
    target = await loadApiProvider(item.route, {
      options: {
        config: {
          ...item.config,
          ...overrides.config,
          apiKey: 'fixture-key',
          maxRetries: 0,
          functionToolCallbacks: { lookup: callback },
        },
      },
    });
    expect(target).toBeInstanceOf(OpenAiChatCompletionProvider);
    expect(target.id()).toBe(item.route);
    const expectedUrl = `${(target as OpenAiChatCompletionProvider).getApiUrl()}/chat/completions`;
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      expect(input instanceof Request ? input.url : String(input)).toBe(expectedUrl);
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'lookup-call',
                    type: 'function',
                    function: { name: 'lookup', arguments: '{}' },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
          ...(usage === null ? {} : { usage }),
        }),
        {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'x-request-id': 'completed-model',
            ...overrides.headers,
          },
        },
      );
    });
    const wrapped = wrapProviderWithRateLimiting(target, registry);
    async function run(outcome: Outcome, prompt: string) {
      const controller = new AbortController();
      const reason = Object.freeze(
        Object.assign(new Error('caller observed tool completion'), { name: 'AbortError' }),
      );
      const descriptors = Object.getOwnPropertyDescriptors(reason);
      active = { controller, outcome, events: [], completed: createDeferred<void>() };
      const call = active;
      const policy = call.completed.promise.then(() => {
        if (outcome === 'selected-error' || outcome === 'success-abort') {
          call.events.push('caller aborted');
          controller.abort(reason);
        }
      });
      pending.push(policy);
      const result = trace
        .getTracer('completed-model-billing')
        .startActiveSpan('application', async (span) => {
          try {
            return await wrapped
              .callApi(
                prompt,
                {
                  prompt: {
                    raw: prompt,
                    label: 'completed model billing',
                    config: overrides.promptConfig,
                  },
                  vars: {},
                },
                { abortSignal: controller.signal },
              )
              .then(
                (response) => ({ response, error: undefined }),
                (error: unknown) => ({ response: undefined, error }),
              );
          } finally {
            span.end();
            call.completed.resolve();
          }
        });
      pending.push(result);
      const settled = await result;
      await policy;
      expect(Object.getOwnPropertyDescriptors(reason)).toEqual(descriptors);
      expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
      for (const metrics of Object.values(registry.getMetrics())) {
        expect(metrics).toMatchObject({
          activeRequests: 0,
          queueDepth: 0,
          retriedRequests: 0,
          rateLimitHits: 0,
        });
      }
      if (outcome === 'selected-error') {
        expect(settled.error).toBeUndefined();
        expect(settled.response?.error).toContain(failure.message);
        expect(settled.response?.metadata).toMatchObject({
          errorOrigin: 'tool',
          http: { status: 200, headers: { 'x-request-id': 'completed-model' } },
        });
        expect(call.events).toEqual(['callback rejected', 'tool span ended', 'caller aborted']);
        expect(controller.signal.reason).toBe(reason);
      }
      return { ...settled, reason, failure };
    }
    return { run, fetch, callback };
  }

  function response(settled: { response?: ProviderResponse; error?: unknown }) {
    expect(settled.error).toBeUndefined();
    expect(settled.response).toBeDefined();
    return settled.response!;
  }

  function cost(actual: number | undefined, expected: number | undefined) {
    if (expected === undefined) {
      expect(actual).toBeUndefined();
    } else {
      expect(actual).toBeCloseTo(expected, 12);
    }
  }

  it.each(cases.flatMap((item) => ['fresh', 'cached'].map((source) => ({ ...item, source }))))(
    'retains $route completed cost and the real $source model cache after callback selection',
    async (item) => {
      const fixture = await setup(item);
      await withCacheNamespace(`completed-model-${item.route}-${item.source}`, () =>
        withCacheEnabled(true, async () => {
          const ordinary = response(await fixture.run('success', 'ordinary'));
          cost(ordinary.cost, item.cost);
          const prompt = item.source === 'cached' ? 'ordinary' : 'selected';
          const selected = response(await fixture.run('selected-error', prompt));
          expect(selected.cached).toBe(item.source === 'cached');
          expect(selected.tokenUsage?.total).toBe(5);
          cost(
            selected.cost,
            item.source === 'fresh'
              ? ordinary.cost
              : item.route.startsWith('fireworks:')
                ? 0
                : undefined,
          );
          const survivor = response(await fixture.run('success', prompt));
          expect(survivor.output).toBe('Hello from lookup');
          expect(survivor.cached).toBe(true);
          cost(survivor.cost, item.route.startsWith('fireworks:') ? 0 : undefined);
          expect(fixture.fetch).toHaveBeenCalledTimes(item.source === 'fresh' ? 2 : 1);
          expect(fixture.callback).toHaveBeenCalledTimes(3);
        }),
      );
    },
  );

  it.each(
    cases.flatMap((item) =>
      ['zero', 'missing', 'unknown'].map((boundary) => ({ ...item, boundary })),
    ),
  )('preserves $route $boundary usage/pricing when the completed tool fails', async (item) => {
    const route =
      item.boundary === 'unknown'
        ? `${item.route.startsWith('meta:') ? 'meta:chat' : item.route.split(':')[0]}:unknown-billing-model`
        : item.route;
    const fixture = await setup(
      { ...item, route },
      {
        ...(item.boundary === 'zero'
          ? { usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } }
          : {}),
        ...(item.boundary === 'missing' ? { usage: null } : {}),
        ...(item.boundary === 'unknown'
          ? { config: { inputCost: undefined, outputCost: undefined } }
          : {}),
      },
    );
    await withCacheEnabled(false, async () => {
      const ordinary = response(await fixture.run('fallback', 'ordinary'));
      const expected =
        item.boundary === 'zero' && !item.route.startsWith('hyperbolic:') ? 0 : undefined;
      cost(ordinary.cost, expected);
      const selected = response(await fixture.run('selected-error', 'selected'));
      cost(selected.cost, expected);
      expect(selected.tokenUsage).toEqual(ordinary.tokenUsage);
      expect(fixture.fetch).toHaveBeenCalledTimes(2);
    });
  });

  it.each(cases)(
    'preserves $route configured-rate precedence and prompt override policy',
    async (item) => {
      const fixture = await setup(item, {
        config: { cost: 99e-6, inputCost: 1e-6, outputCost: 4e-6 },
        promptConfig: { inputCost: 0, outputCost: 0 },
      });
      await withCacheEnabled(false, async () => {
        const ordinary = response(await fixture.run('success', 'ordinary'));
        const expected = /^(deepseek|hyperbolic):/.test(item.route) ? 14e-6 : 0;
        cost(ordinary.cost, expected);
        cost(response(await fixture.run('selected-error', 'selected')).cost, expected);
        expect(fixture.fetch).toHaveBeenCalledTimes(2);
      });
    },
  );

  it.each(cases)(
    'does not invent a $route bill when transport never completed a model',
    async (item) => {
      const fixture = await setup(item);
      fixture.fetch.mockRejectedValue(new Error('fixture transport failed'));
      await withCacheEnabled(false, async () => {
        const failed = response(await fixture.run('fallback', 'transport failure'));
        expect(failed.error).toContain('fixture transport failed');
        expect(failed.cost).toBeUndefined();
        expect(failed.tokenUsage).toBeUndefined();
        expect(failed.metadata).not.toHaveProperty('errorOrigin');
        expect(fixture.callback).not.toHaveBeenCalled();
        expect(fixture.fetch).toHaveBeenCalledOnce();
      });
    },
  );

  it.each(
    cases.flatMap((item) =>
      (['caller-error', 'success-abort'] as const).map((outcome) => ({ ...item, outcome })),
    ),
  )('keeps $route $outcome as caller cancellation', async (item) => {
    const fixture = await setup(item);
    await withCacheEnabled(false, async () => {
      const cancelled = await fixture.run(item.outcome, 'caller cancellation');
      expect(cancelled.response).toBeUndefined();
      if (item.outcome === 'caller-error') {
        expect(cancelled.error).toMatchObject({
          name: 'AbortError',
          message: cancelled.failure.message,
        });
        expect((cancelled.error as Error & { cause?: unknown }).cause).toBe(cancelled.failure);
      } else {
        expect(cancelled.error).toBe(cancelled.reason);
      }
      expect(fixture.fetch).toHaveBeenCalledOnce();
    });
  });

  it.each([
    [2, 1],
    [1, 2],
  ])(
    'preserves Fireworks header=%i and usage=%i cache discount inputs',
    async (headerTokens, usageTokens) => {
      const fixture = await setup(cases[3], {
        config: { cacheReadInputCost: 0.25e-6 },
        usage: {
          prompt_tokens: 2,
          completion_tokens: 3,
          total_tokens: 5,
          prompt_tokens_details: { cached_tokens: usageTokens },
        },
        headers: { 'fireworks-cached-prompt-tokens': String(headerTokens) },
      });
      await withCacheEnabled(false, async () => {
        cost(response(await fixture.run('success', 'ordinary')).cost, 9.5e-6);
        cost(response(await fixture.run('selected-error', 'selected')).cost, 9.5e-6);
      });
    },
  );

  it('preserves DeepSeek configured-model billing and the existing unavailable raw-cache input', async () => {
    const fixture = await setup(cases[0], {
      config: { passthrough: { model: 'deepseek-v4-pro' } },
      usage: {
        prompt_tokens: 2,
        completion_tokens: 3,
        total_tokens: 5,
        prompt_tokens_details: { cached_tokens: 2 },
      },
    });
    await withCacheEnabled(false, async () => {
      for (const outcome of ['success', 'selected-error'] as const) {
        const result = response(await fixture.run(outcome, outcome));
        expect(result).not.toHaveProperty('raw');
        expect(result.tokenUsage?.completionDetails?.cacheReadInputTokens).toBe(2);
        cost(result.cost, 1.12e-6);
      }
    });
  });

  it('preserves an already supplied superclass cost for Meta chat', async () => {
    const fixture = await setup(cases[2], { config: { passthrough: { model: 'gpt-4o-mini' } } });
    await withCacheEnabled(false, async () => {
      cost(response(await fixture.run('success', 'ordinary')).cost, 2.1e-6);
      cost(response(await fixture.run('selected-error', 'selected')).cost, 2.1e-6);
    });
  });
});
