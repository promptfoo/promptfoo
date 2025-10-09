import {
  ADDITIONAL_STRATEGIES,
  ALL_STRATEGIES,
  getDefaultNFanout,
  isCustomStrategy,
  isFanoutStrategy,
  STRATEGY_COLLECTIONS,
} from '../../../src/redteam/constants/strategies';

describe('strategies constants', () => {
  it('should have all strategies sorted', () => {
    const expectedStrategies = [
      'default',
      'basic',
      'jailbreak',
      'jailbreak:composite',
      ...ADDITIONAL_STRATEGIES,
      ...STRATEGY_COLLECTIONS,
    ].sort();

    expect(ALL_STRATEGIES).toEqual(expectedStrategies);
  });

  it('should correctly identify custom strategies', () => {
    expect(isCustomStrategy('custom')).toBe(true);
    expect(isCustomStrategy('custom:test')).toBe(true);
    expect(isCustomStrategy('other')).toBe(false);
  });

  it('should expose fan-out metadata for supported strategies', () => {
    expect(isFanoutStrategy('jailbreak:composite')).toBe(true);
    expect(getDefaultNFanout('jailbreak:composite')).toBeGreaterThanOrEqual(1);

    expect(isFanoutStrategy('gcg')).toBe(true);
    expect(getDefaultNFanout('gcg')).toBeGreaterThanOrEqual(1);

    expect(isFanoutStrategy('base64')).toBe(false);
  });
});
