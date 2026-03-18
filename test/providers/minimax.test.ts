import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  calculateMiniMaxCost,
  createMiniMaxProvider,
  MINIMAX_CHAT_MODELS,
} from '../../src/providers/minimax';

vi.mock('../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('calculateMiniMaxCost', () => {
  it('should calculate cost without cache for MiniMax-M2.7', () => {
    const cost = calculateMiniMaxCost('MiniMax-M2.7', {}, 1000000, 1000000);
    expect(cost).toBeCloseTo(1.5); // (0.3 + 1.2)
  });

  it('should calculate cost with cache hits for MiniMax-M2.7', () => {
    const cost = calculateMiniMaxCost('MiniMax-M2.7', {}, 1000000, 1000000, 500000);
    expect(cost).toBeCloseTo(1.365); // (0.3 * 0.5 + 0.03 * 0.5 + 1.2)
  });

  it('should calculate cost for MiniMax-M2.7-highspeed', () => {
    const cost = calculateMiniMaxCost('MiniMax-M2.7-highspeed', {}, 1000000, 1000000);
    expect(cost).toBeCloseTo(3.0); // (0.6 + 2.4)
  });

  it('should calculate cost with cache hits for MiniMax-M2.7-highspeed', () => {
    const cost = calculateMiniMaxCost('MiniMax-M2.7-highspeed', {}, 1000000, 1000000, 500000);
    expect(cost).toBeCloseTo(2.73); // (0.6 * 0.5 + 0.06 * 0.5 + 2.4)
  });

  it('should calculate cost without cache for MiniMax-M2.5', () => {
    const cost = calculateMiniMaxCost('MiniMax-M2.5', {}, 1000000, 1000000);
    expect(cost).toBeCloseTo(1.5); // (0.3 + 1.2)
  });

  it('should calculate cost with cache hits for MiniMax-M2.5', () => {
    const cost = calculateMiniMaxCost('MiniMax-M2.5', {}, 1000000, 1000000, 500000);
    expect(cost).toBeCloseTo(1.365); // (0.3 * 0.5 + 0.03 * 0.5 + 1.2)
  });

  it('should calculate cost for MiniMax-M2.5-highspeed', () => {
    const cost = calculateMiniMaxCost('MiniMax-M2.5-highspeed', {}, 1000000, 1000000);
    expect(cost).toBeCloseTo(3.0); // (0.6 + 2.4)
  });

  it('should calculate cost with cache hits for MiniMax-M2.5-highspeed', () => {
    const cost = calculateMiniMaxCost('MiniMax-M2.5-highspeed', {}, 1000000, 1000000, 500000);
    expect(cost).toBeCloseTo(2.715); // (0.6 * 0.5 + 0.03 * 0.5 + 2.4)
  });

  it('should return undefined if promptTokens is missing', () => {
    const cost = calculateMiniMaxCost('MiniMax-M2.7', {}, undefined, 1000000);
    expect(cost).toBeUndefined();
  });

  it('should return undefined if completionTokens is missing', () => {
    const cost = calculateMiniMaxCost('MiniMax-M2.7', {}, 1000000, undefined);
    expect(cost).toBeUndefined();
  });

  it('should use custom cost from config', () => {
    const config = { cost: 1.0 / 1e6 };
    const cost = calculateMiniMaxCost('MiniMax-M2.7', config, 1000000, 1000000);
    expect(cost).toBeCloseTo(2.0); // (1.0 + 1.0) from config override
  });

  it('should handle unknown model names', () => {
    const cost = calculateMiniMaxCost('unknown-model', {}, 1000000, 1000000);
    expect(cost).toBeUndefined();
  });

  it('should calculate cost with 100% cache hits for M2.7', () => {
    const cost = calculateMiniMaxCost('MiniMax-M2.7', {}, 1000000, 1000000, 1000000);
    expect(cost).toBeCloseTo(1.23); // (0.03 + 1.2) - all input tokens are cached
  });
});

