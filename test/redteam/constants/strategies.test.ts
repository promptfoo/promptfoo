import { describe, expect, it } from 'vitest';
import {
  ADDITIONAL_STRATEGIES,
  AGENTIC_STRATEGIES,
  ALL_STRATEGIES,
  findUnicodeNormalizationConfigIssues,
  getDefaultNFanout,
  isCustomStrategy,
  isFanoutStrategy,
  isUnicodeNormalizationForm,
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

  it('should identify supported Unicode normalization forms', () => {
    expect(isUnicodeNormalizationForm('NFC')).toBe(true);
    expect(isUnicodeNormalizationForm('NFKD')).toBe(true);
    expect(isUnicodeNormalizationForm('nfkd')).toBe(false);
    expect(isUnicodeNormalizationForm(undefined)).toBe(false);
  });
});

it('rejects excessively nested Layer config without overflowing the stack', () => {
  let config: Record<string, unknown> = { steps: ['unicode-normalization'] };
  for (let depth = 0; depth < 4000; depth++) {
    config = { steps: [{ id: 'layer', config }] };
  }
  expect(findUnicodeNormalizationConfigIssues('layer', config)[0]?.message).toBe(
    'Layer nesting exceeds 64 levels',
  );
});
