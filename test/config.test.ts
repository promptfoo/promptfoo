import * as fs from 'fs';
import { globSync } from 'glob';
import * as path from 'path';
import cliState from '../src/cliState';
import { filterTests } from '../src/commands/eval/filterTests';
import { dereferenceConfig, readConfigs, resolveConfigs } from '../src/config';
import { readTests } from '../src/testCases';
import type { UnifiedConfig, TestSuite } from '../src/types';
import { maybeLoadFromExternalFile } from '../src/util';

jest.mock('../src/database', () => ({
  getDb: jest.fn(),
}));

jest.mock('proxy-agent', () => ({
  ProxyAgent: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('glob', () => ({
  globSync: jest.fn(),
}));

jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  statSync: jest.fn(),
  readdirSync: jest.fn(),
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
}));

jest.mock('../src/util', () => ({
  ...jest.requireActual('../src/util'),
  maybeLoadFromExternalFile: jest.fn(),
}));

jest.mock('../src/esm', () => ({
  importModule: jest.fn().mockResolvedValue(
    class CustomApiProvider {
      options: any;
      constructor(options: any) {
        this.options = options;
      }
    },
  ),
}));

jest.mock('../src/testCases', () => ({
  readTests: jest.fn().mockResolvedValue([]),
  readTest: jest.fn().mockResolvedValue({}),
}));

jest.mock('../src/commands/eval/filterTests', () => {
  const actual = jest.requireActual('../src/commands/eval/filterTests');
  return {
    ...actual,
    filterTests: jest.fn(actual.filterTests),
  };
});

