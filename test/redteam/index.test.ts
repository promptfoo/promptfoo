import * as fs from 'fs';

import cliProgress from 'cli-progress';
import yaml from 'js-yaml';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import logger from '../../src/logger';
import { loadApiProvider } from '../../src/providers/index';
import { getDefaultNFanout, HARM_PLUGINS, PII_PLUGINS } from '../../src/redteam/constants';
import { extractEntities } from '../../src/redteam/extraction/entities';
import { extractSystemPurpose } from '../../src/redteam/extraction/purpose';
import {
  calculateTotalTests,
  getTestCount,
  resolvePluginConfig,
  synthesize,
} from '../../src/redteam/index';
import { Plugins } from '../../src/redteam/plugins/index';
import { getRemoteHealthUrl, shouldGenerateRemote } from '../../src/redteam/remoteGeneration';
import { Strategies, validateStrategies } from '../../src/redteam/strategies/index';
import { checkRemoteHealth } from '../../src/util/apiHealth';
import { extractVariablesFromTemplates } from '../../src/util/templates';
import { stripAnsi } from '../util/utils';

vi.mock('cli-progress');
vi.mock('../../src/logger');
vi.mock('../../src/providers');
vi.mock('../../src/redteam/extraction/entities');
vi.mock('../../src/redteam/extraction/purpose');
vi.mock('../../src/util/templates', async () => {
  const originalModule = await vi.importActual('../../src/util/templates');
  return {
    ...originalModule,
    extractVariablesFromTemplates: vi.fn().mockReturnValue(['query']),
  };
});

vi.spyOn(process, 'exit').mockImplementation(function () {
  return undefined as never;
});

vi.mock('../../src/redteam/strategies', async () => ({
  ...(await vi.importActual('../../src/redteam/strategies')),

  validateStrategies: vi.fn().mockImplementation(function (strategies) {
    if (strategies.some((s: { id: string }) => s.id === 'invalid-strategy')) {
      throw new Error('Invalid strategies');
    }
  }),
}));

vi.mock('../../src/util/apiHealth');
vi.mock('../../src/redteam/remoteGeneration');
vi.mock('../../src/redteam/util', async () => ({
  ...(await vi.importActual('../../src/redteam/util')),
  extractGoalFromPrompt: vi.fn().mockResolvedValue('mocked goal'),
}));

