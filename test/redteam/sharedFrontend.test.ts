import type { Plugin } from '../../src/redteam/constants';
import { Severity } from '../../src/redteam/constants';
import { getRiskCategorySeverityMap, getUnifiedConfig } from '../../src/redteam/sharedFrontend';
import type { RedteamPluginObject, SavedRedteamConfig } from '../../src/redteam/types';

describe('getRiskCategorySeverityMap', () => {
  it('should return default severity map when no plugins provided', () => {
    const result = getRiskCategorySeverityMap();
    expect(result).toBeDefined();
    expect(result['harmful:privacy']).toBe(Severity.High);
  });

  it('should override severities based on plugin config', () => {
    const plugins: RedteamPluginObject[] = [
      {
        id: 'harmful:privacy' as Plugin,
        severity: Severity.Low,
      },
    ];

    const result = getRiskCategorySeverityMap(plugins);
    expect(result['harmful:privacy']).toBe(Severity.Low);
  });

  it('should handle plugins without severity', () => {
    const plugins: RedteamPluginObject[] = [
      {
        id: 'harmful:privacy' as Plugin,
      },
    ];

    const result = getRiskCategorySeverityMap(plugins);
    expect(result['harmful:privacy']).toBe(Severity.High); // Default severity
  });
});

describe('getUnifiedConfig', () => {
  it('should transform config into unified structure', () => {
    const config: SavedRedteamConfig = {
      description: 'Test config',
      target: {
        id: 'test-provider',
        config: {},
      },
      prompts: ['test prompt'],
      plugins: ['plugin1', { id: 'plugin2', config: { key: 'value' } }],
      strategies: ['strategy1', { id: 'strategy2', config: { enabled: true } }],
      purpose: 'test purpose',
      numTests: 5,
      applicationDefinition: {},
      entities: [],
    };

    const result = getUnifiedConfig(config);

    expect(result.description).toBe('Test config');
    expect(result.targets).toEqual([{ id: 'test-provider', config: {} }]);
    expect(result.prompts).toEqual(['test prompt']);
    expect(result.redteam.purpose).toBe('test purpose');
    expect(result.redteam.numTests).toBe(5);
    expect(result.redteam.plugins).toEqual([
      { id: 'plugin1' },
      { id: 'plugin2', config: { key: 'value' } },
    ]);
    expect(result.redteam.strategies).toEqual([
      { id: 'strategy1' },
      { id: 'strategy2', config: { enabled: true } },
    ]);
  });

  it('should handle string plugins and strategies', () => {
    const config: SavedRedteamConfig = {
      description: '',
      target: {
        id: 'test',
        config: {},
      },
      prompts: [],
      plugins: ['plugin1'],
      strategies: ['strategy1'],
      applicationDefinition: {},
      entities: [],
    };

    const result = getUnifiedConfig(config);

    expect(result.redteam.plugins).toEqual([{ id: 'plugin1' }]);
    expect(result.redteam.strategies).toEqual([{ id: 'strategy1' }]);
  });

  it('should handle empty config fields', () => {
    const config: SavedRedteamConfig = {
      description: '',
      target: {
        id: 'test',
        config: {},
      },
      prompts: [],
      plugins: [],
      strategies: [],
      applicationDefinition: {},
      entities: [],
    };

    const result = getUnifiedConfig(config);

    expect(result.description).toBe('');
    expect(result.targets).toEqual([{ id: 'test', config: {} }]);
    expect(result.prompts).toEqual([]);
    expect(result.redteam.plugins).toEqual([]);
    expect(result.redteam.strategies).toEqual([]);
  });
});
