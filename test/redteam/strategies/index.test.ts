import path from 'path';
import cliState from '../../../src/cliState';
import { importModule } from '../../../src/esm';
import logger from '../../../src/logger';
import { loadStrategy, validateStrategies } from '../../../src/redteam/strategies';
import type { RedteamStrategyObject, TestCaseWithPlugin } from '../../../src/types';

jest.mock('../../../src/cliState');
jest.mock('../../../src/esm', () => ({
  importModule: jest.fn(),
}));

describe('validateStrategies', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should validate valid strategies', async () => {
    const validStrategies: RedteamStrategyObject[] = [
      { id: 'basic' },
      { id: 'base64' },
      { id: 'video' },
      { id: 'morse' },
      { id: 'piglatin' },
      { id: 'camelcase' },
      { id: 'emoji' },
    ];
    await expect(validateStrategies(validStrategies)).resolves.toBeUndefined();
  });

  it('should validate basic strategy with enabled config', async () => {
    const strategies: RedteamStrategyObject[] = [{ id: 'basic', config: { enabled: true } }];
    await expect(validateStrategies(strategies)).resolves.toBeUndefined();
  });

  it('should throw error for invalid basic strategy config', async () => {
    const strategies: RedteamStrategyObject[] = [
      { id: 'basic', config: { enabled: 'not-a-boolean' as any } },
    ];
    await expect(validateStrategies(strategies)).rejects.toThrow(
      'Basic strategy enabled config must be a boolean',
    );
  });

  it('should skip validation for file:// strategies', async () => {
    const strategies: RedteamStrategyObject[] = [{ id: 'file://playbook.js' }];
    await expect(validateStrategies(strategies)).resolves.toBeUndefined();
  });

  describe('playbook strategy validation', () => {
    it('should validate simple playbook strategy', async () => {
      const strategies: RedteamStrategyObject[] = [{ id: 'playbook' }];
      await expect(validateStrategies(strategies)).resolves.toBeUndefined();
    });

    it('should validate playbook strategy variants with compound IDs', async () => {
      const strategies: RedteamStrategyObject[] = [
        { id: 'playbook:aggressive' },
        { id: 'playbook:greeting-strategy' },
        { id: 'playbook:multi-word-variant' },
        { id: 'playbook:snake_case_variant' },
      ];
      await expect(validateStrategies(strategies)).resolves.toBeUndefined();
    });

    it('should validate playbook strategies with config', async () => {
      const strategies: RedteamStrategyObject[] = [
        {
          id: 'playbook:configured',
          config: {
            strategyText: 'Playbook strategy text',
            stateful: true,
            temperature: 0.8,
          },
        },
      ];
      await expect(validateStrategies(strategies)).resolves.toBeUndefined();
    });

    it('should validate mixed strategies including playbook variants', async () => {
      const strategies: RedteamStrategyObject[] = [
        { id: 'basic' },
        { id: 'playbook' },
        { id: 'playbook:variant1' },
        { id: 'jailbreak' },
        { id: 'playbook:variant2', config: { strategyText: 'Playbook text' } },
        { id: 'crescendo' },
      ];
      await expect(validateStrategies(strategies)).resolves.toBeUndefined();
    });

    it('should validate playbook strategies with complex variant names', async () => {
      const strategies: RedteamStrategyObject[] = [
        { id: 'playbook:very-long-complex-variant-name-with-many-hyphens' },
        { id: 'playbook:variant_with_underscores_and_numbers_123' },
        { id: 'playbook:CamelCaseVariant' },
        { id: 'playbook:variant.with.dots' },
      ];
      await expect(validateStrategies(strategies)).resolves.toBeUndefined();
    });
  });

  it('should exit for invalid strategies', async () => {
    const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const invalidStrategies: RedteamStrategyObject[] = [{ id: 'invalid-strategy' }];

    await validateStrategies(invalidStrategies);

    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Invalid strategy(s)'));
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('should reject invalid playbook-like strategy patterns', async () => {
    const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const invalidStrategies: RedteamStrategyObject[] = [
      { id: 'playbook-invalid' },
      { id: 'playbook_invalid' },
      { id: 'notplaybook:variant' },
    ];

    await validateStrategies(invalidStrategies);

    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Invalid strategy(s)'));
    expect(mockExit).toHaveBeenCalledWith(1);
  });
});

