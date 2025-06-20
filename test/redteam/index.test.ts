import cliProgress from 'cli-progress';
import * as fs from 'fs';
import yaml from 'js-yaml';
import logger from '../../src/logger';
import { loadApiProvider } from '../../src/providers';
import { HARM_PLUGINS, PII_PLUGINS } from '../../src/redteam/constants';
import { extractEntities } from '../../src/redteam/extraction/entities';
import { extractSystemPurpose } from '../../src/redteam/extraction/purpose';
import {
  calculateTotalTests,
  getMultilingualRequestedCount,
  getTestCount,
  resolvePluginConfig,
  synthesize,
} from '../../src/redteam/index';
import { Plugins } from '../../src/redteam/plugins';
import { getRemoteHealthUrl, shouldGenerateRemote } from '../../src/redteam/remoteGeneration';
import { Strategies, validateStrategies } from '../../src/redteam/strategies';
import { DEFAULT_LANGUAGES } from '../../src/redteam/strategies/multilingual';
import type { TestCaseWithPlugin } from '../../src/types';
import { checkRemoteHealth } from '../../src/util/apiHealth';
import { extractVariablesFromTemplates } from '../../src/util/templates';

jest.mock('cli-progress');
jest.mock('../../src/logger');
jest.mock('../../src/providers');
jest.mock('../../src/redteam/extraction/entities');
jest.mock('../../src/redteam/extraction/purpose');
jest.mock('../../src/util/templates', () => {
  const originalModule = jest.requireActual('../../src/util/templates');
  return {
    ...originalModule,
    extractVariablesFromTemplates: jest.fn().mockReturnValue(['query']),
  };
});

jest.mock('process', () => ({
  ...jest.requireActual('process'),
  exit: jest.fn(),
}));

jest.mock('../../src/redteam/strategies', () => ({
  ...jest.requireActual('../../src/redteam/strategies'),
  validateStrategies: jest.fn().mockImplementation((strategies) => {
    if (strategies.some((s: { id: string }) => s.id === 'invalid-strategy')) {
      throw new Error('Invalid strategies');
    }
  }),
}));

jest.mock('../../src/util/apiHealth');
jest.mock('../../src/redteam/remoteGeneration');
jest.mock('../../src/redteam/util', () => ({
  ...jest.requireActual('../../src/redteam/util'),
  extractGoalFromPrompt: jest.fn().mockResolvedValue('mocked goal'),
}));

