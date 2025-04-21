import { throwConfigurationError, calculateAzureCost } from '../../../src/providers/azure/util';

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
      'gpt-4',
      {},
      100, // prompt tokens
      50, // completion tokens
    );
    expect(cost).toBeDefined();
    expect(typeof cost).toBe('number');
  });

  it('returns undefined for unknown model', () => {
    const cost = calculateAzureCost('unknown-model', {}, 100, 50);
    expect(cost).toBeUndefined();
  });

  it('returns undefined when tokens are undefined', () => {
    const cost = calculateAzureCost('gpt-4', {}, undefined, undefined);
    expect(cost).toBeUndefined();
  });

  it('returns undefined with zero tokens', () => {
    const cost = calculateAzureCost('gpt-4', {}, 0, 0);
    expect(cost).toBeUndefined();
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
