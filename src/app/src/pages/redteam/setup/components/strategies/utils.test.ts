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
      strategies: ['basic'], // multiplier 1
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