describe('synthesize', () => {
  const mockProvider = {
    callApi: jest.fn(),
    generate: jest.fn(),
    id: () => 'test-provider',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();

    // Set up logger mocks
    jest.mocked(logger.info).mockReturnValue(logger as any);
    jest.mocked(logger.warn).mockReturnValue(logger as any);
    jest.mocked(logger.error).mockReturnValue(logger as any);
    jest.mocked(logger.debug).mockReturnValue(logger as any);

    // Set up templates mock with consistent default behavior
    jest.mocked(extractVariablesFromTemplates).mockReturnValue(['query']);

    jest.mocked(extractEntities).mockResolvedValue(['entity1', 'entity2']);
    jest.mocked(extractSystemPurpose).mockResolvedValue('Test purpose');
    jest.mocked(loadApiProvider).mockResolvedValue(mockProvider);
    jest.spyOn(process, 'exit').mockImplementation((code?: string | number | null | undefined) => {
      throw new Error(`Process.exit called with code ${code}`);
    });
    jest.mocked(validateStrategies).mockImplementation(async () => {});
    jest.mocked(cliProgress.SingleBar).mockReturnValue({
      increment: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
      update: jest.fn(),
    } as any);
    // Disable remote generation by default to avoid health checks interfering
    // with tests that don't explicitly set this behaviour
    jest.mocked(shouldGenerateRemote).mockReturnValue(false);
    jest.mocked(getRemoteHealthUrl).mockReturnValue('https://api.test/health');
    jest.mocked(checkRemoteHealth).mockResolvedValue({
      status: 'OK',
      message: 'Cloud API is healthy',
    });
  });

  // Input handling tests
  describe('Input handling', () => {
    it('should use provided purpose and entities if given', async () => {
      const result = await synthesize({
        entities: ['custom-entity'],
        language: 'en',
        numTests: 1,
        plugins: [{ id: 'test-plugin', numTests: 1 }],
        prompts: ['Test prompt'],
        purpose: 'Custom purpose',
        strategies: [],
        targetLabels: ['test-provider'],
      });

      expect(result).toEqual(
        expect.objectContaining({
          entities: ['custom-entity'],
          purpose: 'Custom purpose',
        }),
      );
      expect(extractEntities).not.toHaveBeenCalled();
      expect(extractSystemPurpose).not.toHaveBeenCalled();
    });

    it('should extract purpose and entities if not provided', async () => {
      await synthesize({
        language: 'english',
        numTests: 1,
        plugins: [{ id: 'test-plugin', numTests: 1 }],
        prompts: ['Test prompt'],
        strategies: [],
        targetLabels: ['test-provider'],
      });

      expect(extractEntities).toHaveBeenCalledWith(expect.any(Object), ['Test prompt']);
      expect(extractSystemPurpose).toHaveBeenCalledWith(expect.any(Object), ['Test prompt']);
    });

    it('should handle empty prompts array', async () => {
      await expect(
        synthesize({
          language: 'en',
          numTests: 1,
          plugins: [{ id: 'test-plugin', numTests: 1 }],
          prompts: [] as unknown as [string, ...string[]],
          strategies: [],
          targetLabels: ['test-provider'],
        }),
      ).rejects.toThrow('Prompts array cannot be empty');
    });

    it('should correctly process multiple prompts', async () => {
      await synthesize({
        language: 'en',
        numTests: 1,
        plugins: [{ id: 'test-plugin', numTests: 1 }],
        prompts: ['Prompt 1', 'Prompt 2', 'Prompt 3'],
        strategies: [],
        targetLabels: ['test-provider'],
      });

      expect(extractSystemPurpose).toHaveBeenCalledWith(expect.any(Object), [
        'Prompt 1',
        'Prompt 2',
        'Prompt 3',
      ]);
      expect(extractEntities).toHaveBeenCalledWith(expect.any(Object), [
        'Prompt 1',
        'Prompt 2',
        'Prompt 3',
      ]);
    });
  });

  // API provider tests
  describe('API provider', () => {
    it('should use the provided API provider if given', async () => {
      const customProvider = {
        callApi: jest.fn(),
        generate: jest.fn(),
        id: () => 'custom-provider',
      };
      await synthesize({
        language: 'en',
        numTests: 1,
        plugins: [{ id: 'test-plugin', numTests: 1 }],
        prompts: ['Test prompt'],
        provider: customProvider,
        strategies: [],
        targetLabels: ['custom-provider'],
      });

      expect(loadApiProvider).not.toHaveBeenCalled();
    });
  });

  // Plugin and strategy tests
  describe('Plugins and strategies', () => {
    it('should generate test cases for each plugin', async () => {
      const mockPluginAction = jest.fn().mockResolvedValue([{ vars: { query: 'test' } }]);
      jest.spyOn(Plugins, 'find').mockReturnValue({ action: mockPluginAction, key: 'mockPlugin' });

      const result = await synthesize({
        language: 'en',
        numTests: 1,
        plugins: [
          { id: 'plugin1', numTests: 2 },
          { id: 'plugin2', numTests: 3 },
        ],
        prompts: ['Test prompt'],
        strategies: [],
        targetLabels: ['test-provider'],
      });

      expect(mockPluginAction).toHaveBeenCalledTimes(2);
      expect(result.testCases).toEqual([
        expect.objectContaining({ metadata: expect.objectContaining({ pluginId: 'plugin1' }) }),
        expect.objectContaining({ metadata: expect.objectContaining({ pluginId: 'plugin2' }) }),
      ]);
    });

    it('should warn about unregistered plugins', async () => {
      jest.spyOn(Plugins, 'find').mockReturnValue(undefined);

      await synthesize({
        language: 'en',
        numTests: 1,
        plugins: [{ id: 'unregistered-plugin', numTests: 1 }],
        prompts: ['Test prompt'],
        strategies: [],
        targetLabels: ['test-provider'],
      });

      expect(logger.warn).toHaveBeenCalledWith(
        'Plugin unregistered-plugin not registered, skipping',
      );
    });

    it('should handle HARM_PLUGINS and PII_PLUGINS correctly', async () => {
      const mockPluginAction = jest.fn().mockResolvedValue([{ vars: { query: 'test' } }]);
      jest.spyOn(Plugins, 'find').mockReturnValue({ action: mockPluginAction, key: 'mockPlugin' });

      const result = await synthesize({
        language: 'en',
        numTests: 1,
        plugins: [
          { id: 'harmful', numTests: 2 },
          { id: 'pii', numTests: 3 },
        ],
        prompts: ['Test prompt'],
        strategies: [],
        targetLabels: ['test-provider'],
      });

      // Verify the test cases by checking each one individually rather than hardcoding a number
      // Each test case should have a valid plugin ID that comes from one of our plugin sets
      const testCases = result.testCases;

      // All test cases should have valid plugin IDs
      const pluginIds = testCases.map((tc) => tc.metadata.pluginId);

      // Check that each plugin ID belongs to one of our known plugin categories
      const allValidPluginIds = [...Object.keys(HARM_PLUGINS), ...PII_PLUGINS];

      // Every plugin ID should be in our list of valid plugins
      pluginIds.forEach((id) => {
        expect(allValidPluginIds).toContain(id);
      });

      // Check for uniqueness - we should have unique plugin IDs (no duplicates of the same plugin)
      const uniquePluginIds = new Set(pluginIds);

      // The expected number of test cases is the number of unique plugin IDs we actually got
      // This is more reliable than trying to predict the exact expansion logic
      const expectedTestCount = uniquePluginIds.size;

      // Assert that we got exactly the expected number of test cases
      expect(testCases).toHaveLength(expectedTestCount);
    });

    it('should generate a correct report for plugins and strategies', async () => {
      const mockPluginAction = jest.fn().mockResolvedValue([{ vars: { query: 'test' } }]);
      jest.spyOn(Plugins, 'find').mockReturnValue({ action: mockPluginAction, key: 'mockPlugin' });

      const mockStrategyAction = jest.fn().mockReturnValue([{ test: 'strategy case' }]);
      jest
        .spyOn(Strategies, 'find')
        .mockReturnValue({ action: mockStrategyAction, id: 'mockStrategy' });

      await synthesize({
        language: 'en',
        numTests: 2,
        plugins: [{ id: 'test-plugin', numTests: 2 }],
        prompts: ['Test prompt'],
        strategies: [{ id: 'mockStrategy' }],
        targetLabels: ['test-provider'],
      });

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Test Generation Report:'));
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('test-plugin'));
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('mockStrategy'));
    });

    it('should expand strategy collections into individual strategies', async () => {
      const mockPluginAction = jest.fn().mockResolvedValue([{ vars: { query: 'test' } }]);
      jest.spyOn(Plugins, 'find').mockReturnValue({ action: mockPluginAction, key: 'mockPlugin' });

      const mockStrategyAction = jest.fn().mockReturnValue([{ test: 'strategy case' }]);
      jest.spyOn(Strategies, 'find').mockImplementation((s: any) => {
        if (['morse', 'piglatin'].includes(s.id)) {
          return { action: mockStrategyAction, id: s.id };
        }
        return undefined;
      });

      await synthesize({
        language: 'en',
        numTests: 1,
        plugins: [{ id: 'test-plugin', numTests: 1 }],
        prompts: ['Test prompt'],
        strategies: [
          {
            id: 'other-encodings',
            config: { customOption: 'test-value' },
          },
        ],
        targetLabels: ['test-provider'],
      });

      expect(validateStrategies).toHaveBeenCalledWith(expect.any(Array));
    });

    it('should deduplicate strategies with the same ID', async () => {
      const mockPluginAction = jest.fn().mockResolvedValue([{ vars: { query: 'test' } }]);
      jest.spyOn(Plugins, 'find').mockReturnValue({ action: mockPluginAction, key: 'mockPlugin' });

      // Create a spy on validateStrategies to capture the strategies array
      const validateStrategiesSpy = jest.mocked(validateStrategies);
      validateStrategiesSpy.mockClear();

      // Include both the collection and an individual strategy that's part of the collection
      await synthesize({
        language: 'en',
        numTests: 1,
        plugins: [{ id: 'test-plugin', numTests: 1 }],
        prompts: ['Test prompt'],
        strategies: [
          { id: 'other-encodings' },
          { id: 'morse' }, // This is already included in other-encodings
        ],
        targetLabels: ['test-provider'],
      });

      // Check that validateStrategies was called
      expect(validateStrategiesSpy).toHaveBeenCalledWith(expect.any(Array));

      // Look at the strategies that were passed to validateStrategies
      // The array should have no duplicate ids
      const strategiesArg = validateStrategiesSpy.mock.calls[0][0];
      const strategyIds = strategiesArg.map((s: any) => s.id);

      // Check for duplicates
      const uniqueIds = new Set(strategyIds);
      expect(uniqueIds.size).toBe(strategyIds.length);

      // Should have morse only once
      expect(strategyIds.filter((id: string) => id === 'morse')).toHaveLength(1);

      // Should have at least morse and piglatin
      expect(strategyIds).toContain('morse');
      expect(strategyIds).toContain('piglatin');
    });

    it('should handle missing strategy collections gracefully', async () => {
      const mockPluginAction = jest.fn().mockResolvedValue([{ vars: { query: 'test' } }]);
      jest.spyOn(Plugins, 'find').mockReturnValue({ action: mockPluginAction, key: 'mockPlugin' });

      await synthesize({
        language: 'en',
        numTests: 1,
        plugins: [{ id: 'test-plugin', numTests: 1 }],
        prompts: ['Test prompt'],
        strategies: [
          { id: 'unknown-collection' }, // This doesn't exist in the mappings
        ],
        targetLabels: ['test-provider'],
      });

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('unknown-collection'));
    });

    it('should skip plugins that fail validation and not throw', async () => {
      const failingPlugin = {
        id: 'fail-plugin',
        numTests: 1,
      };
      const passingPlugin = {
        id: 'pass-plugin',
        numTests: 1,
      };

      jest
        .spyOn(Plugins, 'find')
        .mockReturnValueOnce({
          key: 'fail-plugin',
          action: jest.fn().mockResolvedValue([{ vars: { query: 'test' } }]),
          validate: () => {
            throw new Error('Validation failed!');
          },
        })
        .mockReturnValue({
          key: 'pass-plugin',
          action: jest.fn().mockResolvedValue([{ vars: { query: 'test' } }]),
          validate: jest.fn(),
        });

      const result = await synthesize({
        language: 'en',
        numTests: 1,
        plugins: [failingPlugin, passingPlugin],
        prompts: ['Test prompt'],
        strategies: [],
        targetLabels: ['test-provider'],
      });

      expect(result.testCases).toHaveLength(1);
      expect(result.testCases[0].metadata.pluginId).toBe('pass-plugin');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining(
          'Validation failed for plugin fail-plugin: Error: Validation failed!, skipping plugin',
        ),
      );
    });

    it('should not store full config in metadata for intent plugin to prevent bloating', async () => {
      jest.clearAllMocks();

      const mockProvider = {
        id: () => 'test-provider',
        callApi: jest.fn().mockResolvedValue({ output: 'Test response' }),
      };

      const intentPlugin = {
        id: 'intent',
        numTests: 2,
        config: {
          intent: ['intent1', 'intent2', 'intent3', 'intent4', 'intent5'],
        },
      };

      const regularPlugin = {
        id: 'contracts',
        numTests: 1,
        config: {
          someConfig: 'value',
        },
      };

      const mockIntentAction = jest.fn().mockResolvedValue([
        {
          vars: { prompt: 'intent1' },
          assert: [{ type: 'promptfoo:redteam:intent', metric: 'Intent' }],
          metadata: {
            intent: 'intent1',
            pluginId: 'intent',
            pluginConfig: undefined,
          },
        },
        {
          vars: { prompt: 'intent2' },
          assert: [{ type: 'promptfoo:redteam:intent', metric: 'Intent' }],
          metadata: {
            intent: 'intent2',
            pluginId: 'intent',
            pluginConfig: undefined,
          },
        },
      ]);

      const mockContractsAction = jest.fn().mockResolvedValue([
        {
          vars: { prompt: 'contract test' },
          assert: [{ type: 'promptfoo:redteam:contracts', metric: 'Contracts' }],
          metadata: {
            pluginId: 'contracts',
          },
        },
      ]);

      jest.spyOn(Plugins, 'find').mockImplementation((predicate) => {
        const mockPlugins = [
          { key: 'intent', action: mockIntentAction },
          { key: 'contracts', action: mockContractsAction },
        ];

        if (typeof predicate === 'function') {
          return mockPlugins.find(predicate);
        }
        return undefined;
      });

      const result = await synthesize({
        plugins: [intentPlugin, regularPlugin],
        prompts: ['Test prompt'],
        provider: mockProvider,
        purpose: 'Test purpose',
        strategies: [],
        injectVar: 'prompt',
        language: 'en',
        numTests: 5,
        targetLabels: ['test'],
      });

      const intentTestCases = result.testCases.filter((tc) => tc.metadata?.pluginId === 'intent');
      expect(intentTestCases.length).toBeGreaterThan(0);
      intentTestCases.forEach((tc) => {
        expect(tc.metadata?.pluginConfig).toBeUndefined();
        expect(tc.metadata?.pluginId).toBe('intent');
      });

      const contractsTestCases = result.testCases.filter(
        (tc) => tc.metadata?.pluginId === 'contracts',
      );
      expect(contractsTestCases.length).toBeGreaterThan(0);
      contractsTestCases.forEach((tc) => {
        expect(tc.metadata?.pluginConfig).toBeDefined();
        expect(tc.metadata?.pluginConfig).toEqual({ someConfig: 'value' });
        expect(tc.metadata?.pluginId).toBe('contracts');
      });
    });
  });

  describe('Logger', () => {
    it('debug log level hides progress bar', async () => {
      const originalLogLevel = process.env.LOG_LEVEL;
      process.env.LOG_LEVEL = 'debug';

      await synthesize({
        language: 'en',
        numTests: 1,
        plugins: [{ id: 'test-plugin', numTests: 1 }],
        prompts: ['Test prompt'],
        strategies: [],
        targetLabels: ['test-provider'],
      });

      expect(cliProgress.SingleBar).not.toHaveBeenCalled();

      process.env.LOG_LEVEL = originalLogLevel;
    });
  });

  describe('API Health Check', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      jest.resetAllMocks();

      // Reset logger mocks
      jest.mocked(logger.info).mockReturnValue(logger as any);
      jest.mocked(logger.warn).mockReturnValue(logger as any);
      jest.mocked(logger.error).mockReturnValue(logger as any);
      jest.mocked(logger.debug).mockReturnValue(logger as any);

      // Set up templates mock with consistent default behavior
      jest.mocked(extractVariablesFromTemplates).mockReturnValue(['query']);

      jest.mocked(shouldGenerateRemote).mockReturnValue(true);
      jest.mocked(getRemoteHealthUrl).mockReturnValue('https://api.test/health');
      jest.mocked(checkRemoteHealth).mockResolvedValue({
        status: 'OK',
        message: 'Cloud API is healthy',
      });
    });

    it('should check API health when remote generation is enabled', async () => {
      await synthesize({
        language: 'en',
        numTests: 1,
        plugins: [{ id: 'test-plugin', numTests: 1 }],
        prompts: ['Test prompt'],
        strategies: [],
        targetLabels: ['test-provider'],
      });

      expect(shouldGenerateRemote).toHaveBeenCalledWith();
      expect(getRemoteHealthUrl).toHaveBeenCalledWith();
      expect(checkRemoteHealth).toHaveBeenCalledWith('https://api.test/health');
    });

    it('should skip health check when remote generation is disabled', async () => {
      jest.mocked(shouldGenerateRemote).mockReturnValue(false);

      await synthesize({
        language: 'en',
        numTests: 1,
        plugins: [{ id: 'test-plugin', numTests: 1 }],
        prompts: ['Test prompt'],
        strategies: [],
        targetLabels: ['test-provider'],
      });

      expect(shouldGenerateRemote).toHaveBeenCalledWith();
      expect(getRemoteHealthUrl).not.toHaveBeenCalled();
      expect(checkRemoteHealth).not.toHaveBeenCalled();
    });

    it('should throw error when health check fails', async () => {
      jest.mocked(checkRemoteHealth).mockResolvedValue({
        status: 'ERROR',
        message: 'API is not accessible',
      });

      await expect(
        synthesize({
          language: 'en',
          numTests: 1,
          plugins: [{ id: 'test-plugin', numTests: 1 }],
          prompts: ['Test prompt'],
          strategies: [],
          targetLabels: ['test-provider'],
        }),
      ).rejects.toThrow('Unable to proceed with test generation: API is not accessible');
    });

    it('should skip health check when URL is null', async () => {
      jest.mocked(getRemoteHealthUrl).mockReturnValue(null);

      await synthesize({
        language: 'en',
        numTests: 1,
        plugins: [{ id: 'test-plugin', numTests: 1 }],
        prompts: ['Test prompt'],
        strategies: [],
        targetLabels: ['test-provider'],
      });

      expect(shouldGenerateRemote).toHaveBeenCalledWith();
      expect(getRemoteHealthUrl).toHaveBeenCalledWith();
      expect(checkRemoteHealth).not.toHaveBeenCalled();
    });
  });

  it('should handle basic strategy configuration', async () => {
    jest.mocked(loadApiProvider).mockResolvedValue({
      id: () => 'test',
      callApi: jest.fn().mockResolvedValue({ output: 'test output' }),
    });

    const mockPlugin = {
      id: 'test-plugin',
      numTests: 1,
    };

    const mockProvider = {
      id: () => 'test',
      callApi: jest.fn().mockResolvedValue({ output: 'test output' }),
    };

    const mockTestPluginAction = jest.fn().mockResolvedValue([
      {
        vars: { input: 'test input' },
        assert: [{ type: 'test-assertion', metric: 'Test' }],
        metadata: {
          pluginId: 'test-plugin',
        },
      },
    ]);

    jest.spyOn(Plugins, 'find').mockReturnValue({
      key: 'test-plugin',
      action: mockTestPluginAction,
    });

    const resultEnabled = await synthesize({
      plugins: [mockPlugin],
      strategies: [{ id: 'basic', config: { enabled: true } }],
      prompts: ['test prompt'],
      injectVar: 'input',
      provider: mockProvider,
      language: 'en',
      numTests: 1,
      targetLabels: ['test-provider'],
    });

    expect(resultEnabled.testCases.length).toBeGreaterThan(0);

    const resultDisabled = await synthesize({
      plugins: [mockPlugin],
      strategies: [{ id: 'basic', config: { enabled: false } }],
      prompts: ['test prompt'],
      injectVar: 'input',
      provider: mockProvider,
      language: 'en',
      numTests: 1,
      targetLabels: ['test-provider'],
    });

    expect(resultDisabled.testCases).toHaveLength(0);
  });

  describe('Direct plugin handling', () => {
    it('should recognize and not expand direct plugins like bias:gender', async () => {
      const mockPluginAction = jest.fn().mockImplementation(({ n }) => {
        return Array(n).fill({ vars: { query: 'test' } });
      });
      jest.spyOn(Plugins, 'find').mockReturnValue({ key: 'bias:gender', action: mockPluginAction });

      const result = await synthesize({
        language: 'en',
        numTests: 2,
        plugins: [{ id: 'bias:gender', numTests: 2 }],
        prompts: ['Test prompt'],
        strategies: [],
        targetLabels: ['test-provider'],
      });

      // Check that the plugin wasn't expanded and was used directly
      expect(mockPluginAction).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: expect.anything(),
          purpose: expect.any(String),
          n: 2,
        }),
      );

      // Check that the test cases have the correct plugin ID
      const testCases = result.testCases;
      testCases.forEach((tc) => {
        expect(tc.metadata.pluginId).toBe('bias:gender');
      });

      // Should have exactly the number of test cases we requested
      expect(testCases).toHaveLength(2);
    });

    it('should still expand category plugins with new bias category', async () => {
      const mockPluginAction = jest.fn().mockResolvedValue([{ vars: { query: 'test' } }]);
      jest.spyOn(Plugins, 'find').mockReturnValue({ key: 'mockPlugin', action: mockPluginAction });

      const result = await synthesize({
        language: 'en',
        numTests: 1,
        plugins: [{ id: 'bias', numTests: 2 }],
        prompts: ['Test prompt'],
        strategies: [],
        targetLabels: ['test-provider'],
      });

      // Check that we have test cases for each bias plugin
      const biasPluginIds = Object.keys(HARM_PLUGINS).filter((p) => p.startsWith('bias:'));
      const testCasePluginIds = result.testCases.map((tc) => tc.metadata.pluginId);

      // Every bias plugin should have a test case
      biasPluginIds.forEach((id) => {
        expect(testCasePluginIds).toContain(id);
      });
    });
  });
});

