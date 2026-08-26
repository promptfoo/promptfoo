import { describe, expect, it } from 'vitest';
import {
  calculateVolcengineCost,
  createVolcengineProvider,
  VOLCENGINE_CHAT_MODELS,
  VolcengineProvider,
} from '../../src/providers/volcengine';

describe('calculateVolcengineCost', () => {
  it('should calculate cost without cache', () => {
    const cost = calculateVolcengineCost('doubao-seed-2-1-pro-260628', {}, 1000000, 1000000);
    // input 6.00 CNY, output 30.00 CNY -> (6.00 + 30.00) / 6.737012 ≈ 5.3436
    expect(cost).toBeCloseTo(36.0 / 6.737012);
  });

  it('should calculate cost with cache hits', () => {
    const cost = calculateVolcengineCost(
      'doubao-seed-2-1-pro-260628',
      {},
      1000000,
      1000000,
      500000,
    );
    // (6.00 * 0.5 + 1.20 * 0.5 + 30.00) / 6.737012 = 33.6 / 6.737012
    expect(cost).toBeCloseTo(33.6 / 6.737012);
  });

  it('should calculate cost for doubao-seed-evolving', () => {
    const cost = calculateVolcengineCost('doubao-seed-evolving', {}, 1000000, 1000000);
    expect(cost).toBeCloseTo(36.0 / 6.737012);
  });

  it('should calculate cost for doubao-seed-2-1-turbo-260628', () => {
    const cost = calculateVolcengineCost('doubao-seed-2-1-turbo-260628', {}, 1000000, 1000000);
    // input 3.00 CNY, output 15.00 CNY -> 18.0 / 6.737012
    expect(cost).toBeCloseTo(18.0 / 6.737012);
  });

  it('should calculate cost for doubao-seed-2-0-lite-260428', () => {
    const cost = calculateVolcengineCost('doubao-seed-2-0-lite-260428', {}, 1000000, 1000000);
    // input 0.60 CNY, output 3.60 CNY -> 4.2 / 6.737012
    expect(cost).toBeCloseTo(4.2 / 6.737012);
  });

  it('should calculate cost for doubao-seed-2-0-mini-260428', () => {
    const cost = calculateVolcengineCost('doubao-seed-2-0-mini-260428', {}, 1000000, 1000000);
    // input 0.20 CNY, output 2.00 CNY -> 2.2 / 6.737012
    expect(cost).toBeCloseTo(2.2 / 6.737012);
  });

  it('should return undefined if promptTokens is missing', () => {
    const cost = calculateVolcengineCost('doubao-seed-2-1-pro-260628', {}, undefined, 1000000);
    expect(cost).toBeUndefined();
  });

  it('should return undefined if completionTokens is missing', () => {
    const cost = calculateVolcengineCost('doubao-seed-2-1-pro-260628', {}, 1000000, undefined);
    expect(cost).toBeUndefined();
  });

  it('should use custom cost from config', () => {
    const config = { cost: 1.0 / 1e6 };
    const cost = calculateVolcengineCost('doubao-seed-2-1-pro-260628', config, 1000000, 1000000);
    expect(cost).toBeCloseTo(2.0); // (1.0 + 1.0) from config override
  });

  it('should use separate custom input and output costs from config', () => {
    const config = { inputCost: 1.0 / 1e6, outputCost: 3.0 / 1e6 };
    const cost = calculateVolcengineCost('doubao-seed-2-1-pro-260628', config, 1000000, 1000000);
    expect(cost).toBeCloseTo(4.0);
  });

  it('should use separate custom input and output costs with cache hits', () => {
    const config = { inputCost: 1.0 / 1e6, outputCost: 3.0 / 1e6 };
    const cost = calculateVolcengineCost(
      'doubao-seed-2-1-pro-260628',
      config,
      1000000,
      1000000,
      500000,
    );
    // 1.0 * 0.5 + cache_read * 0.5 + 3.0
    const expected = 0.5 + (1.2 / 6.737012) * 0.5 + 3.0;
    expect(cost).toBeCloseTo(expected);
  });

  it('should prefer separate custom costs over custom cost', () => {
    const config = { cost: 5.0 / 1e6, inputCost: 1.0 / 1e6, outputCost: 3.0 / 1e6 };
    const cost = calculateVolcengineCost('doubao-seed-2-1-pro-260628', config, 1000000, 1000000);
    expect(cost).toBeCloseTo(4.0);
  });

  it('should return undefined when an unknown model has no pricing', () => {
    const cost = calculateVolcengineCost('unknown-model', {}, 1000000, 1000000);
    expect(cost).toBeUndefined();
  });

  it('should calculate cost with 100% cache hits', () => {
    const cost = calculateVolcengineCost(
      'doubao-seed-2-1-pro-260628',
      {},
      1000000,
      1000000,
      1000000,
    );
    // cache_read (1.20) + output (30.00) = 31.2 / 6.737012
    expect(cost).toBeCloseTo(31.2 / 6.737012);
  });

  it('should clamp cached tokens that exceed prompt tokens', () => {
    const cost = calculateVolcengineCost(
      'doubao-seed-2-1-pro-260628',
      {},
      1000000,
      1000000,
      1500000,
    );
    expect(cost).toBeCloseTo(31.2 / 6.737012);
  });

  it('should clamp negative cached tokens to zero', () => {
    const cost = calculateVolcengineCost(
      'doubao-seed-2-1-pro-260628',
      {},
      1000000,
      1000000,
      -500000,
    );
    expect(cost).toBeCloseTo(36.0 / 6.737012);
  });

  it('should treat non-finite cached tokens as no cache hits', () => {
    const cost = calculateVolcengineCost(
      'doubao-seed-2-1-pro-260628',
      {},
      1000000,
      1000000,
      Number.NaN,
    );
    expect(cost).toBeCloseTo(36.0 / 6.737012);
  });
});

