import * as fs from 'fs';
import { globSync } from 'glob';
import * as path from 'path';
import type {
  ApiProvider,
  EvaluateResult,
  EvaluateTable,
  TestCase,
  UnifiedConfig,
} from '../src/types';
import {
  dereferenceConfig,
  providerToIdentifier,
  readConfigs,
  readFilters,
  readOutput,
  resultIsForTestCase,
  transformOutput,
  varsMatch,
  writeMultipleOutputs,
  writeOutput,
  extractJsonObjects,
  parsePathOrGlob,
} from '../src/util';

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
jest.mock('../src/database');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('util', () => {
  describe('writeOutput', () => {
    it('writeOutput with CSV output', () => {
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
            label: '[display] Test prompt',
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
          prompts: [{ raw: 'Test prompt', label: '[display] Test prompt', provider: 'foo' }],
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
        version: 2,
        timestamp: '2024-01-01T00:00:00.000Z',
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
      writeOutput(outputPath, null, summary, config, shareableUrl);

      expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
    });

    it('writeOutput with JSON output', () => {
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
            label: '[display] Test prompt',
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
          prompts: [{ raw: 'Test prompt', label: '[display] Test prompt', provider: 'foo' }],
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
        version: 2,
        timestamp: '2024-01-01T00:00:00.000Z',
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
      writeOutput(outputPath, null, summary, config, shareableUrl);

      expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
    });

    it('writeOutput with YAML output', () => {
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
            label: '[display] Test prompt',
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
          prompts: [{ raw: 'Test prompt', label: '[display] Test prompt', provider: 'foo' }],
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
        version: 2,
        timestamp: '2024-01-01T00:00:00.000Z',
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
      writeOutput(outputPath, null, summary, config, shareableUrl);

      expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
    });

    it('writeOutput with json and txt output', () => {
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
            label: '[display] Test prompt',
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
          prompts: [{ raw: 'Test prompt', label: '[display] Test prompt', provider: 'foo' }],
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
        version: 2,
        timestamp: '2024-01-01T00:00:00.000Z',
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
      writeMultipleOutputs(outputPath, null, summary, config, shareableUrl);

      expect(fs.writeFileSync).toHaveBeenCalledTimes(2);
    });
  });

  describe('readOutput', () => {
    it('reads JSON output', async () => {
      const outputPath = 'output.json';
      jest.mocked(fs.readFileSync).mockReturnValue('{}');
      const output = await readOutput(outputPath);
      expect(output).toEqual({});
    });

    it('fails for csv output', async () => {
      await expect(readOutput('output.csv')).rejects.toThrow(
        'Unsupported output file format: csv currently only supports json',
      );
    });

    it('fails for yaml output', async () => {
      await expect(readOutput('output.yaml')).rejects.toThrow(
        'Unsupported output file format: yaml currently only supports json',
      );

      await expect(readOutput('output.yml')).rejects.toThrow(
        'Unsupported output file format: yml currently only supports json',
      );
    });
  });

  it('readFilters', async () => {
    const mockFilter = jest.fn();
    jest.doMock(path.resolve('filter.js'), () => mockFilter, { virtual: true });

    jest.mocked(globSync).mockImplementation((pathOrGlob) => [pathOrGlob]);

    const filters = await readFilters({ testFilter: 'filter.js' });

    expect(filters.testFilter).toBe(mockFilter);
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

  describe('transformOutput', () => {
    afterEach(() => {
      jest.clearAllMocks();
      jest.resetModules();
    });

    it('transforms output using a direct function', async () => {
      const output = 'original output';
      const context = { vars: { key: 'value' }, prompt: { id: '123' } };
      const transformFunction = 'output.toUpperCase()';
      const transformedOutput = await transformOutput(transformFunction, output, context);
      expect(transformedOutput).toBe('ORIGINAL OUTPUT');
    });

    it('transforms output using an imported function from a file', async () => {
      const output = 'hello';
      const context = { vars: { key: 'value' }, prompt: { id: '123' } };
      jest.doMock(path.resolve('transform.js'), () => (output: string) => output.toUpperCase(), {
        virtual: true,
      });
      const transformFunctionPath = 'file://transform.js';
      const transformedOutput = await transformOutput(transformFunctionPath, output, context);
      expect(transformedOutput).toBe('HELLO');
    });

    it('throws error if transform function does not return a value', async () => {
      const output = 'test';
      const context = { vars: {}, prompt: {} };
      const transformFunction = ''; // Empty function, returns undefined
      await expect(transformOutput(transformFunction, output, context)).rejects.toThrow(
        'Transform function did not return a value',
      );
    });

    it('throws error if file does not export a function', async () => {
      const output = 'test';
      const context = { vars: {}, prompt: {} };
      jest.doMock(path.resolve('transform.js'), () => 'banana', { virtual: true });
      const transformFunctionPath = 'file://transform.js';
      await expect(transformOutput(transformFunctionPath, output, context)).rejects.toThrow(
        'Transform transform.js must export a function or have a default export as a function',
      );
    });
  });

  describe('providerToIdentifier', () => {
    it('works with string', () => {
      const provider = 'openai:gpt-4';

      expect(providerToIdentifier(provider)).toStrictEqual(provider);
    });

    it('works with provider id undefined', () => {
      expect(providerToIdentifier(undefined)).toBeUndefined();
    });

    it('works with ApiProvider', () => {
      const providerId = 'custom';
      const apiProvider = {
        id() {
          return providerId;
        },
      } as ApiProvider;

      expect(providerToIdentifier(apiProvider)).toStrictEqual(providerId);
    });

    it('works with ProviderOptions', () => {
      const providerId = 'custom';
      const providerOptions = {
        id: providerId,
      };

      expect(providerToIdentifier(providerOptions)).toStrictEqual(providerId);
    });
  });

  describe('varsMatch', () => {
    it('true with both undefined', () => {
      expect(varsMatch(undefined, undefined)).toBe(true);
    });

    it('false with one undefined', () => {
      expect(varsMatch(undefined, {})).toBe(false);
      expect(varsMatch({}, undefined)).toBe(false);
    });
  });

  describe('resultIsForTestCase', () => {
    const testCase: TestCase = {
      provider: 'provider',
      vars: {
        key: 'value',
      },
    };
    const result = {
      provider: 'provider',
      vars: {
        key: 'value',
      },
    } as any as EvaluateResult;

    it('is true', () => {
      expect(resultIsForTestCase(result, testCase)).toBe(true);
    });

    it('is false if provider is different', () => {
      const nonMatchTestCase: TestCase = {
        provider: 'different',
        vars: {
          key: 'value',
        },
      };

      expect(resultIsForTestCase(result, nonMatchTestCase)).toBe(false);
    });

    it('is false if vars are different', () => {
      const nonMatchTestCase: TestCase = {
        provider: 'provider',
        vars: {
          key: 'different',
        },
      };

      expect(resultIsForTestCase(result, nonMatchTestCase)).toBe(false);
    });
  });
});

describe('extractJsonObjects', () => {
  it('should extract a single JSON object from a string', () => {
    const input = '{"key": "value"}';
    const expectedOutput = [{ key: 'value' }];
    expect(extractJsonObjects(input)).toEqual(expectedOutput);
  });

  it('should extract multiple JSON objects from a string', () => {
    const input = 'yolo {"key1": "value1"} some text {"key2": "value2"} fomo';
    const expectedOutput = [{ key1: 'value1' }, { key2: 'value2' }];
    expect(extractJsonObjects(input)).toEqual(expectedOutput);
  });

  it('should return an empty array if no JSON objects are found', () => {
    const input = 'no json here';
    const expectedOutput = [];
    expect(extractJsonObjects(input)).toEqual(expectedOutput);
  });

  it('should handle nested JSON objects', () => {
    const input = 'wassup {"outer": {"inner": "value"}, "foo": [1,2,3,4]}';
    const expectedOutput = [{ outer: { inner: 'value' }, foo: [1, 2, 3, 4] }];
    expect(extractJsonObjects(input)).toEqual(expectedOutput);
  });

  it('should handle invalid JSON gracefully', () => {
    const input = '{"key": "value" some text {"key2": "value2"}';
    const expectedOutput = [{ key2: 'value2' }];
    expect(extractJsonObjects(input)).toEqual(expectedOutput);
  });
});

describe('parsePathOrGlob', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should parse a simple file path with extension', () => {
    jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats);
    expect(parsePathOrGlob('/base', 'file.txt')).toEqual({
      extension: '.txt',
      functionName: undefined,
      isPathPattern: false,
      filePath: path.join('/base', 'file.txt'),
    });
  });

  it('should parse a file path with function name', () => {
    jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats);
    expect(parsePathOrGlob('/base', 'file.py:myFunction')).toEqual({
      extension: '.py',
      functionName: 'myFunction',
      isPathPattern: false,
      filePath: path.join('/base', 'file.py'),
    });
  });

  it('should parse a file path with file: prefix', () => {
    jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats);
    expect(parsePathOrGlob('/base', 'file:file.js')).toEqual({
      extension: '.js',
      functionName: undefined,
      isPathPattern: false,
      filePath: path.join('/base', 'file.js'),
    });
  });

  it('should parse a directory path', () => {
    jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => true } as fs.Stats);
    expect(parsePathOrGlob('/base', 'dir')).toEqual({
      extension: '',
      functionName: undefined,
      isPathPattern: true,
      filePath: path.join('/base', 'dir'),
    });
  });

  it('should handle non-existent file path gracefully when PROMPTFOO_STRICT_FILES is false', () => {
    jest.spyOn(fs, 'statSync').mockImplementation(() => {
      throw new Error('File does not exist');
    });
    expect(parsePathOrGlob('/base', 'nonexistent.js')).toEqual({
      extension: '.js',
      functionName: undefined,
      isPathPattern: false,
      filePath: path.join('/base', 'nonexistent.js'),
    });
  });

  it('should throw an error for non-existent file path when PROMPTFOO_STRICT_FILES is true', () => {
    process.env.PROMPTFOO_STRICT_FILES = 'true';
    jest.spyOn(fs, 'statSync').mockImplementation(() => {
      throw new Error('File does not exist');
    });
    expect(() => parsePathOrGlob('/base', 'nonexistent.js')).toThrow('File does not exist');
    delete process.env.PROMPTFOO_STRICT_FILES;
  });

  it('should return empty extension for files without extension', () => {
    jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats);
    expect(parsePathOrGlob('/base', 'file')).toEqual({
      extension: '',
      functionName: undefined,
      isPathPattern: false,
      filePath: path.join('/base', 'file'),
    });
  });

  it('should handle relative paths', () => {
    jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats);
    expect(parsePathOrGlob('./base', 'file.txt')).toEqual({
      extension: '.txt',
      functionName: undefined,
      isPathPattern: false,
      filePath: path.join('./base', 'file.txt'),
    });
  });

  it('should handle paths with environment variables', () => {
    jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats);
    expect(parsePathOrGlob('/base', 'file.txt')).toEqual({
      extension: '.txt',
      functionName: undefined,
      isPathPattern: false,
      filePath: path.join('/base', 'file.txt'),
    });
  });
});
