import { getTokenUsage, calculateAI21Cost } from '../../src/providers/ai21';

describe('getTokenUsage', () => {
  it('should return empty object if no usage data', () => {
    const data = {};
    expect(getTokenUsage(data, false)).toEqual({});
  });

  it('should return cached token usage', () => {
    const data = {
      usage: {
        total_tokens: 100,
      },
    };
    expect(getTokenUsage(data, true)).toEqual({
      cached: 100,
      total: 100,
    });
  });

  it('should return uncached token usage', () => {
    const data = {
      usage: {
        total_tokens: 100,
        prompt_tokens: 50,
        completion_tokens: 50,
      },
    };
    expect(getTokenUsage(data, false)).toEqual({
      total: 100,
      prompt: 50,
      completion: 50,
    });
  });

  it('should handle missing prompt/completion tokens', () => {
    const data = {
      usage: {
        total_tokens: 100,
      },
    };
    expect(getTokenUsage(data, false)).toEqual({
      total: 100,
      prompt: 0,
      completion: 0,
    });
  });

  it('should handle null/undefined usage values', () => {
    const data = {
      usage: {
        total_tokens: null,
        prompt_tokens: undefined,
        completion_tokens: null,
      },
    };
    expect(getTokenUsage(data, false)).toEqual({
      total: null,
      prompt: 0,
      completion: 0,
    });
  });
});

describe('calculateAI21Cost', () => {
  it('should calculate cost for known model', () => {
    const cost = calculateAI21Cost('jamba-1.5-mini', {}, 100, 50);
    expect(cost).toBe(0.00004); // (100 * 0.2 + 50 * 0.4) / 1000000
  });

  it('should return undefined for unknown model', () => {
    const cost = calculateAI21Cost('unknown-model', {}, 100, 50);
    expect(cost).toBeUndefined();
  });

  it('should use config cost if provided', () => {
    const cost = calculateAI21Cost('jamba-1.5-mini', { cost: 0.006 }, 100, 50);
    expect(cost).toBeCloseTo(0.9, 10); // 150 * 0.006
  });

  it('should return undefined if tokens are undefined', () => {
    const cost = calculateAI21Cost('jamba-1.5-mini', {}, undefined, undefined);
    expect(cost).toBeUndefined();
  });

  it('should handle zero tokens', () => {
    const cost = calculateAI21Cost('jamba-1.5-mini', {}, 0, 0);
    expect(cost).toBeUndefined();
  });

  it('should calculate cost for jamba-1.5-large model', () => {
    const cost = calculateAI21Cost('jamba-1.5-large', {}, 100, 50);
    expect(cost).toBe(0.0006); // (100 * 2 + 50 * 8) / 1000000
  });
});