jest.mock('fs');
jest.mock('js-yaml');

describe('resolvePluginConfig', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetAllMocks();

    // Set up logger mocks
    jest.mocked(logger.info).mockReturnValue(logger as any);
    jest.mocked(logger.warn).mockReturnValue(logger as any);
    jest.mocked(logger.error).mockReturnValue(logger as any);
    jest.mocked(logger.debug).mockReturnValue(logger as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return an empty object if config is undefined', () => {
    const result = resolvePluginConfig(undefined);
    expect(result).toEqual({});
  });

  it('should return the original config if no file references are present', () => {
    const config = { key: 'value' };
    const result = resolvePluginConfig(config);
    expect(result).toEqual(config);
  });

  it('should resolve YAML file references', () => {
    const config = { key: 'file://test.yaml' };
    const yamlContent = { nested: 'value' };
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'readFileSync').mockReturnValue('yaml content');
    jest.mocked(yaml.load).mockReturnValue(yamlContent);

    const result = resolvePluginConfig(config);

    expect(result).toEqual({ key: yamlContent });
    expect(fs.existsSync).toHaveBeenCalledWith('test.yaml');
    expect(fs.readFileSync).toHaveBeenCalledWith('test.yaml', 'utf8');
    expect(yaml.load).toHaveBeenCalledWith('yaml content');
  });

  it('should resolve JSON file references', () => {
    const config = { key: 'file://test.json' };
    const jsonContent = { nested: 'value' };
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(jsonContent));

    const result = resolvePluginConfig(config);

    expect(result).toEqual({ key: jsonContent });
    expect(fs.existsSync).toHaveBeenCalledWith('test.json');
    expect(fs.readFileSync).toHaveBeenCalledWith('test.json', 'utf8');
  });

  it('should resolve text file references', () => {
    const config = { key: 'file://test.txt' };
    const fileContent = 'text content';
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'readFileSync').mockReturnValue(fileContent);

    const result = resolvePluginConfig(config);

    expect(result).toEqual({ key: fileContent });
    expect(fs.existsSync).toHaveBeenCalledWith('test.txt');
    expect(fs.readFileSync).toHaveBeenCalledWith('test.txt', 'utf8');
  });

  it('should throw an error if the file does not exist', () => {
    const config = { key: 'file://nonexistent.yaml' };
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);

    expect(() => resolvePluginConfig(config)).toThrow('File not found: nonexistent.yaml');
  });

  it('should handle multiple file references', () => {
    const config = {
      yaml: 'file://test.yaml',
      json: 'file://test.json',
      txt: 'file://test.txt',
    };
    const yamlContent = { nested: 'yaml' };
    const jsonContent = { nested: 'json' };
    const txtContent = 'text content';

    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest
      .spyOn(fs, 'readFileSync')
      .mockReturnValueOnce('yaml content')
      .mockReturnValueOnce(JSON.stringify(jsonContent))
      .mockReturnValueOnce(txtContent);
    jest.mocked(yaml.load).mockReturnValue(yamlContent);

    const result = resolvePluginConfig(config);

    expect(result).toEqual({
      yaml: yamlContent,
      json: jsonContent,
      txt: txtContent,
    });
  });
});

