import { describe, expect, it } from 'vitest';
import {
  calculateDeepSeekCost,
  createDeepSeekProvider,
  DEEPSEEK_CHAT_MODELS,
} from '../../src/providers/deepseek';

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

  it.each(['deepseek-v4-flash', 'deepseek-v4-pro', 'deepseek-chat', 'deepseek-reasoner'])(
    'leaves %s cost unknown without applicable billing rates',
    (model) => {
      expect(calculateDeepSeekCost(model, {}, 1_000_000, 1_000_000)).toBeUndefined();
      expect(calculateDeepSeekCost(model, {}, 1_000_000, 1_000_000, 500_000)).toBeUndefined();
    },
  );

  it('requires rates only for token categories actually used', () => {
    expect(
      calculateDeepSeekCost('deepseek-v4-flash', { inputCost: 1 / 1e6 }, 10, 1),
    ).toBeUndefined();
    expect(
      calculateDeepSeekCost('deepseek-v4-flash', { outputCost: 3 / 1e6 }, 1, 10),
    ).toBeUndefined();
    expect(
      calculateDeepSeekCost('deepseek-v4-flash', { cacheReadCost: 0.1 / 1e6 }, 10, 0, 10),
    ).toBeCloseTo(1 / 1e6);
    expect(calculateDeepSeekCost('deepseek-v4-flash', { cost: 0 }, 10, 10, 5)).toBe(0);
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
});

describe('DEEPSEEK_CHAT_MODELS', () => {
  it('retains current IDs and legacy aliases without unqualified prices', () => {
    expect(DEEPSEEK_CHAT_MODELS).toEqual([
      { id: 'deepseek-v4-flash' },
      { id: 'deepseek-v4-pro' },
      { id: 'deepseek-chat' },
      { id: 'deepseek-reasoner' },
    ]);
  });
});

describe('createDeepSeekProvider', () => {
  it('leaves fresh usage unpriced without applicable rates and cached responses free', () => {
    const provider = createDeepSeekProvider('deepseek:deepseek-v4-flash') as unknown as {
      calculateResponseCost(
        data: Record<string, unknown>,
        config: Record<string, unknown>,
        cached: boolean,
      ): number | undefined;
    };
    const data = { usage: { prompt_tokens: 1_000_000, completion_tokens: 1_000_000 } };
    expect(provider.calculateResponseCost(data, {}, false)).toBeUndefined();
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

  it('should use the current V4 Flash model by default', () => {
    expect(createDeepSeekProvider('deepseek').id()).toBe('deepseek:deepseek-v4-flash');
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

  it('should keep the upstream thinking default for an explicit V4 model', async () => {
    const provider = createDeepSeekProvider('deepseek:deepseek-v4-flash');
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
