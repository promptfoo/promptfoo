import { describe, expect, it } from 'vitest';
import {
  getEstimatedDuration,
  getEstimatedProbes,
  getStrategyId,
  isStrategyConfigured,
} from './utils';
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
  it.each([
    { plugins: [{ id: 'toxicity', numTests: 2 }], numTests: 5, expected: 12 },
    { plugins: [{ id: 'bola', numTests: -2 }], numTests: 5, expected: 5 },
    { plugins: [{ id: 'bola', numTests: 1.5 }], numTests: 5, expected: 5 },
    { plugins: [{ id: 'bola', numTests: 500 }], numTests: 5, expected: 500 },
    { plugins: [{ id: 'bola', numTests: 2 }], numTests: 50, expected: 2 },
    { plugins: [{ id: 'bola', numTests: 0 }], numTests: 5, expected: 5 },
    { plugins: [{ id: 'bola', numTests: 0 }], numTests: undefined, expected: 5 },
    {
      plugins: ['bola', { id: 'bfla' }, { id: 'ssrf', numTests: 17 }],
      numTests: 5,
      expected: 27,
    },
    {
      plugins: ['bola', { id: 'bfla' }, { id: 'ssrf', numTests: 17 }],
      numTests: undefined,
      expected: 27,
    },
    {
      plugins: [
        { id: 'bola', numTests: 2 },
        { id: 'bfla', numTests: 17 },
      ],
      numTests: 5,
      expected: 19,
    },
    { plugins: [], numTests: 5, expected: 0 },
  ])('uses effective plugin counts for $plugins', ({ plugins, numTests, expected }) => {
    const config = { ...baseConfig, plugins, numTests, strategies: [] } as Config;
    expect(getEstimatedProbes(config)).toBe(expected);
  });

  it.each([
    { intent: ['first', 'second'], expected: 2 },
    { intent: 'one intent', expected: 1 },
    { intent: [['first step', 'second step']], expected: 1 },
    { intent: ['single', ['step one', 'step two']], expected: 2 },
    { intent: 'file://external-intents.yaml', expected: 1 },
    { intent: [], expected: 0 },
    { intent: ['', 'real intent'], expected: 2 },
    { intent: ['  ', [' ', '\t'], ['real step', '']], expected: 3 },
    { intent: '', expected: 0 },
    { intent: '  ', expected: 1 },
  ])('counts intent entries before overrides: $intent', ({ intent, expected }) => {
    const config = {
      ...baseConfig,
      numTests: 2,
      plugins: [{ id: 'intent', numTests: 100, config: { intent } }],
      strategies: [],
    } as Config;
    expect(getEstimatedProbes(config)).toBe(expected);
  });

  it('combines intents with ordinary overrides before strategy and language factors', () => {
    const config = {
      ...baseConfig,
      numTests: 2,
      plugins: [
        { id: 'intent', numTests: 100, config: { intent: ['first', 'second'] } },
        { id: 'bola', numTests: 3 },
        { id: 'intent', config: { intent: [['step one', 'step two']] } },
      ],
      strategies: ['basic', 'jailbreak'],
      language: ['en', 'es'],
    } as Config;
    expect(getEstimatedProbes(config)).toBe(132); // (2 + 3 + 1) * (1 + 10) * 2
  });

  it('preserves imported blank intents in the multiplied workload estimate', () => {
    const config = {
      ...baseConfig,
      plugins: [{ id: 'intent', config: { intent: ['', 'real intent'] } }],
      strategies: ['basic', 'jailbreak'],
      language: ['en', 'es'],
    } as Config;
    expect(getEstimatedProbes(config)).toBe(44);
  });

  it('applies strategy and language factors to each plugin override', () => {
    const config = {
      ...baseConfig,
      numTests: 5,
      plugins: ['bola', { id: 'bfla', numTests: 17 }],
      strategies: ['basic', { id: 'jailbreak' }],
      language: ['en', 'es'],
    } as Config;
    expect(getEstimatedProbes(config)).toBe(484); // (5 + 17) * (1 + 10) * 2
  });

  it.each(['basic', { id: 'basic' }])('counts basic cases once for %j', (strategy) => {
    const config = {
      ...baseConfig,
      plugins: [{ id: 'bola', numTests: 2 }],
      strategies: [strategy],
    } as Config;
    expect(getEstimatedProbes(config)).toBe(2);
  });

  it('omits base cases when the basic strategy is disabled', () => {
    const config = {
      ...baseConfig,
      plugins: [{ id: 'bola', numTests: 2 }],
      strategies: [{ id: 'basic', config: { enabled: false } }, 'base64'],
    } as Config;
    expect(getEstimatedProbes(config)).toBe(2);
    expect(getEstimatedProbes({ ...config, strategies: [config.strategies[0]] })).toBe(0);
  });

  it.each([
    { strategies: [{ id: 'basic', config: { enabled: false } }, 'retry'], expected: 0 },
    {
      strategies: [{ id: 'basic', config: { enabled: false } }, 'retry', 'base64'],
      expected: 2,
    },
    {
      strategies: [
        { id: 'basic', config: { enabled: false } },
        { id: 'retry', config: { numTests: 7 } },
        'base64',
      ],
      expected: 9,
    },
    { strategies: ['basic', { id: 'retry', config: { numTests: 7 } }], expected: 9 },
    { strategies: ['basic', 'retry'], expected: 4 },
  ])('applies retry to the enabled base workload: $strategies', ({ strategies, expected }) => {
    expect(
      getEstimatedProbes({
        ...baseConfig,
        plugins: [{ id: 'bola', numTests: 2 }],
        strategies,
      } as Config),
    ).toBe(expected);
  });

  it('deduplicates empty and omitted plugin configs just as export does', () => {
    expect(
      getEstimatedProbes({
        ...baseConfig,
        plugins: [
          { id: 'bola', numTests: 2, config: {} },
          { id: 'bola', numTests: 7 },
        ],
        strategies: [],
      } as Config),
    ).toBe(7);
  });

  it('counts duplicate plugin configurations once using the last override', () => {
    const config = {
      ...baseConfig,
      plugins: [
        { id: 'contracts', numTests: 500, config: { key: 'value' } },
        { id: 'contracts', numTests: 7, config: { key: 'value' } },
        { id: 'contracts', numTests: 3, config: { key: 'different' } },
        { id: 'contracts', numTests: 2, config: { key: 'value' }, severity: 'high' },
      ],
      strategies: [],
    } as Config;
    expect(getEstimatedProbes(config)).toBe(12);
  });

  it('applies each plugin language override before summing', () => {
    const config = {
      ...baseConfig,
      numTests: 5,
      language: ['en', 'es'],
      plugins: [
        { id: 'contracts', numTests: 10, config: { language: 'fr' } },
        { id: 'policy', numTests: 3, config: { language: ['de', 'it', 'pt'] } },
        { id: 'overreliance', numTests: 2 },
      ],
      strategies: [],
    } as Config;
    expect(getEstimatedProbes(config)).toBe(23);
  });

  it('deduplicates intent entries before applying their language override', () => {
    const plugin = {
      id: 'intent',
      numTests: 100,
      config: { intent: ['first', 'second'], language: 'fr' },
    };
    const config = {
      ...baseConfig,
      language: ['en', 'es'],
      plugins: [plugin, plugin],
      strategies: [],
    } as Config;
    expect(getEstimatedProbes(config)).toBe(2);
  });

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
      strategies: ['basic', 'jailbreak'], // Base cases plus a multiplier of 10
    } as Config;
    expect(getEstimatedProbes(config)).toBe(55); // 5 base cases + 5*10 jailbreak probes
  });

  it('should handle global language configuration with multiple languages', () => {
    const config = {
      ...baseConfig,
      numTests: 5,
      plugins: ['plugin1'],
      strategies: [],
      language: ['en', 'es', 'fr'],
    } as Config;
    expect(getEstimatedProbes(config)).toBe(15); // (5*1) * 3 languages
  });

  it('should handle global language configuration with single language', () => {
    const config = {
      ...baseConfig,
      numTests: 5,
      plugins: ['plugin1'],
      strategies: [],
      language: 'en',
    } as Config;
    expect(getEstimatedProbes(config)).toBe(5); // (5*1) * 1 language
  });

  it('should handle complex configuration with multiple strategies and languages', () => {
    const config = {
      ...baseConfig,
      numTests: 5,
      plugins: ['plugin1', 'plugin2'],
      strategies: ['basic', 'jailbreak'],
      language: ['en', 'es'],
    } as Config;
    expect(getEstimatedProbes(config)).toBe(220); // (10 + 10*10) * 2 languages
  });

  it('should use default numTests when not specified', () => {
    const config = {
      ...baseConfig,
      plugins: ['plugin1'],
      strategies: ['basic'],
    } as Config;
    expect(getEstimatedProbes(config)).toBe(5); // The basic strategy uses the existing base cases
  });
});

