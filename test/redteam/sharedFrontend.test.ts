import { Severity } from '../../src/redteam/constants';
import type { Plugin } from '../../src/redteam/constants';
import { getRiskCategorySeverityMap, getUnifiedConfig } from '../../src/redteam/sharedFrontend';
import type { SavedRedteamConfig } from '../../src/redteam/types';

describe('getRiskCategorySeverityMap', () => {
  it('should return default severity map when no plugins provided', () => {
    const result = getRiskCategorySeverityMap();
    expect(result).toBeDefined();
    expect(result['contracts']).toBe(Severity.Medium);
  });

  it('should override default severities with plugin severities', () => {
    const plugins = [
      { id: 'contracts' as Plugin, severity: Severity.High },
      { id: 'politics' as Plugin, severity: Severity.Critical },
    ];

    const result = getRiskCategorySeverityMap(plugins);

    expect(result['contracts']).toBe(Severity.High);
    expect(result['politics']).toBe(Severity.Critical);
  });

  it('should handle plugins without severity override', () => {
    const plugins = [
      { id: 'contracts' as Plugin },
      { id: 'politics' as Plugin, severity: Severity.Critical },
    ];

    const result = getRiskCategorySeverityMap(plugins);

    expect(result['contracts']).toBe(Severity.Medium); // Default severity
    expect(result['politics']).toBe(Severity.Critical);
  });
});

describe('getUnifiedConfig', () => {
  const baseConfig: SavedRedteamConfig = {
    description: 'Test config',
    prompts: ['test prompt'],
    target: {
      id: 'test-target',
      config: {
        sessionSource: 'test-session',
        stateful: true,
        apiKey: 'test-key',
      },
    },
    plugins: ['test-plugin'],
    strategies: ['basic'],
    purpose: 'testing',
    applicationDefinition: {},
    entities: [],
  };

  it('should transform config correctly', () => {
    const result = getUnifiedConfig(baseConfig);

    expect(result.description).toBe('Test config');
    expect(result.prompts).toEqual(['test prompt']);
    // @ts-ignore
    expect(result.targets[0].config.sessionSource).toBeUndefined();
    // @ts-ignore
    expect(result.targets[0].config.stateful).toBeUndefined();
    expect(result.redteam.purpose).toBe('testing');
  });

  it('should handle defaultTest transformation', () => {
    const configWithDefaultTest: SavedRedteamConfig = {
      ...baseConfig,
      defaultTest: {
        vars: { test: 'value' },
        options: { someOption: true },
      },
    };

    const result = getUnifiedConfig(configWithDefaultTest);

    expect(result.defaultTest!.vars).toEqual({ test: 'value' });
    expect(result.defaultTest!.options!.transformVars).toBe('{ ...vars, sessionId: context.uuid }');
  });

  it('should transform plugins correctly', () => {
    const configWithPlugins: SavedRedteamConfig = {
      ...baseConfig,
      plugins: ['simple-plugin', { id: 'complex-plugin', config: { setting: true } }],
    };

    const result = getUnifiedConfig(configWithPlugins);

    expect(result.redteam.plugins).toEqual([
      { id: 'simple-plugin' },
      { id: 'complex-plugin', config: { setting: true } },
    ]);
  });

  it('should transform strategies with stateful config', () => {
    const configWithStrategies: SavedRedteamConfig = {
      ...baseConfig,
      strategies: ['basic', 'goat', { id: 'custom', config: { option: true } }],
    };

    const result = getUnifiedConfig(configWithStrategies);

    expect(result.redteam.strategies).toEqual([
      { id: 'basic' },
      { id: 'goat', config: { stateful: true } },
      { id: 'custom', config: { option: true } },
    ]);
  });

  it('should handle maxConcurrency configuration', () => {
    const configWithMaxConcurrency: SavedRedteamConfig = {
      ...baseConfig,
      maxConcurrency: 5,
    };

    const result = getUnifiedConfig(configWithMaxConcurrency);
    // @ts-expect-error property may not exist in type
    expect(result.redteam.maxConcurrency).toBe(5);

    const configWithoutMaxConcurrency = getUnifiedConfig(baseConfig);
    // @ts-expect-error property may not exist in type
    expect(configWithoutMaxConcurrency.redteam.maxConcurrency).toBeUndefined();
  });

  it('should include testGenerationInstructions if provided', () => {
    const configWithInstructions: SavedRedteamConfig = {
      ...baseConfig,
      testGenerationInstructions: 'Generate more tests',
    };

    const result = getUnifiedConfig(configWithInstructions);

    expect(result.redteam.testGenerationInstructions).toBe('Generate more tests');
  });

  it('should omit plugin config if empty', () => {
    const configWithEmptyPluginConfig: SavedRedteamConfig = {
      ...baseConfig,
      plugins: [{ id: 'plugin-empty', config: {} }],
    };

    const result = getUnifiedConfig(configWithEmptyPluginConfig);

    expect(result.redteam.plugins).toEqual([{ id: 'plugin-empty' }]);
  });

  it('should omit strategy config if not needed', () => {
    const configWithSimpleStrategy: SavedRedteamConfig = {
      ...baseConfig,
      strategies: [{ id: 'basic', config: {} }],
    };

    const result = getUnifiedConfig(configWithSimpleStrategy);

    expect(result.redteam.strategies).toEqual([{ id: 'basic' }]);
  });

  it('should add stateful to multi-turn strategies if stateful is true', () => {
    const configWithMultiTurn: SavedRedteamConfig = {
      ...baseConfig,
      strategies: ['goat'],
      target: {
        ...baseConfig.target,
        config: {
          ...baseConfig.target.config,
          stateful: true,
        },
      },
    };

    const result = getUnifiedConfig(configWithMultiTurn);

    expect(result.redteam.strategies).toEqual([{ id: 'goat', config: { stateful: true } }]);
  });

  it('should not add stateful config for multi-turn strategies if stateful is false', () => {
    const configWithNonStateful: SavedRedteamConfig = {
      ...baseConfig,
      strategies: ['goat'],
      target: {
        ...baseConfig.target,
        config: {
          ...baseConfig.target.config,
          stateful: false,
        },
      },
    };

    const result = getUnifiedConfig(configWithNonStateful);

    expect(result.redteam.strategies).toEqual([{ id: 'goat' }]);
  });
});
