import * as fs from 'fs';
import { globSync } from 'glob';
import * as path from 'path';
import cliState from '../src/cliState';
import * as googleSheets from '../src/googleSheets';
import type { ApiProvider, EvaluateResult, EvaluateTable, TestCase } from '../src/types';
import {
  maybeLoadFromExternalFile,
  extractJsonObjects,
  isJavascriptFile,
  parsePathOrGlob,
  providerToIdentifier,
  readFilters,
  readOutput,
  resultIsForTestCase,
  varsMatch,
  writeMultipleOutputs,
  writeOutput,
} from '../src/util';
import { TestGrader } from './utils';

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

jest.mock('../src/logger');
jest.mock('../src/esm');
jest.mock('../src/database', () => ({
  getDb: jest.fn(),
}));

jest.mock('../src/googleSheets', () => ({
  writeCsvToGoogleSheet: jest.fn(),
}));

describe('maybeLoadFromExternalFile', () => {
  const mockFileContent = 'test content';
  const mockJsonContent = '{"key": "value"}';
  const mockYamlContent = 'key: value';

  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest.mocked(fs.readFileSync).mockReturnValue(mockFileContent);
  });

  it('should return the input if it is not a string', () => {
    const input = { key: 'value' };
    expect(maybeLoadFromExternalFile(input)).toBe(input);
  });

  it('should return the input if it does not start with "file://"', () => {
    const input = 'not a file path';
    expect(maybeLoadFromExternalFile(input)).toBe(input);
  });

  it('should throw an error if the file does not exist', () => {
    jest.mocked(fs.existsSync).mockReturnValue(false);
    expect(() => maybeLoadFromExternalFile('file://nonexistent.txt')).toThrow(
      'File does not exist',
    );
  });

  it('should return the file contents for a non-JSON, non-YAML file', () => {
    expect(maybeLoadFromExternalFile('file://test.txt')).toBe(mockFileContent);
  });

  it('should parse and return JSON content for a .json file', () => {
    jest.mocked(fs.readFileSync).mockReturnValue(mockJsonContent);
    expect(maybeLoadFromExternalFile('file://test.json')).toEqual({ key: 'value' });
  });

  it('should parse and return YAML content for a .yaml file', () => {
    jest.mocked(fs.readFileSync).mockReturnValue(mockYamlContent);
    expect(maybeLoadFromExternalFile('file://test.yaml')).toEqual({ key: 'value' });
  });

  it('should parse and return YAML content for a .yml file', () => {
    jest.mocked(fs.readFileSync).mockReturnValue(mockYamlContent);
    expect(maybeLoadFromExternalFile('file://test.yml')).toEqual({ key: 'value' });
  });

  it('should use basePath when resolving file paths', () => {
    const basePath = '/base/path';
    cliState.basePath = basePath;
    jest.mocked(fs.readFileSync).mockReturnValue(mockFileContent);

    maybeLoadFromExternalFile('file://test.txt');

    const expectedPath = path.resolve(basePath, 'test.txt');
    expect(fs.existsSync).toHaveBeenCalledWith(expectedPath);
    expect(fs.readFileSync).toHaveBeenCalledWith(expectedPath, 'utf8');

    cliState.basePath = undefined;
  });

  it('should handle relative paths correctly', () => {
    const basePath = './relative/path';
    cliState.basePath = basePath;
    jest.mocked(fs.readFileSync).mockReturnValue(mockFileContent);

    maybeLoadFromExternalFile('file://test.txt');

    const expectedPath = path.resolve(basePath, 'test.txt');
    expect(fs.existsSync).toHaveBeenCalledWith(expectedPath);
    expect(fs.readFileSync).toHaveBeenCalledWith(expectedPath, 'utf8');

    cliState.basePath = undefined;
  });

  it('should ignore basePath when file path is absolute', () => {
    const basePath = '/base/path';
    cliState.basePath = basePath;
    jest.mocked(fs.readFileSync).mockReturnValue(mockFileContent);

    maybeLoadFromExternalFile('file:///absolute/path/test.txt');

    const expectedPath = path.resolve('/absolute/path/test.txt');
    expect(fs.existsSync).toHaveBeenCalledWith(expectedPath);
    expect(fs.readFileSync).toHaveBeenCalledWith(expectedPath, 'utf8');

    cliState.basePath = undefined;
  });

  it('should handle list of paths', () => {
    const basePath = './relative/path';
    cliState.basePath = basePath;
    jest.mocked(fs.readFileSync).mockReturnValue(mockJsonContent);

    maybeLoadFromExternalFile(['file://test1.txt', 'file://test2.txt', 'file://test3.txt']);

    expect(fs.existsSync).toHaveBeenCalledTimes(3);
    expect(fs.existsSync).toHaveBeenNthCalledWith(1, path.resolve(basePath, 'test1.txt'));
    expect(fs.existsSync).toHaveBeenNthCalledWith(2, path.resolve(basePath, 'test2.txt'));
    expect(fs.existsSync).toHaveBeenNthCalledWith(3, path.resolve(basePath, 'test3.txt'));

    cliState.basePath = undefined;
  });
});

