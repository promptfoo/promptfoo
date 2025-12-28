import { describe, expect, it } from 'vitest';
import { calculateDeepSeekCost, DEEPSEEK_CHAT_MODELS } from '../../src/providers/deepseek';

describe('calculateDeepSeekCost', () => {
  it('should calculate cost without cache', () => {
    const cost = calculateDeepSeekCost('deepseek-chat', {}, 1000000, 1000000);
    expect(cost).toBeCloseTo(0.7); // (0.28 + 0.42)
  });

  it('should calculate cost with cache hits', () => {
    const cost = calculateDeepSeekCost('deepseek-chat', {}, 1000000, 1000000, 500000);
    expect(cost).toBeCloseTo(0.574); // (0.28 * 0.5 + 0.028 * 0.5 + 0.42)
  });

  it('should calculate cost for deepseek-reasoner', () => {
    const cost = calculateDeepSeekCost('deepseek-reasoner', {}, 1000000, 1000000);
    expect(cost).toBeCloseTo(0.7); // Same pricing as deepseek-chat
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

  it('should handle unknown model names', () => {
    const cost = calculateDeepSeekCost('unknown-model', {}, 1000000, 1000000);
    expect(cost).toBeUndefined();
  });

  it('should calculate cost with 100% cache hits', () => {
    const cost = calculateDeepSeekCost('deepseek-chat', {}, 1000000, 1000000, 1000000);
    expect(cost).toBeCloseTo(0.448); // (0.028 + 0.42) - all input tokens are cached
  });
});

describe('DEEPSEEK_CHAT_MODELS', () => {
  it('should have correct pricing for deepseek-chat', () => {
    const model = DEEPSEEK_CHAT_MODELS.find((m) => m.id === 'deepseek-chat');
    expect(model).toBeDefined();
    expect(model?.cost.input).toBeCloseTo(0.28 / 1e6);
    expect(model?.cost.output).toBeCloseTo(0.42 / 1e6);
    expect(model?.cost.cache_read).toBeCloseTo(0.028 / 1e6);
  });

  it('should have correct pricing for deepseek-reasoner', () => {
    const model = DEEPSEEK_CHAT_MODELS.find((m) => m.id === 'deepseek-reasoner');
    expect(model).toBeDefined();
    expect(model?.cost.input).toBeCloseTo(0.28 / 1e6);
    expect(model?.cost.output).toBeCloseTo(0.42 / 1e6);
    expect(model?.cost.cache_read).toBeCloseTo(0.028 / 1e6);
  });
});
