import { describe, expect, it } from 'vitest';
import {
  calculateDeepSeekCost,
  createDeepSeekProvider,
  DEEPSEEK_CHAT_MODELS,
} from '../../src/providers/deepseek';
import { ProviderOptionsSchema } from '../../src/validators/providers';

import type { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';

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

  it.each(['unknown-model', 'deepseek-flash'])(
    'does not guess a rate for billable %s usage',
    (model) => {
      expect(calculateDeepSeekCost(model, { inputCost: 0.01 }, 100, 100)).toBeUndefined();
      expect(calculateDeepSeekCost(model, { outputCost: 0.02 }, 100, 100)).toBeUndefined();
      expect(calculateDeepSeekCost(model, { cacheReadCost: 0.001 }, 100, 100, 50)).toBeUndefined();
      expect(
        calculateDeepSeekCost(model, { cacheReadCost: 0.001, outputCost: 0.02 }, 100, 100, 50),
      ).toBeUndefined();
      expect(calculateDeepSeekCost(model, {}, 0, 0)).toBeUndefined();
    },
  );

  it('only needs a rate for token categories that were actually used', () => {
    expect(calculateDeepSeekCost('deepseek-flash', { inputCost: 0.01 }, 100, 0, 50)).toBeCloseTo(1);
    expect(calculateDeepSeekCost('deepseek-flash', { outputCost: 0.02 }, 0, 100)).toBeCloseTo(2);
    expect(
      calculateDeepSeekCost('deepseek-flash', { cacheReadCost: 0.001 }, 100, 0, 100),
    ).toBeCloseTo(0.1);
    expect(
      calculateDeepSeekCost(
        'deepseek-flash',
        { cacheReadCost: 0.001, outputCost: 0.02 },
        100,
        100,
        100,
      ),
    ).toBeCloseTo(2.1);
    expect(calculateDeepSeekCost('deepseek-flash', { cost: 0 }, 100, 100, 50)).toBe(0);
  });

  it('keeps built-in rates for unspecified directions on known models', () => {
    expect(calculateDeepSeekCost('deepseek-v4-pro', { inputCost: 0.01 }, 100, 100)).toBeCloseTo(
      1.000087,
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

  it('needs explicit rates to estimate costs for the canonical Flash ID', () => {
    expect(calculateDeepSeekCost('deepseek-flash', {}, 100, 100)).toBeUndefined();
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
    expect(calculateDeepSeekCost('deepseek-flash', { cost: 0 }, 100, 100, 50)).toBe(0);
  });
});
