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
