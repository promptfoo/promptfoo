import type { Plugin } from '../../src/redteam/constants';
import { Severity } from '../../src/redteam/constants';
import { getRiskCategorySeverityMap, getUnifiedConfig } from '../../src/redteam/sharedFrontend';
import type { RedteamPluginObject, SavedRedteamConfig } from '../../src/redteam/types';

describe('getRiskCategorySeverityMap', () => {
  it('should return default severity map when no plugins provided', () => {
    const result = getRiskCategorySeverityMap();
    expect(result).toBeDefined();
    expect(Object.keys(result).length).toBeGreaterThan(0);
  });

  it('should override default severities with plugin severities', () => {
    const plugins: RedteamPluginObject[] = [
      {
        id: 'contracts' as Plugin,
        severity: Severity.Critical,
      },
      {
        id: 'hijacking' as Plugin,
        severity: Severity.Low,
      },
    ];

    const result = getRiskCategorySeverityMap(plugins);
    expect(result['contracts']).toBe(Severity.Critical);
    expect(result['hijacking']).toBe(Severity.Low);
  });

  it('should handle plugins without severity', () => {
    const plugins: RedteamPluginObject[] = [
      {
        id: 'contracts' as Plugin,
      },
    ];

    const result = getRiskCategorySeverityMap(plugins);
    expect(result['contracts']).toBeDefined();
  });
});

describe('getUnifiedConfig', () => {
  it('should transform basic config correctly', () => {
    const config: SavedRedteamConfig = {
      description: 'Test config',
      target: { id: 'test-target' },
      prompts: ['test prompt'],
      plugins: ['contracts'],
      strategies: ['basic'],
      purpose: 'testing',
      numTests: 5,
      stateless: true,
      applicationDefinition: {},
      entities: [],
    };

    const result = getUnifiedConfig(config);

    expect(result.description).toBe('Test config');
    expect(result.targets).toEqual([{ id: 'test-target' }]);
    expect(result.prompts).toEqual(['test prompt']);
    expect(result.redteam?.plugins).toEqual([{ id: 'contracts' }]);
    expect(result.redteam?.strategies).toEqual([{ id: 'basic' }]);
    expect(result.redteam?.purpose).toBe('testing');
    expect(result.redteam?.numTests).toBe(5);
  });

  it('should handle plugins with config', () => {
    const config: SavedRedteamConfig = {
      description: 'Test config',
      target: { id: 'test-target' },
      prompts: ['test prompt'],
      plugins: [{ id: 'contracts', config: { key: 'value' } }],
      strategies: ['basic'],
      purpose: 'testing',
      applicationDefinition: {},
      entities: [],
    };

    const result = getUnifiedConfig(config);
    expect(result.redteam?.plugins?.[0]).toEqual({
      id: 'contracts',
      config: { key: 'value' },
    });
  });

  it('should handle strategies with config and stateless setting', () => {
    const config: SavedRedteamConfig = {
      description: 'Test config',
      target: { id: 'test-target' },
      prompts: ['test prompt'],
      plugins: ['contracts'],
      strategies: [{ id: 'goat', config: { key: 'value' } }],
      stateless: true,
      applicationDefinition: {},
      entities: [],
    };

    const result = getUnifiedConfig(config);
    expect(result.redteam?.strategies?.[0]).toEqual({
      id: 'goat',
      config: {
        key: 'value',
        stateless: true,
      },
    });
  });

  it('should handle empty plugin and strategy configs', () => {
    const config: SavedRedteamConfig = {
      description: 'Test config',
      target: { id: 'test-target' },
      prompts: ['test prompt'],
      plugins: [{ id: 'contracts', config: {} }],
      strategies: [{ id: 'basic', config: {} }],
      applicationDefinition: {},
      entities: [],
    };

    const result = getUnifiedConfig(config);
    expect(result.redteam?.plugins?.[0]).toEqual({ id: 'contracts' });
    expect(result.redteam?.strategies?.[0]).toEqual({
      id: 'basic',
      config: {},
    });
  });
});
