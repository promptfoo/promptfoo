import { describe, expect, it } from 'vitest';
import { getEstimatedProbes, getStrategyId } from './utils';
import type { RedteamStrategy } from '@promptfoo/redteam/types';

import type { Config } from '../../types';

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

  describe('composite jailbreak strategy', () => {
    it('should use default n=5 when config.n is not provided', () => {
      const config = {
        ...baseConfig,
        numTests: 5,
        plugins: ['plugin1', 'plugin2'],
        strategies: [{ id: 'jailbreak:composite' }],
      } as Config;
      // baseProbes = 5 * 2 = 10
      // strategyProbes = 5 * 10 = 50
      // total = 10 + 50 = 60
      expect(getEstimatedProbes(config)).toBe(60);
    });

    it('should use config.n when provided', () => {
      const config = {
        ...baseConfig,
        numTests: 5,
        plugins: ['plugin1', 'plugin2'],
        strategies: [{ id: 'jailbreak:composite', config: { n: 3 } }],
      } as Config;
      // baseProbes = 5 * 2 = 10
      // strategyProbes = 3 * 10 = 30
      // total = 10 + 30 = 40
      expect(getEstimatedProbes(config)).toBe(40);
    });

    it('should handle composite strategy as string', () => {
      const config = {
        ...baseConfig,
        numTests: 5,
        plugins: ['plugin1'],
        strategies: ['jailbreak:composite'],
      } as Config;
      // Should use default n=5
      // baseProbes = 5 * 1 = 5
      // strategyProbes = 5 * 5 = 25
      // total = 5 + 25 = 30
      expect(getEstimatedProbes(config)).toBe(30);
    });

    it('should handle invalid n values gracefully', () => {
      const testCases = [
        { n: -1, description: 'negative n' },
        { n: 0, description: 'zero n' },
        { n: 'five', description: 'non-numeric n' },
        { n: null, description: 'null n' },
        { n: NaN, description: 'NaN n' },
      ];

      testCases.forEach(({ n, description }) => {
        const config = {
          ...baseConfig,
          numTests: 5,
          plugins: ['plugin1'],
          strategies: [{ id: 'jailbreak:composite', config: { n } }],
        } as Config;
        // Should fall back to default n=5
        expect(getEstimatedProbes(config)).toBe(30, `Failed for ${description}`);
      });
    });

    it('should handle large n values', () => {
      const config = {
        ...baseConfig,
        numTests: 5,
        plugins: ['plugin1'],
        strategies: [{ id: 'jailbreak:composite', config: { n: 100 } }],
      } as Config;
      // baseProbes = 5 * 1 = 5
      // strategyProbes = 100 * 5 = 500
      // total = 5 + 500 = 505
      expect(getEstimatedProbes(config)).toBe(505);
    });

    it('should handle multiple composite strategies', () => {
      const config = {
        ...baseConfig,
        numTests: 5,
        plugins: ['plugin1'],
        strategies: [
          { id: 'jailbreak:composite', config: { n: 3 } },
          { id: 'jailbreak:composite', config: { n: 2 } },
        ],
      } as Config;
      // baseProbes = 5 * 1 = 5
      // strategyProbes = (3 + 2) * 5 = 25
      // total = 5 + 25 = 30
      expect(getEstimatedProbes(config)).toBe(30);
    });

    it('should work with other strategies', () => {
      const config = {
        ...baseConfig,
        numTests: 5,
        plugins: ['plugin1'],
        strategies: [
          'basic', // multiplier 1
          { id: 'jailbreak:composite', config: { n: 3 } }, // multiplier 3
        ],
      } as Config;
      // baseProbes = 5 * 1 = 5
      // strategyProbes = (1 + 3) * 5 = 20
      // total = 5 + 20 = 25
      expect(getEstimatedProbes(config)).toBe(25);
    });

    it('should work with multilingual strategy', () => {
      const config = {
        ...baseConfig,
        numTests: 5,
        plugins: ['plugin1'],
        strategies: [
          { id: 'jailbreak:composite', config: { n: 2 } },
          { id: 'multilingual', config: { languages: ['en', 'es'] } },
        ],
      } as Config;
      // baseProbes = 5 * 1 = 5
      // strategyProbes = 2 * 5 = 10
      // subtotal = 5 + 10 = 15
      // total = 15 * 2 languages = 30
      expect(getEstimatedProbes(config)).toBe(30);
    });

    it('should handle config.n of different types', () => {
      const config = {
        ...baseConfig,
        numTests: 5,
        plugins: ['plugin1'],
        strategies: [{ id: 'jailbreak:composite', config: { n: '10' } }],
      } as Config;
      // Should convert string '10' to number 10
      // baseProbes = 5 * 1 = 5
      // strategyProbes = 10 * 5 = 50
      // total = 5 + 50 = 55
      expect(getEstimatedProbes(config)).toBe(55);
    });
  });
});
