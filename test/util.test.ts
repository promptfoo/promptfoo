import * as fs from 'fs';
import { globSync } from 'glob';
import * as path from 'path';
import type { ApiProvider, EvaluateResult, EvaluateTable, TestCase } from '../src/types';
import {
  providerToIdentifier,
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

  it('should parse a directory path', () => {
    jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => true } as fs.Stats);
    expect(parsePathOrGlob('/base', 'dir')).toEqual({
      extension: undefined,
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
    process.env.FILE_PATH = 'file.txt';
    expect(parsePathOrGlob('/base', process.env.FILE_PATH)).toEqual({
      extension: '.txt',
      functionName: undefined,
      isPathPattern: false,
      filePath: path.join('/base', 'file.txt'),
    });
    delete process.env.FILE_PATH;
  });

  it('should handle glob patterns in file path', () => {
    jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats);
    expect(parsePathOrGlob('/base', '*.js')).toEqual({
      extension: undefined,
      functionName: undefined,
      isPathPattern: true,
      filePath: path.join('/base', '*.js'),
    });
  });

  it('should handle complex file paths', () => {
    jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats);
    expect(parsePathOrGlob('/base', 'dir/subdir/file.py:func')).toEqual({
      extension: '.py',
      functionName: 'func',
      isPathPattern: false,
      filePath: path.join('/base', 'dir/subdir/file.py'),
    });
  });

  it('should handle non-standard file extensions', () => {
    jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats);
    expect(parsePathOrGlob('/base', 'file.customext')).toEqual({
      extension: '.customext',
      functionName: undefined,
      isPathPattern: false,
      filePath: path.join('/base', 'file.customext'),
    });
  });

  it('should handle deeply nested file paths', () => {
    jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats);
    expect(parsePathOrGlob('/base', 'a/b/c/d/e/f/g/file.py:func')).toEqual({
      extension: '.py',
      functionName: 'func',
      isPathPattern: false,
      filePath: path.join('/base', 'a/b/c/d/e/f/g/file.py'),
    });
  });

  it('should handle complex directory paths', () => {
    jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => true } as fs.Stats);
    expect(parsePathOrGlob('/base', 'a/b/c/d/e/f/g')).toEqual({
      extension: undefined,
      functionName: undefined,
      isPathPattern: true,
      filePath: path.join('/base', 'a/b/c/d/e/f/g'),
    });
  });

  it('should join basePath and safeFilename correctly', () => {
    jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats);
    const basePath = 'base';
    const relativePath = 'relative/path/to/file.txt';
    expect(parsePathOrGlob(basePath, relativePath)).toEqual({
      extension: '.txt',
      functionName: undefined,
      isPathPattern: false,
      filePath: expect.stringMatching(/base[\\\/]relative[\\\/]path[\\\/]to[\\\/]file.txt/),
    });
  });

  it('should handle empty basePath', () => {
    jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats);
    expect(parsePathOrGlob('', 'file.txt')).toEqual({
      extension: '.txt',
      functionName: undefined,
      isPathPattern: false,
      filePath: 'file.txt',
    });
  });

  it('should handle file:// prefix', () => {
    jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats);
    expect(parsePathOrGlob('', 'file://file.txt')).toEqual({
      extension: '.txt',
      functionName: undefined,
      isPathPattern: false,
      filePath: 'file.txt',
    });
  });

  it('should handle file://./... with absolute base path', () => {
    jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats);
    expect(parsePathOrGlob('/absolute/base', 'file://./prompts/file.txt')).toEqual({
      extension: '.txt',
      functionName: undefined,
      isPathPattern: false,
      filePath: expect.stringMatching(/^[/\\]absolute[/\\]base[/\\]prompts[/\\]file\.txt$/),
    });
  });

  it('should handle file://./... with relative base path', () => {
    jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats);
    expect(parsePathOrGlob('relative/base', 'file://file.txt')).toEqual({
      extension: '.txt',
      functionName: undefined,
      isPathPattern: false,
      filePath: expect.stringMatching(/^relative[/\\]base[/\\]file\.txt$/),
    });
  });
});
