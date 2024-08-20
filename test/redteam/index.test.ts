import cliProgress from 'cli-progress';
import logger from '../../src/logger';
import { loadApiProvider } from '../../src/providers';
import { HARM_PLUGINS, PII_PLUGINS } from '../../src/redteam/constants';
import { extractEntities } from '../../src/redteam/extraction/entities';
import { extractSystemPurpose } from '../../src/redteam/extraction/purpose';
import { synthesize } from '../../src/redteam/index';
import { Plugins } from '../../src/redteam/plugins';
import { Strategies } from '../../src/redteam/strategies';
import { validateStrategies } from '../../src/redteam/strategies';
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
    extractVariablesFromTemplates: jest.fn(originalModule.extractVariablesFromTemplates),
  };
});

jest.mock('process', () => ({
  ...jest.requireActual('process'),
  exit: jest.fn(),
}));

jest.mock('../../src/redteam/strategies', () => ({
  ...jest.requireActual('../../src/redteam/strategies'),
  validateStrategies: jest.fn().mockImplementation((strategies) => {
    if (strategies.some((s) => s.id === 'invalid-strategy')) {
      throw new Error('Invalid strategies');
    }
  }),
}));

describe('synthesize', () => {
  const mockProvider = {
    callApi: jest.fn(),
    generate: jest.fn(),
    id: () => 'test-provider',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(extractEntities).mockResolvedValue(['entity1', 'entity2']);
    jest.mocked(extractSystemPurpose).mockResolvedValue('Test purpose');
    jest.mocked(loadApiProvider).mockResolvedValue(mockProvider);
    jest.spyOn(process, 'exit').mockImplementation((code?: string | number | null | undefined) => {
      throw new Error(`Process.exit called with code ${code}`);
    });
    jest.mocked(validateStrategies).mockImplementation(() => {});
    jest.mocked(cliProgress.SingleBar).mockReturnValue({
      start: jest.fn(),
      increment: jest.fn(),
      update: jest.fn(),
      stop: jest.fn(),
    } as any);
  });

  it('should use provided purpose and entities if given', async () => {
    const result = await synthesize({
      entities: ['custom-entity'],
      language: 'en',
      numTests: 1,
      plugins: [{ id: 'test-plugin', numTests: 1 }],
      prompts: ['Test prompt'],
      purpose: 'Custom purpose',
      strategies: [],
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
    });

    expect(extractEntities).toHaveBeenCalledWith(expect.any(Object), ['Test prompt']);
    expect(extractSystemPurpose).toHaveBeenCalledWith(expect.any(Object), ['Test prompt']);
  });

  it('should use the provided API provider if given', async () => {
    const customProvider = { callApi: jest.fn(), generate: jest.fn(), id: () => 'custom-provider' };
    await synthesize({
      language: 'en',
      numTests: 1,
      plugins: [{ id: 'test-plugin', numTests: 1 }],
      prompts: ['Test prompt'],
      provider: customProvider,
      strategies: [],
    });

    expect(loadApiProvider).not.toHaveBeenCalled();
  });

  it('should load the default provider if not provided', async () => {
    await synthesize({
      language: 'en',
      numTests: 1,
      plugins: [{ id: 'test-plugin', numTests: 1 }],
      prompts: ['Test prompt'],
      strategies: [],
    });

    expect(loadApiProvider).toHaveBeenCalledWith('openai:chat:gpt-4o', {
      options: { config: { temperature: 0.5 } },
    });
  });

  it('should generate test cases for each plugin', async () => {
    const mockPluginAction = jest.fn().mockResolvedValue([{ test: 'case' }]);
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
    });

    expect(logger.warn).toHaveBeenCalledWith('Plugin unregistered-plugin not registered, skipping');
  });

  it('should throw an error when invalid strategies are provided', async () => {
    await expect(
      synthesize({
        language: 'en',
        numTests: 1,
        plugins: [{ id: 'test-plugin', numTests: 1 }],
        prompts: ['Test prompt'],
        strategies: [{ id: 'invalid-strategy' }],
      }),
    ).rejects.toThrow('Invalid strategies');
  });

  it('should handle empty prompts array', async () => {
    await expect(
      synthesize({
        language: 'en',
        numTests: 1,
        plugins: [{ id: 'test-plugin', numTests: 1 }],
        prompts: [] as unknown as [string, ...string[]],
        strategies: [],
      }),
    ).rejects.toThrow('Prompts array cannot be empty');
  });

  it('should use default injectVar when no variables found in prompts', async () => {
    jest.mocked(extractVariablesFromTemplates).mockReturnValue([]);

    await synthesize({
      language: 'en',
      numTests: 1,
      plugins: [{ id: 'test-plugin', numTests: 1 }],
      prompts: ['Test prompt'],
      strategies: [],
    });

    expect(logger.warn).toHaveBeenCalledWith(
      'No variables found in prompts. Using "query" as the inject variable.',
    );
  });

  it('should use the progress bar', async () => {
    const mockProgressBar = {
      start: jest.fn(),
      increment: jest.fn(),
      update: jest.fn(),
      stop: jest.fn(),
    };
    jest.mocked(cliProgress.SingleBar).mockReturnValue(mockProgressBar as any);

    await synthesize({
      language: 'en',
      numTests: 1,
      plugins: [{ id: 'test-plugin', numTests: 1 }],
      prompts: ['Test prompt'],
      strategies: [],
    });

    expect(mockProgressBar.start).toHaveBeenCalled();
    expect(mockProgressBar.increment).toHaveBeenCalled();
    expect(mockProgressBar.stop).toHaveBeenCalled();
  });

  it('should handle HARM_PLUGINS and PII_PLUGINS correctly', async () => {
    const mockPluginAction = jest.fn().mockResolvedValue([{ test: 'case' }]);
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
    });

    const expectedTestCaseCount = (Object.keys(HARM_PLUGINS).length + PII_PLUGINS.length) * 1; // Each plugin is called once
    expect(result.testCases).toHaveLength(expectedTestCaseCount);
  });

  it('should expand plugins using ALIASED_PLUGIN_MAPPINGS', async () => {
    const mockPluginAction = jest.fn().mockResolvedValue([{ test: 'case' }]);
    jest.spyOn(Plugins, 'find').mockReturnValue({ action: mockPluginAction, key: 'mockPlugin' });

    const aliasedPluginKey = 'test-alias';
    const mockMapping = {
      [aliasedPluginKey]: {
        plugins: ['plugin1', 'plugin2'],
        strategies: [],
      },
    };
    jest.mock('../../src/redteam/constants', () => ({
      ...jest.requireActual('../../src/redteam/constants'),
      ALIASED_PLUGIN_MAPPINGS: mockMapping,
    }));

    const result = await synthesize({
      language: 'en',
      numTests: 1,
      plugins: [{ id: aliasedPluginKey, numTests: 2 }],
      prompts: ['Test prompt'],
      strategies: [],
    });

    expect(result.testCases).toHaveLength(mockMapping[aliasedPluginKey].plugins.length * 2);
  });

  it('should generate strategy test cases correctly', async () => {
    const mockPluginAction = jest.fn().mockResolvedValue([{ test: 'case' }]);
    jest.spyOn(Plugins, 'find').mockReturnValue({ action: mockPluginAction, key: 'mockPlugin' });

    const mockStrategyAction = jest.fn().mockReturnValue([{ test: 'strategy case' }]);
    jest
      .spyOn(Strategies, 'find')
      .mockReturnValue({ action: mockStrategyAction, key: 'mockStrategy' });

    const result = await synthesize({
      language: 'en',
      numTests: 1,
      plugins: [{ id: 'test-plugin', numTests: 1 }],
      prompts: ['Test prompt'],
      strategies: [{ id: 'mockStrategy' }],
    });

    expect(mockPluginAction).toHaveBeenCalledTimes(1);
    expect(mockStrategyAction).toHaveBeenCalledTimes(1);
    expect(result.testCases).toHaveLength(2); // 1 from plugin, 1 from strategy
    expect(result.testCases[1].metadata?.strategyId).toBe('mockStrategy');
  });

  it('should generate a correct report for plugins and strategies', async () => {
    const mockPluginAction = jest.fn().mockResolvedValue([{ test: 'case' }]);
    jest.spyOn(Plugins, 'find').mockReturnValue({ action: mockPluginAction, key: 'mockPlugin' });

    const mockStrategyAction = jest.fn().mockReturnValue([{ test: 'strategy case' }]);
    jest
      .spyOn(Strategies, 'find')
      .mockReturnValue({ action: mockStrategyAction, key: 'mockStrategy' });

    await synthesize({
      language: 'en',
      numTests: 2,
      plugins: [{ id: 'test-plugin', numTests: 2 }],
      prompts: ['Test prompt'],
      strategies: [{ id: 'mockStrategy' }],
    });

    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('Test Generation Report:'));
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('test-plugin'));
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('mockStrategy'));
  });

  it('should handle errors when executing invalid plugins', async () => {
    jest.spyOn(Plugins, 'find').mockReturnValue(undefined);

    await synthesize({
      language: 'en',
      numTests: 1,
      plugins: [{ id: 'invalid-plugin', numTests: 1 }],
      prompts: ['Test prompt'],
      strategies: [],
    });

    expect(logger.warn).toHaveBeenCalledWith('Plugin invalid-plugin not registered, skipping');
  });

  it('should correctly process multiple prompts', async () => {
    await synthesize({
      language: 'en',
      numTests: 1,
      plugins: [{ id: 'test-plugin', numTests: 1 }],
      prompts: ['Prompt 1', 'Prompt 2', 'Prompt 3'],
      strategies: [],
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

  it('should handle different logger levels appropriately', async () => {
    const originalLevel = logger.level;
    logger.level = 'debug';

    await synthesize({
      language: 'en',
      numTests: 1,
      plugins: [{ id: 'test-plugin', numTests: 1 }],
      prompts: ['Test prompt'],
      strategies: [],
    });

    expect(cliProgress.SingleBar).not.toHaveBeenCalled();

    logger.level = originalLevel;
  });
});