describe('readConfigs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reads from existing configs', async () => {
    const config1 = {
      description: 'test1',
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
      commandLineOptions: { verbose: false },
      sharing: true,
    };

    jest.mocked(globSync).mockImplementation((pathOrGlob) => [pathOrGlob].flat());
    jest
      .mocked(fs.readFileSync)
      .mockImplementation(
        (
          path: fs.PathOrFileDescriptor,
          options?: fs.ObjectEncodingOptions | BufferEncoding | null,
        ): string | Buffer => {
          if (typeof path === 'string' && path === 'config1.json') {
            return JSON.stringify(config1);
          } else if (typeof path === 'string' && path === 'config2.json') {
            return JSON.stringify(config2);
          }
          return Buffer.from(''); // Return an empty Buffer instead of null
        },
      )
      .mockReturnValueOnce(JSON.stringify(config1))
      .mockReturnValueOnce(JSON.stringify(config2))
      .mockReturnValueOnce(JSON.stringify(config1))
      .mockReturnValueOnce(JSON.stringify(config2))
      .mockReturnValue(Buffer.from('')); // Return an empty Buffer instead of null

    // Mocks for prompt loading
    jest.mocked(fs.readdirSync).mockReturnValue([]);
    jest.mocked(fs.statSync).mockImplementation(() => {
      throw new Error('File does not exist');
    });

    const config1Result = await readConfigs(['config1.json']);
    expect(config1Result).toEqual({
      description: 'test1',
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
      commandLineOptions: { verbose: true },
      metadata: {},
      sharing: false,
    });

    const config2Result = await readConfigs(['config2.json']);
    expect(config2Result).toEqual({
      description: 'test2',
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
      commandLineOptions: { verbose: false },
      metadata: {},
      sharing: true,
    });

    const result = await readConfigs(['config1.json', 'config2.json']);

    expect(fs.readFileSync).toHaveBeenCalledTimes(4);
    expect(result).toEqual({
      description: 'test1, test2',
      providers: ['provider1', 'provider2'],
      prompts: ['prompt1', 'prompt2'],
      tests: ['test1', 'test2'],
      extensions: [],
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
      commandLineOptions: { verbose: false },
      metadata: {},
      sharing: false,
    });
  });

  it('throws error for unsupported configuration file format', async () => {
    jest.mocked(fs.existsSync).mockReturnValue(true);

    await expect(readConfigs(['config1.unsupported'])).rejects.toThrow(
      'Unsupported configuration file format: .unsupported',
    );
  });

  it('makeAbsolute should resolve file:// syntax and plaintext prompts', async () => {
    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest
      .mocked(fs.readFileSync)
      .mockImplementation(
        (
          path: fs.PathOrFileDescriptor,
          options?: fs.ObjectEncodingOptions | BufferEncoding | null,
        ): string | Buffer => {
          if (typeof path === 'string' && path === 'config1.json') {
            return JSON.stringify({
              description: 'test1',
              prompts: ['file://prompt1.txt', 'prompt2'],
            });
          } else if (typeof path === 'string' && path === 'config2.json') {
            return JSON.stringify({
              description: 'test2',
              prompts: ['file://prompt3.txt', 'prompt4'],
            });
          }
          return Buffer.from(''); // Return an empty Buffer instead of null
        },
      );

    const configPaths = ['config1.json', 'config2.json'];
    const result = await readConfigs(configPaths);

    expect(result.prompts).toEqual([
      `file://${path.resolve(path.dirname(configPaths[0]), 'prompt1.txt')}`,
      'prompt2',
      `file://${path.resolve(path.dirname(configPaths[1]), 'prompt3.txt')}`,
      'prompt4',
    ]);
  });

  it('de-duplicates prompts when reading configs', async () => {
    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest
      .mocked(fs.readFileSync)
      .mockImplementation(
        (
          path: fs.PathOrFileDescriptor,
          options?: fs.ObjectEncodingOptions | BufferEncoding | null,
        ): string | Buffer => {
          if (typeof path === 'string' && path === 'config1.json') {
            return JSON.stringify({
              description: 'test1',
              prompts: ['prompt1', 'file://prompt2.txt', 'prompt3'],
            });
          } else if (typeof path === 'string' && path === 'config2.json') {
            return JSON.stringify({
              description: 'test2',
              prompts: ['prompt3', 'file://prompt2.txt', 'prompt4'],
            });
          }
          return Buffer.from(''); // Return an empty Buffer instead of null
        },
      );

    const configPaths = ['config1.json', 'config2.json'];
    const result = await readConfigs(configPaths);

    expect(result.prompts).toEqual([
      'prompt1',
      `file://${path.resolve(path.dirname(configPaths[0]), 'prompt2.txt')}`,
      'prompt3',
      'prompt4',
    ]);
  });

  it('merges metadata correctly', async () => {
    const config1 = {
      defaultTest: {
        metadata: { key1: 'value1' },
      },
    };
    const config2 = {
      defaultTest: {
        metadata: { key2: 'value2' },
      },
    };

    jest
      .mocked(fs.readFileSync)
      .mockReturnValueOnce(JSON.stringify(config1))
      .mockReturnValueOnce(JSON.stringify(config2));

    const result = await readConfigs(['config1.json', 'config2.json']);

    expect(result.defaultTest?.metadata).toEqual({
      key1: 'value1',
      key2: 'value2',
    });
  });

  it('combines extensions from multiple configs', async () => {
    const config1 = {
      extensions: ['extension1', 'extension2'],
    };
    const config2 = {
      extensions: ['extension3'],
    };

    jest
      .mocked(fs.readFileSync)
      .mockReturnValueOnce(JSON.stringify(config1))
      .mockReturnValueOnce(JSON.stringify(config2));
    jest.spyOn(console, 'warn').mockImplementation();

    const result = await readConfigs(['config1.json', 'config2.json']);

    expect(result.extensions).toEqual(['extension1', 'extension2', 'extension3']);
  });

  it('handles configs without extensions', async () => {
    const config1 = {
      description: 'Config without extensions',
    };
    const config2 = {
      extensions: ['extension1'],
    };

    jest
      .mocked(fs.readFileSync)
      .mockReturnValueOnce(JSON.stringify(config1))
      .mockReturnValueOnce(JSON.stringify(config2));

    const result = await readConfigs(['config1.json', 'config2.json']);

    expect(result.extensions).toEqual(['extension1']);
  });

  it('warns when multiple configs and extensions are detected', async () => {
    jest
      .mocked(fs.readFileSync)
      .mockReturnValueOnce(
        JSON.stringify({
          extensions: ['extension1'],
        }),
      )
      .mockReturnValueOnce(
        JSON.stringify({
          extensions: ['extension2'],
        }),
      );

    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

    await readConfigs(['config1.json', 'config2.json']);

    expect(consoleSpy).toHaveBeenCalledWith(
      'Warning: Multiple configurations and extensions detected. Currently, all extensions are run across all configs and do not respect their original promptfooconfig. Please file an issue on our GitHub repository if you need support for this use case.',
    );

    consoleSpy.mockRestore();
  });

  it('warns when multiple extensions are detected and multiple configs are provided', async () => {
    jest
      .mocked(fs.readFileSync)
      .mockReturnValueOnce(
        JSON.stringify({
          extensions: ['extension1', 'extension2'],
        }),
      )
      .mockReturnValueOnce(
        JSON.stringify({
          description: 'Config without extensions',
        }),
      );

    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

    await readConfigs(['config1.json', 'config2.json']);

    expect(consoleSpy).toHaveBeenCalledWith(
      'Warning: Multiple configurations and extensions detected. Currently, all extensions are run across all configs and do not respect their original promptfooconfig. Please file an issue on our GitHub repository if you need support for this use case.',
    );
    consoleSpy.mockRestore();
  });
});