describe('VOLCENGINE_CHAT_MODELS', () => {
  it('should have correct pricing for doubao-seed-evolving', () => {
    const model = VOLCENGINE_CHAT_MODELS.find((m) => m.id === 'doubao-seed-evolving');
    expect(model).toBeDefined();
    expect(model!.cost.input).toBeCloseTo(6.0 / 6.737012 / 1e6);
    expect(model!.cost.output).toBeCloseTo(30.0 / 6.737012 / 1e6);
    expect(model!.cost.cache_read).toBeCloseTo(1.2 / 6.737012 / 1e6);
  });

  it('should have correct pricing for doubao-seed-2-1-pro-260628', () => {
    const model = VOLCENGINE_CHAT_MODELS.find((m) => m.id === 'doubao-seed-2-1-pro-260628');
    expect(model).toBeDefined();
    expect(model!.cost.input).toBeCloseTo(6.0 / 6.737012 / 1e6);
    expect(model!.cost.output).toBeCloseTo(30.0 / 6.737012 / 1e6);
    expect(model!.cost.cache_read).toBeCloseTo(1.2 / 6.737012 / 1e6);
  });

  it('should have correct pricing for doubao-seed-2-1-turbo-260628', () => {
    const model = VOLCENGINE_CHAT_MODELS.find((m) => m.id === 'doubao-seed-2-1-turbo-260628');
    expect(model).toBeDefined();
    expect(model!.cost.input).toBeCloseTo(3.0 / 6.737012 / 1e6);
    expect(model!.cost.output).toBeCloseTo(15.0 / 6.737012 / 1e6);
    expect(model!.cost.cache_read).toBeCloseTo(0.6 / 6.737012 / 1e6);
  });

  it('should have correct pricing for doubao-seed-2-0-pro-260215', () => {
    const model = VOLCENGINE_CHAT_MODELS.find((m) => m.id === 'doubao-seed-2-0-pro-260215');
    expect(model).toBeDefined();
    expect(model!.cost.input).toBeCloseTo(3.2 / 6.737012 / 1e6);
    expect(model!.cost.output).toBeCloseTo(16.0 / 6.737012 / 1e6);
    expect(model!.cost.cache_read).toBeCloseTo(0.64 / 6.737012 / 1e6);
  });

  it('should have correct pricing for doubao-seed-2-0-lite-260428', () => {
    const model = VOLCENGINE_CHAT_MODELS.find((m) => m.id === 'doubao-seed-2-0-lite-260428');
    expect(model).toBeDefined();
    expect(model!.cost.input).toBeCloseTo(0.6 / 6.737012 / 1e6);
    expect(model!.cost.output).toBeCloseTo(3.6 / 6.737012 / 1e6);
    expect(model!.cost.cache_read).toBeCloseTo(0.12 / 6.737012 / 1e6);
  });

  it('should have correct pricing for doubao-seed-2-0-mini-260428', () => {
    const model = VOLCENGINE_CHAT_MODELS.find((m) => m.id === 'doubao-seed-2-0-mini-260428');
    expect(model).toBeDefined();
    expect(model!.cost.input).toBeCloseTo(0.2 / 6.737012 / 1e6);
    expect(model!.cost.output).toBeCloseTo(2.0 / 6.737012 / 1e6);
    expect(model!.cost.cache_read).toBeCloseTo(0.04 / 6.737012 / 1e6);
  });

  it('should have correct aliases for doubao models', () => {
    const aliasPro = VOLCENGINE_CHAT_MODELS.find((m) => m.id === 'doubao-seed-2-1-pro');
    expect(aliasPro).toBeDefined();
    expect(aliasPro!.cost.input).toBeCloseTo(6.0 / 6.737012 / 1e6);

    const aliasTurbo = VOLCENGINE_CHAT_MODELS.find((m) => m.id === 'doubao-seed-2-1-turbo');
    expect(aliasTurbo).toBeDefined();
    expect(aliasTurbo!.cost.input).toBeCloseTo(3.0 / 6.737012 / 1e6);

    const aliasLite = VOLCENGINE_CHAT_MODELS.find((m) => m.id === 'doubao-seed-2-0-lite');
    expect(aliasLite).toBeDefined();
    expect(aliasLite!.cost.input).toBeCloseTo(0.6 / 6.737012 / 1e6);
  });
});

