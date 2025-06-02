import path from 'path';
import cliState from '../../../src/cliState';
import { importModule } from '../../../src/esm';
import logger from '../../../src/logger';
import { validateStrategies, loadStrategy } from '../../../src/redteam/strategies';
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
    const strategies: RedteamStrategyObject[] = [{ id: 'file://custom.js' }];
    await expect(validateStrategies(strategies)).resolves.toBeUndefined();
  });

  it('should exit for invalid strategies', async () => {
    const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const invalidStrategies: RedteamStrategyObject[] = [{ id: 'invalid-strategy' }];

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

  it('should throw error for non-existent strategy', async () => {
    await expect(loadStrategy('non-existent')).rejects.toThrow('Strategy not found: non-existent');
  });

  it('should load custom file strategy', async () => {
    const customStrategy = {
      id: 'custom',
      action: jest.fn(),
    };
    jest.mocked(importModule).mockResolvedValue(customStrategy);
    (cliState as any).basePath = '/test/path';

    const strategy = await loadStrategy('file://custom.js');
    expect(strategy).toEqual(customStrategy);
  });

  it('should throw error for non-js custom file', async () => {
    await expect(loadStrategy('file://custom.txt')).rejects.toThrow(
      'Custom strategy file must be a JavaScript file',
    );
  });

  it('should throw error for invalid custom strategy', async () => {
    jest.mocked(importModule).mockResolvedValue({});

    await expect(loadStrategy('file://invalid.js')).rejects.toThrow(
      "Custom strategy in invalid.js must export an object with 'key' and 'action' properties",
    );
  });

  it('should use absolute path for custom strategy', async () => {
    const customStrategy = {
      id: 'custom',
      action: jest.fn(),
    };
    jest.mocked(importModule).mockResolvedValue(customStrategy);

    await loadStrategy('file:///absolute/path/custom.js');
    expect(importModule).toHaveBeenCalledWith('/absolute/path/custom.js');
  });

  it('should use relative path from basePath for custom strategy', async () => {
    const customStrategy = {
      id: 'custom',
      action: jest.fn(),
    };
    jest.mocked(importModule).mockResolvedValue(customStrategy);
    (cliState as any).basePath = '/base/path';

    await loadStrategy('file://relative/custom.js');
    expect(importModule).toHaveBeenCalledWith(path.join('/base/path', 'relative/custom.js'));
  });
});
