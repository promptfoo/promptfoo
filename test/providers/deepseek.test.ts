import { describe, expect, it } from 'vitest';
import {
  calculateDeepSeekCost,
  createDeepSeekProvider,
  DEEPSEEK_CHAT_MODELS,
} from '../../src/providers/deepseek';

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
      {},
      false,
    );

    expect(cost).toBeCloseTo(0.69745);
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
      {},
      false,
    );

    expect(cost).toBeCloseTo(0.69745);
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