describe('isStrategyConfigured', () => {
  it('should return true for strategies that do not require configuration', () => {
    expect(isStrategyConfigured('basic', 'basic')).toBe(true);
    expect(isStrategyConfigured('jailbreak', 'jailbreak')).toBe(true);
    expect(isStrategyConfigured('crescendo', 'crescendo')).toBe(true);
  });

  describe('layer strategy', () => {
    it('should return true when layer strategy has valid steps', () => {
      const strategy: RedteamStrategy = {
        id: 'layer',
        config: {
          steps: ['step1', 'step2', 'step3'],
        },
      };
      expect(isStrategyConfigured('layer', strategy)).toBe(true);
    });

    it('should return false when layer strategy has empty steps array', () => {
      const strategy: RedteamStrategy = {
        id: 'layer',
        config: {
          steps: [],
        },
      };
      expect(isStrategyConfigured('layer', strategy)).toBe(false);
    });

    it('should return false when layer strategy has no steps', () => {
      const strategy: RedteamStrategy = {
        id: 'layer',
        config: {},
      };
      expect(isStrategyConfigured('layer', strategy)).toBe(false);
    });

    it('should return false when layer strategy has null or undefined steps', () => {
      const strategy1: RedteamStrategy = {
        id: 'layer',
        config: {
          steps: [null, 'step2'],
        },
      };
      expect(isStrategyConfigured('layer', strategy1)).toBe(false);

      const strategy2: RedteamStrategy = {
        id: 'layer',
        config: {
          steps: ['step1', undefined, 'step3'],
        },
      };
      expect(isStrategyConfigured('layer', strategy2)).toBe(false);
    });

    it('should return false when layer strategy has empty string steps', () => {
      const strategy: RedteamStrategy = {
        id: 'layer',
        config: {
          steps: ['step1', '', 'step3'],
        },
      };
      expect(isStrategyConfigured('layer', strategy)).toBe(false);
    });

    it('should return false when layer strategy steps is not an array', () => {
      const strategy: RedteamStrategy = {
        id: 'layer',
        config: {
          steps: 'not-an-array' as any,
        },
      };
      expect(isStrategyConfigured('layer', strategy)).toBe(false);
    });
  });

  describe('custom strategy', () => {
    it('should return true when custom strategy has valid strategyText', () => {
      const strategy: RedteamStrategy = {
        id: 'custom',
        config: {
          strategyText: 'My custom strategy text',
        },
      };
      expect(isStrategyConfigured('custom', strategy)).toBe(true);
    });

    it('should return false when custom strategy has empty strategyText', () => {
      const strategy: RedteamStrategy = {
        id: 'custom',
        config: {
          strategyText: '',
        },
      };
      expect(isStrategyConfigured('custom', strategy)).toBe(false);
    });

    it('should return false when custom strategy has only whitespace strategyText', () => {
      const strategy: RedteamStrategy = {
        id: 'custom',
        config: {
          strategyText: '   \n\t  ',
        },
      };
      expect(isStrategyConfigured('custom', strategy)).toBe(false);
    });

    it('should return false when custom strategy has no strategyText', () => {
      const strategy: RedteamStrategy = {
        id: 'custom',
        config: {},
      };
      expect(isStrategyConfigured('custom', strategy)).toBe(false);
    });

    it('should return false when custom strategy strategyText is not a string', () => {
      const strategy: RedteamStrategy = {
        id: 'custom',
        config: {
          strategyText: 123 as any,
        },
      };
      expect(isStrategyConfigured('custom', strategy)).toBe(false);
    });
  });

  it('should handle string strategies', () => {
    expect(isStrategyConfigured('basic', 'basic')).toBe(true);
    expect(isStrategyConfigured('layer', 'layer')).toBe(false);
    expect(isStrategyConfigured('custom', 'custom')).toBe(false);
  });
});

