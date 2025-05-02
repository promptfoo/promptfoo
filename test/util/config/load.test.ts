import * as fs from 'fs';
import { globSync } from 'glob';
import * as path from 'path';
import cliState from '../../../src/cliState';
import { combineConfigs, dereferenceConfig, resolveConfigs } from '../../../src/util/config/load';
import { maybeLoadFromExternalFile } from '../../../src/util/file';

jest.mock('../../../src/database', () => ({
  getDb: jest.fn(),
}));

jest.mock('fs');

jest.mock('glob', () => ({
  globSync: jest.fn(),
}));

jest.mock('proxy-agent', () => ({
  ProxyAgent: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../src/envars', () => {
  const originalModule = jest.requireActual('../../../src/envars');
  return {
    ...originalModule,
    getEnvBool: jest.fn(),
    isCI: jest.fn(),
  };
});

jest.mock('../../../src/esm', () => ({
  importModule: jest.fn(),
}));

jest.mock('../../../src/logger', () => ({
  debug: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
}));

jest.mock('../../../src/util', () => ({
  ...jest.requireActual('../../../src/util'),
  isRunningUnderNpx: jest.fn(),
}));

jest.mock('../../../src/util/file', () => {
  const originalModule = jest.requireActual('../../../src/util/file');
  return {
    ...originalModule,
    maybeLoadFromExternalFile: jest.fn(),
    readFilters: jest.fn(),
  };
});

jest.mock('../../../src/util/testCaseReader', () => ({
  readTest: jest.fn(),
  readTests: jest.fn().mockResolvedValue([]),
}));

jest.mock('process', () => ({
  ...jest.requireActual('process'),
  exit: jest.fn(),
}));

jest.mock('../../../src/assertions', () => ({
  readAssertions: jest.fn().mockResolvedValue([{ type: 'equals', value: 'expected' }]),
}));

jest.mock('../../../src/providers', () => ({
  loadApiProvider: jest.fn().mockResolvedValue({ id: 'provider1' } as any),
  loadApiProviders: jest.fn().mockResolvedValue([{ id: 'provider1' } as any]),
}));

describe('combineConfigs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reads from existing configs', async () => {
    const config1 = {
      description: 'test1',
      tags: { tag1: 'value1' },
      providers: ['provider1'],
      prompts: ['prompt1'],
      tests: ['test1'],
      scenarios: ['scenario1'],
      defaultTest: {
        description: 'defaultTest1',
        metadata: {},
        vars: { var1: 'value1' },
        assert: [{ type: 'equals', value: 'expected1' }],
      },
      nunjucksFilters: { filter1: 'filter1' },
      redteam: {
        plugins: ['plugin1'],
        strategies: ['strategy1'],
      },
      env: { envVar1: 'envValue1' },
      evaluateOptions: { maxConcurrency: 1 },
      outputPath: [],
      commandLineOptions: { verbose: true },
      sharing: false,
    };

    const config2 = {
      description: 'test2',
      providers: ['provider2'],
      prompts: ['prompt2'],
      tests: ['test2'],
      scenarios: ['scenario2'],
      defaultTest: {
        description: 'defaultTest2',
        metadata: {},
        vars: { var2: 'value2' },
        assert: [{ type: 'equals', value: 'expected2' }],
      },
      nunjucksFilters: { filter2: 'filter2' },
      redteam: {
        plugins: ['plugin2'],
        strategies: [],
      },
      env: { envVar2: 'envValue2' },
      evaluateOptions: { maxConcurrency: 2 },
      outputPath: [],
      commandLineOptions: { verbose: false },
      sharing: true,
    };

    (globSync as any).mockImplementation((pathOrGlob: string) => [pathOrGlob]);
    (fs.readFileSync as any).mockImplementation((filePath: string) => {
      if (filePath === 'config1.json') {
        return JSON.stringify(config1);
      } else if (filePath === 'config2.json') {
        return JSON.stringify(config2);
      }
      return '{}';
    });

    jest.mocked(fs.existsSync).mockReturnValue(true);

    const config1Result = await combineConfigs(['config1.json']);
    expect(config1Result).toEqual({
      description: 'test1',
      tags: { tag1: 'value1' },
      providers: ['provider1'],
      prompts: ['prompt1'],
      extensions: [],
      tests: ['test1'],
      scenarios: ['scenario1'],
      defaultTest: {
        description: 'defaultTest1',
        metadata: {},
        options: {},
        vars: { var1: 'value1' },
        assert: [{ type: 'equals', value: 'expected1' }],
      },
      nunjucksFilters: { filter1: 'filter1' },
      derivedMetrics: undefined,
      redteam: {
        plugins: ['plugin1'],
        strategies: ['strategy1'],
      },
      env: { envVar1: 'envValue1' },
      evaluateOptions: { maxConcurrency: 1 },
      outputPath: [],
      commandLineOptions: { verbose: true },
      metadata: {},
      sharing: false,
    });

    const config2Result = await combineConfigs(['config2.json']);
    expect(config2Result).toEqual({
      description: 'test2',
      tags: {},
      providers: ['provider2'],
      prompts: ['prompt2'],
      extensions: [],
      tests: ['test2'],
      scenarios: ['scenario2'],
      defaultTest: {
        description: 'defaultTest2',
        metadata: {},
        options: {},
        vars: { var2: 'value2' },
        assert: [{ type: 'equals', value: 'expected2' }],
      },
      nunjucksFilters: { filter2: 'filter2' },
      derivedMetrics: undefined,
      redteam: {
        plugins: ['plugin2'],
        strategies: [],
      },
      env: { envVar2: 'envValue2' },
      evaluateOptions: { maxConcurrency: 2 },
      outputPath: [],
      commandLineOptions: { verbose: false },
      metadata: {},
      sharing: true,
    });

    const result = await combineConfigs(['config1.json', 'config2.json']);
    expect(result).toEqual({
      description: 'test1, test2',
      tags: { tag1: 'value1' },
      providers: ['provider1', 'provider2'],
      prompts: ['prompt1', 'prompt2'],
      extensions: [],
      tests: ['test1', 'test2'],
      scenarios: ['scenario1', 'scenario2'],
      defaultTest: {
        description: 'defaultTest2',
        metadata: {},
        options: {},
        vars: { var1: 'value1', var2: 'value2' },
        assert: [
          { type: 'equals', value: 'expected1' },
          { type: 'equals', value: 'expected2' },
        ],
      },
      nunjucksFilters: { filter1: 'filter1', filter2: 'filter2' },
      derivedMetrics: undefined,
      redteam: {
        plugins: ['plugin1', 'plugin2'],
        strategies: ['strategy1'],
      },
      env: { envVar1: 'envValue1', envVar2: 'envValue2' },
      evaluateOptions: { maxConcurrency: 2 },
      outputPath: [],
      commandLineOptions: { verbose: false },
      metadata: {},
      sharing: false,
    });
  });

  it('combines configs with provider-specific prompts', async () => {
    jest.mocked(fs.existsSync).mockReturnValue(true);
    (fs.readFileSync as any).mockImplementation((filePath: string) => {
      if (filePath === 'config.json') {
        return JSON.stringify({
          prompts: [
            { id: 'file://prompt1.txt', label: 'My first prompt' },
            { id: 'file://prompt2.txt', label: 'My second prompt' },
          ],
          providers: [
            {
              id: 'openai:gpt-4o-mini',
              prompts: ['My first prompt', 'My second prompt'],
            },
            {
              id: 'openai:gpt-4',
              prompts: ['My first prompt'],
            },
          ],
          tests: [{ vars: { topic: 'bananas' } }],
        });
      }
      return '';
    });

    const result = await combineConfigs(['config.json']);

    expect(result.prompts).toEqual([
      {
        id: `file://${path.resolve(path.dirname('config.json'), 'prompt1.txt')}`,
        label: 'My first prompt',
      },
      {
        id: `file://${path.resolve(path.dirname('config.json'), 'prompt2.txt')}`,
        label: 'My second prompt',
      },
    ]);

    expect(result.providers).toEqual([
      {
        id: 'openai:gpt-4o-mini',
        prompts: ['My first prompt', 'My second prompt'],
      },
      {
        id: 'openai:gpt-4',
        prompts: ['My first prompt'],
      },
    ]);
  });

  it('should handle missing config paths', async () => {
    jest.mocked(globSync).mockReturnValue([]);

    await expect(combineConfigs(['nonexistent.json'])).rejects.toThrow(
      'No configuration file found at nonexistent.json',
    );
  });

  it('throws error for unsupported configuration file format', async () => {
    (globSync as any).mockReturnValue(['config.invalid']);

    await expect(combineConfigs(['config.invalid'])).rejects.toThrow(
      'Unsupported configuration file format: .invalid',
    );
  });

  it('merges metadata correctly', async () => {
    (globSync as any).mockImplementation((pathOrGlob: string) => [pathOrGlob]);
    (fs.readFileSync as any).mockImplementation((filePath: string) => {
      if (filePath === 'config1.json') {
        return JSON.stringify({
          defaultTest: {
            metadata: { key1: 'value1' },
          },
        });
      }
      if (filePath === 'config2.json') {
        return JSON.stringify({
          defaultTest: {
            metadata: { key2: 'value2' },
          },
        });
      }
      return '';
    });

    const result = await combineConfigs(['config1.json', 'config2.json']);

    expect(result.defaultTest?.metadata).toEqual({
      key1: 'value1',
      key2: 'value2',
    });
  });
});