describe('dereferenceConfig', () => {
  it('should dereference a config with no $refs', async () => {
    const rawConfig = {
      prompts: ['Hello world'],
      description: 'Test config',
      providers: ['provider1'],
      tests: ['test1'],
      evaluateOptions: {},
      commandLineOptions: {},
    };
    const dereferencedConfig = await dereferenceConfig(rawConfig);
    expect(dereferencedConfig).toEqual(rawConfig);
  });

  it('should dereference a config with $refs', async () => {
    const rawConfig = {
      prompts: [],
      tests: [],
      evaluateOptions: {},
      commandLineOptions: {},
      providers: [{ $ref: '#/definitions/provider' }],
      definitions: {
        provider: {
          name: 'provider1',
          config: { setting: 'value' },
        },
      },
    };
    const expectedConfig = {
      prompts: [],
      tests: [],
      evaluateOptions: {},
      commandLineOptions: {},
      providers: [{ name: 'provider1', config: { setting: 'value' } }],
      definitions: {
        provider: {
          name: 'provider1',
          config: { setting: 'value' },
        },
      },
    };
    const dereferencedConfig = await dereferenceConfig(rawConfig as UnifiedConfig);
    expect(dereferencedConfig).toEqual(expectedConfig);
  });

  it('should preserve regular functions when dereferencing', async () => {
    const rawConfig = {
      description: 'Test config with function parameters',
      prompts: [],
      tests: [],
      evaluateOptions: {},
      commandLineOptions: {},
      providers: [
        {
          name: 'provider1',
          config: {
            functions: [
              {
                name: 'function1',
                parameters: { param1: 'value1' },
              },
            ],
            tools: [
              {
                function: {
                  name: 'toolFunction1',
                  parameters: { param2: 'value2' },
                },
              },
            ],
          },
        },
      ],
    };
    const dereferencedConfig = await dereferenceConfig(rawConfig as UnifiedConfig);
    expect(dereferencedConfig).toEqual(rawConfig);
  });

  it('should preserve tools with references and definitions when dereferencing', async () => {
    const rawConfig = {
      prompts: [{ $ref: '#/definitions/prompt' }],
      tests: [],
      evaluateOptions: {},
      commandLineOptions: {},
      providers: [
        {
          name: 'openai:gpt-4',
          config: {
            tools: [
              {
                type: 'function',
                function: {
                  name: 'kubectl_describe',
                  parameters: {
                    $defs: {
                      KubernetesResourceKind: {
                        enum: ['deployment', 'node'],
                        title: 'KubernetesResourceKind',
                        type: 'string',
                      },
                    },
                    properties: {
                      kind: { $ref: '#/$defs/KubernetesResourceKind' },
                      namespace: {
                        anyOf: [{ type: 'string' }, { type: 'null' }],
                        default: null,
                        title: 'Namespace',
                      },
                      name: { title: 'Name', type: 'string' },
                    },
                    required: ['kind', 'name'],
                    title: 'KubectlDescribe',
                    type: 'object',
                  },
                },
              },
            ],
          },
        },
      ],
      definitions: {
        prompt: 'hello world',
      },
    };
    const dereferencedConfig = await dereferenceConfig(rawConfig as unknown as UnifiedConfig);
    const expectedOutput = {
      prompts: ['hello world'],
      tests: [],
      evaluateOptions: {},
      commandLineOptions: {},
      providers: [
        {
          name: 'openai:gpt-4',
          config: {
            tools: [
              {
                type: 'function',
                function: {
                  name: 'kubectl_describe',
                  parameters: {
                    $defs: {
                      KubernetesResourceKind: {
                        enum: ['deployment', 'node'],
                        title: 'KubernetesResourceKind',
                        type: 'string',
                      },
                    },
                    properties: {
                      kind: { $ref: '#/$defs/KubernetesResourceKind' },
                      namespace: {
                        anyOf: [{ type: 'string' }, { type: 'null' }],
                        default: null,
                        title: 'Namespace',
                      },
                      name: { title: 'Name', type: 'string' },
                    },
                    required: ['kind', 'name'],
                    title: 'KubectlDescribe',
                    type: 'object',
                  },
                },
              },
            ],
          },
        },
      ],
      definitions: {
        prompt: 'hello world',
      },
    };
    expect(dereferencedConfig).toEqual(expectedOutput);
  });

  it('should preserve handle string functions/tools when dereferencing', async () => {
    const rawConfig = {
      description: 'Test config with function parameters',
      prompts: [],
      tests: [],
      evaluateOptions: {},
      commandLineOptions: {},
      providers: [
        {
          name: 'provider2',
          config: {
            functions: 'file://external_functions.yaml',
            tools: 'file://external_tools.yaml',
          },
        },
      ],
    };
    const dereferencedConfig = await dereferenceConfig(rawConfig as UnifiedConfig);
    expect(dereferencedConfig).toEqual(rawConfig);
  });
});

