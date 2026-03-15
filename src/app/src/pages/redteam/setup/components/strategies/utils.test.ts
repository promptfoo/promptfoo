import { describe, expect, it } from 'vitest';
import { estimateProbeRange, getEstimatedProbes, getStrategyId } from './utils';
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
    expect(getEstimatedProbes(config)).toBe(55); // base 5 + jailbreak contribution (5*10)
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
    expect(getEstimatedProbes(config)).toBe(220); // base 20 + jailbreak contribution (20*10)
  });

  it('should use default numTests when not specified', () => {
    const config = {
      ...baseConfig,
      plugins: ['plugin1'],
      strategies: ['basic'],
    } as Config;
    expect(getEstimatedProbes(config)).toBe(5); // base-only because basic is not additive
  });
});

describe('estimateProbeRange', () => {
  it('should return ordered bounds and breakdown metadata', () => {
    const config = {
      ...baseConfig,
      numTests: 4,
      plugins: ['plugin1'],
      strategies: ['jailbreak:meta'],
    } as Config;

    const estimate = estimateProbeRange(config);

    expect(estimate.min).toBeLessThanOrEqual(estimate.likely);
    expect(estimate.likely).toBeLessThanOrEqual(estimate.max);
    expect(estimate.max).toBeLessThanOrEqual(estimate.ceiling);
    expect(estimate.breakdown.length).toBeGreaterThan(0);
  });

  it('should adjust estimates when maxTurns changes for multi-turn strategies', () => {
    const lowTurnsConfig = {
      ...baseConfig,
      numTests: 2,
      plugins: ['plugin1'],
      strategies: [{ id: 'jailbreak:hydra', config: { maxTurns: 5 } }],
    } as Config;

    const highTurnsConfig = {
      ...baseConfig,
      numTests: 2,
      plugins: ['plugin1'],
      strategies: [{ id: 'jailbreak:hydra', config: { maxTurns: 20 } }],
    } as Config;

    const lowTurnsEstimate = estimateProbeRange(lowTurnsConfig);
    const highTurnsEstimate = estimateProbeRange(highTurnsConfig);
    const assumptionsText = highTurnsEstimate.assumptions.join(' ');

    expect(highTurnsEstimate.likely).toBeGreaterThan(lowTurnsEstimate.likely);
    expect(highTurnsEstimate.max).toBeGreaterThan(lowTurnsEstimate.max);
    expect(assumptionsText).toMatch(/jailbreak:hydra/);
    expect(assumptionsText).toMatch(/maxTurns=20/);
  });

  it('returns zero estimates when no plugins are configured', () => {
    const config = {
      ...baseConfig,
      numTests: 5,
      plugins: [],
      strategies: ['jailbreak'],
    } as Config;

    const estimate = estimateProbeRange(config);

    expect(estimate.min).toBe(0);
    expect(estimate.likely).toBe(0);
    expect(estimate.max).toBe(0);
    expect(estimate.ceiling).toBe(0);
    expect(estimate.assumptions).toContain('No plugins selected; estimate is zero.');
  });

  it('excludes baseline probes when basic strategy is disabled', () => {
    const config = {
      ...baseConfig,
      numTests: 5,
      plugins: ['plugin1'],
      strategies: [{ id: 'basic', config: { enabled: false } }],
    } as Config;

    const estimate = estimateProbeRange(config);

    expect(estimate.min).toBe(0);
    expect(estimate.likely).toBe(0);
    expect(estimate.max).toBe(0);
    expect(estimate.ceiling).toBe(0);
    expect(estimate.assumptions).toContain(
      'Basic strategy is disabled, so baseline tests are excluded.',
    );
  });

  it('respects strategy-level numTests cap', () => {
    const config = {
      ...baseConfig,
      numTests: 5,
      plugins: ['plugin1'],
      strategies: [{ id: 'jailbreak', config: { numTests: 7 } }],
    } as Config;

    const estimate = estimateProbeRange(config);

    expect(estimate.likely).toBe(12);
    expect(estimate.ceiling).toBe(12);
    expect(estimate.assumptions).toContain('jailbreak uses numTests=7 cap.');
  });

  it('models retry behavior with and without explicit numTests cap', () => {
    const uncappedRetryConfig = {
      ...baseConfig,
      numTests: 5,
      plugins: ['plugin1'],
      strategies: ['retry'],
    } as Config;

    const cappedRetryConfig = {
      ...baseConfig,
      numTests: 5,
      plugins: ['plugin1'],
      strategies: [{ id: 'retry', config: { numTests: 3 } }],
    } as Config;

    const uncapped = estimateProbeRange(uncappedRetryConfig);
    const capped = estimateProbeRange(cappedRetryConfig);

    expect(uncapped.likely).toBe(10);
    expect(uncapped.assumptions).toContain(
      'Retry strategy without numTests cap can vary at runtime.',
    );
    expect(capped.likely).toBe(8);
    expect(capped.assumptions).toContain('retry uses numTests=3 cap.');
  });
});