describe('util', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isJavascriptFile', () => {
    it('should return true for JavaScript files', () => {
      expect(isJavascriptFile('file.js')).toBe(true);
      expect(isJavascriptFile('file.cjs')).toBe(true);
      expect(isJavascriptFile('file.mjs')).toBe(true);
    });

    it('should return true for TypeScript files', () => {
      expect(isJavascriptFile('file.ts')).toBe(true);
      expect(isJavascriptFile('file.cts')).toBe(true);
      expect(isJavascriptFile('file.mts')).toBe(true);
    });

    it('should return false for non-JavaScript/TypeScript files', () => {
      expect(isJavascriptFile('file.txt')).toBe(false);
      expect(isJavascriptFile('file.py')).toBe(false);
      expect(isJavascriptFile('file.jsx')).toBe(false);
      expect(isJavascriptFile('file.tsx')).toBe(false);
    });

    it('should handle paths with directories', () => {
      expect(isJavascriptFile('/path/to/file.js')).toBe(true);
      expect(isJavascriptFile('C:\\path\\to\\file.ts')).toBe(true);
      expect(isJavascriptFile('/path/to/file.txt')).toBe(false);
    });
  });

  describe('writeOutput', () => {
    let consoleLogSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
    });
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

    it('writes output to Google Sheets', async () => {
      const outputPath = 'https://docs.google.com/spreadsheets/d/1234567890/edit#gid=0';
      const evalId = null;
      const results = {
        version: 2,
        timestamp: '2024-01-01T00:00:00.000Z',
        stats: {
          successes: 1,
          failures: 0,
          tokenUsage: {
            total: 10,
            prompt: 5,
            completion: 5,
            cached: 0,
          },
        },
        results: [],
        table: {
          head: {
            vars: ['var1', 'var2'],
            prompts: [{ raw: 'Test prompt', label: 'Test prompt', provider: 'test-provider' }],
          },
          body: [
            {
              vars: ['value1', 'value2'],
              outputs: [
                {
                  pass: true,
                  score: 1.0,
                  namedScores: { accuracy: 0.9 },
                  text: 'Test output',
                  prompt: 'Test prompt',
                  latencyMs: 1000,
                  cost: 0,
                },
              ],
              test: {},
            },
          ],
        },
      };
      const config = { description: 'Test config' };
      const shareableUrl = null;

      await writeOutput(outputPath, evalId, results, config, shareableUrl);

      expect(googleSheets.writeCsvToGoogleSheet).toHaveBeenCalledTimes(1);
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

    jest.mocked(globSync).mockImplementation((pathOrGlob) => [pathOrGlob].flat());

    const filters = await readFilters({ testFilter: 'filter.js' });

    expect(filters.testFilter).toBe(mockFilter);
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
      const expectedOutput: any[] = [];
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

    describe('Grader', () => {
      it('should have an id and callApi attributes', async () => {
        const Grader = new TestGrader();
        expect(Grader.id()).toBe('TestGradingProvider');
        await expect(Grader.callApi()).resolves.toEqual({
          output: JSON.stringify({
            pass: true,
            reason: 'Test grading output',
          }),
          tokenUsage: {
            completion: 5,
            prompt: 5,
            total: 10,
          },
        });
      });
    });
  });
});
