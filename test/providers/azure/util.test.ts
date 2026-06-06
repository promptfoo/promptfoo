import { describe, expect, it } from 'vitest';
import { calculateAzureCost, throwConfigurationError } from '../../../src/providers/azure/util';

describe('throwConfigurationError', () => {
  it('throws error with formatted message and docs link', () => {
    const message = 'Test error message';
    expect(() => throwConfigurationError(message)).toThrow(
      `${message}\n\nSee https://www.promptfoo.dev/docs/providers/azure/ to learn more about Azure configuration.`,
    );
  });
});

describe('calculateAzureCost', () => {
  it('calculates cost for valid model and tokens', () => {
    const cost = calculateAzureCost(
      'gpt-5.4',
      {},
      100, // prompt tokens
      50, // completion tokens
    );
    expect(cost).toBeDefined();
    expect(typeof cost).toBe('number');
  });

  it('calculates cost for dated GPT-5.4 mini snapshots', () => {
    const cost = calculateAzureCost('gpt-5.4-mini-2026-03-17', {}, 100, 50);
    expect(cost).toBeDefined();
    expect(typeof cost).toBe('number');
  });

  it('calculates cost for dated GPT-5.4 nano snapshots', () => {
    const cost = calculateAzureCost('gpt-5.4-nano-2026-03-17', {}, 100, 50);
    expect(cost).toBeDefined();
    expect(typeof cost).toBe('number');
  });

  it('returns undefined for unknown model', () => {
    const cost = calculateAzureCost('unknown-model', {}, 100, 50);
    expect(cost).toBeUndefined();
  });

  it('calculates cost for Microsoft MAI image models from output tokens', () => {
    // MAI-Image-2.5 bills image output at $33/1M tokens; input is unused here.
    const cost = calculateAzureCost('MAI-Image-2.5', {}, 0, 1000);
    expect(cost).toBeCloseTo(0.033, 6);
  });

  it('calculates cost for the MAI-DS-R1 reasoning model', () => {
    const cost = calculateAzureCost('MAI-DS-R1', {}, 100, 50);
    expect(cost).toBeDefined();
    expect(typeof cost).toBe('number');
  });

  it('returns undefined when tokens are undefined', () => {
    const cost = calculateAzureCost('gpt-4', {}, undefined, undefined);
    expect(cost).toBeUndefined();
  });

  it('returns zero cost with zero tokens', () => {
    const cost = calculateAzureCost('gpt-4', {}, 0, 0);
    expect(cost).toBe(0);
  });

  it('handles empty config object', () => {
    const cost = calculateAzureCost('gpt-4', {}, 100, 50);
    expect(cost).toBeDefined();
    expect(typeof cost).toBe('number');
  });

  it('handles undefined completion tokens', () => {
    const cost = calculateAzureCost('gpt-4', {}, 100, undefined);
    expect(cost).toBeUndefined();
  });

  it('handles undefined prompt tokens', () => {
    const cost = calculateAzureCost('gpt-4', {}, undefined, 50);
    expect(cost).toBeUndefined();
  });
});
