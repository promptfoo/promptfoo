import * as fs from 'fs';

import cliProgress from 'cli-progress';
import yaml from 'js-yaml';
import logger from '../../src/logger';
import { loadApiProvider } from '../../src/providers/index';
import { HARM_PLUGINS, PII_PLUGINS, getDefaultNFanout } from '../../src/redteam/constants';
import { extractEntities } from '../../src/redteam/extraction/entities';
import { extractSystemPurpose } from '../../src/redteam/extraction/purpose';
import {
  calculateTotalTests,
  getTestCount,
  resolvePluginConfig,
  synthesize,
} from '../../src/redteam/index';
import { Plugins } from '../../src/redteam/plugins';
import { getRemoteHealthUrl, shouldGenerateRemote } from '../../src/redteam/remoteGeneration';
import { Strategies, validateStrategies } from '../../src/redteam/strategies';
import { checkRemoteHealth } from '../../src/util/apiHealth';
import { extractVariablesFromTemplates } from '../../src/util/templates';

import { stripAnsi } from '../util/utils';

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

jest.spyOn(process, 'exit').mockImplementation(() => {
  return undefined as never;
});

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

  afterAll(() => {
    jest.restoreAllMocks();
  });

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

    it('should use default fan-out values when strategy config omits n', async () => {
      const pluginAction = jest.fn().mockResolvedValue([{ vars: { query: 'test' } }]);
      const pluginFindSpy = jest
        .spyOn(Plugins, 'find')
        .mockReturnValue({ action: pluginAction, key: 'mockPlugin' });

      const strategyAction = jest
        .fn()
        .mockImplementation(async () =>
          Array.from({ length: 5 }, (_, idx) => ({ vars: { query: `fanout-${idx}` } })),
        );
      const strategyFindSpy = jest.spyOn(Strategies, 'find').mockImplementation((predicate) => {
        if (typeof predicate === 'function') {
          const strategies = [{ action: strategyAction, id: 'jailbreak:composite' }];
          return strategies.find(predicate);
        }
        return undefined;
      });

      try {
        await synthesize({
          language: 'en',
          numTests: 1,
          plugins: [{ id: 'test-plugin', numTests: 1 }],
          prompts: ['Test prompt'],
          strategies: [{ id: 'jailbreak:composite' }],
          targetLabels: ['test-provider'],
        });

        const reportMessage = jest
          .mocked(logger.info)
          .mock.calls.map(([arg]) => arg)
          .find(
            (arg): arg is string =>
              typeof arg === 'string' && arg.includes('Test Generation Report'),
          );

        expect(reportMessage).toBeDefined();

        const stripped = stripAnsi(reportMessage!);
        const lines = stripped.split('\n');

        // Find header row and parse column indexes
        const headerRow = lines.find(
          (line) => line.includes('Requested') && line.includes('Generated'),
        );
        expect(headerRow).toBeDefined();

        const headerColumns = headerRow!
          .split('│')
          .map((col) => col.trim())
          .filter((col) => col.length > 0);

        const requestedIndex = headerColumns.indexOf('Requested');
        const generatedIndex = headerColumns.indexOf('Generated');
        expect(requestedIndex).toBeGreaterThan(-1);
        expect(generatedIndex).toBeGreaterThan(-1);

        // Find the jailbreak:composite row
        const row = lines.find((line) => line.includes('jailbreak:composite'));
        expect(row).toBeDefined();

        const columns = row!
          .split('│')
          .map((col) => col.trim())
          .filter((col) => col.length > 0);

        // Requested = default fan-out * 1 base test
        expect(columns[requestedIndex]).toBe(getDefaultNFanout('jailbreak:composite').toString());
        // Generated = what our mock strategy returned
        expect(columns[generatedIndex]).toBe(getDefaultNFanout('jailbreak:composite').toString());

        // Verify the "Using strategies:" summary shows correct fan-out
        const summaryMessage = jest
          .mocked(logger.info)
          .mock.calls.map(([arg]) => arg)
          .find(
            (arg): arg is string => typeof arg === 'string' && arg.includes('Using strategies:'),
          );

        expect(summaryMessage).toBeDefined();
        const summaryStripped = stripAnsi(summaryMessage!);
        const summaryLine = summaryStripped
          .split('\n')
          .find((line) => line.includes('jailbreak:composite'));
        expect(summaryLine).toBeDefined();
        expect(summaryLine).toContain(
          `(${getDefaultNFanout('jailbreak:composite')} additional tests)`,
        );

        // Verify the "Test Generation Summary:" shows correct total
        const totalSummaryMessage = jest
          .mocked(logger.info)
          .mock.calls.map(([arg]) => arg)
          .find(
            (arg): arg is string =>
              typeof arg === 'string' && arg.includes('Test Generation Summary:'),
          );

        expect(totalSummaryMessage).toBeDefined();
        const totalStripped = stripAnsi(totalSummaryMessage!);
        // 1 base + default fan-out
        expect(totalStripped).toContain(
          `• Total tests: ${1 + getDefaultNFanout('jailbreak:composite')}`,
        );
      } finally {
        pluginFindSpy.mockRestore();
        strategyFindSpy.mockRestore();
      }
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

    it('should find exact strategy IDs like jailbreak:composite', async () => {
      const mockPluginAction = jest.fn().mockResolvedValue([{ vars: { query: 'test' } }]);
      jest.spyOn(Plugins, 'find').mockReturnValue({ action: mockPluginAction, key: 'mockPlugin' });

      const mockJailbreakCompositeAction = jest.fn().mockReturnValue([
        {
          vars: { query: 'composite test' },
          metadata: { strategyId: 'jailbreak:composite' },
        },
      ]);

      // Mock the Strategies array to include both jailbreak and jailbreak:composite
      jest.spyOn(Strategies, 'find').mockImplementation((predicate) => {
        if (typeof predicate === 'function') {
          const strategies = [
            {
              id: 'jailbreak',
              action: jest.fn().mockReturnValue([{ vars: { query: 'basic jailbreak' } }]),
            },
            { id: 'jailbreak:composite', action: mockJailbreakCompositeAction },
          ];
          return strategies.find(predicate);
        }
        return undefined;
      });

      const result = await synthesize({
        language: 'en',
        numTests: 1,
        plugins: [{ id: 'test-plugin', numTests: 1 }],
        prompts: ['Test prompt'],
        strategies: [{ id: 'jailbreak:composite' }],
        targetLabels: ['test-provider'],
      });

      // Should have called the composite action, not the basic jailbreak action
      expect(mockJailbreakCompositeAction).toHaveBeenCalled();

      // Check that the strategy test cases have the correct strategy ID
      const strategyTestCases = result.testCases.filter((tc) => tc.metadata?.strategyId);
      expect(strategyTestCases).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            metadata: expect.objectContaining({ strategyId: 'jailbreak:composite' }),
          }),
        ]),
      );
    });

    it('should find exact strategy ID for custom strategy', async () => {
      const mockPluginAction = jest.fn().mockResolvedValue([{ vars: { query: 'test' } }]);
      jest.spyOn(Plugins, 'find').mockReturnValue({ action: mockPluginAction, key: 'mockPlugin' });

      const mockCustomAction = jest.fn().mockReturnValue([
        {
          vars: { query: 'custom test' },
          metadata: { strategyId: 'custom' },
        },
      ]);

      // Mock the Strategies array to include the exact 'custom' strategy
      jest.spyOn(Strategies, 'find').mockImplementation((predicate) => {
        if (typeof predicate === 'function') {
          const strategies = [{ id: 'custom', action: mockCustomAction }];
          return strategies.find(predicate);
        }
        return undefined;
      });

      const result = await synthesize({
        language: 'en',
        numTests: 1,
        plugins: [{ id: 'test-plugin', numTests: 1 }],
        prompts: ['Test prompt'],
        strategies: [{ id: 'custom' }],
        targetLabels: ['test-provider'],
      });

      // Should have found the exact 'custom' strategy and called its action
      expect(mockCustomAction).toHaveBeenCalled();

      // Check that the strategy test cases have the correct strategy ID
      const strategyTestCases = result.testCases.filter((tc) => tc.metadata?.strategyId);
      expect(strategyTestCases).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            metadata: expect.objectContaining({ strategyId: 'custom' }),
          }),
        ]),
      );
    });

    it('should fall back to base strategy ID for custom variants', async () => {
      const mockPluginAction = jest.fn().mockResolvedValue([{ vars: { query: 'test' } }]);
      jest.spyOn(Plugins, 'find').mockReturnValue({ action: mockPluginAction, key: 'mockPlugin' });

      const mockCustomAction = jest.fn().mockReturnValue([
        {
          vars: { query: 'custom test' },
          metadata: { strategyId: 'custom:aggressive' },
        },
      ]);

      // Mock the Strategies array to include only the base 'custom' strategy
      jest.spyOn(Strategies, 'find').mockImplementation((predicate) => {
        if (typeof predicate === 'function') {
          const strategies = [{ id: 'custom', action: mockCustomAction }];
          return strategies.find(predicate);
        }
        return undefined;
      });

      const result = await synthesize({
        language: 'en',
        numTests: 1,
        plugins: [{ id: 'test-plugin', numTests: 1 }],
        prompts: ['Test prompt'],
        strategies: [{ id: 'custom:aggressive' }],
        targetLabels: ['test-provider'],
      });

      // Should have found the base 'custom' strategy and called its action
      expect(mockCustomAction).toHaveBeenCalled();

      // Check that the strategy test cases have the correct strategy ID
      const strategyTestCases = result.testCases.filter((tc) => tc.metadata?.strategyId);
      expect(strategyTestCases).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            metadata: expect.objectContaining({ strategyId: 'custom:aggressive' }),
          }),
        ]),
      );
    });

    it('should warn when strategy is not found', async () => {
      const mockPluginAction = jest.fn().mockResolvedValue([{ vars: { query: 'test' } }]);
      jest.spyOn(Plugins, 'find').mockReturnValue({ action: mockPluginAction, key: 'mockPlugin' });

      // Mock Strategies.find to return undefined (strategy not found)
      jest.spyOn(Strategies, 'find').mockReturnValue(undefined);

      await synthesize({
        language: 'en',
        numTests: 1,
        plugins: [{ id: 'test-plugin', numTests: 1 }],
        prompts: ['Test prompt'],
        strategies: [{ id: 'nonexistent-strategy' }],
        targetLabels: ['test-provider'],
      });

      expect(logger.warn).toHaveBeenCalledWith(
        'Strategy nonexistent-strategy not registered, skipping',
      );
    });

    it('should prioritize exact strategy match over base strategy for colon-separated IDs', async () => {
      const mockPluginAction = jest.fn().mockResolvedValue([{ vars: { query: 'test' } }]);
      jest.spyOn(Plugins, 'find').mockReturnValue({ action: mockPluginAction, key: 'mockPlugin' });

      const mockJailbreakAction = jest.fn().mockReturnValue([
        {
          vars: { query: 'basic jailbreak' },
          metadata: { strategyId: 'jailbreak' },
        },
      ]);

      const mockJailbreakCompositeAction = jest.fn().mockReturnValue([
        {
          vars: { query: 'composite jailbreak' },
          metadata: { strategyId: 'jailbreak:composite' },
        },
      ]);

      // Mock the Strategies array to include both strategies
      jest.spyOn(Strategies, 'find').mockImplementation((predicate) => {
        if (typeof predicate === 'function') {
          const strategies = [
            { id: 'jailbreak', action: mockJailbreakAction },
            { id: 'jailbreak:composite', action: mockJailbreakCompositeAction },
          ];
          return strategies.find(predicate);
        }
        return undefined;
      });

      await synthesize({
        language: 'en',
        numTests: 1,
        plugins: [{ id: 'test-plugin', numTests: 1 }],
        prompts: ['Test prompt'],
        strategies: [{ id: 'jailbreak:composite' }],
        targetLabels: ['test-provider'],
      });

      // Should have called the composite action, not the basic jailbreak action
      expect(mockJailbreakCompositeAction).toHaveBeenCalled();
      expect(mockJailbreakAction).not.toHaveBeenCalled();
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
      includeBasicTests: false,
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
    });
  });

  it('should handle retry strategy combined with other strategies', () => {
    const strategies = [{ id: 'retry' }, { id: 'rot13' }];
    const result = calculateTotalTests(mockPlugins, strategies);
    expect(result).toEqual({
      totalTests: 15,
      totalPluginTests: 5,
      effectiveStrategyCount: 2,
      includeBasicTests: true,
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
    });
  });

  it('should handle multiple strategies', () => {
    const strategies = [{ id: 'morse' }, { id: 'piglatin' }, { id: 'rot13' }];
    const result = calculateTotalTests(mockPlugins, strategies);
    expect(result).toEqual({
      totalTests: 20,
      totalPluginTests: 5,
      effectiveStrategyCount: 3,
      includeBasicTests: true,
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
    });
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

  it('should return totalPluginTests for layer strategy', () => {
    const strategy = {
      id: 'layer',
      config: {
        steps: ['base64', 'rot13'],
      },
    };
    const result = getTestCount(strategy, 10, []);
    expect(result).toBe(10);
  });
});

