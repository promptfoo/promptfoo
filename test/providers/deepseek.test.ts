import { getEventListeners } from 'node:events';
import fs from 'node:fs';

import { context, propagation, SpanStatusCode, trace } from '@opentelemetry/api';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { load } from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache, withCacheEnabled, withCacheNamespace } from '../../src/cache';
import { loadApiProvider } from '../../src/providers';
import {
  calculateDeepSeekCost,
  createDeepSeekProvider,
  DEEPSEEK_CHAT_MODELS,
} from '../../src/providers/deepseek';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { wrapProviderWithRateLimiting } from '../../src/scheduler/providerWrapper';
import { RateLimitRegistry } from '../../src/scheduler/rateLimitRegistry';
import { ProviderOptionsSchema } from '../../src/validators/providers';
import { createDeferred, mockProcessEnv } from '../util/utils';
import type { SpanProcessor } from '@opentelemetry/sdk-trace-node';

import type { ApiProvider, ProviderResponse } from '../../src/types/providers';

vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWithCache: vi.fn(),
}));

afterEach(() => {
  vi.resetAllMocks();
});

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
  const customRates = { inputCost: 1 / 1e6, outputCost: 3 / 1e6, cacheReadCost: 0.1 / 1e6 };

  it('leaves unknown models unpriced without explicit rates', () => {
    expect(calculateDeepSeekCost('custom-model', {}, 100, 200)).toBeUndefined();
    expect(calculateDeepSeekCost('custom-model', {}, 100, 200, 50)).toBeUndefined();
  });

  it('requires rates only for token categories actually used', () => {
    expect(calculateDeepSeekCost('custom-model', { inputCost: 1 / 1e6 }, 10, 1)).toBeUndefined();
    expect(calculateDeepSeekCost('custom-model', { outputCost: 3 / 1e6 }, 1, 10)).toBeUndefined();
    expect(
      calculateDeepSeekCost('custom-model', { cacheReadCost: 0.1 / 1e6 }, 10, 0, 10),
    ).toBeCloseTo(1 / 1e6);
    expect(calculateDeepSeekCost('custom-model', { cost: 0 }, 10, 10, 5)).toBe(0);
  });

  it('uses a flat explicit rate for both cached and uncached input and output', () => {
    expect(
      calculateDeepSeekCost('deepseek-v4-flash', { cost: 1 / 1e6 }, 1_000_000, 1_000_000, 500_000),
    ).toBeCloseTo(2);
  });

  it('uses separate rates and an explicit cache-read override', () => {
    expect(
      calculateDeepSeekCost('deepseek-v4-pro', customRates, 1_000_000, 1_000_000, 500_000),
    ).toBeCloseTo(3.55);
  });

  it('should calculate cost for deepseek-v4-pro', () => {
    const cost = calculateDeepSeekCost('deepseek-v4-pro', {}, 1000000, 1000000);
    expect(cost).toBeCloseTo(5.28); // Peak input + output.
  });

  it('uses the explicit input rate for cached tokens unless separately overridden', () => {
    expect(
      calculateDeepSeekCost(
        'deepseek-v4-pro',
        { inputCost: 1 / 1e6, outputCost: 3 / 1e6 },
        1_000_000,
        1_000_000,
        500_000,
      ),
    ).toBeCloseTo(4);
  });

  it('prefers separate rates over the flat cost override', () => {
    expect(
      calculateDeepSeekCost(
        'deepseek-v4-pro',
        { cost: 5 / 1e6, ...customRates },
        1_000_000,
        1_000_000,
        500_000,
      ),
    ).toBeCloseTo(3.55);
  });

  it('keeps unknown models unpriced unless the user supplies applicable rates', () => {
    expect(calculateDeepSeekCost('unknown-model', {}, 1_000_000, 1_000_000)).toBeUndefined();
    expect(calculateDeepSeekCost('unknown-model', customRates, 1_000_000, 1_000_000)).toBeCloseTo(
      4,
    );
  });

  it.each([1_000_000, 1_500_000])('caps cached tokens %i at the prompt count', (cachedTokens) => {
    expect(
      calculateDeepSeekCost('deepseek-v4-pro', customRates, 1_000_000, 1_000_000, cachedTokens),
    ).toBeCloseTo(3.1);
  });

  it.each([-500_000, Number.NaN, Number.POSITIVE_INFINITY])(
    'treats invalid cached tokens %s as uncached',
    (cachedTokens) => {
      expect(
        calculateDeepSeekCost('deepseek-v4-pro', customRates, 1_000_000, 1_000_000, cachedTokens),
      ).toBeCloseTo(4);
    },
  );

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid explicit rates %s',
    (rate) => {
      expect(calculateDeepSeekCost('deepseek-v4-flash', { cost: rate }, 1, 1)).toBeUndefined();
    },
  );
  it('should prefer separate custom costs over custom cost', () => {
    const config = { cost: 5.0 / 1e6, inputCost: 1.0 / 1e6, outputCost: 3.0 / 1e6 };
    const cost = calculateDeepSeekCost('deepseek-chat', config, 1000000, 1000000);
    expect(cost).toBeCloseTo(4.0);
  });

  it('should return undefined when an unknown model has no pricing', () => {
    const cost = calculateDeepSeekCost('unknown-model', {}, 1000000, 1000000);
    expect(cost).toBeUndefined();
  });

  it('does not guess a rate for billable unknown-model usage', () => {
    const model = 'unknown-model';
    expect(calculateDeepSeekCost(model, { inputCost: 0.01 }, 100, 100)).toBeUndefined();
    expect(calculateDeepSeekCost(model, { outputCost: 0.02 }, 100, 100)).toBeUndefined();
    expect(calculateDeepSeekCost(model, { cacheReadCost: 0.001 }, 100, 100, 50)).toBeUndefined();
    expect(
      calculateDeepSeekCost(model, { cacheReadCost: 0.001, outputCost: 0.02 }, 100, 100, 50),
    ).toBeUndefined();
    expect(calculateDeepSeekCost(model, {}, 0, 0)).toBeUndefined();
  });

  it('only needs a rate for token categories that were actually used', () => {
    expect(calculateDeepSeekCost('unknown-model', { inputCost: 0.01 }, 100, 0, 50)).toBeCloseTo(1);
    expect(calculateDeepSeekCost('unknown-model', { outputCost: 0.02 }, 0, 100)).toBeCloseTo(2);
    expect(
      calculateDeepSeekCost('unknown-model', { cacheReadCost: 0.001 }, 100, 0, 100),
    ).toBeCloseTo(0.1);
    expect(
      calculateDeepSeekCost(
        'unknown-model',
        { cacheReadCost: 0.001, outputCost: 0.02 },
        100,
        100,
        100,
      ),
    ).toBeCloseTo(2.1);
    expect(calculateDeepSeekCost('unknown-model', { cost: 0 }, 100, 100, 50)).toBe(0);
  });

  it('keeps built-in rates for unspecified directions on known models', () => {
    expect(calculateDeepSeekCost('deepseek-v4-pro', { inputCost: 0.01 }, 100, 100)).toBeCloseTo(
      1.000396,
      8,
    );
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
  it.each(['deepseek-flash', 'deepseek-v4-flash', 'deepseek-v4-flash-vision-exp'])(
    'uses current peak pricing for the Flash route %s',
    (model) => {
      expect(calculateDeepSeekCost(model, {}, 1_000_000, 1_000_000)).toBeCloseTo(1.5);
      expect(calculateDeepSeekCost(model, {}, 1_000_000, 1_000_000, 500_000)).toBeCloseTo(1.353);
    },
  );

  it('should have correct pricing for deepseek-v4-pro', () => {
    expect(calculateDeepSeekCost('deepseek-v4-pro', {}, 1_000_000, 1_000_000, 500_000)).toBeCloseTo(
      4.642,
    );
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
  it('prices fresh usage and leaves replayed responses free', () => {
    const provider = createDeepSeekProvider('deepseek:deepseek-v4-flash') as unknown as {
      calculateResponseCost(
        data: Record<string, unknown>,
        config: Record<string, unknown>,
        cached: boolean,
      ): number | undefined;
    };
    const data = { usage: { prompt_tokens: 1_000_000, completion_tokens: 1_000_000 } };
    expect(provider.calculateResponseCost(data, {}, false)).toBeCloseTo(1.5);
    expect(provider.calculateResponseCost(data, {}, true)).toBe(0);
  });

  it('uses DeepSeek native cache-hit usage when calculating V4 cost', () => {
    const provider = createDeepSeekProvider('deepseek:deepseek-v4-pro') as unknown as {
      calculateResponseCost(
        data: Record<string, unknown>,
        config: Record<string, unknown>,
        cached: boolean,
      ): number | undefined;
    };

    const cost = provider.calculateResponseCost(
      {
        usage: {
          prompt_tokens: 1_000_000,
          completion_tokens: 500_000,
          prompt_cache_hit_tokens: 400_000,
          prompt_cache_miss_tokens: 600_000,
        },
      },
      { inputCost: 1 / 1e6, outputCost: 3 / 1e6, cacheReadCost: 0.1 / 1e6 },
      false,
    );

    expect(cost).toBeCloseTo(2.14);
  });

  it('falls back to OpenAI-style cached-token usage for compatible gateways', () => {
    const provider = createDeepSeekProvider('deepseek:deepseek-v4-pro') as unknown as {
      calculateResponseCost(
        data: Record<string, unknown>,
        config: Record<string, unknown>,
        cached: boolean,
      ): number | undefined;
    };

    const cost = provider.calculateResponseCost(
      {
        usage: {
          prompt_tokens: 1_000_000,
          completion_tokens: 500_000,
          prompt_tokens_details: { cached_tokens: 400_000 },
        },
      },
      { inputCost: 1 / 1e6, outputCost: 3 / 1e6, cacheReadCost: 0.1 / 1e6 },
      false,
    );

    expect(cost).toBeCloseTo(2.14);
  });

  it('should use canonical Flash by default', () => {
    expect(createDeepSeekProvider('deepseek').id()).toBe('deepseek:deepseek-flash');
  });

  it('should preserve non-thinking behavior for the bare provider default', async () => {
    const provider = createDeepSeekProvider('deepseek:');
    const { body } = await (
      provider as unknown as {
        getOpenAiBody(prompt: string): Promise<{ body: Record<string, unknown> }>;
      }
    ).getOpenAiBody('hello');

    expect(body.thinking).toEqual({ type: 'disabled' });
  });

  it('should keep the upstream thinking default for explicit canonical Flash', async () => {
    const provider = createDeepSeekProvider('deepseek:deepseek-flash');
    const { body } = await (
      provider as unknown as {
        getOpenAiBody(prompt: string): Promise<{ body: Record<string, unknown> }>;
      }
    ).getOpenAiBody('hello');

    expect(body).not.toHaveProperty('thinking');
  });

  it('should keep the upstream thinking default for a passthrough model override', async () => {
    const provider = createDeepSeekProvider('deepseek:', {
      config: {
        config: {
          passthrough: { model: 'deepseek-v4-pro' },
        },
      },
    });
    const { body } = await (
      provider as unknown as {
        getOpenAiBody(prompt: string): Promise<{ body: Record<string, unknown> }>;
      }
    ).getOpenAiBody('hello');

    expect(body.model).toBe('deepseek-v4-pro');
    expect(body).not.toHaveProperty('thinking');
  });

  it('should preserve an explicit thinking override on the bare provider', async () => {
    const provider = createDeepSeekProvider('deepseek:', {
      config: {
        config: {
          passthrough: {
            thinking: { type: 'enabled' },
          },
        },
      },
    });
    const { body } = await (
      provider as unknown as {
        getOpenAiBody(prompt: string): Promise<{ body: Record<string, unknown> }>;
      }
    ).getOpenAiBody('hello');

    expect(body.thinking).toEqual({ type: 'enabled' });
  });

  it('should keep the bare default when prompt passthrough replaces provider passthrough', async () => {
    const provider = createDeepSeekProvider('deepseek:', {
      config: {
        config: {
          passthrough: { trace_id: 'provider-trace' },
        },
      },
    });
    const { body } = await (
      provider as unknown as {
        getOpenAiBody(
          prompt: string,
          context: { prompt: { config: { passthrough: { trace_id: string } } } },
        ): Promise<{ body: Record<string, unknown> }>;
      }
    ).getOpenAiBody('hello', {
      prompt: { config: { passthrough: { trace_id: 'prompt-trace' } } },
    });

    expect(body.thinking).toEqual({ type: 'disabled' });
    expect(body.trace_id).toBe('prompt-trace');
  });
});

describe('DeepSeek native requests', () => {
  const response = {
    data: {
      choices: [{ message: { content: 'fixture answer' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 100, completion_tokens: 20, prompt_cache_hit_tokens: 40 },
    },
    cached: false,
    status: 200,
    statusText: 'OK',
  };

  it.each([
    ['deepseek:', 'deepseek-flash'],
    ['deepseek:deepseek-flash', 'deepseek-flash'],
    ['deepseek:deepseek-v4-flash', 'deepseek-v4-flash'],
    ['deepseek:deepseek-v4-flash-vision-exp', 'deepseek-v4-flash-vision-exp'],
    ['deepseek:deepseek-v4-pro', 'deepseek-v4-pro'],
    ['deepseek:custom-model', 'custom-model'],
    ['deepseek:deepseek-reasoner', 'deepseek-reasoner'],
  ])('serializes %s without rewriting an explicit model', async (providerPath, model) => {
    vi.mocked(fetchWithCache).mockResolvedValueOnce(response);
    const provider = createDeepSeekProvider(providerPath, {
      config: { config: { apiKey: 'test-deepseek-key' } },
    });

    const result = await provider.callApi('Hello');
    const [url, request] = vi.mocked(fetchWithCache).mock.calls[0];
    const body = JSON.parse(request?.body as string);

    expect(url).toBe('https://api.deepseek.com/v1/chat/completions');
    expect(body.model).toBe(model);
    expect(body.messages).toEqual([{ role: 'user', content: 'Hello' }]);
    if (providerPath === 'deepseek:') {
      expect(body.thinking).toEqual({ type: 'disabled' });
    } else {
      expect(body).not.toHaveProperty('thinking');
    }
    expect(result.error).toBeUndefined();
    expect(result.output).toBe('fixture answer');
    const expected =
      model === 'custom-model'
        ? undefined
        : model === 'deepseek-v4-pro'
          ? 0.00016016
          : model === 'deepseek-reasoner'
            ? 0.000014112
            : 0.00004224;
    if (expected === undefined) {
      expect(result.cost).toBeUndefined();
    } else {
      expect(result.cost).toBeCloseTo(expected, 12);
    }
  });

  it.each([{ prompt_cache_hit_tokens: 40 }, { prompt_cache_miss_tokens: 60 }])(
    'uses effective per-call rates with native cache usage %j',
    async (cacheUsage) => {
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
        ...response,
        data: {
          ...response.data,
          usage: { prompt_tokens: 100, completion_tokens: 20, ...cacheUsage },
        },
      });
      const provider = createDeepSeekProvider('deepseek:', {
        config: {
          config: {
            apiKey: 'test-deepseek-key',
            inputCost: 1 / 1e6,
            outputCost: 3 / 1e6,
            passthrough: { thinking: { type: 'disabled' } },
          },
        },
      });

      const result = await provider.callApi('Hello', {
        vars: {},
        prompt: {
          raw: 'Hello',
          label: 'Hello',
          config: {
            inputCost: 2 / 1e6,
            outputCost: 4 / 1e6,
            cacheReadCost: 0.2 / 1e6,
            passthrough: {
              model: 'deepseek-v4-flash-vision-exp',
              thinking: { type: 'enabled' },
              reasoning_effort: 'high',
              top_p: 0.97,
            },
          },
        },
      });
      const body = JSON.parse(vi.mocked(fetchWithCache).mock.calls[0][1]?.body as string);

      expect(body).toMatchObject({
        model: 'deepseek-v4-flash-vision-exp',
        thinking: { type: 'enabled' },
        reasoning_effort: 'high',
        top_p: 0.97,
      });
      expect(body).not.toHaveProperty('inputCost');
      expect(body).not.toHaveProperty('outputCost');
      expect(body).not.toHaveProperty('cacheReadCost');
      expect(result.error).toBeUndefined();
      expect(result.cost).toBeCloseTo(208 / 1e6, 10);
    },
  );

  it('keeps cached canonical Flash responses free when rates are configured', async () => {
    vi.mocked(fetchWithCache).mockResolvedValueOnce({ ...response, cached: true });
    const provider = createDeepSeekProvider('deepseek:deepseek-flash', {
      config: { config: { apiKey: 'test-deepseek-key', cost: 1 / 1e6 } },
    });

    const result = await provider.callApi('Hello');

    expect(result.error).toBeUndefined();
    expect(result.cached).toBe(true);
    expect(result.cost).toBe(0);
  });

  it.each([
    'examples/compare-deepseek-r1-vs-openai-o1/promptfooconfig.yaml',
    'examples/huggingface/hle/promptfooconfig.yaml',
    'examples/huggingface/hle/README.md',
    'site/docs/guides/hle-benchmark.md',
  ])('sends the reasoning example in %s through native Chat Completions', async (path) => {
    const source = fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
    let configs: string[];
    if (path.endsWith('.md')) {
      configs = [...source.matchAll(/```yaml[^\n]*\n([\s\S]*?)```/g)].map((match) => match[1]);
    } else if (path === 'examples/huggingface/hle/promptfooconfig.yaml') {
      // Exercise the optional provider exactly as a user uncommenting this block would.
      const optionalProvider = source.match(/^  # - id: deepseek:[^\n]*(?:\n  # +[^\n]*)*/m);
      expect(optionalProvider).not.toBeNull();
      configs = [`providers:\n${optionalProvider![0].replace(/^  # /gm, '  ')}`];
    } else {
      configs = [source];
    }

    const deepseekProviders = configs.flatMap((config) => {
      const parsed = load(config) as {
        providers?: Array<string | { id: string; config?: Record<string, unknown> }>;
      };
      return (parsed.providers ?? [])
        .map((provider) => (typeof provider === 'string' ? { id: provider } : provider))
        .filter((provider) => provider.id.startsWith('deepseek:'));
    });
    expect(deepseekProviders).toHaveLength(1);
    const example = deepseekProviders[0];
    const provider = createDeepSeekProvider(example.id, {
      config: { config: { ...example.config, apiKey: 'test-deepseek-key' } },
    });
    vi.mocked(fetchWithCache).mockResolvedValueOnce(response);

    const result = await provider.callApi('Solve this reasoning question');
    const [url, request] = vi.mocked(fetchWithCache).mock.calls[0];
    const body = JSON.parse(request?.body as string);

    expect(url).toBe('https://api.deepseek.com/v1/chat/completions');
    expect(body).toMatchObject({
      model: 'deepseek-flash',
      thinking: { type: 'enabled' },
      max_tokens: 8192,
    });
    expect(body).not.toHaveProperty('max_completion_tokens');
    expect(result.error).toBeUndefined();
    expect(result.output).toBe('fixture answer');
    expect(result.cost).toBeCloseTo(0.00004224, 12);
  });

  it.each(['deepseek', 'deepseek:'])(
    'uses the current Flash model without changing the shorthand thinking mode for %s',
    async (path) => {
      const provider = createDeepSeekProvider(path) as OpenAiChatCompletionProvider;
      const { body } = await provider.getOpenAiBody('Hello');
      expect(provider.id()).toBe('deepseek:deepseek-flash');
      expect(body).toMatchObject({ model: 'deepseek-flash', thinking: { type: 'disabled' } });
    },
  );

  it('allows explicit thinking and leaves named model defaults to DeepSeek', async () => {
    const shorthand = createDeepSeekProvider('deepseek:', {
      config: { config: { passthrough: { thinking: { type: 'enabled' } } } },
    }) as OpenAiChatCompletionProvider;
    expect((await shorthand.getOpenAiBody('Hello')).body.thinking).toEqual({ type: 'enabled' });

    const named = createDeepSeekProvider(
      'deepseek:deepseek-v4-pro',
    ) as OpenAiChatCompletionProvider;
    const { body } = await named.getOpenAiBody('Hello');
    expect(body.model).toBe('deepseek-v4-pro');
    expect(body.thinking).toBeUndefined();
  });

  it('reads a provider-scoped API key after config validation', () => {
    const options = ProviderOptionsSchema.parse({ env: { DEEPSEEK_API_KEY: 'provider-key' } });
    const provider = createDeepSeekProvider('deepseek:', {
      config: options,
      env: { DEEPSEEK_API_KEY: 'suite-key' },
    }) as OpenAiChatCompletionProvider;
    expect(provider.getApiKey()).toBe('provider-key');
  });

  it('lets explicit rates replace the peak-hour estimates', () => {
    expect(calculateDeepSeekCost('deepseek-flash', {}, 100, 100)).toBeCloseTo(0.00015, 8);
    expect(
      calculateDeepSeekCost('deepseek-flash', { inputCost: 0.01, outputCost: 0.02 }, 100, 100),
    ).toBeCloseTo(3);
    expect(
      calculateDeepSeekCost(
        'deepseek-flash',
        { inputCost: 0.01, outputCost: 0.02, cacheReadCost: 0.001 },
        100,
        100,
        50,
      ),
    ).toBeCloseTo(2.55);
    expect(
      calculateDeepSeekCost('deepseek-flash', { cost: 0, cacheReadCost: 0 }, 100, 100, 50),
    ).toBe(0);
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

  beforeEach(async () => {
    const actual = await vi.importActual<typeof import('../../src/cache')>('../../src/cache');
    vi.mocked(fetchWithCache).mockImplementation(actual.fetchWithCache);
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
              : item.route.startsWith('fireworks:') || item.route.startsWith('deepseek:')
                ? 0
                : undefined,
          );
          const survivor = response(await fixture.run('success', prompt));
          expect(survivor.output).toBe('Hello from lookup');
          expect(survivor.cached).toBe(true);
          cost(
            survivor.cost,
            item.route.startsWith('fireworks:') || item.route.startsWith('deepseek:')
              ? 0
              : undefined,
          );
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
        const expected = /^hyperbolic:/.test(item.route) ? 14e-6 : 0;
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

  it('preserves DeepSeek request-model billing and raw cache-token discounts', async () => {
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
        cost(result.cost, 11.968e-6);
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

it('keeps mutable prices independent across model aliases', () => {
  const costs = DEEPSEEK_CHAT_MODELS.map(({ cost }) => cost);
  expect(new Set(costs).size).toBe(costs.length);
});
