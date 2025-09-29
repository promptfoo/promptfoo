import {
  ADDITIONAL_STRATEGIES,
  ALL_STRATEGIES,
  isCustomStrategy,
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
});
