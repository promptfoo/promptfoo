import cliProgress from 'cli-progress';
import * as fs from 'fs';
import yaml from 'js-yaml';
import logger from '../../src/logger';
import { loadApiProvider } from '../../src/providers';
import { HARM_PLUGINS, PII_PLUGINS } from '../../src/redteam/constants';
import { extractEntities } from '../../src/redteam/extraction/entities';
import { extractSystemPurpose } from '../../src/redteam/extraction/purpose';
import { synthesize, resolvePluginConfig, calculateTotalTests } from '../../src/redteam/index';
import { Plugins } from '../../src/redteam/plugins';
import { shouldGenerateRemote, getRemoteHealthUrl } from '../../src/redteam/remoteGeneration';
import { Strategies } from '../../src/redteam/strategies';
import { validateStrategies } from '../../src/redteam/strategies';
import { DEFAULT_LANGUAGES } from '../../src/redteam/strategies/multilingual';
import { checkRemoteHealth } from '../../src/util/apiHealth';

jest.mock('cli-progress');
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
    if (strategies.some((s: { id: string }) => s.id === 'invalid-strategy')) {
      throw new Error('Invalid strategies');
    }
  }),
}));

jest.mock('../../src/util/apiHealth');
jest.mock('../../src/redteam/remoteGeneration');

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
    jest.mocked(validateStrategies).mockImplementation(async () => {});
    jest.mocked(cliProgress.SingleBar).mockReturnValue({
      increment: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
      update: jest.fn(),
    } as any);
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
        targetLabels: ['test-provider'],
      });

      const expectedTestCaseCount = (Object.keys(HARM_PLUGINS).length + PII_PLUGINS.length) * 1; // Each plugin is called once
      expect(result.testCases).toHaveLength(expectedTestCaseCount);
    });

    it('should generate a correct report for plugins and strategies', async () => {
      const mockPluginAction = jest.fn().mockResolvedValue([{ test: 'case' }]);
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

    // Mock plugin to generate a test case
    const mockPlugin = {
      id: 'test-plugin',
      numTests: 1,
    };

    const mockProvider = {
      id: () => 'test',
      callApi: jest.fn().mockResolvedValue({ output: 'test output' }),
    };

    // Test with basic strategy enabled
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

    // Test with basic strategy disabled
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
});

jest.mock('fs');
jest.mock('js-yaml');

describe('resolvePluginConfig', () => {
  afterEach(() => {
    jest.resetAllMocks();
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
      totalTests: 5, // 2 + 3 from plugins
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
      totalTests: 5, // (2 + 3) * 1 strategy
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
      totalTests: 0, // No tests because basic is disabled and it's the only strategy
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
      totalTests: 5 * DEFAULT_LANGUAGES.length, // (2 + 3) * number of default languages
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
      totalTests: 15, // (2 + 3) * 3 languages
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
      totalTests: 10, // 5 tests * 2 languages
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
      totalTests: 10, // Original 5 tests + 5 retry tests
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
      totalTests: 8, // Original 5 tests + 3 retry tests
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
      totalTests: 20, // (Original 5 + 5 retry tests) * 2 languages
      totalPluginTests: 5,
      effectiveStrategyCount: 2,
      includeBasicTests: true,
      multilingualStrategy: strategies[1],
    });
  });

  it('should correctly calculate total tests for multiple plugins with jailbreak strategy', () => {
    const plugins = Array(10).fill({ numTests: 5 }); // 10 plugins with 5 tests each
    const strategies = [{ id: 'jailbreak' }];
    const result = calculateTotalTests(plugins, strategies);
    expect(result).toEqual({
      totalTests: 100, // 50 plugin tests + 50 jailbreak tests
      totalPluginTests: 50, // 10 plugins * 5 tests each
      effectiveStrategyCount: 1,
      includeBasicTests: true,
      multilingualStrategy: undefined,
    });
  });
});
