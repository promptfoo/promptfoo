import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliProgress from 'cli-progress';
import logger from '../../src/logger';
import { loadApiProvider } from '../../src/providers/index';
import { extractEntities } from '../../src/redteam/extraction/entities';
import { extractSystemPurpose } from '../../src/redteam/extraction/purpose';
import { synthesize } from '../../src/redteam/index';
import { Plugins } from '../../src/redteam/plugins/index';
import { getRemoteHealthUrl, shouldGenerateRemote } from '../../src/redteam/remoteGeneration';
import { Strategies, validateStrategies } from '../../src/redteam/strategies/index';
import { checkRemoteHealth } from '../../src/util/apiHealth';
import { extractVariablesFromTemplates } from '../../src/util/templates';

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

vi.mock('../../src/redteam/strategies', async () => ({
  ...(await vi.importActual('../../src/redteam/strategies')),
  validateStrategies: vi.fn(),
}));

vi.mock('../../src/util/apiHealth');
vi.mock('../../src/redteam/remoteGeneration');
vi.mock('../../src/redteam/util', async () => ({
  ...(await vi.importActual('../../src/redteam/util')),
  extractGoalFromPrompt: vi.fn().mockResolvedValue('mocked goal'),
}));

describe('synthesize metadata propagation', () => {
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
    vi.mocked(validateStrategies).mockImplementation(async () => {});
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
      message: 'Cloud API is healthy',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should add purpose and entities to all test case metadata', async () => {
    const mockPluginAction = vi.fn().mockResolvedValue([
      { vars: { query: 'test1' }, metadata: { pluginId: 'test-plugin' } },
      { vars: { query: 'test2' }, metadata: { pluginId: 'test-plugin' } },
    ]);
    vi.spyOn(Plugins, 'find').mockReturnValue({ action: mockPluginAction, key: 'test-plugin' });

    const result = await synthesize({
      entities: ['entity1', 'entity2'],
      language: 'en',
      numTests: 2,
      plugins: [{ id: 'test-plugin', numTests: 2 }],
      prompts: ['Test prompt'],
      purpose: 'Test purpose for metadata',
      strategies: [],
      targetLabels: ['test-provider'],
    });

    // All test cases should have purpose and entities in metadata
    expect(result.testCases.length).toBeGreaterThan(0);
    for (const testCase of result.testCases) {
      expect(testCase.metadata?.purpose).toBe('Test purpose for metadata');
      expect(testCase.metadata?.entities).toEqual(['entity1', 'entity2']);
    }
  });

  it('should add purpose and entities to strategy-generated test cases', async () => {
    const mockPluginAction = vi
      .fn()
      .mockResolvedValue([{ vars: { query: 'base test' }, metadata: { pluginId: 'test-plugin' } }]);
    vi.spyOn(Plugins, 'find').mockReturnValue({ action: mockPluginAction, key: 'test-plugin' });

    const mockStrategyAction = vi
      .fn()
      .mockReturnValue([
        { vars: { query: 'strategy test' }, metadata: { strategyId: 'mock-strategy' } },
      ]);
    vi.spyOn(Strategies, 'find').mockReturnValue({
      id: 'mock-strategy',
      action: mockStrategyAction,
    });

    const result = await synthesize({
      entities: ['custom-entity'],
      language: 'en',
      numTests: 1,
      plugins: [{ id: 'test-plugin', numTests: 1 }],
      prompts: ['Test prompt'],
      purpose: 'Strategy test purpose',
      strategies: [{ id: 'mock-strategy' }],
      targetLabels: ['test-provider'],
    });

    // All test cases (both base and strategy) should have purpose and entities
    const baseTests = result.testCases.filter((tc) => tc.metadata?.pluginId);
    const strategyTests = result.testCases.filter((tc) => tc.metadata?.strategyId);

    expect(baseTests.length).toBeGreaterThan(0);
    expect(strategyTests.length).toBeGreaterThan(0);

    for (const testCase of result.testCases) {
      expect(testCase.metadata?.purpose).toBe('Strategy test purpose');
      expect(testCase.metadata?.entities).toEqual(['custom-entity']);
    }
  });

  it('should use extracted purpose and entities when not provided', async () => {
    const mockPluginAction = vi
      .fn()
      .mockResolvedValue([{ vars: { query: 'test' }, metadata: { pluginId: 'test-plugin' } }]);
    vi.spyOn(Plugins, 'find').mockReturnValue({ action: mockPluginAction, key: 'test-plugin' });

    // These are the extracted values (mocked in beforeEach)
    vi.mocked(extractSystemPurpose).mockResolvedValue('Extracted purpose');
    vi.mocked(extractEntities).mockResolvedValue(['extracted-entity-1', 'extracted-entity-2']);

    const result = await synthesize({
      // Not providing purpose or entities
      language: 'en',
      numTests: 1,
      plugins: [{ id: 'test-plugin', numTests: 1 }],
      prompts: ['Test prompt'],
      strategies: [],
      targetLabels: ['test-provider'],
    });

    expect(result.testCases.length).toBeGreaterThan(0);
    for (const testCase of result.testCases) {
      expect(testCase.metadata?.purpose).toBe('Extracted purpose');
      expect(testCase.metadata?.entities).toEqual(['extracted-entity-1', 'extracted-entity-2']);
    }
  });
});