describe('getEstimatedDuration', () => {
  it('uses the overridden probe workload while preserving the duration heuristic', () => {
    const config = {
      ...baseConfig,
      numTests: 5,
      plugins: [{ id: 'bola', numTests: 500 }],
      strategies: ['basic'],
      maxConcurrency: 10,
    } as Config;
    expect(getEstimatedDuration(config)).toBe('~3m'); // 8s generation + 150s probes
    expect(getEstimatedDuration({ ...config, plugins: [{ id: 'bola', numTests: 2 }] })).toBe('~9s');
  });

  it('should return duration in seconds for very short runs', () => {
    const config = {
      ...baseConfig,
      numTests: 1,
      plugins: ['plugin1'],
      strategies: [],
      maxConcurrency: 10,
    } as Config;
    const duration = getEstimatedDuration(config);
    expect(duration).toMatch(/^~\d+s$/);
  });

  it('should return duration in minutes for medium runs', () => {
    const config = {
      ...baseConfig,
      numTests: 10,
      plugins: ['plugin1', 'plugin2', 'plugin3'],
      strategies: ['basic', 'jailbreak'],
      maxConcurrency: 5,
    } as Config;
    const duration = getEstimatedDuration(config);
    expect(duration).toMatch(/^~\d+m$/);
  });

  it('should return duration in hours and minutes for long runs', () => {
    const config = {
      ...baseConfig,
      numTests: 50,
      plugins: ['p1', 'p2', 'p3', 'p4', 'p5'],
      strategies: ['jailbreak:tree', 'crescendo', 'goat'],
      maxConcurrency: 2,
    } as Config;
    const duration = getEstimatedDuration(config);
    expect(duration).toMatch(/^~\d+h \d+m$/);
  });

  it('should account for concurrency in duration calculation', () => {
    // Use more probes to make concurrency effect more visible over test generation time
    const configLowConcurrency = {
      ...baseConfig,
      numTests: 20,
      plugins: ['plugin1', 'plugin2', 'plugin3'],
      strategies: ['jailbreak'], // multiplier 10
      maxConcurrency: 1,
    } as Config;
    const configHighConcurrency = {
      ...baseConfig,
      numTests: 20,
      plugins: ['plugin1', 'plugin2', 'plugin3'],
      strategies: ['jailbreak'], // multiplier 10
      maxConcurrency: 20,
    } as Config;

    const durationLow = getEstimatedDuration(configLowConcurrency);
    const durationHigh = getEstimatedDuration(configHighConcurrency);

    // Extract numeric values for comparison
    const parseDuration = (dur: string): number => {
      const match = dur.match(/~(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    };

    // Higher concurrency should result in shorter duration
    expect(parseDuration(durationLow)).toBeGreaterThan(parseDuration(durationHigh));
  });

  it('should use default concurrency when maxConcurrency is not specified', () => {
    const config = {
      ...baseConfig,
      numTests: 10,
      plugins: ['plugin1', 'plugin2'],
      strategies: ['basic'],
    } as Config;
    const duration = getEstimatedDuration(config);
    expect(duration).toBeDefined();
    expect(typeof duration).toBe('string');
  });

  it('should handle strategies with different probe multipliers', () => {
    const configBasic = {
      ...baseConfig,
      numTests: 5,
      plugins: ['plugin1'],
      strategies: ['basic'], // Base cases only
      maxConcurrency: 5,
    } as Config;
    const configJailbreakTree = {
      ...baseConfig,
      numTests: 5,
      plugins: ['plugin1'],
      strategies: ['jailbreak:tree'], // multiplier 150
      maxConcurrency: 5,
    } as Config;

    const durationBasic = getEstimatedDuration(configBasic);
    const durationTree = getEstimatedDuration(configJailbreakTree);

    const parseDuration = (dur: string): number => {
      if (dur.includes('h')) {
        const match = dur.match(/~(\d+)h (\d+)m/);
        return match ? parseInt(match[1], 10) * 60 + parseInt(match[2], 10) : 0;
      }
      if (dur.includes('m')) {
        const match = dur.match(/~(\d+)m/);
        return match ? parseInt(match[1], 10) : 0;
      }
      const match = dur.match(/~(\d+)s/);
      return match ? parseInt(match[1], 10) / 60 : 0;
    };

    // jailbreak:tree should take much longer than basic
    expect(parseDuration(durationTree)).toBeGreaterThan(parseDuration(durationBasic));
  });

  it('should factor in test generation time', () => {
    const configFewTests = {
      ...baseConfig,
      numTests: 1,
      plugins: ['plugin1'],
      strategies: [],
      maxConcurrency: 10,
    } as Config;
    const configManyTests = {
      ...baseConfig,
      numTests: 50,
      plugins: ['plugin1'],
      strategies: [],
      maxConcurrency: 10,
    } as Config;

    const durationFew = getEstimatedDuration(configFewTests);
    const durationMany = getEstimatedDuration(configManyTests);

    const parseDuration = (dur: string): number => {
      if (dur.includes('m')) {
        const match = dur.match(/~(\d+)m/);
        return match ? parseInt(match[1], 10) * 60 : 0;
      }
      const match = dur.match(/~(\d+)s/);
      return match ? parseInt(match[1], 10) : 0;
    };

    // More tests should result in longer duration due to test generation time
    expect(parseDuration(durationMany)).toBeGreaterThan(parseDuration(durationFew));
  });

  it('should handle boundary between seconds and minutes (60s)', () => {
    const config = {
      ...baseConfig,
      numTests: 5,
      plugins: ['plugin1', 'plugin2'],
      strategies: [],
      maxConcurrency: 10,
    } as Config;
    const duration = getEstimatedDuration(config);
    // Should be either in seconds or minutes format
    expect(duration).toMatch(/^~\d+(s|m)$/);
  });

  it('should handle boundary between minutes and hours (3600s)', () => {
    const config = {
      ...baseConfig,
      numTests: 50,
      plugins: ['p1', 'p2', 'p3', 'p4'],
      strategies: ['jailbreak:tree', 'crescendo'],
      maxConcurrency: 2,
    } as Config;
    const duration = getEstimatedDuration(config);
    // Should be either in minutes or hours format
    expect(duration).toMatch(/^~(\d+m|\d+h \d+m)$/);
  });
});
