import { afterEach, describe, expect, it, vi } from 'vitest';
import { Severity } from '../../src/redteam/constants';
import { getRiskCategorySeverityMap, getUnifiedConfig } from '../../src/redteam/sharedFrontend';

import type { Plugin } from '../../src/redteam/constants';
import type { SavedRedteamConfig } from '../../src/redteam/types';

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetAllMocks();
});

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

  it('should add severity entry for specific policy ID when plugin is a custom policy', () => {
    const plugins = [
      {
        id: 'policy' as Plugin,
        severity: Severity.Low,
        config: { policy: { id: 'abc123', text: 'Do not discuss cats', name: 'No Cats' } },
      },
    ];

    const result = getRiskCategorySeverityMap(plugins);

    // Should have entry for both 'policy' and the specific policy ID
    expect(result['policy']).toBe(Severity.Low);
    expect(result['abc123' as Plugin]).toBe(Severity.Low);
  });

  it('should handle multiple custom policies with different severities', () => {
    const plugins = [
      {
        id: 'policy' as Plugin,
        severity: Severity.Low,
        config: { policy: { id: 'policy-1', text: 'Policy 1', name: 'Policy 1' } },
      },
      {
        id: 'policy' as Plugin,
        severity: Severity.Critical,
        config: { policy: { id: 'policy-2', text: 'Policy 2', name: 'Policy 2' } },
      },
    ];

    const result = getRiskCategorySeverityMap(plugins);

    // Each specific policy ID should have its own severity
    expect(result['policy-1' as Plugin]).toBe(Severity.Low);
    expect(result['policy-2' as Plugin]).toBe(Severity.Critical);
    // The generic 'policy' key gets the last value (Critical)
    expect(result['policy']).toBe(Severity.Critical);
  });

  it('should not add policy ID entry when policy config is missing', () => {
    const plugins = [
      {
        id: 'policy' as Plugin,
        severity: Severity.Low,
        // No config.policy.id
      },
    ];

    const result = getRiskCategorySeverityMap(plugins);

    expect(result['policy']).toBe(Severity.Low);
    // Should not throw or add undefined keys
    expect(Object.keys(result).filter((k) => k === 'undefined')).toHaveLength(0);
  });

  it('should not add policy ID entry for non-policy plugins', () => {
    const plugins = [
      {
        id: 'contracts' as Plugin,
        severity: Severity.High,
        config: { policy: { id: 'should-not-be-added' } },
      },
    ];

    const result = getRiskCategorySeverityMap(plugins);

    expect(result['contracts']).toBe(Severity.High);
    expect(result['should-not-be-added' as Plugin]).toBeUndefined();
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

    expect(typeof result.defaultTest).toBe('object');
    expect(result.defaultTest).toBeDefined();
    // Type assertion since we've verified it's an object above
    const defaultTest = result.defaultTest as Exclude<
      typeof result.defaultTest,
      string | undefined
    >;
    expect(defaultTest.vars).toEqual({ test: 'value' });
    expect(defaultTest.options!.transformVars).toBe('{ ...vars, sessionId: context.uuid }');
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
      { id: 'custom', config: { option: true, stateful: true } },
    ]);
  });

  it('should handle maxConcurrency configuration', () => {
    const configWithMaxConcurrency: SavedRedteamConfig = {
      ...baseConfig,
      maxConcurrency: 5,
    };

    const result = getUnifiedConfig(configWithMaxConcurrency);
    expect(result.redteam.maxConcurrency).toBe(5);

    const configWithoutMaxConcurrency = getUnifiedConfig(baseConfig);
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

  it('should include frameworks when provided', () => {
    const configWithFrameworks: SavedRedteamConfig = {
      ...baseConfig,
      frameworks: ['owasp:llm', 'nist:ai:measure'],
    };

    const result = getUnifiedConfig(configWithFrameworks);

    expect(result.redteam.frameworks).toEqual(['owasp:llm', 'nist:ai:measure']);
  });

  it('should include provider when provided as string', () => {
    const configWithProvider: SavedRedteamConfig = {
      ...baseConfig,
      provider: 'openai:chat:gpt-4',
    };

    const result = getUnifiedConfig(configWithProvider);

    expect(result.redteam.provider).toBe('openai:chat:gpt-4');
  });

  it('should include provider when provided as object', () => {
    const configWithProvider: SavedRedteamConfig = {
      ...baseConfig,
      provider: {
        id: 'openai:chat',
        config: {
          apiBaseUrl: 'http://192.168.1.1:1111/v1',
          apiKey: 'sk-test',
          model: 'Qwen3-test',
        },
      },
    };

    const result = getUnifiedConfig(configWithProvider);

    expect(result.redteam.provider).toEqual({
      id: 'openai:chat',
      config: {
        apiBaseUrl: 'http://192.168.1.1:1111/v1',
        apiKey: 'sk-test',
        model: 'Qwen3-test',
      },
    });
  });

  it('should not include provider when not provided', () => {
    const result = getUnifiedConfig(baseConfig);

    expect(result.redteam.provider).toBeUndefined();
  });
});