describe('Language configuration', () => {
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

    // Set up templates mock
    jest.mocked(extractVariablesFromTemplates).mockReturnValue(['query']);

    jest.mocked(extractEntities).mockResolvedValue(['entity1', 'entity2']);
    jest.mocked(extractSystemPurpose).mockResolvedValue('Test purpose');
    jest.mocked(loadApiProvider).mockResolvedValue(mockProvider);
    jest.mocked(validateStrategies).mockImplementation(async () => {});
    jest.mocked(cliProgress.SingleBar).mockReturnValue({
      increment: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
      update: jest.fn(),
    } as any);
    jest.mocked(shouldGenerateRemote).mockReturnValue(false);
    jest.mocked(getRemoteHealthUrl).mockReturnValue('https://api.test/health');
    jest.mocked(checkRemoteHealth).mockResolvedValue({
      status: 'OK',
      message: 'OK',
    });

    // Mock plugin action to return test cases
    const mockPluginAction = jest
      .fn()
      .mockResolvedValue([{ vars: { query: 'test1' } }, { vars: { query: 'test2' } }]);
    jest.spyOn(Plugins, 'find').mockReturnValue({
      action: mockPluginAction,
      key: 'mockPlugin',
    });
  });

  describe('calculateTotalTests with language', () => {
    it('should calculate correct test count for single language', () => {
      const plugins = [
        { id: 'plugin1', numTests: 2 },
        { id: 'plugin2', numTests: 3 },
      ];
      const result = calculateTotalTests(plugins, [], 'en');
      expect(result).toEqual({
        totalTests: 5,
        totalPluginTests: 5,
        effectiveStrategyCount: 0,
        includeBasicTests: true,
      });
    });

    it('should calculate correct test count for multiple languages', () => {
      const plugins = [
        { id: 'plugin1', numTests: 2 },
        { id: 'plugin2', numTests: 3 },
      ];
      // With 3 languages, we expect 5 tests * 3 = 15 tests
      const result = calculateTotalTests(plugins, [], ['en', 'fr', 'de']);
      expect(result).toEqual({
        totalTests: 15,
        totalPluginTests: 15,
        effectiveStrategyCount: 0,
        includeBasicTests: true,
      });
    });

    it('should calculate correct test count with strategies and multiple languages', () => {
      const plugins = [
        { id: 'plugin1', numTests: 2 },
        { id: 'plugin2', numTests: 3 },
      ];
      const strategies = [{ id: 'rot13' }];
      // Base tests: 5 * 3 languages = 15
      // Strategy tests: 5 * 3 languages = 15
      // Total: 30
      const result = calculateTotalTests(plugins, strategies, ['en', 'fr', 'de']);
      expect(result).toEqual({
        totalTests: 30,
        totalPluginTests: 15,
        effectiveStrategyCount: 1,
        includeBasicTests: true,
      });
    });

    it('should handle layer strategy with multiple languages', () => {
      const plugins = [{ id: 'plugin1', numTests: 5 }];
      const strategies = [
        {
          id: 'layer',
          config: {
            steps: ['base64', 'rot13'],
          },
        },
      ];
      // With 2 languages, plugin tests: 5 * 2 = 10
      // Layer strategy adds 10 more tests
      const result = calculateTotalTests(plugins, strategies, ['en', 'fr']);
      expect(result).toEqual({
        totalTests: 20,
        totalPluginTests: 10,
        effectiveStrategyCount: 1,
        includeBasicTests: true,
      });
    });

    it('should handle retry strategy with multiple languages', () => {
      const plugins = [{ id: 'plugin1', numTests: 2 }];
      const strategies = [{ id: 'retry', config: { numTests: 2 } }];
      // With 3 languages: 2 * 3 = 6 base tests
      // Retry adds 2 tests per base test: 6 + 2 = 8
      const result = calculateTotalTests(plugins, strategies, ['en', 'fr', 'de']);
      expect(result).toEqual({
        totalTests: 8,
        totalPluginTests: 6,
        effectiveStrategyCount: 1,
        includeBasicTests: true,
      });
    });
  });

  describe('synthesize with language configuration', () => {
    it('should generate test cases with single language', async () => {
      const result = await synthesize({
        language: 'en',
        numTests: 2,
        plugins: [{ id: 'test-plugin', numTests: 2 }],
        prompts: ['Test prompt'],
        strategies: [],
        targetLabels: ['test-provider'],
      });

      expect(result.testCases).toHaveLength(2);
      expect(result.testCases.every((tc) => tc.metadata?.language === 'en')).toBe(true);
    });

    it('should generate test cases for each language when multiple languages specified', async () => {
      const result = await synthesize({
        language: ['en', 'fr'],
        numTests: 2,
        plugins: [{ id: 'test-plugin', numTests: 2 }],
        prompts: ['Test prompt'],
        strategies: [],
        targetLabels: ['test-provider'],
      });

      // Should generate 2 tests * 2 languages = 4 test cases
      expect(result.testCases).toHaveLength(4);

      // Check that we have tests for both languages
      const languageCounts = result.testCases.reduce(
        (acc, tc) => {
          const lang = tc.metadata?.language || 'en';
          acc[lang] = (acc[lang] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );

      expect(languageCounts).toEqual({
        en: 2,
        fr: 2,
      });
    });

    it('should apply strategies to multilingual test cases', async () => {
      // Mock strategy action
      const mockStrategyAction = jest.fn().mockImplementation((testCases) => {
        return testCases.map((tc: any) => ({
          ...tc,
          vars: { ...tc.vars, query: `transformed: ${tc.vars.query}` },
          metadata: { ...tc.metadata, strategyId: 'rot13' },
        }));
      });

      jest.spyOn(Strategies, 'find').mockReturnValue({
        id: 'rot13',
        action: mockStrategyAction,
      });

      const result = await synthesize({
        language: ['en', 'fr'],
        numTests: 2,
        plugins: [{ id: 'test-plugin', numTests: 2 }],
        prompts: ['Test prompt'],
        strategies: [{ id: 'rot13' }],
        targetLabels: ['test-provider'],
      });

      // Base tests: 2 * 2 languages = 4
      // Strategy tests: 2 * 2 languages = 4
      // Total: 8
      expect(result.testCases.length).toBeGreaterThanOrEqual(4);

      // Verify strategy was applied to tests in both languages
      const strategyTests = result.testCases.filter((tc) => tc.metadata?.strategyId === 'rot13');
      expect(strategyTests.length).toBeGreaterThan(0);
    });

    it('should include language in test metadata', async () => {
      // Mock plugin to return only 1 test case instead of 2
      const mockPluginAction = jest.fn().mockResolvedValue([{ vars: { query: 'test1' } }]);
      jest.spyOn(Plugins, 'find').mockReturnValue({
        action: mockPluginAction,
        key: 'mockPlugin',
      });

      const result = await synthesize({
        language: ['en', 'es', 'zh'],
        numTests: 1,
        plugins: [{ id: 'test-plugin', numTests: 1 }],
        prompts: ['Test prompt'],
        strategies: [],
        targetLabels: ['test-provider'],
      });

      expect(result.testCases).toHaveLength(3);

      // Each test case should have language metadata
      for (const testCase of result.testCases) {
        expect(testCase.metadata?.language).toBeDefined();
        expect(['en', 'es', 'zh']).toContain(testCase.metadata?.language);
      }
    });

    it('should handle plugin-level language configuration', async () => {
      const result = await synthesize({
        language: 'en', // Global default
        numTests: 2,
        plugins: [
          {
            id: 'test-plugin',
            numTests: 2,
            config: {
              language: ['fr', 'de'], // Plugin-specific override
            },
          },
        ],
        prompts: ['Test prompt'],
        strategies: [],
        targetLabels: ['test-provider'],
      });

      // Should generate 2 tests * 2 plugin languages = 4 test cases
      expect(result.testCases).toHaveLength(4);

      // All tests should be in plugin-specified languages
      const languages = result.testCases.map((tc) => tc.metadata?.language);
      expect(languages.every((lang) => ['fr', 'de'].includes(lang || ''))).toBe(true);
    });

    it('should handle when no language is specified', async () => {
      const result = await synthesize({
        // No language specified - will use undefined which plugins interpret as 'en'
        numTests: 2,
        plugins: [{ id: 'test-plugin', numTests: 2 }],
        prompts: ['Test prompt'],
        strategies: [],
        targetLabels: ['test-provider'],
      });

      expect(result.testCases).toHaveLength(2);
      // Check that all tests have the same language
      const languages = result.testCases.map((tc) => tc.metadata?.language);
      const uniqueLanguages = [...new Set(languages)];
      expect(uniqueLanguages.length).toBe(1); // Only one language used
    });

    it('should pass testGenerationInstructions through modifiers to plugin action', async () => {
      const mockPluginAction = jest.fn().mockResolvedValue([{ vars: { query: 'test' } }]);
      jest.spyOn(Plugins, 'find').mockReturnValue({
        action: mockPluginAction,
        key: 'test-plugin',
      });

      await synthesize({
        language: 'en',
        numTests: 1,
        plugins: [
          {
            id: 'test-plugin',
            numTests: 1,
            config: {
              modifiers: {
                tone: 'aggressive',
              },
            },
          },
        ],
        prompts: ['Test prompt'],
        strategies: [],
        targetLabels: ['test-provider'],
        testGenerationInstructions: 'Focus on edge cases',
      });

      // Verify action was called with correct config containing merged modifiers
      expect(mockPluginAction).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            modifiers: expect.objectContaining({
              testGenerationInstructions: 'Focus on edge cases',
              tone: 'aggressive',
            }),
          }),
        }),
      );
    });
  });

  describe('Language-disallowed strategies', () => {
    it('should filter multilingual test cases for audio strategy', async () => {
      // Mock strategy action for audio
      const mockAudioAction = jest.fn().mockImplementation((testCases) => {
        return testCases.map((tc: any) => ({
          ...tc,
          vars: { ...tc.vars, query: `audio: ${tc.vars.query}` },
          metadata: { ...tc.metadata, strategyId: 'audio' },
        }));
      });

      jest.spyOn(Strategies, 'find').mockImplementation((predicate) => {
        if (typeof predicate === 'function') {
          const strategies = [{ id: 'audio', action: mockAudioAction }];
          return strategies.find(predicate);
        }
        return undefined;
      });

      const result = await synthesize({
        language: ['en', 'fr', 'de'], // 3 languages
        numTests: 2,
        plugins: [{ id: 'test-plugin', numTests: 2 }],
        prompts: ['Test prompt'],
        strategies: [{ id: 'audio' }],
        targetLabels: ['test-provider'],
      });

      // With audio strategy present, language is forced to 'en' early in synthesize
      // Base tests: 2 tests * 1 language = 2
      // Audio strategy tests: 2 tests
      // Total: 4 tests
      expect(result.testCases.length).toBe(4);

      // Check that audio strategy was applied
      const audioTests = result.testCases.filter((tc) => tc.metadata?.strategyId === 'audio');
      expect(audioTests.length).toBe(2);

      // All tests should be in English only
      const allTests = result.testCases;
      const languages = allTests.map((tc) => tc.metadata?.language || 'en');
      expect(new Set(languages).size).toBe(1); // Only one language
      expect(languages[0]).toBe('en');
    });

    it('should filter multilingual test cases for video strategy', async () => {
      const mockVideoAction = jest.fn().mockImplementation((testCases) => {
        return testCases.map((tc: any) => ({
          ...tc,
          vars: { ...tc.vars, query: `video: ${tc.vars.query}` },
          metadata: { ...tc.metadata, strategyId: 'video' },
        }));
      });

      jest.spyOn(Strategies, 'find').mockReturnValue({
        id: 'video',
        action: mockVideoAction,
      });

      const result = await synthesize({
        language: ['en', 'es'], // 2 languages
        numTests: 1,
        plugins: [{ id: 'test-plugin', numTests: 1 }],
        prompts: ['Test prompt'],
        strategies: [{ id: 'video' }],
        targetLabels: ['test-provider'],
      });

      // With video strategy present, language is forced to 'en' early in synthesize
      // Mock plugin always returns 2 tests (ignores numTests: 1)
      // Base tests: 2 tests (from mock)
      // Strategy transforms: 2 tests → 2 video tests
      // Total: 2 base + 2 video = 4 tests
      const videoTests = result.testCases.filter((tc) => tc.metadata?.strategyId === 'video');
      expect(videoTests.length).toBe(2);
      expect(result.testCases.length).toBe(4);
    });

    it('should filter multilingual test cases for image strategy', async () => {
      const mockImageAction = jest.fn().mockImplementation((testCases) => {
        return testCases.map((tc: any) => ({
          ...tc,
          vars: { ...tc.vars, query: `image: ${tc.vars.query}` },
          metadata: { ...tc.metadata, strategyId: 'image' },
        }));
      });

      jest.spyOn(Strategies, 'find').mockReturnValue({
        id: 'image',
        action: mockImageAction,
      });

      const result = await synthesize({
        language: ['en', 'fr', 'de', 'es'], // 4 languages
        numTests: 3,
        plugins: [{ id: 'test-plugin', numTests: 3 }],
        prompts: ['Test prompt'],
        strategies: [{ id: 'image' }],
        targetLabels: ['test-provider'],
      });

      // With image strategy present, language is forced to 'en' early in synthesize
      // Mock plugin always returns 2 tests (ignores numTests: 3)
      // Base tests: 2 tests (from mock)
      // Strategy transforms: 2 tests → 2 image tests
      // Total: 2 base + 2 image = 4 tests
      const imageTests = result.testCases.filter((tc) => tc.metadata?.strategyId === 'image');
      expect(imageTests.length).toBe(2);
      expect(result.testCases.length).toBe(4);
    });

    it('should support multilingual test cases for layer strategy', async () => {
      const mockJailbreakAction = jest.fn().mockImplementation((testCases) => {
        return testCases.map((tc: any) => ({
          ...tc,
          vars: { ...tc.vars, query: `jailbreak: ${tc.vars.query}` },
          metadata: { ...tc.metadata, strategyId: 'jailbreak' },
        }));
      });

      jest.spyOn(Strategies, 'find').mockReturnValue({
        id: 'jailbreak',
        action: mockJailbreakAction,
      });

      const result = await synthesize({
        language: ['en', 'fr'], // 2 languages
        numTests: 2,
        plugins: [{ id: 'test-plugin', numTests: 2 }],
        prompts: ['Test prompt'],
        strategies: [{ id: 'jailbreak' }],
        targetLabels: ['test-provider'],
      });

      // Layer strategy now supports multiple languages
      // Base tests: 2 tests * 2 languages = 4
      // Jailbreak strategy tests: 4 tests (applies to all base tests)
      // Total: 8 tests
      const jailbreakTests = result.testCases.filter(
        (tc) => tc.metadata?.strategyId === 'jailbreak',
      );
      expect(jailbreakTests.length).toBe(4);
      expect(result.testCases.length).toBe(8);
    });

    it('should filter multilingual test cases for math-prompt strategy', async () => {
      const mockMathPromptAction = jest.fn().mockImplementation((testCases) => {
        return testCases.map((tc: any) => ({
          ...tc,
          vars: { ...tc.vars, query: `math: ${tc.vars.query}` },
          metadata: { ...tc.metadata, strategyId: 'math-prompt' },
        }));
      });

      jest.spyOn(Strategies, 'find').mockReturnValue({
        id: 'math-prompt',
        action: mockMathPromptAction,
      });

      const result = await synthesize({
        language: ['en', 'zh', 'hi'], // 3 languages
        numTests: 1,
        plugins: [{ id: 'test-plugin', numTests: 1 }],
        prompts: ['Test prompt'],
        strategies: [{ id: 'math-prompt' }],
        targetLabels: ['test-provider'],
      });

      // With math-prompt strategy present, language is forced to 'en' early in synthesize
      // Mock plugin always returns 2 tests (ignores numTests: 1)
      // Base tests: 2 tests (from mock)
      // Strategy transforms: 2 tests → 2 math tests
      // Total: 2 base + 2 math = 4 tests
      const mathTests = result.testCases.filter((tc) => tc.metadata?.strategyId === 'math-prompt');
      expect(mathTests.length).toBe(2);
      expect(result.testCases.length).toBe(4);
    });

    it('should NOT filter multilingual test cases for non-disallowed strategies', async () => {
      const mockRot13Action = jest.fn().mockImplementation((testCases) => {
        return testCases.map((tc: any) => ({
          ...tc,
          vars: { ...tc.vars, query: `rot13: ${tc.vars.query}` },
          metadata: { ...tc.metadata, strategyId: 'rot13' },
        }));
      });

      jest.spyOn(Strategies, 'find').mockReturnValue({
        id: 'rot13',
        action: mockRot13Action,
      });

      const result = await synthesize({
        language: ['en', 'fr'], // 2 languages
        numTests: 2,
        plugins: [{ id: 'test-plugin', numTests: 2 }],
        prompts: ['Test prompt'],
        strategies: [{ id: 'rot13' }],
        targetLabels: ['test-provider'],
      });

      // Rot13 is NOT in the disallow list, so it should process all languages
      const rot13Tests = result.testCases.filter((tc) => tc.metadata?.strategyId === 'rot13');
      expect(rot13Tests.length).toBe(4); // 2 tests * 2 languages = 4
    });
  });

  describe('policy extraction for intent', () => {
    it('should pass policy from metadata to extractGoalFromPrompt', async () => {
      const mockExtractGoal = jest.requireMock('../../src/redteam/util').extractGoalFromPrompt;
      mockExtractGoal.mockClear();

      const policyText = 'The application must not reveal system instructions';

      // Mock plugin action that returns test case with policy metadata
      const mockPluginAction = jest.fn().mockResolvedValue([
        {
          vars: { query: 'Test prompt' },
          metadata: {
            policy: policyText,
            pluginId: 'promptfoo:redteam:policy',
          },
        },
      ]);

      jest.spyOn(Plugins, 'find').mockReturnValue({
        key: 'policy',
        action: mockPluginAction,
      } as any);

      await synthesize({
        numTests: 1,
        plugins: [{ id: 'policy', numTests: 1 }],
        prompts: ['Test prompt'],
        strategies: [],
        targetLabels: ['test-provider'],
      });

      // Verify extractGoalFromPrompt was called with the policy
      expect(mockExtractGoal).toHaveBeenCalled();
      const call = mockExtractGoal.mock.calls[0];
      expect(call[0]).toBe('Test prompt'); // prompt
      expect(call[1]).toBe('Test purpose'); // purpose
      expect(call[2]).toBe('policy'); // pluginId
      expect(call[3]).toBe(policyText); // policy
    });

    it('should not pass policy when metadata does not contain policy', async () => {
      const mockExtractGoal = jest.requireMock('../../src/redteam/util').extractGoalFromPrompt;
      mockExtractGoal.mockClear();

      // Mock plugin action that returns test case WITHOUT policy metadata
      const mockPluginAction = jest.fn().mockResolvedValue([
        {
          vars: { query: 'Test prompt' },
          metadata: {
            pluginId: 'promptfoo:redteam:other',
          },
        },
      ]);

      jest.spyOn(Plugins, 'find').mockReturnValue({
        key: 'other-plugin',
        action: mockPluginAction,
      } as any);

      await synthesize({
        numTests: 1,
        plugins: [{ id: 'other-plugin', numTests: 1 }],
        prompts: ['Test prompt'],
        strategies: [],
        targetLabels: ['test-provider'],
      });

      // Verify extractGoalFromPrompt was called WITHOUT policy (undefined)
      expect(mockExtractGoal).toHaveBeenCalled();
      const call = mockExtractGoal.mock.calls[0];
      expect(call[0]).toBe('Test prompt'); // prompt
      expect(call[1]).toBe('Test purpose'); // purpose
      expect(call[2]).toBe('other-plugin'); // pluginId
      expect(call[3]).toBeUndefined(); // policy should be undefined
    });

    it('should handle policy in metadata with safe type checking', async () => {
      const mockExtractGoal = jest.requireMock('../../src/redteam/util').extractGoalFromPrompt;
      mockExtractGoal.mockClear();

      const testCases = [
        {
          metadata: { policy: 'Valid policy' },
          expectedPolicy: 'Valid policy',
        },
        {
          metadata: { policy: { id: 'abc123', text: 'Policy from object' } },
          expectedPolicy: 'Policy from object',
        },
        {
          metadata: { policy: '' },
          expectedPolicy: '', // Empty string is extracted but filtered later by util.ts
        },
        {
          metadata: { someOtherField: 'value' },
          expectedPolicy: undefined, // No policy field
        },
        {
          metadata: null,
          expectedPolicy: undefined, // Null metadata
        },
      ];

      for (const testCase of testCases) {
        mockExtractGoal.mockClear();

        const mockPluginAction = jest.fn().mockResolvedValue([
          {
            vars: { query: 'Test prompt' },
            metadata: testCase.metadata,
          },
        ]);

        jest.spyOn(Plugins, 'find').mockReturnValue({
          key: 'test-plugin',
          action: mockPluginAction,
        } as any);

        await synthesize({
          numTests: 1,
          plugins: [{ id: 'test-plugin', numTests: 1 }],
          prompts: ['Test prompt'],
          strategies: [],
          targetLabels: ['test-provider'],
        });

        // Verify the policy parameter matches expected
        expect(mockExtractGoal).toHaveBeenCalled();
        const call = mockExtractGoal.mock.calls[0];
        expect(call[3]).toBe(testCase.expectedPolicy);
      }
    });
  });
});
