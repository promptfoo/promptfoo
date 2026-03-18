import { describe, expect, it } from 'vitest';
import { calculateMiniMaxCost, MINIMAX_CHAT_MODELS } from '../../src/providers/minimax';

describe('calculateMiniMaxCost', () => {
  it('should calculate cost without cache for MiniMax-M2.7', () => {
    const cost = calculateMiniMaxCost('MiniMax-M2.7', {}, 1000000, 1000000);
    expect(cost).toBeCloseTo(1.5); // (0.3 + 1.2)
  });

  it('should calculate cost with cache hits for MiniMax-M2.7', () => {
    const cost = calculateMiniMaxCost('MiniMax-M2.7', {}, 1000000, 1000000, 500000);
    expect(cost).toBeCloseTo(1.38); // (0.3 * 0.5 + 0.06 * 0.5 + 1.2)
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
    expect(cost).toBeCloseTo(1.26); // (0.06 + 1.2) - all input tokens are cached
  });
});

describe('MINIMAX_CHAT_MODELS', () => {
  it('should have correct pricing for MiniMax-M2.7', () => {
    const model = MINIMAX_CHAT_MODELS.find((m) => m.id === 'MiniMax-M2.7');
    expect(model).toBeDefined();
    expect(model?.cost.input).toBeCloseTo(0.3 / 1e6);
    expect(model?.cost.output).toBeCloseTo(1.2 / 1e6);
    expect(model?.cost.cache_read).toBeCloseTo(0.06 / 1e6);
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