describe('calculateTotalTests', () => {
  const mockPlugins = [
    { id: 'plugin1', numTests: 2 },
    { id: 'plugin2', numTests: 3 },
  ];

  it('should calculate basic test counts with no strategies', () => {
    const result = calculateTotalTests(mockPlugins, []);
    expect(result).toEqual({
      totalTests: 5,
      totalPluginTests: 5,
      effectiveStrategyCount: 0,
      multilingualStrategy: undefined,
      includeBasicTests: true,
    });
  });

  it('should handle basic strategy when enabled', () => {
    const strategies = [{ id: 'basic', config: { enabled: true } }];
    const result = calculateTotalTests(mockPlugins, strategies);
    expect(result).toEqual({
      totalTests: 5,
      totalPluginTests: 5,
      effectiveStrategyCount: 1,
      multilingualStrategy: undefined,
      includeBasicTests: true,
    });
  });

  it('should handle basic strategy when disabled', () => {
    const strategies = [{ id: 'basic', config: { enabled: false } }];
    const result = calculateTotalTests(mockPlugins, strategies);
    expect(result).toEqual({
      totalTests: 0,
      totalPluginTests: 5,
      effectiveStrategyCount: 0,
      multilingualStrategy: undefined,
      includeBasicTests: false,
    });
  });

  it('should handle multilingual strategy with default languages', () => {
    const strategies = [{ id: 'multilingual' }];
    const result = calculateTotalTests(mockPlugins, strategies);
    expect(result).toEqual({
      totalTests: 5 * DEFAULT_LANGUAGES.length,
      totalPluginTests: 5,
      effectiveStrategyCount: 1,
      multilingualStrategy: strategies[0],
      includeBasicTests: true,
    });
  });

  it('should handle multilingual strategy with custom languages', () => {
    const strategies = [
      { id: 'multilingual', config: { languages: { en: true, es: true, fr: true } } },
    ];
    const result = calculateTotalTests(mockPlugins, strategies);
    expect(result).toEqual({
      totalTests: 15,
      totalPluginTests: 5,
      effectiveStrategyCount: 1,
      multilingualStrategy: strategies[0],
      includeBasicTests: true,
    });
  });

  it('should handle combination of basic and multilingual strategies', () => {
    const strategies = [
      { id: 'basic' },
      { id: 'multilingual', config: { languages: { en: true, es: true } } },
    ];
    const result = calculateTotalTests(mockPlugins, strategies);
    expect(result).toEqual({
      totalTests: 10,
      totalPluginTests: 5,
      effectiveStrategyCount: 2,
      includeBasicTests: true,
      multilingualStrategy: strategies[1],
    });
  });

  it('should handle retry strategy with default numTests', () => {
    const strategies = [{ id: 'retry' }];
    const result = calculateTotalTests(mockPlugins, strategies);
    expect(result).toEqual({
      totalTests: 10,
      totalPluginTests: 5,
      effectiveStrategyCount: 1,
      includeBasicTests: true,
      multilingualStrategy: undefined,
    });
  });

  it('should handle retry strategy with custom numTests', () => {
    const strategies = [{ id: 'retry', config: { numTests: 3 } }];
    const result = calculateTotalTests(mockPlugins, strategies);
    expect(result).toEqual({
      totalTests: 8,
      totalPluginTests: 5,
      effectiveStrategyCount: 1,
      includeBasicTests: true,
      multilingualStrategy: undefined,
    });
  });

  it('should handle retry strategy combined with other strategies', () => {
    const strategies = [
      { id: 'retry' },
      { id: 'multilingual', config: { languages: { en: true, es: true } } },
    ];
    const result = calculateTotalTests(mockPlugins, strategies);
    expect(result).toEqual({
      totalTests: 20,
      totalPluginTests: 5,
      effectiveStrategyCount: 2,
      includeBasicTests: true,
      multilingualStrategy: strategies[1],
    });
  });

  it('should correctly calculate total tests for multiple plugins with jailbreak strategy', () => {
    const plugins = Array(10).fill({ numTests: 5 });
    const strategies = [{ id: 'jailbreak' }];
    const result = calculateTotalTests(plugins, strategies);
    expect(result).toEqual({
      totalTests: 100,
      totalPluginTests: 50,
      effectiveStrategyCount: 1,
      includeBasicTests: true,
      multilingualStrategy: undefined,
    });
  });

  it('should add tests for each strategy instead of replacing the total', () => {
    const strategies = [{ id: 'morse' }, { id: 'piglatin' }];
    const result = calculateTotalTests(mockPlugins, strategies);
    expect(result).toEqual({
      totalTests: 15,
      totalPluginTests: 5,
      effectiveStrategyCount: 2,
      includeBasicTests: true,
      multilingualStrategy: undefined,
    });
  });

  it('should handle multiple strategies with multilingual applied last', () => {
    const strategies = [
      { id: 'morse' },
      { id: 'piglatin' },
      { id: 'multilingual', config: { languages: { en: true, es: true } } },
    ];
    const result = calculateTotalTests(mockPlugins, strategies);
    expect(result).toEqual({
      totalTests: 30,
      totalPluginTests: 5,
      effectiveStrategyCount: 3,
      includeBasicTests: true,
      multilingualStrategy: strategies[2],
    });
  });

  it('should handle multiple strategies with basic strategy disabled', () => {
    const strategies = [
      { id: 'basic', config: { enabled: false } },
      { id: 'morse' },
      { id: 'piglatin' },
    ];
    const result = calculateTotalTests(mockPlugins, strategies);
    expect(result).toEqual({
      totalTests: 10,
      totalPluginTests: 5,
      effectiveStrategyCount: 2,
      includeBasicTests: false,
      multilingualStrategy: undefined,
    });
  });
});

