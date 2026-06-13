import { describe, expect, it } from 'vitest';
import {
  calculateEmpirioLabsCost,
  createEmpirioLabsProvider,
  EMPIRIOLABS_CHAT_MODELS,
} from '../../src/providers/empiriolabs';

describe('calculateEmpirioLabsCost', () => {
  it('should calculate cost for deepseek-v4-pro', () => {
    const cost = calculateEmpirioLabsCost('deepseek-v4-pro', {}, 1000000, 1000000);
    expect(cost).toBeCloseTo(2.75); // (0.55 + 2.2)
  });

  it('should calculate cost for deepseek-v4-flash', () => {
    const cost = calculateEmpirioLabsCost('deepseek-v4-flash', {}, 1000000, 1000000);
    expect(cost).toBeCloseTo(0.42); // (0.14 + 0.28)
  });

  it('should calculate cost for kimi-k2-7-code', () => {
    const cost = calculateEmpirioLabsCost('kimi-k2-7-code', {}, 1000000, 1000000);
    expect(cost).toBeCloseTo(4.95); // (0.95 + 4.0)
  });

  it('should return undefined if promptTokens is missing', () => {
    const cost = calculateEmpirioLabsCost('deepseek-v4-pro', {}, undefined, 1000000);
    expect(cost).toBeUndefined();
  });

  it('should return undefined if completionTokens is missing', () => {
    const cost = calculateEmpirioLabsCost('deepseek-v4-pro', {}, 1000000, undefined);
    expect(cost).toBeUndefined();
  });

  it('should use custom cost from config', () => {
    const config = { cost: 1.0 / 1e6 };
    const cost = calculateEmpirioLabsCost('deepseek-v4-pro', config, 1000000, 1000000);
    expect(cost).toBeCloseTo(2.0); // (1.0 + 1.0) from config override
  });

  it('should use separate custom input and output costs from config', () => {
    const config = { inputCost: 1.0 / 1e6, outputCost: 3.0 / 1e6 };
    const cost = calculateEmpirioLabsCost('deepseek-v4-pro', config, 1000000, 1000000);
    expect(cost).toBeCloseTo(4.0);
  });

  it('should prefer separate custom costs over custom cost', () => {
    const config = { cost: 5.0 / 1e6, inputCost: 1.0 / 1e6, outputCost: 3.0 / 1e6 };
    const cost = calculateEmpirioLabsCost('deepseek-v4-pro', config, 1000000, 1000000);
    expect(cost).toBeCloseTo(4.0);
  });

  it('should return undefined when an unknown model has no pricing', () => {
    const cost = calculateEmpirioLabsCost('unknown-model', {}, 1000000, 1000000);
    expect(cost).toBeUndefined();
  });
});

describe('EMPIRIOLABS_CHAT_MODELS', () => {
  it('should have correct pricing for deepseek-v4-pro', () => {
    const model = EMPIRIOLABS_CHAT_MODELS.find((m) => m.id === 'deepseek-v4-pro');
    expect(model).toBeDefined();
    expect(model!.cost.input).toBeCloseTo(0.55 / 1e6);
    expect(model!.cost.output).toBeCloseTo(2.2 / 1e6);
  });

  it('should have correct pricing for kimi-k2-7-code', () => {
    const model = EMPIRIOLABS_CHAT_MODELS.find((m) => m.id === 'kimi-k2-7-code');
    expect(model).toBeDefined();
    expect(model!.cost.input).toBeCloseTo(0.95 / 1e6);
    expect(model!.cost.output).toBeCloseTo(4.0 / 1e6);
  });
});

describe('createEmpirioLabsProvider', () => {
  it('should create a provider with the given model id', () => {
    expect(createEmpirioLabsProvider('empiriolabs:qwen3-7-plus').id()).toBe(
      'empiriolabs:qwen3-7-plus',
    );
  });

  it('should preserve colons in model ids', () => {
    expect(createEmpirioLabsProvider('empiriolabs:deepseek-v4-flash:variant1').id()).toBe(
      'empiriolabs:deepseek-v4-flash:variant1',
    );
  });
});