describe('resolveConfigs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should set cliState.basePath', async () => {
    const cmdObj = { config: ['config.json'] };
    const defaultConfig = {};

    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        prompts: ['prompt1'],
        providers: ['provider1'],
      }),
    );

    await resolveConfigs(cmdObj, defaultConfig);

    expect(cliState.basePath).toBe(path.dirname('config.json'));
  });

  it('should load scenarios from external file', async () => {
    const cmdObj = { config: ['config.json'] };
    const defaultConfig = {};
    const externalScenarios = [
      { description: 'Scenario 1', tests: ['test1.json'] },
      { description: 'Scenario 2', tests: ['test2.json'] },
    ];

    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        prompts: ['prompt1'],
        providers: ['provider1'],
        scenarios: 'scenarios.json',
      }),
    );
    jest.mocked(maybeLoadFromExternalFile).mockResolvedValueOnce(externalScenarios);

    // Mock readTests to return an empty array for each scenario
    jest.mocked(readTests).mockResolvedValue([]);

    const { testSuite } = (await resolveConfigs(cmdObj, defaultConfig)) as { testSuite: TestSuite };

    expect(maybeLoadFromExternalFile).toHaveBeenCalledWith(['scenarios.json']);
    expect(testSuite.scenarios).toEqual(externalScenarios);
  });

  it('should load scenario tests from external file', async () => {
    const cmdObj = { config: ['config.json'] };
    const defaultConfig = {};
    const scenarios = [
      { description: 'Scenario 1', tests: 'tests1.json' },
      { description: 'Scenario 2', tests: 'tests2.json' },
    ];
    const externalTests1 = [{ vars: { var1: 'value1' } }];
    const externalTests2 = [{ vars: { var2: 'value2' } }];

    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        prompts: ['prompt1'],
        providers: ['provider1'],
        scenarios,
      }),
    );
    jest.mocked(maybeLoadFromExternalFile).mockResolvedValueOnce(scenarios);

    // Mock readTests to return the external tests
    jest
      .mocked(readTests)
      .mockResolvedValueOnce(externalTests1)
      .mockResolvedValueOnce(externalTests2);

    const { testSuite } = (await resolveConfigs(cmdObj, defaultConfig)) as { testSuite: TestSuite };

    expect(readTests).toHaveBeenCalledWith('tests1.json', expect.anything());
    expect(readTests).toHaveBeenCalledWith('tests2.json', expect.anything());
    expect(testSuite.scenarios?.[0].tests).toEqual(externalTests1);
    expect(testSuite.scenarios?.[1].tests).toEqual(externalTests2);
  });
});