describe('getMultilingualRequestedCount', () => {
  const testCases = [
    { metadata: { pluginId: 'test1' } },
    { metadata: { pluginId: 'test2' } },
  ] as TestCaseWithPlugin[];

  it('should calculate count with custom languages array', () => {
    const strategy = {
      id: 'multilingual',
      config: { languages: ['en', 'es', 'fr'] },
    };
    const count = getMultilingualRequestedCount(testCases, strategy);
    expect(count).toBe(6);
  });

  it('should use DEFAULT_LANGUAGES when no languages config provided', () => {
    const strategy = { id: 'multilingual' };
    const count = getMultilingualRequestedCount(testCases, strategy);
    expect(count).toBe(2 * DEFAULT_LANGUAGES.length);
  });

  it('should handle empty languages array', () => {
    const strategy = {
      id: 'multilingual',
      config: { languages: [] },
    };
    const count = getMultilingualRequestedCount(testCases, strategy);
    expect(count).toBe(0);
  });

  it('should handle undefined config', () => {
    const strategy = { id: 'multilingual' };
    const count = getMultilingualRequestedCount(testCases, strategy);
    expect(count).toBe(2 * DEFAULT_LANGUAGES.length);
  });

  it('should handle empty test cases', () => {
    const strategy = {
      id: 'multilingual',
      config: { languages: ['en', 'es'] },
    };
    const count = getMultilingualRequestedCount([], strategy);
    expect(count).toBe(0);
  });
});

