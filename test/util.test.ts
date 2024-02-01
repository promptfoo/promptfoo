import * as fs from 'fs';
import * as path from 'path';

import { globSync } from 'glob';

import yaml from 'js-yaml';

import {
  dereferenceConfig,
  maybeRecordFirstRun,
  readConfigs,
  readFilters,
  readGlobalConfig,
  resetGlobalConfig,
  writeMultipleOutputs,
  writeOutput,
} from '../src/util';

import type { EvaluateResult, EvaluateTable, UnifiedConfig } from '../src/types';

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

jest.mock('../src/esm');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('util', () => {
  test('writeOutput with CSV output', () => {
    const outputPath = 'output.csv';
    const results: EvaluateResult[] = [
      {
        success: true,
        score: 1.0,
        namedScores: {},
        latencyMs: 1000,
        provider: {
          id: 'foo',
        },
        prompt: {
          raw: 'Test prompt',
          display: '[display] Test prompt',
        },
        response: {
          output: 'Test output',
        },
        vars: {
          var1: 'value1',
          var2: 'value2',
        },
      },
    ];
    const table: EvaluateTable = {
      head: {
        prompts: [{ raw: 'Test prompt', display: '[display] Test prompt', provider: 'foo' }],
        vars: ['var1', 'var2'],
      },
      body: [
        {
          outputs: [
            {
              pass: true,
              score: 1.0,
              namedScores: {},
              text: 'Test output',
              prompt: 'Test prompt',
              latencyMs: 1000,
              cost: 0,
            },
          ],
          vars: ['value1', 'value2'],
          test: {},
        },
      ],
    };
    const summary = {
      version: 1,
      stats: {
        successes: 1,
        failures: 1,
        tokenUsage: {
          total: 10,
          prompt: 5,
          completion: 5,
          cached: 0,
        },
      },
      results,
      table,
    };
    const config = {
      description: 'test',
    };
    const shareableUrl = null;
    writeOutput(outputPath, summary, config, shareableUrl);

    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
  });

  test('writeOutput with JSON output', () => {
    const outputPath = 'output.json';
    const results: EvaluateResult[] = [
      {
        success: true,
        score: 1.0,
        namedScores: {},
        latencyMs: 1000,
        provider: {
          id: 'foo',
        },
        prompt: {
          raw: 'Test prompt',
          display: '[display] Test prompt',
        },
        response: {
          output: 'Test output',
        },
        vars: {
          var1: 'value1',
          var2: 'value2',
        },
      },
    ];
    const table: EvaluateTable = {
      head: {
        prompts: [{ raw: 'Test prompt', display: '[display] Test prompt', provider: 'foo' }],
        vars: ['var1', 'var2'],
      },
      body: [
        {
          outputs: [
            {
              pass: true,
              score: 1.0,
              namedScores: {},
              text: 'Test output',
              prompt: 'Test prompt',
              latencyMs: 1000,
              cost: 0,
            },
          ],
          vars: ['value1', 'value2'],
          test: {},
        },
      ],
    };
    const summary = {
      version: 1,
      stats: {
        successes: 1,
        failures: 1,
        tokenUsage: {
          total: 10,
          prompt: 5,
          completion: 5,
          cached: 0,
        },
      },
      results,
      table,
    };
    const config = {
      description: 'test',
    };
    const shareableUrl = null;
    writeOutput(outputPath, summary, config, shareableUrl);

    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
  });

  test('writeOutput with YAML output', () => {
    const outputPath = 'output.yaml';
    const results: EvaluateResult[] = [
      {
        success: true,
        score: 1.0,
        namedScores: {},
        latencyMs: 1000,
        provider: {
          id: 'foo',
        },
        prompt: {
          raw: 'Test prompt',
          display: '[display] Test prompt',
        },
        response: {
          output: 'Test output',
        },
        vars: {
          var1: 'value1',
          var2: 'value2',
        },
      },
    ];
    const table: EvaluateTable = {
      head: {
        prompts: [{ raw: 'Test prompt', display: '[display] Test prompt', provider: 'foo' }],
        vars: ['var1', 'var2'],
      },
      body: [
        {
          outputs: [
            {
              pass: true,
              score: 1.0,
              namedScores: {},
              text: 'Test output',
              prompt: 'Test prompt',
              latencyMs: 1000,
              cost: 0,
            },
          ],
          vars: ['value1', 'value2'],
          test: {},
        },
      ],
    };
    const summary = {
      version: 1,
      stats: {
        successes: 1,
        failures: 1,
        tokenUsage: {
          total: 10,
          prompt: 5,
          completion: 5,
          cached: 0,
        },
      },
      results,
      table,
    };
    const config = {
      description: 'test',
    };
    const shareableUrl = null;
    writeOutput(outputPath, summary, config, shareableUrl);

    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
  });

  test('writeOutput with json and txt output', () => {
    const outputPath = ['output.json', 'output.txt'];
    const results: EvaluateResult[] = [
      {
        success: true,
        score: 1.0,
        namedScores: {},
        latencyMs: 1000,
        provider: {
          id: 'foo',
        },
        prompt: {
          raw: 'Test prompt',
          display: '[display] Test prompt',
        },
        response: {
          output: 'Test output',
        },
        vars: {
          var1: 'value1',
          var2: 'value2',
        },
      },
    ];
    const table: EvaluateTable = {
      head: {
        prompts: [{ raw: 'Test prompt', display: '[display] Test prompt', provider: 'foo' }],
        vars: ['var1', 'var2'],
      },
      body: [
        {
          outputs: [
            {
              pass: true,
              score: 1.0,
              namedScores: {},
              text: 'Test output',
              prompt: 'Test prompt',
              latencyMs: 1000,
              cost: 0,
            },
          ],
          vars: ['value1', 'value2'],
          test: {},
        },
      ],
    };
    const summary = {
      version: 1,
      stats: {
        successes: 1,
        failures: 1,
        tokenUsage: {
          total: 10,
          prompt: 5,
          completion: 5,
          cached: 0,
        },
      },
      results,
      table,
    };
    const config = {
      description: 'test',
    };
    const shareableUrl = null;
    writeMultipleOutputs(outputPath, summary, config, shareableUrl);

    expect(fs.writeFileSync).toHaveBeenCalledTimes(2);
  });

  describe('readCliConfig', () => {
    afterEach(() => {
      jest.clearAllMocks();
      resetGlobalConfig();
    });

    test('reads from existing config', () => {
      const config = { hasRun: false };
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(yaml.dump(config));

      const result = readGlobalConfig();

      expect(fs.existsSync).toHaveBeenCalledTimes(1);
      expect(fs.readFileSync).toHaveBeenCalledTimes(1);
      expect(result).toEqual(config);
    });

    test('creates new config if none exists', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      (fs.writeFileSync as jest.Mock).mockImplementation();

      const result = readGlobalConfig();

      expect(fs.existsSync).toHaveBeenCalledTimes(2);
      expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ hasRun: false });
    });
  });

  describe('maybeRecordFirstRun', () => {
    afterEach(() => {
      resetGlobalConfig();
      jest.clearAllMocks();
    });

    test('returns true if it is the first run', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      (fs.writeFileSync as jest.Mock).mockImplementation();

      const result = maybeRecordFirstRun();

      expect(fs.writeFileSync).toHaveBeenCalledTimes(2);
      expect(result).toBe(true);
    });

    test('returns false if it is not the first run', () => {
      const config = { hasRun: true };
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(yaml.dump(config));

      const result = maybeRecordFirstRun();

      expect(fs.readFileSync).toHaveBeenCalledTimes(1);
      expect(result).toBe(false);
    });
  });

  test('readFilters', () => {
    const mockFilter = jest.fn();
    jest.doMock(path.resolve('filter.js'), () => mockFilter, { virtual: true });

    (globSync as jest.Mock).mockImplementation((pathOrGlob) => [pathOrGlob]);

    const filters = readFilters({ testFilter: 'filter.js' });

    expect(filters.testFilter).toBe(mockFilter);
  });

  describe('readConfigs', () => {
    test('reads from existing configs', async () => {
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

      (globSync as jest.Mock).mockImplementation((pathOrGlob) => [pathOrGlob]);
      (fs.readFileSync as jest.Mock)
        .mockReturnValueOnce(JSON.stringify(config1))
        .mockReturnValueOnce(JSON.stringify(config2))
        .mockReturnValueOnce(JSON.stringify(config1))
        .mockReturnValueOnce(JSON.stringify(config2))
        .mockReturnValue('you should not see this');

      // Mocks for prompt loading
      (fs.readdirSync as jest.Mock).mockReturnValue([]);
      (fs.statSync as jest.Mock).mockImplementation(() => {
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
        sharing: false,
      });
    });

    test('throws error for unsupported configuration file format', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      await expect(readConfigs(['config1.unsupported'])).rejects.toThrow(
        'Unsupported configuration file format: .unsupported',
      );
    });

    test('makeAbsolute should resolve file:// syntax and plaintext prompts', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockImplementation((path: string) => {
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

  });

  describe('dereferenceConfig', () => {
    test('should dereference a config with no $refs', async () => {
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

    test('should dereference a config with $refs', async () => {
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

    test('should preserve regular functions when dereferencing', async () => {
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

    test('should preserve tools with references and definitions when dereferencing', async () => {
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
});
