import { describe, expect, it } from 'vitest';
import { getStrategyId } from './utils';
import type { RedteamStrategy } from '@promptfoo/redteam/types';

describe('getStrategyId', () => {
  it('should return strategy string when strategy is string', () => {
    const strategy = 'basic';
    expect(getStrategyId(strategy)).toBe('basic');
  });

  it('should return strategy id when strategy is object', () => {
    const strategy: RedteamStrategy = {
      id: 'jailbreak',
      config: {},
    };
    expect(getStrategyId(strategy)).toBe('jailbreak');
  });
});