describe('dereferenceConfig', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return config as-is when dereferencing is disabled', async () => {
    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest.spyOn(fs, 'readFileSync').mockReturnValue('');

    const rawConfig = {
      prompts: ['Hello world'],
      providers: ['provider1'],
    };

    const result = await dereferenceConfig(rawConfig);
    expect(result).toEqual(rawConfig);
  });

  it('should preserve functions when dereferencing', async () => {
    const rawConfig = {
      prompts: [],
      providers: [
        {
          config: {
            functions: [
              {
                name: 'test',
                parameters: {
                  type: 'object',
                },
              },
            ],
          },
        },
      ],
    };

    const result = await dereferenceConfig(rawConfig);
    expect(result).toEqual(rawConfig);
  });
});

describe('resolveConfigs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  it('should set cliState.basePath', async () => {
    jest.mocked(fs.existsSync).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue(
      JSON.stringify({
        prompts: ['prompt1'],
        providers: ['provider1'],
      }),
    );

    const result = await resolveConfigs({ config: ['config.json'] }, {});

    expect(result).toBeDefined();
    expect(cliState.basePath).toBe(path.dirname('config.json'));
  });

  it('should load scenarios and tests from external files', async () => {
    const externalTests = [
      { vars: { prompt: 'Test 1' }, tests: [] },
      { vars: { prompt: 'Test 2' }, tests: [] },
    ];

    jest.mocked(fs.existsSync).mockReturnValue(true);
    (fs.readFileSync as any).mockReturnValue(
      JSON.stringify({
        prompts: ['{{prompt}}'],
        providers: ['provider1'],
        scenarios: [
          {
            description: 'Test scenario',
            tests: externalTests,
          },
        ],
      }),
    );

    jest.mocked(maybeLoadFromExternalFile).mockResolvedValue(externalTests);

    const result = await resolveConfigs({ config: ['config.json'] }, {});
    expect(result.testSuite.scenarios?.[0].tests).toEqual(externalTests);
  });

  it('should handle missing config paths gracefully', async () => {
    jest.mocked(fs.existsSync).mockReturnValue(false);
    const mockModelOutputs = [{ output: 'test output' }];
    (fs.readFileSync as any).mockReturnValue(JSON.stringify(mockModelOutputs));

    const result = await resolveConfigs(
      {
        output: ['test-output.json'],
        providers: ['provider1'],
        modelOutputs: 'test.json',
        assertions: 'assertions.yaml',
      } as any,
      {},
    );

    expect(result).toBeDefined();
    expect(result.config.providers).toContain('provider1');
    expect(result.config.prompts).toContain('{{output}}');
  });
});
