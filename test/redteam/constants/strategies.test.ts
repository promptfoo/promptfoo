import { describe, expect, it } from 'vitest';
import {
  ADDITIONAL_STRATEGIES,
  AGENTIC_STRATEGIES,
  ALL_STRATEGIES,
  getDefaultNFanout,
  isCustomStrategy,
  isFanoutStrategy,
  STRATEGY_COLLECTION_MAPPINGS,
  STRATEGY_COLLECTIONS,
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
      'zero-width',
      'unicode-noise',
      'zalgo',
      'whitespace-obfuscation',
      'random-case',
      'homoglyph',
    ]);
  });
});