describe('createVolcengineProvider', () => {
  it('should default to doubao-seed-2-1-pro-260628 when no model is specified', () => {
    expect(createVolcengineProvider('volcengine').id()).toBe(
      'volcengine:doubao-seed-2-1-pro-260628',
    );
    expect(createVolcengineProvider('volcengine:').id()).toBe(
      'volcengine:doubao-seed-2-1-pro-260628',
    );
  });

  it('should create provider with specific model', () => {
    expect(createVolcengineProvider('volcengine:doubao-seed-evolving').id()).toBe(
      'volcengine:doubao-seed-evolving',
    );
  });
});

describe('VolcengineProvider', () => {
  it('should initialize with correct default config', () => {
    const provider = new VolcengineProvider('doubao-seed-2-1-pro-260628', {});
    expect(provider.id()).toBe('volcengine:doubao-seed-2-1-pro-260628');
    expect(provider.toString()).toBe('[Volcengine Provider doubao-seed-2-1-pro-260628]');
    expect(provider.config.apiKeyEnvar).toBe('ARK_API_KEY');
    expect(provider.config.apiBaseUrl).toBe('https://ark.cn-beijing.volces.com/api/v3');
  });

  it('should allow overriding apiBaseUrl and apiKeyEnvar', () => {
    const provider = new VolcengineProvider('doubao-seed-2-1-pro-260628', {
      config: {
        apiBaseUrl: 'https://custom-ark.volces.com/api/v3',
        apiKeyEnvar: 'CUSTOM_ARK_KEY',
      },
    });
    expect(provider.config.apiBaseUrl).toBe('https://custom-ark.volces.com/api/v3');
    expect(provider.config.apiKeyEnvar).toBe('CUSTOM_ARK_KEY');
  });

  it('should format toJSON correctly without leaking raw apiKey', () => {
    const provider = new VolcengineProvider('doubao-seed-2-1-pro-260628', {
      config: {
        apiKey: 'secret-key',
        temperature: 0.5,
      },
    });
    const json = provider.toJSON();
    expect(json.provider).toBe('volcengine');
    expect(json.model).toBe('doubao-seed-2-1-pro-260628');
    expect(json.config.apiKey).toBeUndefined();
    expect(json.config.temperature).toBe(0.5);
  });
});