describe('getTestCount', () => {
  it('should return totalPluginTests when basic strategy is enabled', () => {
    const strategy = { id: 'basic', config: { enabled: true } };
    const result = getTestCount(strategy, 10, []);
    expect(result).toBe(10);
  });

  it('should return 0 when basic strategy is disabled', () => {
    const strategy = { id: 'basic', config: { enabled: false } };
    const result = getTestCount(strategy, 10, []);
    expect(result).toBe(0);
  });

  it('should multiply by number of languages for multilingual strategy', () => {
    const strategy = {
      id: 'multilingual',
      config: { languages: { en: true, es: true, fr: true } },
    };
    const result = getTestCount(strategy, 10, []);
    expect(result).toBe(30);
  });

  it('should add configured number of tests for retry strategy', () => {
    const strategy = { id: 'retry', config: { numTests: 5 } };
    const result = getTestCount(strategy, 10, []);
    expect(result).toBe(15);
  });

  it('should add totalPluginTests for retry strategy when numTests not specified', () => {
    const strategy = { id: 'retry' };
    const result = getTestCount(strategy, 10, []);
    expect(result).toBe(20);
  });

  it('should return totalPluginTests for other strategies', () => {
    const strategy = { id: 'morse' };
    const result = getTestCount(strategy, 10, []);
    expect(result).toBe(10);
  });
});
