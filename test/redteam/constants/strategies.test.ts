import { describe, expect, it } from 'vitest';
import { CANARY_BREAKING_STRATEGY_IDS } from '../../../src/redteam/constants/plugins';
import {
  ADDITIONAL_STRATEGIES,
  AGENTIC_STRATEGIES,
  ALL_STRATEGIES,
  CONFIGURABLE_STRATEGIES_SET,
  getDefaultNFanout,
  isCustomStrategy,
  isFanoutStrategy,
  STRATEGY_COLLECTION_MAPPINGS,
  STRATEGY_COLLECTIONS,
  TEXT_MUTATION_DEFAULT_RATES,
  TEXT_MUTATION_STRATEGIES,
} from '../../../src/redteam/constants/strategies';

describe('strategies constants', () => {
  it('should have all strategies sorted', () => {
    const expectedStrategies = new Set([
      'default',
      'basic',
      'jailbreak',
      'jailbreak:composite',
      ...AGENTIC_STRATEGIES,
      ...ADDITIONAL_STRATEGIES,
      ...STRATEGY_COLLECTIONS,
    ]);

    expect(ALL_STRATEGIES).toEqual(Array.from(expectedStrategies).sort());
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

  it('should expand the text-mutations collection to every supported mutation', () => {
    expect(STRATEGY_COLLECTION_MAPPINGS['text-mutations']).toEqual([
      ...TEXT_MUTATION_STRATEGIES,
      'homoglyph',
    ]);
  });

  it('should define one default rate for every text mutation strategy', () => {
    expect(Object.keys(TEXT_MUTATION_DEFAULT_RATES).sort()).toEqual(
      [...TEXT_MUTATION_STRATEGIES].sort(),
    );
  });

  it('should exclude every text mutation from canary-sensitive coding-agent tests', () => {
    expect(CANARY_BREAKING_STRATEGY_IDS).toEqual(
      expect.arrayContaining([...TEXT_MUTATION_STRATEGIES]),
    );
  });

  it('should expose configuration controls for parameterized mutation strategies', () => {
    for (const strategy of ['bijection', ...TEXT_MUTATION_STRATEGIES]) {
      expect(CONFIGURABLE_STRATEGIES_SET.has(strategy)).toBe(true);
    }
  });
});