describe('synthesize', () => {
  const mockProvider = {
    callApi: vi.fn(),
    generate: vi.fn(),
    id: () => 'test-provider',
  };

  afterAll(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();

    // Set up logger mocks
    vi.mocked(logger.info).mockImplementation(function () {
      return logger as any;
    });
    vi.mocked(logger.warn).mockImplementation(function () {
      return logger as any;
    });
    vi.mocked(logger.error).mockImplementation(function () {
      return logger as any;
    });
    vi.mocked(logger.debug).mockImplementation(function () {
      return logger as any;
    });

    // Set up templates mock with consistent default behavior
    vi.mocked(extractVariablesFromTemplates).mockImplementation(function () {
      return ['query'];
    });

    vi.mocked(extractEntities).mockResolvedValue(['entity1', 'entity2']);
    vi.mocked(extractSystemPurpose).mockResolvedValue('Test purpose');
    vi.mocked(loadApiProvider).mockResolvedValue(mockProvider);
    vi.spyOn(process, 'exit').mockImplementation(function (
      code?: string | number | null | undefined,
    ) {
      throw new Error(`Process.exit called with code ${code}`);
    });
    vi.mocked(validateStrategies).mockImplementation(async function () {});
    vi.mocked(cliProgress.SingleBar).mockImplementation(function () {
      return {
        increment: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        update: vi.fn(),
      } as any;
    });
    // Disable remote generation by default to avoid health checks interfering
    // with tests that don't explicitly set this behaviour
    vi.mocked(shouldGenerateRemote).mockImplementation(function () {
      return false;
    });
    vi.mocked(getRemoteHealthUrl).mockImplementation(function () {
      return 'https://api.test/health';
    });
    vi.mocked(checkRemoteHealth).mockResolvedValue({
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
        targetIds: ['test-provider'],
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
        targetIds: ['test-provider'],
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
          targetIds: ['test-provider'],
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
        targetIds: ['test-provider'],
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
        callApi: vi.fn(),
        generate: vi.fn(),
        id: () => 'custom-provider',
      };
      await synthesize({
        language: 'en',
        numTests: 1,
        plugins: [{ id: 'test-plugin', numTests: 1 }],
        prompts: ['Test prompt'],
        provider: customProvider,
        strategies: [],
        targetIds: ['custom-provider'],
      });

      expect(loadApiProvider).not.toHaveBeenCalled();
    });
  });

  // Plugin and strategy tests
  describe('Plugins and strategies', () => {
    it('should generate test cases for each plugin', async () => {
      const mockPluginAction = vi.fn().mockResolvedValue([{ vars: { query: 'test' } }]);
      vi.spyOn(Plugins, 'find').mockReturnValue({ action: mockPluginAction, key: 'mockPlugin' });

      const result = await synthesize({
        language: 'en',
        numTests: 1,
        plugins: [
          { id: 'plugin1', numTests: 2 },
          { id: 'plugin2', numTests: 3 },
        ],
        prompts: ['Test prompt'],
        strategies: [],
        targetIds: ['test-provider'],
      });

      expect(mockPluginAction).toHaveBeenCalledTimes(2);
      expect(result.testCases).toEqual([
        expect.objectContaining({ metadata: expect.objectContaining({ pluginId: 'plugin1' }) }),
        expect.objectContaining({ metadata: expect.objectContaining({ pluginId: 'plugin2' }) }),
      ]);
    });

    it('should warn about unregistered plugins', async () => {
      vi.spyOn(Plugins, 'find').mockReturnValue(undefined);

      await synthesize({
        language: 'en',
        numTests: 1,
        plugins: [{ id: 'unregistered-plugin', numTests: 1 }],
        prompts: ['Test prompt'],
        strategies: [],
        targetIds: ['test-provider'],
      });

      expect(logger.warn).toHaveBeenCalledWith(
        'Plugin unregistered-plugin not registered, skipping',
      );
    });

    it('should handle HARM_PLUGINS and PII_PLUGINS correctly', async () => {
      const mockPluginAction = vi.fn().mockResolvedValue([{ vars: { query: 'test' } }]);
      vi.spyOn(Plugins, 'find').mockReturnValue({ action: mockPluginAction, key: 'mockPlugin' });

      const result = await synthesize({
        language: 'en',
        numTests: 1,
        plugins: [
          { id: 'harmful', numTests: 2 },
          { id: 'pii', numTests: 3 },
        ],
        prompts: ['Test prompt'],
        strategies: [],
        targetIds: ['test-provider'],
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
      const mockPluginAction = vi.fn().mockResolvedValue([{ vars: { query: 'test' } }]);
      vi.spyOn(Plugins, 'find').mockReturnValue({ action: mockPluginAction, key: 'mockPlugin' });

      const mockStrategyAction = vi.fn().mockReturnValue([{ test: 'strategy case' }]);
      vi.spyOn(Strategies, 'find').mockReturnValue({
        action: mockStrategyAction,
        id: 'mockStrategy',
      });

      await synthesize({
        language: 'en',
        numTests: 2,
        plugins: [{ id: 'test-plugin', numTests: 2 }],
        prompts: ['Test prompt'],
        strategies: [{ id: 'mockStrategy' }],
        targetIds: ['test-provider'],
      });

      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Test Generation Report:'));
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('test-plugin'));
      expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('mockStrategy'));
    });

    it('should use default fan-out values when strategy config omits n', async () => {
      const pluginAction = vi.fn().mockResolvedValue([{ vars: { query: 'test' } }]);
      const pluginFindSpy = vi
        .spyOn(Plugins, 'find')
        .mockReturnValue({ action: pluginAction, key: 'mockPlugin' });

      const strategyAction = vi.fn().mockImplementation(async function () {
        return Array.from({ length: 5 }, (_, idx) => ({ vars: { query: `fanout-${idx}` } }));
      });
      const strategyFindSpy = vi.spyOn(Strategies, 'find').mockImplementation(function (predicate) {
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
          targetIds: ['test-provider'],
        });

        const reportMessage = vi
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
        const summaryMessage = vi
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
        const totalSummaryMessage = vi
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
      const mockPluginAction = vi.fn().mockResolvedValue([{ vars: { query: 'test' } }]);
      vi.spyOn(Plugins, 'find').mockReturnValue({ action: mockPluginAction, key: 'mockPlugin' });

      const mockStrategyAction = vi.fn().mockReturnValue([{ test: 'strategy case' }]);
      vi.spyOn(Strategies, 'find').mockImplementation(function (s: any) {
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
        targetIds: ['test-provider'],
      });

      expect(validateStrategies).toHaveBeenCalledWith(expect.any(Array));
    });

    it('should deduplicate strategies with the same ID', async () => {
      const mockPluginAction = vi.fn().mockResolvedValue([{ vars: { query: 'test' } }]);
      vi.spyOn(Plugins, 'find').mockReturnValue({ action: mockPluginAction, key: 'mockPlugin' });

      // Create a spy on validateStrategies to capture the strategies array
      const validateStrategiesSpy = vi.mocked(validateStrategies);
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
        targetIds: ['test-provider'],
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
      const mockPluginAction = vi.fn().mockResolvedValue([{ vars: { query: 'test' } }]);
      vi.spyOn(Plugins, 'find').mockReturnValue({ action: mockPluginAction, key: 'mockPlugin' });

      await synthesize({
        language: 'en',
        numTests: 1,
        plugins: [{ id: 'test-plugin', numTests: 1 }],
        prompts: ['Test prompt'],
        strategies: [
          { id: 'unknown-collection' }, // This doesn't exist in the mappings
        ],
        targetIds: ['test-provider'],
      });

      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('unknown-collection'));
    });

    it('should find exact strategy IDs like jailbreak:composite', async () => {
      const mockPluginAction = vi.fn().mockResolvedValue([{ vars: { query: 'test' } }]);
      vi.spyOn(Plugins, 'find').mockReturnValue({ action: mockPluginAction, key: 'mockPlugin' });

      const mockJailbreakCompositeAction = vi.fn().mockReturnValue([
        {
          vars: { query: 'composite test' },
          metadata: { strategyId: 'jailbreak:composite' },
        },
      ]);

      // Mock the Strategies array to include both jailbreak and jailbreak:composite
      vi.spyOn(Strategies, 'find').mockImplementation(function (predicate) {
        if (typeof predicate === 'function') {
          const strategies = [
            {
              id: 'jailbreak',
              action: vi.fn().mockReturnValue([{ vars: { query: 'basic jailbreak' } }]),
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
        targetIds: ['test-provider'],
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
      const mockPluginAction = vi.fn().mockResolvedValue([{ vars: { query: 'test' } }]);
      vi.spyOn(Plugins, 'find').mockReturnValue({ action: mockPluginAction, key: 'mockPlugin' });

      const mockCustomAction = vi.fn().mockReturnValue([
        {
          vars: { query: 'custom test' },
          metadata: { strategyId: 'custom' },
        },
      ]);

      // Mock the Strategies array to include the exact 'custom' strategy
      vi.spyOn(Strategies, 'find').mockImplementation(function (predicate) {
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
        targetIds: ['test-provider'],
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
      const mockPluginAction = vi.fn().mockResolvedValue([{ vars: { query: 'test' } }]);
      vi.spyOn(Plugins, 'find').mockReturnValue({ action: mockPluginAction, key: 'mockPlugin' });

      const mockCustomAction = vi.fn().mockReturnValue([
        {
          vars: { query: 'custom test' },
          metadata: { strategyId: 'custom:aggressive' },
        },
      ]);

      // Mock the Strategies array to include only the base 'custom' strategy
      vi.spyOn(Strategies, 'find').mockImplementation(function (predicate) {
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
        targetIds: ['test-provider'],
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
      const mockPluginAction = vi.fn().mockResolvedValue([{ vars: { query: 'test' } }]);
      vi.spyOn(Plugins, 'find').mockReturnValue({ action: mockPluginAction, key: 'mockPlugin' });

      // Mock Strategies.find to return undefined (strategy not found)
      vi.spyOn(Strategies, 'find').mockReturnValue(undefined);

      await synthesize({
        language: 'en',
        numTests: 1,
        plugins: [{ id: 'test-plugin', numTests: 1 }],
        prompts: ['Test prompt'],
        strategies: [{ id: 'nonexistent-strategy' }],
        targetIds: ['test-provider'],
      });

      expect(logger.warn).toHaveBeenCalledWith(
        'Strategy nonexistent-strategy not registered, skipping',
      );
    });

    it('should prioritize exact strategy match over base strategy for colon-separated IDs', async () => {
      const mockPluginAction = vi.fn().mockResolvedValue([{ vars: { query: 'test' } }]);
      vi.spyOn(Plugins, 'find').mockReturnValue({ action: mockPluginAction, key: 'mockPlugin' });

      const mockJailbreakAction = vi.fn().mockReturnValue([
        {
          vars: { query: 'basic jailbreak' },
          metadata: { strategyId: 'jailbreak' },
        },
      ]);

      const mockJailbreakCompositeAction = vi.fn().mockReturnValue([
        {
          vars: { query: 'composite jailbreak' },
          metadata: { strategyId: 'jailbreak:composite' },
        },
      ]);

      // Mock the Strategies array to include both strategies
      vi.spyOn(Strategies, 'find').mockImplementation(function (predicate) {
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
        targetIds: ['test-provider'],
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

      vi.spyOn(Plugins, 'find')
        .mockReturnValueOnce({
          key: 'fail-plugin',
          action: vi.fn().mockResolvedValue([{ vars: { query: 'test' } }]),
          validate: () => {
            throw new Error('Validation failed!');
          },
        })
        .mockReturnValue({
          key: 'pass-plugin',
          action: vi.fn().mockResolvedValue([{ vars: { query: 'test' } }]),
          validate: vi.fn(),
        });

      const result = await synthesize({
        language: 'en',
        numTests: 1,
        plugins: [failingPlugin, passingPlugin],
        prompts: ['Test prompt'],
        strategies: [],
        targetIds: ['test-provider'],
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
      vi.clearAllMocks();

      const mockProvider = {
        id: () => 'test-provider',
        callApi: vi.fn().mockResolvedValue({ output: 'Test response' }),
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

      const mockIntentAction = vi.fn().mockResolvedValue([
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

      const mockContractsAction = vi.fn().mockResolvedValue([
        {
          vars: { prompt: 'contract test' },
          assert: [{ type: 'promptfoo:redteam:contracts', metric: 'Contracts' }],
          metadata: {
            pluginId: 'contracts',
          },
        },
      ]);

      vi.spyOn(Plugins, 'find').mockImplementation(function (predicate) {
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
        targetIds: ['test'],
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

    it('should handle strategies that return undefined test cases', async () => {
      const mockPluginAction = vi.fn().mockResolvedValue([
        { vars: { query: 'test1' }, metadata: { pluginId: 'test-plugin' } },
        { vars: { query: 'test2' }, metadata: { pluginId: 'test-plugin' } },
      ]);
      vi.spyOn(Plugins, 'find').mockReturnValue({ action: mockPluginAction, key: 'mockPlugin' });

      // Mock a strategy that returns an array with some undefined values
      const mockStrategyAction = vi.fn().mockReturnValue([
        { vars: { query: 'strategy test 1' }, metadata: { strategyId: 'test-strategy' } },
        undefined, // This undefined should be filtered out
        { vars: { query: 'strategy test 2' }, metadata: { strategyId: 'test-strategy' } },
        undefined, // This undefined should be filtered out
      ]);

      vi.spyOn(Strategies, 'find').mockReturnValue({
        id: 'test-strategy',
        action: mockStrategyAction,
      });

      const result = await synthesize({
        language: 'en',
        numTests: 2,
        plugins: [{ id: 'test-plugin', numTests: 2 }],
        prompts: ['Test prompt'],
        strategies: [{ id: 'test-strategy' }],
        targetIds: ['test-provider'],
      });

      // Should have 2 base tests + 2 strategy tests (undefined values filtered out)
      expect(result.testCases).toHaveLength(4);

      // Verify that no undefined values made it through
      expect(result.testCases.every((tc) => tc !== undefined && tc !== null)).toBe(true);

      // Verify strategy tests are present (only the non-undefined ones)
      const strategyTests = result.testCases.filter((tc) => tc.metadata?.strategyId);
      expect(strategyTests).toHaveLength(2);
    });

    it('should handle strategies that return all undefined test cases', async () => {
      const mockPluginAction = vi
        .fn()
        .mockResolvedValue([{ vars: { query: 'test1' }, metadata: { pluginId: 'test-plugin' } }]);
      vi.spyOn(Plugins, 'find').mockReturnValue({ action: mockPluginAction, key: 'mockPlugin' });

      // Mock a strategy that returns only undefined values
      const mockStrategyAction = vi.fn().mockReturnValue([undefined, undefined, undefined]);

      vi.spyOn(Strategies, 'find').mockReturnValue({
        id: 'failing-strategy',
        action: mockStrategyAction,
      });

      const result = await synthesize({
        language: 'en',
        numTests: 1,
        plugins: [{ id: 'test-plugin', numTests: 1 }],
        prompts: ['Test prompt'],
        strategies: [{ id: 'failing-strategy' }],
        targetIds: ['test-provider'],
      });

      // Should only have the base test (no strategy tests since all were undefined)
      expect(result.testCases).toHaveLength(1);
      expect(result.testCases[0].metadata?.pluginId).toBe('test-plugin');
      expect(result.testCases[0].metadata?.strategyId).toBeUndefined();
    });

    it('should preserve language metadata when filtering undefined strategy test cases', async () => {
      const mockPluginAction = vi
        .fn()
        .mockResolvedValue([
          { vars: { query: 'test1' }, metadata: { pluginId: 'test-plugin', language: 'fr' } },
        ]);
      vi.spyOn(Plugins, 'find').mockReturnValue({ action: mockPluginAction, key: 'mockPlugin' });

      // Mock a strategy that returns mixed undefined and valid test cases with language metadata
      const mockStrategyAction = vi.fn().mockReturnValue([
        {
          vars: { query: 'strategy test 1' },
          metadata: { strategyId: 'test-strategy', language: 'fr' },
        },
        undefined,
        {
          vars: { query: 'strategy test 2' },
          metadata: { strategyId: 'test-strategy', language: 'fr' },
        },
      ]);

      vi.spyOn(Strategies, 'find').mockReturnValue({
        id: 'test-strategy',
        action: mockStrategyAction,
      });

      const result = await synthesize({
        language: 'fr',
        numTests: 1,
        plugins: [{ id: 'test-plugin', numTests: 1 }],
        prompts: ['Test prompt'],
        strategies: [{ id: 'test-strategy' }],
        targetIds: ['test-provider'],
      });

      // Should have 1 base test + 2 strategy tests
      expect(result.testCases).toHaveLength(3);

      // All test cases should have language metadata preserved
      result.testCases.forEach((tc) => {
        expect(tc.metadata?.language).toBe('fr');
      });

      // Verify strategy tests preserved language
      const strategyTests = result.testCases.filter((tc) => tc.metadata?.strategyId);
      expect(strategyTests).toHaveLength(2);
      strategyTests.forEach((tc) => {
        expect(tc.metadata?.language).toBe('fr');
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
        targetIds: ['test-provider'],
      });

      expect(cliProgress.SingleBar).not.toHaveBeenCalled();

      process.env.LOG_LEVEL = originalLogLevel;
    });
  });

  describe('Progress bar', () => {
    it('should initialize progress bar with totalTests including strategies', async () => {
      const mockStart = vi.fn();
      const mockIncrement = vi.fn();
      const mockUpdate = vi.fn();
      const mockStop = vi.fn();

      vi.mocked(cliProgress.SingleBar).mockImplementation(function () {
        return {
          start: mockStart,
          increment: mockIncrement,
          update: mockUpdate,
          stop: mockStop,
        } as any;
      });

      // Mock plugin to return test cases
      const mockPluginAction = vi.fn().mockResolvedValue([{ vars: { query: 'test' } }]);
      vi.spyOn(Plugins, 'find').mockReturnValue({
        action: mockPluginAction,
        key: 'test-plugin',
      });

      // 2 plugins × 1 test = 2 plugin tests
      // 2 strategies × 2 tests = 4 strategy tests (jailbreak strategies add 1:1)
      // Total = 6 tests
      await synthesize({
        numTests: 1,
        plugins: [
          { id: 'test-plugin', numTests: 1 },
          { id: 'test-plugin', numTests: 1 },
        ],
        prompts: ['Test prompt'],
        strategies: [{ id: 'jailbreak' }, { id: 'jailbreak:tree' }],
        targetIds: ['test-provider'],
      });

      // Progress bar should be started with totalTests (not just plugin tests)
      expect(mockStart).toHaveBeenCalled();
      const startCall = mockStart.mock.calls[0];
      // totalTests should be greater than just plugin tests (2)
      expect(startCall[0]).toBeGreaterThan(2);
    });

    it('should increment progress bar for strategy tests', async () => {
      const mockStart = vi.fn();
      const mockIncrement = vi.fn();
      const mockUpdate = vi.fn();
      const mockStop = vi.fn();

      vi.mocked(cliProgress.SingleBar).mockImplementation(function () {
        return {
          start: mockStart,
          increment: mockIncrement,
          update: mockUpdate,
          stop: mockStop,
        } as any;
      });

      const mockPluginAction = vi.fn().mockResolvedValue([{ vars: { query: 'test' } }]);
      vi.spyOn(Plugins, 'find').mockReturnValue({
        action: mockPluginAction,
        key: 'test-plugin',
      });

      await synthesize({
        numTests: 1,
        plugins: [{ id: 'test-plugin', numTests: 1 }],
        prompts: ['Test prompt'],
        strategies: [{ id: 'jailbreak' }],
        targetIds: ['test-provider'],
      });

      // Should have increment calls for both plugin tests and strategy tests
      expect(mockIncrement).toHaveBeenCalled();
      // At least one increment call should be for strategy tests (with a number argument)
      const incrementCalls = mockIncrement.mock.calls;
      const hasStrategyIncrement = incrementCalls.some(
        (call) => typeof call[0] === 'number' && call[0] > 0,
      );
      expect(hasStrategyIncrement).toBe(true);
    });

    it('should include strategy tests in progress bar for multilingual configs', async () => {
      const mockStart = vi.fn();
      const mockIncrement = vi.fn();
      const mockUpdate = vi.fn();
      const mockStop = vi.fn();

      vi.mocked(cliProgress.SingleBar).mockImplementation(function () {
        return {
          start: mockStart,
          increment: mockIncrement,
          update: mockUpdate,
          stop: mockStop,
        } as any;
      });

      const mockPluginAction = vi.fn().mockResolvedValue([{ vars: { query: 'test' } }]);
      vi.spyOn(Plugins, 'find').mockReturnValue({
        action: mockPluginAction,
        key: 'policy',
      });

      // 2 plugins × 1 test × 2 languages = 4 plugin tests
      // 1 strategy × 4 plugin tests = 4 strategy tests
      // Total = 8 tests
      await synthesize({
        numTests: 1,
        language: ['Hmong', 'Zulu'],
        plugins: [
          { id: 'policy', numTests: 1, config: { policy: 'Policy 1' } },
          { id: 'policy', numTests: 1, config: { policy: 'Policy 2' } },
        ],
        prompts: ['Test prompt'],
        strategies: [{ id: 'jailbreak' }],
        targetIds: ['test-provider'],
      });

      // Progress bar should be started with totalTests including strategies
      expect(mockStart).toHaveBeenCalled();
      const startCall = mockStart.mock.calls[0];
      // Should be 8 (4 plugin + 4 strategy), not 4 (just plugins)
      expect(startCall[0]).toBeGreaterThanOrEqual(8);
    });
  });

  describe('Report status for policy plugins', () => {
    it('should show Failed status when plugin generates 0 test cases', async () => {
      // Mock plugin to return empty array (failed generation)
      const mockPluginAction = vi.fn().mockResolvedValue([]);
      vi.spyOn(Plugins, 'find').mockReturnValue({
        action: mockPluginAction,
        key: 'policy',
      });

      // Capture the report output
      let reportMessage: string | undefined;
      vi.mocked(logger.info).mockImplementation(function (msg: any) {
        if (typeof msg === 'string' && msg.includes('Test Generation Report')) {
          reportMessage = msg;
        }
        return logger as any;
      });

      await synthesize({
        numTests: 2,
        plugins: [{ id: 'policy', numTests: 2, config: { policy: 'Test policy' } }],
        prompts: ['Test prompt'],
        strategies: [],
        targetIds: ['test-provider'],
      });

      expect(reportMessage).toBeDefined();
      const cleanReport = stripAnsi(reportMessage || '');
      // Should show 2 requested, 0 generated
      expect(cleanReport).toContain('2');
      expect(cleanReport).toContain('0');
      expect(cleanReport).toContain('Failed');
    });

    it('should show Partial status when plugin generates fewer tests than requested', async () => {
      // Mock plugin to return only 1 test case when 2 are requested
      const mockPluginAction = vi.fn().mockResolvedValue([{ vars: { query: 'test1' } }]);
      vi.spyOn(Plugins, 'find').mockReturnValue({
        action: mockPluginAction,
        key: 'policy',
      });

      // Capture the report output
      let reportMessage: string | undefined;
      vi.mocked(logger.info).mockImplementation(function (msg: any) {
        if (typeof msg === 'string' && msg.includes('Test Generation Report')) {
          reportMessage = msg;
        }
        return logger as any;
      });

      await synthesize({
        numTests: 2,
        plugins: [{ id: 'policy', numTests: 2, config: { policy: 'Test policy' } }],
        prompts: ['Test prompt'],
        strategies: [],
        targetIds: ['test-provider'],
      });

      expect(reportMessage).toBeDefined();
      const cleanReport = stripAnsi(reportMessage || '');
      // Should show 2 requested, 1 generated
      expect(cleanReport).toContain('2');
      expect(cleanReport).toContain('1');
      expect(cleanReport).toContain('Partial');
    });

    it('should show individual status for each policy when one fails and others succeed', async () => {
      // First policy returns 0, second policy returns 2
      let callCount = 0;
      const mockPluginAction = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve([]); // First policy fails
        }
        return Promise.resolve([{ vars: { query: 'test1' } }, { vars: { query: 'test2' } }]);
      });

      vi.spyOn(Plugins, 'find').mockReturnValue({
        action: mockPluginAction,
        key: 'policy',
      });

      // Capture the report output
      let reportMessage: string | undefined;
      vi.mocked(logger.info).mockImplementation(function (msg: any) {
        if (typeof msg === 'string' && msg.includes('Test Generation Report')) {
          reportMessage = msg;
        }
        return logger as any;
      });

      await synthesize({
        numTests: 2,
        plugins: [
          { id: 'policy', numTests: 2, config: { policy: 'Failing policy' } },
          { id: 'policy', numTests: 2, config: { policy: 'Succeeding policy' } },
        ],
        prompts: ['Test prompt'],
        strategies: [],
        targetIds: ['test-provider'],
      });

      expect(reportMessage).toBeDefined();
      const cleanReport = stripAnsi(reportMessage || '');
      // Should have both policies with display format "policy [hash]: preview..."
      expect(cleanReport).toMatch(/policy \[[a-f0-9]{12}\]:/);
      // Inline policies show hash and preview
      // Should show both Failed and Success statuses
      expect(cleanReport).toContain('Failed');
      expect(cleanReport).toContain('Success');
    });
  });

  describe('API Health Check', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.resetAllMocks();

      // Reset logger mocks
      vi.mocked(logger.info).mockImplementation(function () {
        return logger as any;
      });
      vi.mocked(logger.warn).mockImplementation(function () {
        return logger as any;
      });
      vi.mocked(logger.error).mockImplementation(function () {
        return logger as any;
      });
      vi.mocked(logger.debug).mockImplementation(function () {
        return logger as any;
      });

      // Set up templates mock with consistent default behavior
      vi.mocked(extractVariablesFromTemplates).mockImplementation(function () {
        return ['query'];
      });

      vi.mocked(shouldGenerateRemote).mockImplementation(function () {
        return true;
      });
      vi.mocked(getRemoteHealthUrl).mockImplementation(function () {
        return 'https://api.test/health';
      });
      vi.mocked(checkRemoteHealth).mockResolvedValue({
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
        targetIds: ['test-provider'],
      });

      expect(shouldGenerateRemote).toHaveBeenCalledWith();
      expect(getRemoteHealthUrl).toHaveBeenCalledWith();
      expect(checkRemoteHealth).toHaveBeenCalledWith('https://api.test/health');
    });

    it('should skip health check when remote generation is disabled', async () => {
      vi.mocked(shouldGenerateRemote).mockImplementation(function () {
        return false;
      });

      await synthesize({
        language: 'en',
        numTests: 1,
        plugins: [{ id: 'test-plugin', numTests: 1 }],
        prompts: ['Test prompt'],
        strategies: [],
        targetIds: ['test-provider'],
      });

      expect(shouldGenerateRemote).toHaveBeenCalledWith();
      expect(getRemoteHealthUrl).not.toHaveBeenCalled();
      expect(checkRemoteHealth).not.toHaveBeenCalled();
    });

    it('should throw error when health check fails', async () => {
      vi.mocked(checkRemoteHealth).mockResolvedValue({
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
          targetIds: ['test-provider'],
        }),
      ).rejects.toThrow('Unable to proceed with test generation: API is not accessible');
    });

    it('should skip health check when URL is null', async () => {
      vi.mocked(getRemoteHealthUrl).mockImplementation(function () {
        return null;
      });

      await synthesize({
        language: 'en',
        numTests: 1,
        plugins: [{ id: 'test-plugin', numTests: 1 }],
        prompts: ['Test prompt'],
        strategies: [],
        targetIds: ['test-provider'],
      });

      expect(shouldGenerateRemote).toHaveBeenCalledWith();
      expect(getRemoteHealthUrl).toHaveBeenCalledWith();
      expect(checkRemoteHealth).not.toHaveBeenCalled();
    });
  });

  it('should handle basic strategy configuration', async () => {
    vi.mocked(loadApiProvider).mockResolvedValue({
      id: () => 'test',
      callApi: vi.fn().mockResolvedValue({ output: 'test output' }),
    });

    const mockPlugin = {
      id: 'test-plugin',
      numTests: 1,
    };

    const mockProvider = {
      id: () => 'test',
      callApi: vi.fn().mockResolvedValue({ output: 'test output' }),
    };

    const mockTestPluginAction = vi.fn().mockResolvedValue([
      {
        vars: { input: 'test input' },
        assert: [{ type: 'test-assertion', metric: 'Test' }],
        metadata: {
          pluginId: 'test-plugin',
        },
      },
    ]);

    vi.spyOn(Plugins, 'find').mockReturnValue({
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
      targetIds: ['test-provider'],
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
      targetIds: ['test-provider'],
    });

    expect(resultDisabled.testCases).toHaveLength(0);
  });

  describe('Direct plugin handling', () => {
    it('should recognize and not expand direct plugins like bias:gender', async () => {
      const mockPluginAction = vi.fn().mockImplementation(function ({ n }) {
        return Array(n).fill({ vars: { query: 'test' } });
      });
      vi.spyOn(Plugins, 'find').mockReturnValue({ key: 'bias:gender', action: mockPluginAction });

      const result = await synthesize({
        language: 'en',
        numTests: 2,
        plugins: [{ id: 'bias:gender', numTests: 2 }],
        prompts: ['Test prompt'],
        strategies: [],
        targetIds: ['test-provider'],
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
      const mockPluginAction = vi.fn().mockResolvedValue([{ vars: { query: 'test' } }]);
      vi.spyOn(Plugins, 'find').mockReturnValue({ key: 'mockPlugin', action: mockPluginAction });

      const result = await synthesize({
        language: 'en',
        numTests: 1,
        plugins: [{ id: 'bias', numTests: 2 }],
        prompts: ['Test prompt'],
        strategies: [],
        targetIds: ['test-provider'],
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

vi.mock('fs');
vi.mock('js-yaml');

describe('resolvePluginConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();

    // Set up logger mocks
    vi.mocked(logger.info).mockImplementation(function () {
      return logger as any;
    });
    vi.mocked(logger.warn).mockImplementation(function () {
      return logger as any;
    });
    vi.mocked(logger.error).mockImplementation(function () {
      return logger as any;
    });
    vi.mocked(logger.debug).mockImplementation(function () {
      return logger as any;
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
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
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue('yaml content');
    vi.mocked(yaml.load).mockImplementation(function () {
      return yamlContent;
    });

    const result = resolvePluginConfig(config);

    expect(result).toEqual({ key: yamlContent });
    expect(fs.existsSync).toHaveBeenCalledWith('test.yaml');
    expect(fs.readFileSync).toHaveBeenCalledWith('test.yaml', 'utf8');
    expect(yaml.load).toHaveBeenCalledWith('yaml content');
  });

  it('should resolve JSON file references', () => {
    const config = { key: 'file://test.json' };
    const jsonContent = { nested: 'value' };
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(jsonContent));

    const result = resolvePluginConfig(config);

    expect(result).toEqual({ key: jsonContent });
    expect(fs.existsSync).toHaveBeenCalledWith('test.json');
    expect(fs.readFileSync).toHaveBeenCalledWith('test.json', 'utf8');
  });

  it('should resolve text file references', () => {
    const config = { key: 'file://test.txt' };
    const fileContent = 'text content';
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(fileContent);

    const result = resolvePluginConfig(config);

    expect(result).toEqual({ key: fileContent });
    expect(fs.existsSync).toHaveBeenCalledWith('test.txt');
    expect(fs.readFileSync).toHaveBeenCalledWith('test.txt', 'utf8');
  });

  it('should throw an error if the file does not exist', () => {
    const config = { key: 'file://nonexistent.yaml' };
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);

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

    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync')
      .mockReturnValueOnce('yaml content')
      .mockReturnValueOnce(JSON.stringify(jsonContent))
      .mockReturnValueOnce(txtContent);
    vi.mocked(yaml.load).mockImplementation(function () {
      return yamlContent;
    });

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

  describe('numTests cap', () => {
    it('should cap test count when numTests is less than calculated count', () => {
      // Fan-out strategy with default n=5 would produce 50 tests
      const strategy = { id: 'jailbreak', config: { numTests: 10 } };
      const result = getTestCount(strategy, 10, []);
      expect(result).toBe(10);
    });

    it('should return 0 when numTests is 0', () => {
      const strategy = { id: 'base64', config: { numTests: 0 } };
      const result = getTestCount(strategy, 10, []);
      expect(result).toBe(0);
    });

    it('should not affect count when numTests is larger than calculated', () => {
      // Non-fanout strategy produces 10 tests (1:1)
      const strategy = { id: 'morse', config: { numTests: 100 } };
      const result = getTestCount(strategy, 10, []);
      expect(result).toBe(10);
    });

    it('should cap basic strategy tests', () => {
      const strategy = { id: 'basic', config: { numTests: 5 } };
      const result = getTestCount(strategy, 10, []);
      expect(result).toBe(5);
    });

    it('should cap layer strategy tests', () => {
      const strategy = {
        id: 'layer',
        config: {
          numTests: 3,
          steps: ['base64', 'rot13'],
        },
      };
      const result = getTestCount(strategy, 10, []);
      expect(result).toBe(3);
    });

    it('should not apply numTests cap to retry strategy (different semantics)', () => {
      // Retry has additive semantics: totalPluginTests + numTests
      const strategy = { id: 'retry', config: { numTests: 5 } };
      const result = getTestCount(strategy, 10, []);
      // Should be 10 + 5 = 15, not capped
      expect(result).toBe(15);
    });

    it('should cap fan-out strategy with custom n and numTests', () => {
      // n=3 would produce 30 tests, but numTests caps at 15
      const strategy = { id: 'jailbreak', config: { numTests: 15, n: 3 } };
      const result = getTestCount(strategy, 10, []);
      expect(result).toBe(15);
    });

    it('should handle numTests equal to calculated count (no-op)', () => {
      // Non-fanout strategy produces 10 tests (1:1), numTests also set to 10
      const strategy = { id: 'morse', config: { numTests: 10 } };
      const result = getTestCount(strategy, 10, []);
      expect(result).toBe(10);
    });

    it('should handle numTests equal to fan-out calculated count (no-op)', () => {
      // Fan-out with explicit n=5 produces 50 tests, numTests also set to 50
      const strategy = { id: 'jailbreak', config: { numTests: 50, n: 5 } };
      const result = getTestCount(strategy, 10, []);
      expect(result).toBe(50);
    });

    it('should ignore invalid numTests values at runtime (NaN)', () => {
      // Defensive check should skip NaN
      const strategy = { id: 'base64', config: { numTests: NaN } };
      const result = getTestCount(strategy, 10, []);
      // Should return uncapped count (10 for non-fanout)
      expect(result).toBe(10);
    });

    it('should ignore invalid numTests values at runtime (Infinity)', () => {
      // Defensive check should skip Infinity
      const strategy = { id: 'base64', config: { numTests: Infinity } };
      const result = getTestCount(strategy, 10, []);
      // Should return uncapped count (10 for non-fanout)
      expect(result).toBe(10);
    });

    it('should ignore invalid numTests values at runtime (negative)', () => {
      // Defensive check should skip negative values
      const strategy = { id: 'base64', config: { numTests: -5 } };
      const result = getTestCount(strategy, 10, []);
      // Should return uncapped count (10 for non-fanout)
      expect(result).toBe(10);
    });
  });
});

describe('Language configuration', () => {
  const mockProvider = {
    callApi: vi.fn(),
    generate: vi.fn(),
    id: () => 'test-provider',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetAllMocks();

    // Set up logger mocks
    vi.mocked(logger.info).mockImplementation(function () {
      return logger as any;
    });
    vi.mocked(logger.warn).mockImplementation(function () {
      return logger as any;
    });
    vi.mocked(logger.error).mockImplementation(function () {
      return logger as any;
    });
    vi.mocked(logger.debug).mockImplementation(function () {
      return logger as any;
    });

    // Set up templates mock
    vi.mocked(extractVariablesFromTemplates).mockImplementation(function () {
      return ['query'];
    });

    vi.mocked(extractEntities).mockResolvedValue(['entity1', 'entity2']);
    vi.mocked(extractSystemPurpose).mockResolvedValue('Test purpose');
    vi.mocked(loadApiProvider).mockResolvedValue(mockProvider);
    vi.mocked(validateStrategies).mockImplementation(async function () {});
    vi.mocked(cliProgress.SingleBar).mockImplementation(function () {
      return {
        increment: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        update: vi.fn(),
      } as any;
    });
    vi.mocked(shouldGenerateRemote).mockImplementation(function () {
      return false;
    });
    vi.mocked(getRemoteHealthUrl).mockImplementation(function () {
      return 'https://api.test/health';
    });
    vi.mocked(checkRemoteHealth).mockResolvedValue({
      status: 'OK',
      message: 'OK',
    });

    // Mock plugin action to return test cases
    const mockPluginAction = vi
      .fn()
      .mockResolvedValue([{ vars: { query: 'test1' } }, { vars: { query: 'test2' } }]);
    vi.spyOn(Plugins, 'find').mockReturnValue({
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
        targetIds: ['test-provider'],
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
        targetIds: ['test-provider'],
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
      const mockStrategyAction = vi.fn().mockImplementation(function (testCases) {
        return testCases.map((tc: any) => ({
          ...tc,
          vars: { ...tc.vars, query: `transformed: ${tc.vars.query}` },
          metadata: { ...tc.metadata, strategyId: 'rot13' },
        }));
      });

      vi.spyOn(Strategies, 'find').mockReturnValue({
        id: 'rot13',
        action: mockStrategyAction,
      });

      const result = await synthesize({
        language: ['en', 'fr'],
        numTests: 2,
        plugins: [{ id: 'test-plugin', numTests: 2 }],
        prompts: ['Test prompt'],
        strategies: [{ id: 'rot13' }],
        targetIds: ['test-provider'],
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
      const mockPluginAction = vi.fn().mockResolvedValue([{ vars: { query: 'test1' } }]);
      vi.spyOn(Plugins, 'find').mockReturnValue({
        action: mockPluginAction,
        key: 'mockPlugin',
      });

      const result = await synthesize({
        language: ['en', 'es', 'zh'],
        numTests: 1,
        plugins: [{ id: 'test-plugin', numTests: 1 }],
        prompts: ['Test prompt'],
        strategies: [],
        targetIds: ['test-provider'],
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
        targetIds: ['test-provider'],
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
        targetIds: ['test-provider'],
      });

      expect(result.testCases).toHaveLength(2);
      // Check that all tests have the same language
      const languages = result.testCases.map((tc) => tc.metadata?.language);
      const uniqueLanguages = [...new Set(languages)];
      expect(uniqueLanguages.length).toBe(1); // Only one language used
    });

    it('should not include language in config when no language is specified', async () => {
      const mockPluginAction = vi.fn().mockResolvedValue([{ vars: { query: 'test' } }]);
      vi.spyOn(Plugins, 'find').mockReturnValue({
        action: mockPluginAction,
        key: 'test-plugin',
      });

      await synthesize({
        // No language specified
        numTests: 1,
        plugins: [{ id: 'test-plugin', numTests: 1 }],
        prompts: ['Test prompt'],
        strategies: [],
        targetIds: ['test-provider'],
      });

      // Verify action was called with config that does NOT contain language property
      expect(mockPluginAction).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.not.objectContaining({
            language: expect.anything(),
          }),
        }),
      );
    });

    it('should not include language in modifiers when no language is specified', async () => {
      const mockPluginAction = vi.fn().mockResolvedValue([{ vars: { query: 'test' } }]);
      vi.spyOn(Plugins, 'find').mockReturnValue({
        action: mockPluginAction,
        key: 'test-plugin',
      });

      await synthesize({
        // No language specified
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
        targetIds: ['test-provider'],
      });

      // Verify modifiers don't contain language
      expect(mockPluginAction).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({
            modifiers: expect.objectContaining({
              tone: 'aggressive',
            }),
          }),
        }),
      );

      // Get the actual config that was passed
      const actualConfig = mockPluginAction.mock.calls[0][0].config;

      // Verify language is not in the config at all
      expect(actualConfig).not.toHaveProperty('language');

      // Verify modifiers don't have language key
      expect(actualConfig.modifiers).not.toHaveProperty('language');
    });

    it('should pass testGenerationInstructions through modifiers to plugin action', async () => {
      const mockPluginAction = vi.fn().mockResolvedValue([{ vars: { query: 'test' } }]);
      vi.spyOn(Plugins, 'find').mockReturnValue({
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
        targetIds: ['test-provider'],
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

  describe('Multilingual support for media strategies', () => {
    it('should support multilingual test cases for audio strategy', async () => {
      // Mock strategy action for audio
      const mockAudioAction = vi.fn().mockImplementation(function (testCases) {
        return testCases.map((tc: any) => ({
          ...tc,
          vars: { ...tc.vars, query: `audio: ${tc.vars.query}` },
          metadata: { ...tc.metadata, strategyId: 'audio' },
        }));
      });

      vi.spyOn(Strategies, 'find').mockImplementation(function (predicate) {
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
        targetIds: ['test-provider'],
      });

      // Audio strategy now supports multiple languages
      // Mock plugin always returns 2 tests (ignores numTests)
      // Base tests: 2 tests * 3 languages = 6
      // Audio strategy tests: 6 tests (applies to all base tests)
      // Total: 12 tests
      expect(result.testCases.length).toBe(12);

      // Check that audio strategy was applied to all language variants
      const audioTests = result.testCases.filter((tc) => tc.metadata?.strategyId === 'audio');
      expect(audioTests.length).toBe(6);
    });

    it('should support multilingual test cases for video strategy', async () => {
      const mockVideoAction = vi.fn().mockImplementation(function (testCases) {
        return testCases.map((tc: any) => ({
          ...tc,
          vars: { ...tc.vars, query: `video: ${tc.vars.query}` },
          metadata: { ...tc.metadata, strategyId: 'video' },
        }));
      });

      vi.spyOn(Strategies, 'find').mockReturnValue({
        id: 'video',
        action: mockVideoAction,
      });

      const result = await synthesize({
        language: ['en', 'es'], // 2 languages
        numTests: 1,
        plugins: [{ id: 'test-plugin', numTests: 1 }],
        prompts: ['Test prompt'],
        strategies: [{ id: 'video' }],
        targetIds: ['test-provider'],
      });

      // Video strategy now supports multiple languages
      // Mock plugin always returns 2 tests (ignores numTests: 1)
      // Base tests: 2 tests * 2 languages = 4
      // Strategy transforms: 4 tests → 4 video tests
      // Total: 4 base + 4 video = 8 tests
      const videoTests = result.testCases.filter((tc) => tc.metadata?.strategyId === 'video');
      expect(videoTests.length).toBe(4);
      expect(result.testCases.length).toBe(8);
    });

    it('should support multilingual test cases for image strategy', async () => {
      const mockImageAction = vi.fn().mockImplementation(function (testCases) {
        return testCases.map((tc: any) => ({
          ...tc,
          vars: { ...tc.vars, query: `image: ${tc.vars.query}` },
          metadata: { ...tc.metadata, strategyId: 'image' },
        }));
      });

      vi.spyOn(Strategies, 'find').mockReturnValue({
        id: 'image',
        action: mockImageAction,
      });

      const result = await synthesize({
        language: ['en', 'fr', 'de', 'es'], // 4 languages
        numTests: 3,
        plugins: [{ id: 'test-plugin', numTests: 3 }],
        prompts: ['Test prompt'],
        strategies: [{ id: 'image' }],
        targetIds: ['test-provider'],
      });

      // Image strategy now supports multiple languages
      // Mock plugin always returns 2 tests (ignores numTests: 3)
      // Base tests: 2 tests * 4 languages = 8
      // Strategy transforms: 8 tests → 8 image tests
      // Total: 8 base + 8 image = 16 tests
      const imageTests = result.testCases.filter((tc) => tc.metadata?.strategyId === 'image');
      expect(imageTests.length).toBe(8);
      expect(result.testCases.length).toBe(16);
    });

    it('should support multilingual test cases for jailbreak strategy', async () => {
      const mockJailbreakAction = vi.fn().mockImplementation(function (testCases) {
        return testCases.map((tc: any) => ({
          ...tc,
          vars: { ...tc.vars, query: `jailbreak: ${tc.vars.query}` },
          metadata: { ...tc.metadata, strategyId: 'jailbreak' },
        }));
      });

      vi.spyOn(Strategies, 'find').mockReturnValue({
        id: 'jailbreak',
        action: mockJailbreakAction,
      });

      const result = await synthesize({
        language: ['en', 'fr'], // 2 languages
        numTests: 2,
        plugins: [{ id: 'test-plugin', numTests: 2 }],
        prompts: ['Test prompt'],
        strategies: [{ id: 'jailbreak' }],
        targetIds: ['test-provider'],
      });

      // Jailbreak strategy supports multiple languages
      // Base tests: 2 tests * 2 languages = 4
      // Jailbreak strategy tests: 4 tests (applies to all base tests)
      // Total: 8 tests
      const jailbreakTests = result.testCases.filter(
        (tc) => tc.metadata?.strategyId === 'jailbreak',
      );
      expect(jailbreakTests.length).toBe(4);
      expect(result.testCases.length).toBe(8);
    });

    it('should support multilingual test cases for math-prompt strategy', async () => {
      const mockMathPromptAction = vi.fn().mockImplementation(function (testCases) {
        return testCases.map((tc: any) => ({
          ...tc,
          vars: { ...tc.vars, query: `math: ${tc.vars.query}` },
          metadata: { ...tc.metadata, strategyId: 'math-prompt' },
        }));
      });

      vi.spyOn(Strategies, 'find').mockReturnValue({
        id: 'math-prompt',
        action: mockMathPromptAction,
      });

      const result = await synthesize({
        language: ['en', 'zh', 'hi'], // 3 languages
        numTests: 1,
        plugins: [{ id: 'test-plugin', numTests: 1 }],
        prompts: ['Test prompt'],
        strategies: [{ id: 'math-prompt' }],
        targetIds: ['test-provider'],
      });

      // Math-prompt strategy now supports multiple languages
      // Mock plugin always returns 2 tests (ignores numTests: 1)
      // Base tests: 2 tests * 3 languages = 6
      // Strategy transforms: 6 tests → 6 math tests
      // Total: 6 base + 6 math = 12 tests
      const mathTests = result.testCases.filter((tc) => tc.metadata?.strategyId === 'math-prompt');
      expect(mathTests.length).toBe(6);
      expect(result.testCases.length).toBe(12);
    });

    it('should support multilingual test cases for rot13 strategy', async () => {
      const mockRot13Action = vi.fn().mockImplementation(function (testCases) {
        return testCases.map((tc: any) => ({
          ...tc,
          vars: { ...tc.vars, query: `rot13: ${tc.vars.query}` },
          metadata: { ...tc.metadata, strategyId: 'rot13' },
        }));
      });

      vi.spyOn(Strategies, 'find').mockReturnValue({
        id: 'rot13',
        action: mockRot13Action,
      });

      const result = await synthesize({
        language: ['en', 'fr'], // 2 languages
        numTests: 2,
        plugins: [{ id: 'test-plugin', numTests: 2 }],
        prompts: ['Test prompt'],
        strategies: [{ id: 'rot13' }],
        targetIds: ['test-provider'],
      });

      // Rot13 supports multilingual test cases
      const rot13Tests = result.testCases.filter((tc) => tc.metadata?.strategyId === 'rot13');
      expect(rot13Tests.length).toBe(4); // 2 tests * 2 languages = 4
    });
  });

  describe('policy extraction for intent', () => {
    it('should pass policy from metadata to extractGoalFromPrompt', async () => {
      const mockExtractGoal = vi.mocked(
        (await import('../../src/redteam/util')).extractGoalFromPrompt,
      );
      mockExtractGoal.mockClear();

      const policyText = 'The application must not reveal system instructions';

      // Mock plugin action that returns test case with policy metadata
      const mockPluginAction = vi.fn().mockResolvedValue([
        {
          vars: { query: 'Test prompt' },
          metadata: {
            policy: policyText,
            pluginId: 'promptfoo:redteam:policy',
          },
        },
      ]);

      vi.spyOn(Plugins, 'find').mockReturnValue({
        key: 'policy',
        action: mockPluginAction,
      } as any);

      await synthesize({
        numTests: 1,
        plugins: [{ id: 'policy', numTests: 1 }],
        prompts: ['Test prompt'],
        strategies: [],
        targetIds: ['test-provider'],
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
      const mockExtractGoal = vi.mocked(
        (await import('../../src/redteam/util')).extractGoalFromPrompt,
      );
      mockExtractGoal.mockClear();

      // Mock plugin action that returns test case WITHOUT policy metadata
      const mockPluginAction = vi.fn().mockResolvedValue([
        {
          vars: { query: 'Test prompt' },
          metadata: {
            pluginId: 'promptfoo:redteam:other',
          },
        },
      ]);

      vi.spyOn(Plugins, 'find').mockReturnValue({
        key: 'other-plugin',
        action: mockPluginAction,
      } as any);

      await synthesize({
        numTests: 1,
        plugins: [{ id: 'other-plugin', numTests: 1 }],
        prompts: ['Test prompt'],
        strategies: [],
        targetIds: ['test-provider'],
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
      const mockExtractGoal = vi.mocked(
        (await import('../../src/redteam/util')).extractGoalFromPrompt,
      );
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

        const mockPluginAction = vi.fn().mockResolvedValue([
          {
            vars: { query: 'Test prompt' },
            metadata: testCase.metadata,
          },
        ]);

        vi.spyOn(Plugins, 'find').mockReturnValue({
          key: 'test-plugin',
          action: mockPluginAction,
        } as any);

        await synthesize({
          numTests: 1,
          plugins: [{ id: 'test-plugin', numTests: 1 }],
          prompts: ['Test prompt'],
          strategies: [],
          targetIds: ['test-provider'],
        });

        // Verify the policy parameter matches expected
        expect(mockExtractGoal).toHaveBeenCalled();
        const call = mockExtractGoal.mock.calls[0];
        expect(call[3]).toBe(testCase.expectedPolicy);
      }
    });
  });

  describe('strategy numTests capping integration', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.resetAllMocks();

      vi.mocked(logger.info).mockImplementation(() => logger as any);
      vi.mocked(logger.warn).mockImplementation(() => logger as any);
      vi.mocked(logger.debug).mockImplementation(() => logger as any);
      vi.mocked(logger.error).mockImplementation(() => logger as any);
      vi.mocked(extractSystemPurpose).mockResolvedValue('Test purpose');
      vi.mocked(extractEntities).mockResolvedValue([]);
      vi.mocked(shouldGenerateRemote).mockReturnValue(false);
      vi.mocked(checkRemoteHealth).mockResolvedValue({
        status: 'OK',
        message: 'Cloud API is healthy',
      });
      vi.mocked(getRemoteHealthUrl).mockReturnValue('http://test.com/health');
      vi.mocked(extractVariablesFromTemplates).mockReturnValue(['query']);

      vi.mocked(cliProgress.SingleBar).mockImplementation(function () {
        return {
          start: vi.fn(),
          update: vi.fn(),
          stop: vi.fn(),
          increment: vi.fn(),
        } as any;
      });
    });

    it('should cap strategy output when numTests is configured', async () => {
      // Mock plugin to return 10 test cases
      const mockPluginAction = vi.fn().mockResolvedValue(
        Array(10)
          .fill(null)
          .map((_, i) => ({ vars: { query: `test${i}` } })),
      );
      vi.spyOn(Plugins, 'find').mockReturnValue({
        action: mockPluginAction,
        key: 'test-plugin',
      });

      // Mock strategy that returns all input tests (1:1)
      const mockStrategyAction = vi.fn().mockImplementation((testCases) =>
        testCases.map((tc: any) => ({
          ...tc,
          metadata: { ...tc.metadata, strategyId: 'base64' },
        })),
      );
      vi.spyOn(Strategies, 'find').mockReturnValue({
        id: 'base64',
        action: mockStrategyAction,
      });

      const result = await synthesize({
        numTests: 10,
        plugins: [{ id: 'test-plugin', numTests: 10 }],
        prompts: ['Test prompt'],
        strategies: [{ id: 'base64', config: { numTests: 3 } }],
        targetIds: ['test-provider'],
      });

      // Basic tests: 10, Strategy tests: 3 (capped from 10)
      const strategyTests = result.testCases.filter((tc) => tc.metadata?.strategyId === 'base64');
      expect(strategyTests.length).toBe(3);
    });

    it('should log warning when numTests is 0', async () => {
      const mockPluginAction = vi.fn().mockResolvedValue([{ vars: { query: 'test' } }]);
      vi.spyOn(Plugins, 'find').mockReturnValue({
        action: mockPluginAction,
        key: 'test-plugin',
      });

      const mockStrategyAction = vi.fn().mockImplementation((testCases) =>
        testCases.map((tc: any) => ({
          ...tc,
          metadata: { ...tc.metadata, strategyId: 'base64' },
        })),
      );
      vi.spyOn(Strategies, 'find').mockReturnValue({
        id: 'base64',
        action: mockStrategyAction,
      });

      const result = await synthesize({
        numTests: 1,
        plugins: [{ id: 'test-plugin', numTests: 1 }],
        prompts: ['Test prompt'],
        strategies: [{ id: 'base64', config: { numTests: 0 } }],
        targetIds: ['test-provider'],
      });

      // Should have 0 strategy tests
      const strategyTests = result.testCases.filter((tc) => tc.metadata?.strategyId === 'base64');
      expect(strategyTests.length).toBe(0);

      // Should have logged warning
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('numTests=0 configured, skipping strategy'),
      );
    });

    it('should log debug when capping occurs', async () => {
      const mockPluginAction = vi.fn().mockResolvedValue(
        Array(5)
          .fill(null)
          .map((_, i) => ({ vars: { query: `test${i}` } })),
      );
      vi.spyOn(Plugins, 'find').mockReturnValue({
        action: mockPluginAction,
        key: 'test-plugin',
      });

      const mockStrategyAction = vi.fn().mockImplementation((testCases) =>
        testCases.map((tc: any) => ({
          ...tc,
          metadata: { ...tc.metadata, strategyId: 'base64' },
        })),
      );
      vi.spyOn(Strategies, 'find').mockReturnValue({
        id: 'base64',
        action: mockStrategyAction,
      });

      await synthesize({
        numTests: 5,
        plugins: [{ id: 'test-plugin', numTests: 5 }],
        prompts: ['Test prompt'],
        strategies: [{ id: 'base64', config: { numTests: 2 } }],
        targetIds: ['test-provider'],
      });

      // Should have logged debug about pre-limiting
      expect(logger.debug).toHaveBeenCalledWith(
        expect.stringContaining('Pre-limiting 5 tests to numTests=2'),
      );
    });

    it('should not cap when numTests is undefined', async () => {
      const mockPluginAction = vi.fn().mockResolvedValue(
        Array(5)
          .fill(null)
          .map((_, i) => ({ vars: { query: `test${i}` } })),
      );
      vi.spyOn(Plugins, 'find').mockReturnValue({
        action: mockPluginAction,
        key: 'test-plugin',
      });

      const mockStrategyAction = vi.fn().mockImplementation((testCases) =>
        testCases.map((tc: any) => ({
          ...tc,
          metadata: { ...tc.metadata, strategyId: 'base64' },
        })),
      );
      vi.spyOn(Strategies, 'find').mockReturnValue({
        id: 'base64',
        action: mockStrategyAction,
      });

      const result = await synthesize({
        numTests: 5,
        plugins: [{ id: 'test-plugin', numTests: 5 }],
        prompts: ['Test prompt'],
        strategies: [{ id: 'base64' }], // No numTests config
        targetIds: ['test-provider'],
      });

      // All 5 strategy tests should be present (no capping)
      const strategyTests = result.testCases.filter((tc) => tc.metadata?.strategyId === 'base64');
      expect(strategyTests.length).toBe(5);
    });

    it('should pass pre-limited tests to strategy (not all tests)', async () => {
      // This is the key test: verify strategy receives limited input, not all tests
      const mockPluginAction = vi.fn().mockResolvedValue(
        Array(10)
          .fill(null)
          .map((_, i) => ({ vars: { query: `test${i}` } })),
      );
      vi.spyOn(Plugins, 'find').mockReturnValue({
        action: mockPluginAction,
        key: 'test-plugin',
      });

      const mockStrategyAction = vi.fn().mockImplementation((testCases) =>
        testCases.map((tc: any) => ({
          ...tc,
          metadata: { ...tc.metadata, strategyId: 'base64' },
        })),
      );
      vi.spyOn(Strategies, 'find').mockReturnValue({
        id: 'base64',
        action: mockStrategyAction,
      });

      await synthesize({
        numTests: 10,
        plugins: [{ id: 'test-plugin', numTests: 10 }],
        prompts: ['Test prompt'],
        strategies: [{ id: 'base64', config: { numTests: 3 } }],
        targetIds: ['test-provider'],
      });

      // KEY ASSERTION: Strategy should receive only 3 tests, not all 10
      // This verifies pre-limiting works (avoids wasted computation)
      expect(mockStrategyAction).toHaveBeenCalled();
      const receivedTests = mockStrategyAction.mock.calls[0][0];
      expect(receivedTests.length).toBe(3);
    });

    it('should not call strategy when numTests is 0', async () => {
      const mockPluginAction = vi.fn().mockResolvedValue([{ vars: { query: 'test' } }]);
      vi.spyOn(Plugins, 'find').mockReturnValue({
        action: mockPluginAction,
        key: 'test-plugin',
      });

      const mockStrategyAction = vi.fn().mockImplementation((testCases) =>
        testCases.map((tc: any) => ({
          ...tc,
          metadata: { ...tc.metadata, strategyId: 'base64' },
        })),
      );
      vi.spyOn(Strategies, 'find').mockReturnValue({
        id: 'base64',
        action: mockStrategyAction,
      });

      await synthesize({
        numTests: 1,
        plugins: [{ id: 'test-plugin', numTests: 1 }],
        prompts: ['Test prompt'],
        strategies: [{ id: 'base64', config: { numTests: 0 } }],
        targetIds: ['test-provider'],
      });

      // Strategy should NOT be called when numTests=0 (early exit)
      expect(mockStrategyAction).not.toHaveBeenCalled();
    });

    it('should apply post-cap safety net for 1:N fan-out strategies', async () => {
      const mockPluginAction = vi.fn().mockResolvedValue(
        Array(5)
          .fill(null)
          .map((_, i) => ({ vars: { query: `test${i}` } })),
      );
      vi.spyOn(Plugins, 'find').mockReturnValue({
        action: mockPluginAction,
        key: 'test-plugin',
      });

      // Mock strategy that generates 2x the input (1:2 fan-out)
      const mockStrategyAction = vi.fn().mockImplementation((testCases) =>
        testCases.flatMap((tc: any) => [
          { ...tc, metadata: { ...tc.metadata, strategyId: 'multilingual', variant: 'a' } },
          { ...tc, metadata: { ...tc.metadata, strategyId: 'multilingual', variant: 'b' } },
        ]),
      );
      vi.spyOn(Strategies, 'find').mockReturnValue({
        id: 'multilingual',
        action: mockStrategyAction,
      });

      const result = await synthesize({
        numTests: 5,
        plugins: [{ id: 'test-plugin', numTests: 5 }],
        prompts: ['Test prompt'],
        strategies: [{ id: 'multilingual', config: { numTests: 3 } }],
        targetIds: ['test-provider'],
      });

      // Strategy receives 3 tests (pre-limit), generates 6 (2x fan-out), capped to 3 (post-cap)
      const strategyTests = result.testCases.filter(
        (tc) => tc.metadata?.strategyId === 'multilingual',
      );
      expect(strategyTests.length).toBe(3);

      // Should have logged warning about post-cap safety net
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Post-cap safety net applied'),
      );
    });
  });

  describe('plugin logging and report aggregation', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.resetAllMocks();

      vi.mocked(logger.info).mockImplementation(() => logger as any);
      vi.mocked(logger.warn).mockImplementation(() => logger as any);
      vi.mocked(logger.debug).mockImplementation(() => logger as any);
      vi.mocked(logger.error).mockImplementation(() => logger as any);
      vi.mocked(extractSystemPurpose).mockResolvedValue('Test purpose');
      vi.mocked(extractEntities).mockResolvedValue([]);
      vi.mocked(extractVariablesFromTemplates).mockReturnValue(['query']);
      vi.mocked(checkRemoteHealth).mockResolvedValue({
        status: 'OK',
        message: 'Cloud API is healthy',
      });
      vi.mocked(getRemoteHealthUrl).mockReturnValue('http://health.test');
      vi.mocked(shouldGenerateRemote).mockResolvedValue(true);
    });

    it('should show truncated policy text in plugin list for policy plugins', async () => {
      const longPolicyText =
        'The assistant must not reveal any internal implementation details such as schema definitions, parameter lists, tool routing logic.';
      const mockPluginAction = vi.fn().mockResolvedValue([{ vars: { query: 'test' } }]);
      vi.spyOn(Plugins, 'find').mockReturnValue({
        action: mockPluginAction,
        key: 'policy',
      });

      await synthesize({
        numTests: 1,
        plugins: [{ id: 'policy', numTests: 1, config: { policy: longPolicyText } }],
        prompts: ['Test prompt'],
        strategies: [],
        targetIds: ['test-provider'],
      });

      // Check that the "Using plugins:" log contains truncated policy text
      const pluginListMessage = vi
        .mocked(logger.info)
        .mock.calls.map(([arg]) => arg)
        .find((arg): arg is string => typeof arg === 'string' && arg.includes('Using plugins:'));

      expect(pluginListMessage).toBeDefined();
      // Should contain truncated text (70 chars + ...)
      expect(pluginListMessage).toContain(
        'The assistant must not reveal any internal implementation details such',
      );
      expect(pluginListMessage).toContain('...');
      // Should NOT contain full JSON config
      expect(pluginListMessage).not.toContain('"policy":');
    });

    it('should log full config at debug level for policy plugins', async () => {
      const policyText = 'Test policy for debug logging';
      const mockPluginAction = vi.fn().mockResolvedValue([{ vars: { query: 'test' } }]);
      vi.spyOn(Plugins, 'find').mockReturnValue({
        action: mockPluginAction,
        key: 'policy',
      });

      await synthesize({
        numTests: 1,
        plugins: [{ id: 'policy', numTests: 1, config: { policy: policyText } }],
        prompts: ['Test prompt'],
        strategies: [],
        targetIds: ['test-provider'],
      });

      // Check that debug log uses structured logging with plugin config
      expect(logger.debug).toHaveBeenCalledWith('Plugin config', {
        pluginId: 'policy',
        config: expect.objectContaining({ policy: policyText }),
      });
    });

    it('should show "(custom config)" for non-policy plugins with config', async () => {
      const mockPluginAction = vi.fn().mockResolvedValue([{ vars: { query: 'test' } }]);
      vi.spyOn(Plugins, 'find').mockReturnValue({
        action: mockPluginAction,
        key: 'harmful:hate',
      });

      await synthesize({
        numTests: 1,
        plugins: [{ id: 'harmful:hate', numTests: 1, config: { someOption: 'value' } }],
        prompts: ['Test prompt'],
        strategies: [],
        targetIds: ['test-provider'],
      });

      const pluginListMessage = vi
        .mocked(logger.info)
        .mock.calls.map(([arg]) => arg)
        .find((arg): arg is string => typeof arg === 'string' && arg.includes('Using plugins:'));

      expect(pluginListMessage).toBeDefined();
      expect(pluginListMessage).toContain('(custom config)');
      // Should NOT contain full JSON
      expect(pluginListMessage).not.toContain('someOption');
    });

    it('should show separate rows for multiple policy plugins with unique IDs', async () => {
      const mockPluginAction = vi
        .fn()
        .mockResolvedValue([{ vars: { query: 'test1' } }, { vars: { query: 'test2' } }]);
      vi.spyOn(Plugins, 'find').mockReturnValue({
        action: mockPluginAction,
        key: 'policy',
      });

      await synthesize({
        numTests: 2,
        plugins: [
          { id: 'policy', numTests: 2, config: { policy: 'Policy 1' } },
          { id: 'policy', numTests: 2, config: { policy: 'Policy 2' } },
          { id: 'policy', numTests: 2, config: { policy: 'Policy 3' } },
        ],
        prompts: ['Test prompt'],
        strategies: [],
        targetIds: ['test-provider'],
      });

      // Find the report in logger.info calls
      const reportMessage = vi
        .mocked(logger.info)
        .mock.calls.map(([arg]) => arg)
        .find(
          (arg): arg is string => typeof arg === 'string' && arg.includes('Test Generation Report'),
        );

      expect(reportMessage).toBeDefined();
      // Strip ANSI codes for easier assertion
      const cleanReport = stripAnsi(reportMessage || '');

      // Each policy plugin should have its own row with display format "policy [hash]: preview..."
      // Inline policies show hash and preview
      expect(cleanReport).toMatch(/policy \[[a-f0-9]{12}\]:/);
      // Count unique policy rows (should be 3)
      const policyMatches = cleanReport.match(/policy \[[a-f0-9]{12}\]:/g);
      expect(policyMatches?.length).toBe(3);
      // Each should show 2 requested, 2 generated
      const twoMatches = cleanReport.match(/\b2\b/g);
      expect(twoMatches?.length).toBeGreaterThanOrEqual(6); // At least 6 occurrences of "2"
    });

    it('should show separate rows for each policy and language combination', async () => {
      const mockPluginAction = vi.fn().mockResolvedValue([{ vars: { query: 'test' } }]);
      vi.spyOn(Plugins, 'find').mockReturnValue({
        action: mockPluginAction,
        key: 'policy',
      });

      await synthesize({
        numTests: 1,
        language: ['Hmong', 'Zulu'],
        plugins: [
          { id: 'policy', numTests: 1, config: { policy: 'Policy 1' } },
          { id: 'policy', numTests: 1, config: { policy: 'Policy 2' } },
        ],
        prompts: ['Test prompt'],
        strategies: [],
        targetIds: ['test-provider'],
      });

      const reportMessage = vi
        .mocked(logger.info)
        .mock.calls.map(([arg]) => arg)
        .find(
          (arg): arg is string => typeof arg === 'string' && arg.includes('Test Generation Report'),
        );

      expect(reportMessage).toBeDefined();
      const cleanReport = stripAnsi(reportMessage || '');

      // Each policy should have separate rows for each language
      // Display format: "(Lang) policy [hash]: preview..."
      const hmongMatches = cleanReport.match(/\(Hmong\) policy \[[a-f0-9]{12}\]:/g);
      const zuluMatches = cleanReport.match(/\(Zulu\) policy \[[a-f0-9]{12}\]:/g);
      expect(hmongMatches?.length).toBe(2); // 2 policies in Hmong
      expect(zuluMatches?.length).toBe(2); // 2 policies in Zulu
      // Each should show 1 requested, 1 generated
      const oneMatches = cleanReport.match(/\b1\b/g);
      expect(oneMatches?.length).toBeGreaterThanOrEqual(8); // At least 8 occurrences of "1"
    });

    it('should use policy name when available instead of hash + truncated text', async () => {
      const mockPluginAction = vi.fn().mockResolvedValue([{ vars: { query: 'test' } }]);
      vi.spyOn(Plugins, 'find').mockReturnValue({
        action: mockPluginAction,
        key: 'policy',
      });

      await synthesize({
        numTests: 2,
        plugins: [
          // Policy with a name - should display the name
          {
            id: 'policy',
            numTests: 2,
            config: {
              policy: {
                id: 'abc123def456',
                text: 'Some policy text',
                name: 'Secret Protection Policy',
              },
            },
          },
          // Policy without a name - should display hash + truncated text
          { id: 'policy', numTests: 2, config: { policy: 'Another policy without a name' } },
        ],
        prompts: ['Test prompt'],
        strategies: [],
        targetIds: ['test-provider'],
      });

      const reportMessage = vi
        .mocked(logger.info)
        .mock.calls.map(([arg]) => arg)
        .find(
          (arg): arg is string => typeof arg === 'string' && arg.includes('Test Generation Report'),
        );

      expect(reportMessage).toBeDefined();
      const cleanReport = stripAnsi(reportMessage || '');

      // Named policy should show just the name (no hash in display)
      expect(cleanReport).toMatch(/Secret Protection Policy/);
      expect(cleanReport).not.toMatch(/Secret Protection Policy \[[a-f0-9]/); // No hash after name
      // Inline policy should show: "policy [hash]: preview..."
      expect(cleanReport).toMatch(/policy \[[a-f0-9]{12}\]:/);
    });

    it('should work correctly with both built-in plugins and policy plugins', async () => {
      // Mock different plugins
      const mockPluginAction = vi.fn().mockResolvedValue([{ vars: { query: 'test' } }]);
      vi.spyOn(Plugins, 'find').mockImplementation(function (predicate) {
        const mockPlugins = [
          { key: 'policy', action: mockPluginAction },
          { key: 'hallucination', action: mockPluginAction },
          { key: 'contracts', action: mockPluginAction },
        ];
        if (typeof predicate === 'function') {
          return mockPlugins.find(predicate);
        }
        return undefined;
      });

      await synthesize({
        numTests: 2,
        plugins: [
          // Built-in plugin - hallucination
          { id: 'hallucination', numTests: 2 },
          // Built-in plugin - contracts
          { id: 'contracts', numTests: 2 },
          // Policy plugin with name (cloud-style)
          {
            id: 'policy',
            numTests: 2,
            config: {
              policy: {
                id: 'abc123def456',
                text: 'Never share confidential data',
                name: 'Data Protection Policy',
              },
            },
          },
          // Policy plugin without name (inline)
          { id: 'policy', numTests: 2, config: { policy: 'Always be respectful to users' } },
        ],
        prompts: ['Test prompt'],
        strategies: [],
        targetIds: ['test-provider'],
      });

      const reportMessage = vi
        .mocked(logger.info)
        .mock.calls.map(([arg]) => arg)
        .find(
          (arg): arg is string => typeof arg === 'string' && arg.includes('Test Generation Report'),
        );

      expect(reportMessage).toBeDefined();
      const cleanReport = stripAnsi(reportMessage || '');

      // Built-in plugins should show their ID directly
      expect(cleanReport).toMatch(/hallucination/);
      expect(cleanReport).toMatch(/contracts/);
      // Named policy should show just the name
      expect(cleanReport).toMatch(/Data Protection Policy/);
      expect(cleanReport).not.toMatch(/Data Protection Policy \[/); // No ID after name
      // Inline policy should show "policy [hash]: preview..."
      expect(cleanReport).toMatch(/policy \[[a-f0-9]{12}\]:/);
      // Should have 4 plugin rows (hallucination, contracts, named policy, inline policy)
      const pluginRows = cleanReport.match(/│\s+\d+\s+│\s+Plugin/g);
      expect(pluginRows?.length).toBe(4);
    });
  });

  describe('redteamProvider config propagation to strategies', () => {
    beforeEach(() => {
      vi.resetAllMocks();

      vi.mocked(logger.info).mockImplementation(() => logger as any);
      vi.mocked(logger.warn).mockImplementation(() => logger as any);
      vi.mocked(logger.debug).mockImplementation(() => logger as any);
      vi.mocked(logger.error).mockImplementation(() => logger as any);
      vi.mocked(extractSystemPurpose).mockResolvedValue('Test purpose');
      vi.mocked(extractEntities).mockResolvedValue([]);
      vi.mocked(shouldGenerateRemote).mockReturnValue(false);
      vi.mocked(checkRemoteHealth).mockResolvedValue({
        status: 'OK',
        message: 'Cloud API is healthy',
      });
      vi.mocked(getRemoteHealthUrl).mockReturnValue('http://test.com/health');
      vi.mocked(extractVariablesFromTemplates).mockReturnValue(['query']);

      vi.mocked(cliProgress.SingleBar).mockImplementation(function () {
        return {
          start: vi.fn(),
          update: vi.fn(),
          stop: vi.fn(),
          increment: vi.fn(),
        } as any;
      });
    });

    it('should pass redteamProvider from cliState.config to strategy actions', async () => {
      // Import cliState to set up the redteam provider config
      const cliState = (await import('../../src/cliState')).default;
      const originalConfig = cliState.config;

      // Set up cliState with a mock redteam provider - this is the provider that should
      // be passed to strategies for use by agentic providers (iterative, crescendo, etc.)
      cliState.config = {
        redteam: {
          provider: 'vertex:gemini-2.5-flash',
        },
      } as any;

      try {
        // Mock plugin to return a test case
        const mockPluginAction = vi.fn().mockResolvedValue([{ vars: { query: 'test' } }]);
        vi.spyOn(Plugins, 'find').mockReturnValue({
          action: mockPluginAction,
          key: 'test-plugin',
        });

        // Mock strategy that captures the config it receives
        let capturedConfig: Record<string, any> | undefined;
        const mockStrategyAction = vi.fn().mockImplementation((testCases, _injectVar, config) => {
          capturedConfig = config;
          return testCases.map((tc: any) => ({
            ...tc,
            metadata: { ...tc.metadata, strategyId: 'jailbreak' },
          }));
        });

        vi.spyOn(Strategies, 'find').mockReturnValue({
          id: 'jailbreak',
          action: mockStrategyAction,
        });

        // Mock the provider loading to return a mock provider for test generation
        // This avoids the loadApiProviders error while still testing strategy config
        const mockProvider = { id: () => 'mock-provider', callApi: vi.fn() };
        const providerSpy = vi
          .spyOn(
            await import('../../src/redteam/providers/shared'),
            'redteamProviderManager',
            'get',
          )
          .mockReturnValue({
            getProvider: vi.fn().mockResolvedValue(mockProvider),
            getGradingProvider: vi.fn().mockResolvedValue(mockProvider),
            getMultilingualProvider: vi.fn().mockResolvedValue(undefined),
            setProvider: vi.fn(),
            setGradingProvider: vi.fn(),
            setMultilingualProvider: vi.fn(),
            clearProvider: vi.fn(),
          } as any);

        try {
          await synthesize({
            numTests: 1,
            plugins: [{ id: 'test-plugin', numTests: 1 }],
            prompts: ['Test prompt'],
            strategies: [{ id: 'jailbreak' }],
            targetIds: ['test-provider'],
          });

          // KEY ASSERTION: The strategy should receive redteamProvider from cliState.config
          expect(mockStrategyAction).toHaveBeenCalled();
          expect(capturedConfig).toBeDefined();
          expect(capturedConfig?.redteamProvider).toBe('vertex:gemini-2.5-flash');
        } finally {
          providerSpy.mockRestore();
        }
      } finally {
        // Restore original cliState
        cliState.config = originalConfig;
      }
    });

    it('should pass redteamProvider as undefined when not configured in cliState', async () => {
      const cliState = (await import('../../src/cliState')).default;
      const originalConfig = cliState.config;

      // Set up cliState WITHOUT redteam provider
      cliState.config = {
        redteam: {},
      } as any;

      try {
        const mockPluginAction = vi.fn().mockResolvedValue([{ vars: { query: 'test' } }]);
        vi.spyOn(Plugins, 'find').mockReturnValue({
          action: mockPluginAction,
          key: 'test-plugin',
        });

        let capturedConfig: Record<string, any> | undefined;
        const mockStrategyAction = vi.fn().mockImplementation((testCases, _injectVar, config) => {
          capturedConfig = config;
          return testCases.map((tc: any) => ({
            ...tc,
            metadata: { ...tc.metadata, strategyId: 'jailbreak' },
          }));
        });

        vi.spyOn(Strategies, 'find').mockReturnValue({
          id: 'jailbreak',
          action: mockStrategyAction,
        });

        await synthesize({
          numTests: 1,
          plugins: [{ id: 'test-plugin', numTests: 1 }],
          prompts: ['Test prompt'],
          strategies: [{ id: 'jailbreak' }],
          targetIds: ['test-provider'],
        });

        expect(mockStrategyAction).toHaveBeenCalled();
        expect(capturedConfig).toBeDefined();
        // When not configured, redteamProvider should be undefined
        expect(capturedConfig?.redteamProvider).toBeUndefined();
      } finally {
        cliState.config = originalConfig;
      }
    });

    it('should pass redteamProvider as object when configured as provider options', async () => {
      const cliState = (await import('../../src/cliState')).default;
      const originalConfig = cliState.config;

      // Set up cliState with provider options object
      const providerOptions = {
        id: 'vertex:gemini-2.5-flash',
        config: { temperature: 0.7 },
      };
      cliState.config = {
        redteam: {
          provider: providerOptions,
        },
      } as any;

      try {
        const mockPluginAction = vi.fn().mockResolvedValue([{ vars: { query: 'test' } }]);
        vi.spyOn(Plugins, 'find').mockReturnValue({
          action: mockPluginAction,
          key: 'test-plugin',
        });

        let capturedConfig: Record<string, any> | undefined;
        const mockStrategyAction = vi.fn().mockImplementation((testCases, _injectVar, config) => {
          capturedConfig = config;
          return testCases.map((tc: any) => ({
            ...tc,
            metadata: { ...tc.metadata, strategyId: 'jailbreak' },
          }));
        });

        vi.spyOn(Strategies, 'find').mockReturnValue({
          id: 'jailbreak',
          action: mockStrategyAction,
        });

        // Mock the provider loading
        const mockProvider = { id: () => 'mock-provider', callApi: vi.fn() };
        const providerSpy = vi
          .spyOn(
            await import('../../src/redteam/providers/shared'),
            'redteamProviderManager',
            'get',
          )
          .mockReturnValue({
            getProvider: vi.fn().mockResolvedValue(mockProvider),
            getGradingProvider: vi.fn().mockResolvedValue(mockProvider),
            getMultilingualProvider: vi.fn().mockResolvedValue(undefined),
            setProvider: vi.fn(),
            setGradingProvider: vi.fn(),
            setMultilingualProvider: vi.fn(),
            clearProvider: vi.fn(),
          } as any);

        try {
          await synthesize({
            numTests: 1,
            plugins: [{ id: 'test-plugin', numTests: 1 }],
            prompts: ['Test prompt'],
            strategies: [{ id: 'jailbreak' }],
            targetIds: ['test-provider'],
          });

          expect(mockStrategyAction).toHaveBeenCalled();
          expect(capturedConfig).toBeDefined();
          // Should pass the full provider options object
          expect(capturedConfig?.redteamProvider).toEqual(providerOptions);
        } finally {
          providerSpy.mockRestore();
        }
      } finally {
        cliState.config = originalConfig;
      }
    });
  });

  describe('Multi-input mode plugin exclusion', () => {
    it('should exclude dataset-exempt plugins in multi-input mode', async () => {
      const result = await synthesize({
        language: 'en',
        numTests: 1,
        plugins: [
          { id: 'aegis', numTests: 1 }, // DATASET_EXEMPT_PLUGIN
          { id: 'contracts', numTests: 1 }, // Regular plugin
        ],
        prompts: ['Test {{query}}'],
        strategies: [],
        targetIds: ['test-provider'],
        inputs: { query: 'user query', context: 'additional context' }, // Multi-input mode
      });

      // aegis should be excluded, contracts should remain
      // Result should only contain test cases from contracts
      expect(result.testCases.length).toBeGreaterThanOrEqual(0);

      // Check that logger.info was called with skipping message
      const skipMessage = vi
        .mocked(logger.info)
        .mock.calls.map(([arg]) => arg)
        .find((arg): arg is string => typeof arg === 'string' && arg.includes('Skipping'));

      expect(skipMessage).toBeDefined();
      expect(skipMessage).toContain('aegis');
    });

    it('should exclude multi-input excluded plugins in multi-input mode', async () => {
      const result = await synthesize({
        language: 'en',
        numTests: 1,
        plugins: [
          { id: 'cca', numTests: 1 }, // MULTI_INPUT_EXCLUDED_PLUGIN
          { id: 'cross-session-leak', numTests: 1 }, // MULTI_INPUT_EXCLUDED_PLUGIN
          { id: 'contracts', numTests: 1 }, // Regular plugin
        ],
        prompts: ['Test {{query}}'],
        strategies: [],
        targetIds: ['test-provider'],
        inputs: { query: 'user query', context: 'additional context' }, // Multi-input mode
      });

      // cca and cross-session-leak should be excluded
      expect(result.testCases.length).toBeGreaterThanOrEqual(0);

      // Check that logger.info was called with skipping message
      const skipMessage = vi
        .mocked(logger.info)
        .mock.calls.map(([arg]) => arg)
        .find((arg): arg is string => typeof arg === 'string' && arg.includes('Skipping'));

      expect(skipMessage).toBeDefined();
      expect(skipMessage).toContain('cca');
      expect(skipMessage).toContain('cross-session-leak');
    });

    it('should NOT exclude plugins when inputs is empty object', async () => {
      const result = await synthesize({
        language: 'en',
        numTests: 1,
        plugins: [
          { id: 'cca', numTests: 1 }, // Would be excluded in multi-input mode
          { id: 'contracts', numTests: 1 },
        ],
        prompts: ['Test {{query}}'],
        strategies: [],
        targetIds: ['test-provider'],
        inputs: {}, // Empty inputs - not multi-input mode
      });

      // No plugins should be excluded
      expect(result.testCases.length).toBeGreaterThanOrEqual(0);

      // Should NOT have skipping message for cca
      const skipMessage = vi
        .mocked(logger.info)
        .mock.calls.map(([arg]) => arg)
        .find(
          (arg): arg is string =>
            typeof arg === 'string' && arg.includes('Skipping') && arg.includes('cca'),
        );

      expect(skipMessage).toBeUndefined();
    });

    it('should NOT exclude plugins when inputs is undefined', async () => {
      const result = await synthesize({
        language: 'en',
        numTests: 1,
        plugins: [
          { id: 'cca', numTests: 1 }, // Would be excluded in multi-input mode
          { id: 'contracts', numTests: 1 },
        ],
        prompts: ['Test {{query}}'],
        strategies: [],
        targetIds: ['test-provider'],
        // No inputs - not multi-input mode
      });

      // No plugins should be excluded
      expect(result.testCases.length).toBeGreaterThanOrEqual(0);

      // Should NOT have skipping message for cca
      const skipMessage = vi
        .mocked(logger.info)
        .mock.calls.map(([arg]) => arg)
        .find(
          (arg): arg is string =>
            typeof arg === 'string' && arg.includes('Skipping') && arg.includes('cca'),
        );

      expect(skipMessage).toBeUndefined();
    });

    it('should log info about using multi-input mode', async () => {
      await synthesize({
        language: 'en',
        numTests: 1,
        plugins: [{ id: 'contracts', numTests: 1 }],
        prompts: ['Test {{query}}'],
        strategies: [],
        targetIds: ['test-provider'],
        inputs: { query: 'user query', context: 'additional context' },
      });

      // Check that logger.info was called with multi-input mode message
      const multiInputMessage = vi
        .mocked(logger.info)
        .mock.calls.map(([arg]) => arg)
        .find((arg): arg is string => typeof arg === 'string' && arg.includes('multi-input mode'));

      expect(multiInputMessage).toBeDefined();
      expect(multiInputMessage).toContain('2 variables');
      expect(multiInputMessage).toContain('query');
      expect(multiInputMessage).toContain('context');
    });

    it('should exclude all MULTI_INPUT_EXCLUDED_PLUGINS in multi-input mode', async () => {
      await synthesize({
        language: 'en',
        numTests: 1,
        plugins: [
          { id: 'cca', numTests: 1 },
          { id: 'cross-session-leak', numTests: 1 },
          { id: 'special-token-injection', numTests: 1 },
          { id: 'system-prompt-override', numTests: 1 },
          { id: 'contracts', numTests: 1 }, // Regular plugin - should NOT be excluded
        ],
        prompts: ['Test {{query}}'],
        strategies: [],
        targetIds: ['test-provider'],
        inputs: { query: 'user query', context: 'additional context' },
      });

      // Check that all 4 MULTI_INPUT_EXCLUDED_PLUGINS are in skip message
      const skipMessage = vi
        .mocked(logger.info)
        .mock.calls.map(([arg]) => arg)
        .find((arg): arg is string => typeof arg === 'string' && arg.includes('Skipping 4 plugin'));

      expect(skipMessage).toBeDefined();
      expect(skipMessage).toContain('cca');
      expect(skipMessage).toContain('cross-session-leak');
      expect(skipMessage).toContain('special-token-injection');
      expect(skipMessage).toContain('system-prompt-override');
    });
  });
});