describe('MINIMAX_CHAT_MODELS', () => {
  it('should have correct pricing for MiniMax-M2.7', () => {
    const model = MINIMAX_CHAT_MODELS.find((m) => m.id === 'MiniMax-M2.7');
    expect(model).toBeDefined();
    expect(model?.cost.input).toBeCloseTo(0.3 / 1e6);
    expect(model?.cost.output).toBeCloseTo(1.2 / 1e6);
    expect(model?.cost.cache_read).toBeCloseTo(0.03 / 1e6);
  });

  it('should have correct pricing for MiniMax-M2.7-highspeed', () => {
    const model = MINIMAX_CHAT_MODELS.find((m) => m.id === 'MiniMax-M2.7-highspeed');
    expect(model).toBeDefined();
    expect(model?.cost.input).toBeCloseTo(0.6 / 1e6);
    expect(model?.cost.output).toBeCloseTo(2.4 / 1e6);
    expect(model?.cost.cache_read).toBeCloseTo(0.06 / 1e6);
  });

  it('should have correct pricing for MiniMax-M2.5', () => {
    const model = MINIMAX_CHAT_MODELS.find((m) => m.id === 'MiniMax-M2.5');
    expect(model).toBeDefined();
    expect(model?.cost.input).toBeCloseTo(0.3 / 1e6);
    expect(model?.cost.output).toBeCloseTo(1.2 / 1e6);
    expect(model?.cost.cache_read).toBeCloseTo(0.03 / 1e6);
  });

  it('should have correct pricing for MiniMax-M2.5-highspeed', () => {
    const model = MINIMAX_CHAT_MODELS.find((m) => m.id === 'MiniMax-M2.5-highspeed');
    expect(model).toBeDefined();
    expect(model?.cost.input).toBeCloseTo(0.6 / 1e6);
    expect(model?.cost.output).toBeCloseTo(2.4 / 1e6);
    expect(model?.cost.cache_read).toBeCloseTo(0.03 / 1e6);
  });

  it('should contain exactly four models', () => {
    expect(MINIMAX_CHAT_MODELS).toHaveLength(4);
  });

  it('should have M2.7 as first model in the list', () => {
    expect(MINIMAX_CHAT_MODELS[0].id).toBe('MiniMax-M2.7');
  });

  it('should have M2.7-highspeed as second model in the list', () => {
    expect(MINIMAX_CHAT_MODELS[1].id).toBe('MiniMax-M2.7-highspeed');
  });
});

describe('createMiniMaxProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should use default model MiniMax-M2.7 when no model specified', () => {
    const provider = createMiniMaxProvider('minimax');
    expect(provider.id()).toBe('minimax:MiniMax-M2.7');
  });

  it('should parse model name from provider path', () => {
    const provider = createMiniMaxProvider('minimax:MiniMax-M2.5');
    expect(provider.id()).toBe('minimax:MiniMax-M2.5');
  });

  it('should handle model names with colons', () => {
    const provider = createMiniMaxProvider('minimax:MiniMax-M2.7-highspeed');
    expect(provider.id()).toBe('minimax:MiniMax-M2.7-highspeed');
  });

  it('should pass options to the provider', () => {
    const provider = createMiniMaxProvider('minimax:MiniMax-M2.7', {
      config: {
        config: {
          temperature: 0.8,
          max_tokens: 2000,
        },
      },
    });
    expect(provider.id()).toBe('minimax:MiniMax-M2.7');
  });
});

describe('MiniMaxProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return correct id', () => {
    const provider = createMiniMaxProvider('minimax:MiniMax-M2.7');
    expect(provider.id()).toBe('minimax:MiniMax-M2.7');
  });

  it('should return correct string representation', () => {
    const provider = createMiniMaxProvider('minimax:MiniMax-M2.7');
    expect(provider.toString()).toBe('[MiniMax Provider MiniMax-M2.7]');
  });

  it('should serialize to JSON correctly', () => {
    const provider = createMiniMaxProvider('minimax:MiniMax-M2.7', {
      config: {
        config: {
          temperature: 0.7,
          max_tokens: 100,
        },
      },
    });
    const json = (provider as any).toJSON();
    expect(json.provider).toBe('minimax');
    expect(json.model).toBe('MiniMax-M2.7');
  });

  it('should not expose apiKey in JSON serialization', () => {
    const provider = createMiniMaxProvider('minimax:MiniMax-M2.7', {
      config: {
        config: {
          apiKey: 'secret-key',
        },
      },
    });
    const json = (provider as any).toJSON();
    expect(json.config.apiKey).toBeUndefined();
  });

  it('should set apiBaseUrl to MiniMax API endpoint', () => {
    const provider = createMiniMaxProvider('minimax:MiniMax-M2.7');
    const json = (provider as any).toJSON();
    expect(json.config.apiBaseUrl).toBe('https://api.minimax.io/v1');
  });

  it('should set apiKeyEnvar to MINIMAX_API_KEY', () => {
    const provider = createMiniMaxProvider('minimax:MiniMax-M2.7');
    const json = (provider as any).toJSON();
    expect(json.config.apiKeyEnvar).toBe('MINIMAX_API_KEY');
  });
});
