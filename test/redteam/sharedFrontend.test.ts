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
});