describe('resolveConfigs for scenarios', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest.mocked(filterTests).mockImplementation(async (scenario) => scenario.tests);
  });

  it('should load nested scenarios from external files', async () => {
    const cmdObj = { config: ['config.json'] };
    const defaultConfig = {};
    const mainScenarios = [{ description: 'Main Scenario', scenarios: 'nested_scenarios.json' }];
    const nestedScenarios = [
      { description: 'Nested Scenario 1', tests: 'nested_tests1.json' },
      { description: 'Nested Scenario 2', tests: 'nested_tests2.json' },
    ];
    const nestedTests1 = [{ vars: { var1: 'value1' } }];
    const nestedTests2 = [{ vars: { var2: 'value2' } }];

    jest.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        prompts: ['prompt1'],
        providers: ['provider1'],
        scenarios: mainScenarios,
      }),
    );
    jest
      .mocked(maybeLoadFromExternalFile)
      .mockResolvedValueOnce(mainScenarios)
      .mockResolvedValueOnce(nestedScenarios)
      .mockResolvedValueOnce(nestedTests1)
      .mockResolvedValueOnce(nestedTests2);

    jest.mocked(readTests).mockResolvedValueOnce(nestedTests1).mockResolvedValueOnce(nestedTests2);

    const { testSuite } = (await resolveConfigs(cmdObj, defaultConfig)) as { testSuite: TestSuite };

    expect(maybeLoadFromExternalFile).toHaveBeenCalledWith('nested_scenarios.json');
    expect(readTests).toHaveBeenCalledWith('nested_tests1.json', expect.anything());
    expect(readTests).toHaveBeenCalledWith('nested_tests2.json', expect.anything());
  });

  it('should handle errors when loading scenarios from non-existent files', async () => {
    const cmdObj = { config: ['config.json'] };
    const defaultConfig = {};
    const scenarios = [{ description: 'Scenario 1', tests: 'non_existent_tests.json' }];

    jest.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        prompts: ['prompt1'],
        providers: ['provider1'],
        scenarios,
      }),
    );
    jest.mocked(maybeLoadFromExternalFile).mockResolvedValueOnce(scenarios);
    jest.mocked(readTests).mockRejectedValueOnce(new Error('File not found'));

    await expect(resolveConfigs(cmdObj, defaultConfig)).rejects.toThrow('File not found');
  });

  it('should apply filters to scenario tests', async () => {
    const cmdObj = { config: ['config.json'], filterPattern: 'test' };
    const defaultConfig = {};
    const scenarios = [
      {
        description: 'Scenario 1',
        tests: [{ vars: { var1: 'value1' } }, { vars: { var2: 'value2' } }],
      },
    ];

    jest.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        prompts: ['prompt1'],
        providers: ['provider1'],
        scenarios,
      }),
    );
    jest.mocked(maybeLoadFromExternalFile).mockResolvedValueOnce(scenarios);
    jest.mocked(filterTests).mockResolvedValueOnce([{ vars: { var1: 'value1' } }]);

    const { testSuite } = (await resolveConfigs(cmdObj, defaultConfig)) as { testSuite: TestSuite };

    expect(filterTests).toHaveBeenCalledWith(
      {
        description: "Scenario 1",
        prompts: [{"config": undefined, "label": "prompt1", "raw": "prompt1"}],
        providers: [{"delay": undefined, "label": undefined, "options": {}, "transform": undefined}],
        tests: [{"vars": {"var1": "value1"}}, {"vars": {"var2": "value2"}}],
      },
      {
        failing: undefined,
        firstN: undefined,
        pattern: "test",
      }
    );
    expect(testSuite.scenarios?.[0].tests).toEqual([{ vars: { var1: 'value1' } }]);
  });

  it('should handle scenarios with a mix of inline and external tests', async () => {
    const cmdObj = { config: ['config.json'] };
    const defaultConfig = {};
    const scenarios = [
      { description: 'Scenario 1', tests: [{ vars: { var1: 'inline' } }, 'external_tests.json'] },
    ];
    const externalTests = [{ vars: { var2: 'external' } }];

    jest.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        prompts: ['prompt1'],
        providers: ['provider1'],
        scenarios,
      }),
    );
    jest.mocked(maybeLoadFromExternalFile).mockResolvedValueOnce(scenarios);
    jest.mocked(readTests).mockResolvedValueOnce(externalTests);

    const { testSuite } = (await resolveConfigs(cmdObj, defaultConfig)) as { testSuite: TestSuite };

    expect(readTests).toHaveBeenCalledWith('external_tests.json', expect.anything());
    expect(testSuite.scenarios?.[0].tests).toEqual([
      { vars: { var1: 'inline' } },
      { vars: { var2: 'external' } },
    ]);
  });
});
