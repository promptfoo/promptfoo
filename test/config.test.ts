import * as fs from 'fs';
import { globSync } from 'glob';
import * as path from 'path';
import { dereferenceConfig, readConfigs } from '../src/config';
import { UnifiedConfig } from '../src/types';

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

jest.mock('../src/database');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('readConfigs', () => {
  it('reads from existing configs', async () => {
    const config1 = {
      description: 'test1',
      providers: ['provider1'],
      prompts: ['prompt1'],
      tests: ['test1'],
      scenarios: ['scenario1'],
      defaultTest: {
        description: 'defaultTest1',
        vars: { var1: 'value1' },
        assert: [{ type: 'equals', value: 'expected1' }],
      },
      nunjucksFilters: { filter1: 'filter1' },
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
        vars: { var2: 'value2' },
        assert: [{ type: 'equals', value: 'expected2' }],
      },
      nunjucksFilters: { filter2: 'filter2' },
      env: { envVar2: 'envValue2' },
      evaluateOptions: { maxConcurrency: 2 },
      commandLineOptions: { verbose: false },
      sharing: true,
    };

    jest.mocked(globSync).mockImplementation((pathOrGlob) => [pathOrGlob]);
    jest
      .mocked(fs.readFileSync)
      .mockReturnValueOnce(JSON.stringify(config1))
      .mockReturnValueOnce(JSON.stringify(config2))
      .mockReturnValueOnce(JSON.stringify(config1))
      .mockReturnValueOnce(JSON.stringify(config2))
      .mockReturnValue('you should not see this');

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
      tests: ['test1'],
      scenarios: ['scenario1'],
      defaultTest: {
        description: 'defaultTest1',
        options: {},
        vars: { var1: 'value1' },
        assert: [{ type: 'equals', value: 'expected1' }],
      },
      nunjucksFilters: { filter1: 'filter1' },
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
      tests: ['test2'],
      scenarios: ['scenario2'],
      defaultTest: {
        description: 'defaultTest2',
        options: {},
        vars: { var2: 'value2' },
        assert: [{ type: 'equals', value: 'expected2' }],
      },
      nunjucksFilters: { filter2: 'filter2' },
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
      scenarios: ['scenario1', 'scenario2'],
      defaultTest: {
        description: 'defaultTest2',
        options: {},
        vars: { var1: 'value1', var2: 'value2' },
        assert: [
          { type: 'equals', value: 'expected1' },
          { type: 'equals', value: 'expected2' },
        ],
      },
      nunjucksFilters: { filter1: 'filter1', filter2: 'filter2' },
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
    jest.mocked(fs.readFileSync).mockImplementation((path: string) => {
      if (path === 'config1.json') {
        return JSON.stringify({
          description: 'test1',
          prompts: ['file://prompt1.txt', 'prompt2'],
        });
      } else if (path === 'config2.json') {
        return JSON.stringify({
          description: 'test2',
          prompts: ['file://prompt3.txt', 'prompt4'],
        });
      }
      return null;
    });

    const configPaths = ['config1.json', 'config2.json'];
    const result = await readConfigs(configPaths);

    expect(result.prompts).toEqual([
      'file://' + path.resolve(path.dirname(configPaths[0]), 'prompt1.txt'),
      'prompt2',
      'file://' + path.resolve(path.dirname(configPaths[1]), 'prompt3.txt'),
      'prompt4',
    ]);
  });

  it('dedupes prompts when reading configs', async () => {
    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest.mocked(fs.readFileSync).mockImplementation((path: string) => {
      if (path === 'config1.json') {
        return JSON.stringify({
          description: 'test1',
          prompts: ['prompt1', 'file://prompt2.txt', 'prompt3'],
        });
      } else if (path === 'config2.json') {
        return JSON.stringify({
          description: 'test2',
          prompts: ['prompt3', 'file://prompt2.txt', 'prompt4'],
        });
      }
      return null;
    });

    const configPaths = ['config1.json', 'config2.json'];
    const result = await readConfigs(configPaths);

    expect(result.prompts).toEqual([
      'prompt1',
      'file://' + path.resolve(path.dirname(configPaths[0]), 'prompt2.txt'),
      'prompt3',
      'prompt4',
    ]);
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
});