describe('loadStrategy', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should load predefined strategy', async () => {
    const strategy = await loadStrategy('basic');
    expect(strategy).toBeDefined();
    expect(strategy.id).toBe('basic');
  });

  it('should load video strategy', async () => {
    const strategy = await loadStrategy('video');
    expect(strategy).toBeDefined();
    expect(strategy.id).toBe('video');
    expect(typeof strategy.action).toBe('function');
  });

  it('should call video strategy action with correct parameters', async () => {
    const strategy = await loadStrategy('video');
    const testCases: TestCaseWithPlugin[] = [
      { vars: { test: 'value' }, metadata: { pluginId: 'test' } },
    ];
    const injectVar = 'inject';
    const config = {};

    await strategy.action(testCases, injectVar, config);

    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Adding video encoding'));
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Added'));
  });

  it('should load morse strategy', async () => {
    const strategy = await loadStrategy('morse');
    expect(strategy).toBeDefined();
    expect(strategy.id).toBe('morse');
  });

  it('should load piglatin strategy', async () => {
    const strategy = await loadStrategy('piglatin');
    expect(strategy).toBeDefined();
    expect(strategy.id).toBe('piglatin');
  });

  it('should load camelcase strategy', async () => {
    const strategy = await loadStrategy('camelcase');
    expect(strategy).toBeDefined();
    expect(strategy.id).toBe('camelcase');
  });

  it('should load emoji strategy', async () => {
    const strategy = await loadStrategy('emoji');
    expect(strategy).toBeDefined();
    expect(strategy.id).toBe('emoji');
  });

  it('should call emoji strategy action with correct parameters', async () => {
    const strategy = await loadStrategy('emoji');
    const testCases: TestCaseWithPlugin[] = [
      { vars: { test: 'value' }, metadata: { pluginId: 'test' } },
    ];
    const injectVar = 'inject';
    const config = {};

    await strategy.action(testCases, injectVar, config);

    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Adding emoji encoding'));
    expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Added'));
  });

  describe('playbook strategy loading', () => {
    it('should load simple playbook strategy', async () => {
      const strategy = await loadStrategy('playbook');
      expect(strategy).toBeDefined();
      expect(strategy.id).toBe('playbook');
      expect(typeof strategy.action).toBe('function');
    });

    it('should call playbook strategy action with correct parameters including strategyId', async () => {
      const strategy = await loadStrategy('playbook');
      const testCases: TestCaseWithPlugin[] = [
        { vars: { test: 'value' }, metadata: { pluginId: 'test' } },
      ];
      const injectVar = 'inject';
      const config = { strategyText: 'Test strategy' };

      await strategy.action(testCases, injectVar, config, 'playbook:test');

      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Adding Playbook'));
      expect(logger.debug).toHaveBeenCalledWith(expect.stringContaining('Added'));
    });
  });

  it('should throw error for non-existent strategy', async () => {
    await expect(loadStrategy('non-existent')).rejects.toThrow('Strategy not found: non-existent');
  });

  it('should load playbook file strategy', async () => {
    const playbookStrategy = {
      id: 'playbook',
      action: jest.fn(),
    };
    jest.mocked(importModule).mockResolvedValue(playbookStrategy);
    (cliState as any).basePath = '/test/path';

    const strategy = await loadStrategy('file://playbook.js');
    expect(strategy).toEqual(playbookStrategy);
  });

  it('should throw error for non-js playbook file', async () => {
    await expect(loadStrategy('file://playbook.txt')).rejects.toThrow(
      'Custom strategy file must be a JavaScript file',
    );
  });

  it('should throw error for invalid playbook strategy', async () => {
    jest.mocked(importModule).mockResolvedValue({});

    await expect(loadStrategy('file://invalid.js')).rejects.toThrow(
      "Custom strategy in invalid.js must export an object with 'key' and 'action' properties",
    );
  });

  it('should use absolute path for playbook strategy', async () => {
    const playbookStrategy = {
      id: 'playbook',
      action: jest.fn(),
    };
    jest.mocked(importModule).mockResolvedValue(playbookStrategy);

    await loadStrategy('file:///absolute/path/playbook.js');
    expect(importModule).toHaveBeenCalledWith('/absolute/path/playbook.js');
  });

  it('should use relative path from basePath for playbook strategy', async () => {
    const playbookStrategy = {
      id: 'playbook',
      action: jest.fn(),
    };
    jest.mocked(importModule).mockResolvedValue(playbookStrategy);
    (cliState as any).basePath = '/base/path';

    await loadStrategy('file://relative/playbook.js');
    expect(importModule).toHaveBeenCalledWith(path.join('/base/path', 'relative/playbook.js'));
  });
});
