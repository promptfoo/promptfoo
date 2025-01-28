import $RefParser from '@apidevtools/json-schema-ref-parser';
import * as fs from 'fs';
import { globSync } from 'glob';
import yaml from 'js-yaml';
import * as path from 'path';
import cliState from '../../../src/cliState';
import { importModule } from '../../../src/esm';
import logger from '../../../src/logger';
import { readTests } from '../../../src/testCases';
import type { UnifiedConfig } from '../../../src/types';
import { maybeLoadFromExternalFile } from '../../../src/util';
import {
  dereferenceConfig,
  readConfig,
  resolveConfigs,
  combineConfigs,
} from '../../../src/util/config/load';

jest.mock('../../../src/database', () => ({
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

jest.mock('../../../src/util', () => {
  const originalModule = jest.requireActual('../../../src/util');
  return {
    ...originalModule,
    maybeLoadFromExternalFile: jest.fn(originalModule.maybeLoadFromExternalFile),
  };
});

jest.mock('../../../src/esm', () => ({
  importModule: jest.fn(),
}));

jest.mock('../../../src/testCases', () => {
  const originalModule = jest.requireActual('../../../src/testCases');
  return {
    ...originalModule,
    readTests: jest.fn(originalModule.readTests),
  };
});

jest.mock('../../../src/logger', () => ({
  default: {
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
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

    expect(fs.readFileSync).toHaveBeenCalledTimes(4);
    expect(result).toEqual({
      description: 'test1, test2',
      tags: { tag1: 'value1' },
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
      outputPath: [],
      commandLineOptions: { verbose: false },
      metadata: {},
      sharing: false,
    });
  });

  it('combines configs with provider-specific prompts', async () => {
    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest.mocked(fs.readFileSync).mockImplementation((path: fs.PathOrFileDescriptor) => {
      if (typeof path === 'string' && path === 'config.json') {
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
      return Buffer.from('');
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

    expect(result.tests?.[0]).toEqual({ vars: { topic: 'bananas' } });
  });

  it('throws error for unsupported configuration file format', async () => {
    jest.mocked(fs.existsSync).mockReturnValue(true);

    await expect(combineConfigs(['config1.unsupported'])).rejects.toThrow(
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
    const result = await combineConfigs(configPaths);

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
    const result = await combineConfigs(configPaths);

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

    const result = await combineConfigs(['config1.json', 'config2.json']);

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

    const result = await combineConfigs(['config1.json', 'config2.json']);

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

    const result = await combineConfigs(['config1.json', 'config2.json']);

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

    await combineConfigs(['config1.json', 'config2.json']);

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

    await combineConfigs(['config1.json', 'config2.json']);

    expect(consoleSpy).toHaveBeenCalledWith(
      'Warning: Multiple configurations and extensions detected. Currently, all extensions are run across all configs and do not respect their original promptfooconfig. Please file an issue on our GitHub repository if you need support for this use case.',
    );
    consoleSpy.mockRestore();
  });

  it('should only set redteam config when at least one individual config has redteam settings', async () => {
    jest
      .mocked(fs.readFileSync)
      .mockReturnValueOnce(
        JSON.stringify({
          description: 'Config without redteam',
          providers: ['provider1'],
        }),
      )
      .mockReturnValueOnce(
        JSON.stringify({
          description: 'Config with redteam',
          providers: ['provider2'],
          redteam: {
            plugins: ['plugin1'],
            strategies: ['strategy1'],
          },
        }),
      )
      .mockReturnValueOnce(
        JSON.stringify({
          description: 'Another config without redteam',
          providers: ['provider3'],
        }),
      );

    const result = await combineConfigs(['config1.json', 'config2.json', 'config3.json']);

    expect(result.redteam).toBeDefined();
    expect(result.redteam).toEqual({
      plugins: ['plugin1'],
      strategies: ['strategy1'],
    });
  });

  it('should not set redteam config when no individual configs have redteam settings', async () => {
    jest
      .mocked(fs.readFileSync)
      .mockReturnValueOnce(
        JSON.stringify({
          description: 'Config without redteam',
          providers: ['provider1'],
        }),
      )
      .mockReturnValueOnce(
        JSON.stringify({
          description: 'Another config without redteam',
          providers: ['provider2'],
        }),
      );

    const result = await combineConfigs(['config1.json', 'config2.json']);

    expect(result.redteam).toBeUndefined();
  });

  it('should combine redteam entities from multiple configs', async () => {
    const config1 = {
      prompts: ['prompt1'],
      providers: ['provider1'],
      redteam: {
        entities: ['entity1', 'entity2'],
        plugins: ['plugin1'],
        strategies: ['strategy1'],
      },
    };
    const config2 = {
      prompts: ['prompt2'],
      providers: ['provider2'],
      redteam: {
        entities: ['entity2', 'entity3'],
        plugins: ['plugin2'],
        strategies: ['strategy2'],
      },
    };

    jest
      .mocked(fs.readFileSync)
      .mockReturnValueOnce(JSON.stringify(config1))
      .mockReturnValueOnce(JSON.stringify(config2));

    const result = await combineConfigs(['config1.json', 'config2.json']);

    expect(result.redteam).toEqual({
      entities: ['entity1', 'entity2', 'entity3'],
      plugins: ['plugin1', 'plugin2'],
      strategies: ['strategy1', 'strategy2'],
    });
  });

  it('should handle redteam config with undefined arrays', async () => {
    const config1 = {
      prompts: ['prompt1'],
      providers: ['provider1'],
      redteam: {
        entities: undefined,
        plugins: ['plugin1'],
        strategies: undefined,
      },
    };
    const config2 = {
      prompts: ['prompt2'],
      providers: ['provider2'],
      redteam: {
        entities: ['entity1'],
        plugins: undefined,
        strategies: ['strategy1'],
      },
    };

    jest
      .mocked(fs.readFileSync)
      .mockReturnValueOnce(JSON.stringify(config1))
      .mockReturnValueOnce(JSON.stringify(config2));

    const result = await combineConfigs(['config1.json', 'config2.json']);

    expect(result.redteam).toEqual({
      entities: ['entity1'],
      plugins: ['plugin1'],
      strategies: ['strategy1'],
    });
  });

  it('should preserve non-array redteam properties', async () => {
    const config1 = {
      prompts: ['prompt1'],
      providers: ['provider1'],
      redteam: {
        entities: ['entity1'],
        plugins: ['plugin1'],
        strategies: ['strategy1'],
        delay: 1000,
        language: 'en',
        provider: 'openai:gpt-4',
      },
    };
    const config2 = {
      prompts: ['prompt2'],
      providers: ['provider2'],
      redteam: {
        entities: ['entity2'],
        plugins: ['plugin2'],
        strategies: ['strategy2'],
        delay: 2000,
        purpose: 'testing',
      },
    };

    jest
      .mocked(fs.readFileSync)
      .mockReturnValueOnce(JSON.stringify(config1))
      .mockReturnValueOnce(JSON.stringify(config2));

    const result = await combineConfigs(['config1.json', 'config2.json']);

    expect(result.redteam).toEqual({
      entities: ['entity1', 'entity2'],
      plugins: ['plugin1', 'plugin2'],
      strategies: ['strategy1', 'strategy2'],
      delay: 2000,
      language: 'en',
      provider: 'openai:gpt-4',
      purpose: 'testing',
    });
  });

  it('should handle empty redteam arrays', async () => {
    const config1 = {
      prompts: ['prompt1'],
      providers: ['provider1'],
      redteam: {
        entities: [],
        plugins: ['plugin1'],
        strategies: [],
      },
    };
    const config2 = {
      prompts: ['prompt2'],
      providers: ['provider2'],
      redteam: {
        entities: ['entity1'],
        plugins: [],
        strategies: ['strategy1'],
      },
    };

    jest
      .mocked(fs.readFileSync)
      .mockReturnValueOnce(JSON.stringify(config1))
      .mockReturnValueOnce(JSON.stringify(config2));

    const result = await combineConfigs(['config1.json', 'config2.json']);

    expect(result.redteam).toEqual({
      entities: ['entity1'],
      plugins: ['plugin1'],
      strategies: ['strategy1'],
    });
  });

  it('should merge shared object from multiple configs with urls', async () => {
    const config1 = {
      sharing: {
        apiBaseUrl: 'http://localhost',
        appBaseUrl: 'http://localhost',
      },
    };
    const config2 = {};

    jest
      .mocked(fs.readFileSync)
      .mockReturnValueOnce(JSON.stringify(config1))
      .mockReturnValueOnce(JSON.stringify(config2));

    const result = await combineConfigs(['config1.json', 'config2.json']);

    expect(result.sharing).toEqual({
      apiBaseUrl: 'http://localhost',
      appBaseUrl: 'http://localhost',
    });
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
        providers: ['openai:foobar'],
      }),
    );

    await resolveConfigs(cmdObj, defaultConfig);

    expect(cliState.basePath).toBe(path.dirname('config.json'));
  });

  it('should load scenarios and tests from external files', async () => {
    const cmdObj = { config: ['config.json'] };
    const defaultConfig = {};
    const scenarios = [{ description: 'Scenario', tests: 'file://tests.yaml' }];
    const externalTests = [
      { vars: { testPrompt: 'What services do you offer?' } },
      { vars: { testPrompt: 'How can I confirm an order?' } },
    ];

    const prompt =
      'You are a helpful assistant. You are given a prompt and you must answer it. {{testPrompt}}';
    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        prompts: [prompt],
        providers: ['openai:gpt-4'],
        scenarios: 'file://scenarios.yaml',
      }),
    );

    // Mock maybeLoadFromExternalFile to return scenarios and tests
    jest
      .mocked(maybeLoadFromExternalFile)
      .mockResolvedValueOnce(scenarios) // For scenarios.yaml
      .mockResolvedValueOnce(externalTests); // For tests.yaml

    // Mock readTests to return the external tests
    jest.mocked(readTests).mockResolvedValue(externalTests);

    jest.mocked(globSync).mockReturnValue(['config.json']);

    const { testSuite } = await resolveConfigs(cmdObj, defaultConfig);

    expect(maybeLoadFromExternalFile).toHaveBeenCalledWith(['file://scenarios.yaml']);
    expect(maybeLoadFromExternalFile).toHaveBeenCalledWith('file://tests.yaml');
    expect(testSuite).toEqual(
      expect.objectContaining({
        prompts: [
          {
            raw: prompt,
            label: prompt,
            config: undefined,
          },
        ],
        providers: expect.arrayContaining([
          expect.objectContaining({
            modelName: 'gpt-4',
          }),
        ]),
        scenarios: ['file://scenarios.yaml'],
        tests: externalTests,
        defaultTest: {
          assert: [],
          metadata: {},
          options: {},
          vars: {},
        },
        derivedMetrics: undefined,
        extensions: [],
        nunjucksFilters: {},
        providerPromptMap: {},
      }),
    );
  });
});

describe('readConfig', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should read JSON config file', async () => {
    const mockConfig = {
      description: 'Test config',
      providers: ['openai:gpt-4o'],
      prompts: ['Hello, world!'],
    };
    jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(mockConfig));
    jest.spyOn(path, 'parse').mockReturnValue({ ext: '.json' } as any);

    const result = await readConfig('config.json');

    expect(result).toEqual(mockConfig);
    expect(fs.readFileSync).toHaveBeenCalledWith('config.json', 'utf-8');
  });

  it('should read YAML config file', async () => {
    const mockConfig = {
      description: 'Test config',
      providers: ['openai:gpt-4o'],
      prompts: ['Hello, world!'],
    };
    jest.spyOn(fs, 'readFileSync').mockReturnValue(yaml.dump(mockConfig));
    jest.spyOn(path, 'parse').mockReturnValue({ ext: '.yaml' } as any);

    const result = await readConfig('config.yaml');

    expect(result).toEqual(mockConfig);
    expect(fs.readFileSync).toHaveBeenCalledWith('config.yaml', 'utf-8');
  });

  it('should read JavaScript config file', async () => {
    const mockConfig = {
      description: 'Test config',
      providers: ['openai:gpt-4o'],
      prompts: ['Hello, world!'],
    };

    jest.spyOn(path, 'parse').mockReturnValue({ ext: '.js' } as any);
    jest.mocked(importModule).mockResolvedValue(mockConfig);

    const result = await readConfig('config.js');

    expect(result).toEqual(mockConfig);
    expect(importModule).toHaveBeenCalledWith('config.js');
  });

  it('should throw error for unsupported file format', async () => {
    jest.spyOn(path, 'parse').mockReturnValue({ ext: '.txt' } as any);

    await expect(readConfig('config.txt')).rejects.toThrow(
      'Unsupported configuration file format: .txt',
    );
  });

  it('should rewrite targets to providers', async () => {
    const mockConfig = {
      description: 'Test config',
      targets: ['openai:gpt-4o'],
      prompts: ['Hello, world!'],
    };
    jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(mockConfig));
    jest.spyOn(path, 'parse').mockReturnValue({ ext: '.json' } as any);

    const result = await readConfig('config.json');

    expect(result).toEqual({
      description: 'Test config',
      providers: ['openai:gpt-4o'],
      prompts: ['Hello, world!'],
    });
  });

  it('should rewrite plugins and strategies to redteam', async () => {
    const mockConfig = {
      description: 'Test config',
      providers: ['openai:gpt-4o'],
      prompts: ['Hello, world!'],
      plugins: ['plugin1'],
      strategies: ['strategy1'],
    };
    jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(mockConfig));
    jest.spyOn(path, 'parse').mockReturnValue({ ext: '.json' } as any);

    const result = await readConfig('config.json');

    expect(result).toEqual({
      description: 'Test config',
      providers: ['openai:gpt-4o'],
      prompts: ['Hello, world!'],
      redteam: {
        plugins: ['plugin1'],
        strategies: ['strategy1'],
      },
    });
  });

  it('should set default prompt when no prompts are provided', async () => {
    const mockConfig = {
      description: 'Test config',
      providers: ['openai:gpt-4o'],
      tests: [
        { vars: { someVar: 'value', prompt: 'abc' } },
        { vars: { anotherVar: 'anotherValue', prompt: 'yo mama' } },
      ],
    };
    jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(mockConfig));
    jest.spyOn(path, 'parse').mockReturnValue({ ext: '.json' } as any);

    const result = await readConfig('config.json');

    expect(result).toEqual({
      ...mockConfig,
      prompts: ['{{prompt}}'],
    });
  });

  it('should resolve YAML references before validation', async () => {
    const mockConfig = {
      description: 'test_config',
      prompts: ['test {{text}}'],
      providers: [{ $ref: 'defaultParams.yaml#/model' }],
      temperature: 1,
      tests: [{ vars: { text: 'test text' } }],
    };

    const dereferencedConfig = {
      description: 'test_config',
      prompts: ['test {{text}}'],
      providers: ['echo'],
      temperature: 1,
      tests: [{ vars: { text: 'test text' } }],
    };

    jest.mocked(fs.readFileSync).mockReturnValue(yaml.dump(mockConfig));
    jest.spyOn($RefParser.prototype, 'dereference').mockResolvedValue(dereferencedConfig);

    const result = await readConfig('config.yaml');
    expect(result).toEqual(dereferencedConfig);
    expect(fs.readFileSync).toHaveBeenCalledWith('config.yaml', 'utf-8');
  });

  it('should throw validation error for invalid dereferenced config', async () => {
    const mockConfig = {
      description: 'invalid_config',
      providers: [{ $ref: 'defaultParams.yaml#/invalidKey' }],
    };

    const dereferencedConfig = {
      description: 'invalid_config',
      providers: [{ invalid: true }], // This will fail validation
    };

    jest.mocked(fs.readFileSync).mockReturnValue(yaml.dump(mockConfig));
    jest.spyOn($RefParser.prototype, 'dereference').mockResolvedValue(dereferencedConfig);
    jest.mocked(fs.existsSync).mockReturnValue(true);

    await readConfig('config.yaml');

    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn).toHaveBeenCalledWith(
      'Invalid configuration file config.yaml:\nValidation error: Unrecognized key(s) in object: \'invalid\' at "providers[0]"',
    );
    const calls = jest.mocked(logger.warn).mock.calls;
    expect(calls[0][0]).toContain('Invalid configuration file');
  });
});
