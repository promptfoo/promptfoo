import type { RedteamStrategy } from '@promptfoo/redteam/types';
import { describe, expect, it } from 'vitest';
import type { Config } from '../../types';
import { getStrategyId, getEstimatedProbes } from './utils';

// Create a base config with all required properties for testing
const baseConfig: Partial<Config> = {
  description: 'Test description',
  prompts: ['Test prompt'],
  target: {
    id: 'test-target',
    config: {},
  },
  applicationDefinition: {
    purpose: 'Testing',
  },
  entities: [],
};

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

describe('getEstimatedProbes', () => {
  it('should calculate basic probes without strategies', () => {
    const config = {
      ...baseConfig,
      numTests: 5,
      plugins: ['plugin1', 'plugin2'],
      strategies: [],
    } as Config;
    expect(getEstimatedProbes(config)).toBe(10); // 5 tests * 2 plugins
  });

  it('should calculate probes with strategy multipliers', () => {
    const config = {
      ...baseConfig,
      numTests: 5,
      plugins: ['plugin1'],
      strategies: ['basic', 'jailbreak'], // multipliers 1 and 10
    } as Config;
    expect(getEstimatedProbes(config)).toBe(60); // (5*1) + (5*1*(1+10))
  });

  it('should handle multilingual strategy with specified languages', () => {
    const config = {
      ...baseConfig,
      numTests: 5,
      plugins: ['plugin1'],
      strategies: [
        {
          id: 'multilingual',
          config: {
            languages: ['en', 'es', 'fr'],
          },
        },
      ],
    } as Config;
    expect(getEstimatedProbes(config)).toBe(15); // (5*1) * 3 languages
  });

  it('should handle multilingual strategy without specified languages', () => {
    const config = {
      ...baseConfig,
      numTests: 5,
      plugins: ['plugin1'],
      strategies: ['multilingual'],
    } as Config;
    expect(getEstimatedProbes(config)).toBe(5); // (5*1) * 1 language (no config)
  });

  it('should handle complex configuration with multiple strategies', () => {
    const config = {
      ...baseConfig,
      numTests: 5,
      plugins: ['plugin1', 'plugin2'],
      strategies: [
        'basic',
        {
          id: 'multilingual',
          config: {
            languages: ['en', 'es'],
          },
        },
        'jailbreak',
      ],
    } as Config;
    expect(getEstimatedProbes(config)).toBe(240); // ((10) + (10*11)) * 2 languages
  });

  it('should use default numTests when not specified', () => {
    const config = {
      ...baseConfig,
      plugins: ['plugin1'],
      strategies: ['basic'],
    } as Config;
    expect(getEstimatedProbes(config)).toBe(10); // (5*1) + (5*1*1)
  });
});
