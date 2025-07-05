import dotenv from 'dotenv';
import * as fs from 'fs';
import { globSync } from 'glob';
import * as path from 'path';
import cliState from '../../src/cliState';
import { getDb } from '../../src/database';
import * as googleSheets from '../../src/googleSheets';
import Eval from '../../src/models/eval';
import {
  ResultFailureReason,
  type ApiProvider,
  type EvaluateResult,
  type TestCase,
} from '../../src/types';
import {
  parsePathOrGlob,
  providerToIdentifier,
  readFilters,
  readOutput,
  resultIsForTestCase,
  setupEnv,
  varsMatch,
  writeMultipleOutputs,
  writeOutput,
  maybeLoadToolsFromExternalFile,
  renderVarsInObject,
} from '../../src/util';
import { TestGrader } from './utils';

jest.mock('../../src/database', () => ({
  getDb: jest.fn(),
}));

jest.mock('proxy-agent', () => ({
  ProxyAgent: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('glob', () => ({
  globSync: jest.fn(),
}));

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  statSync: jest.fn(),
  readdirSync: jest.fn(),
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
}));

jest.mock('../../src/esm', () => {
  const actual = jest.requireActual('../../src/__mocks__/esm.ts');
  return {
    importModule: jest.fn(actual.importModule),
    getDirectory: jest.fn(actual.getDirectory),
  };
});

jest.mock('../../src/googleSheets', () => ({
  writeCsvToGoogleSheet: jest.fn(),
}));

jest.mock('../../src/python/pythonUtils', () => ({
  runPython: jest.fn(),
}));

describe('maybeLoadToolsFromExternalFile', () => {
  const mockFileContent = '{"name": "calculator", "parameters": {"type": "object"}}';
  const mockToolsArray = [
    { type: 'function', function: { name: 'calculator', parameters: { type: 'object' } } },
  ];

  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(fs.existsSync).mockReturnValue(true);
    jest.mocked(fs.readFileSync).mockReturnValue(mockFileContent);
  });

  it('should process tool objects directly', () => {
    const tools = mockToolsArray;
    const vars = { api_key: '123456' };
    expect(maybeLoadToolsFromExternalFile(tools, vars)).toEqual(tools);
  });

  it('should load tools from external file', () => {
    const tools = 'file://tools.json';
    expect(maybeLoadToolsFromExternalFile(tools)).toEqual(JSON.parse(mockFileContent));
  });

  it('should render variables in tools object', () => {
    const tools = [
      {
        type: 'function',
        function: {
          name: 'calculator',
          parameters: { type: 'object' },
          apiKey: '{{ api_key }}',
        },
      },
    ];
    const vars = { api_key: '123456' };

    const expected = [
      {
        type: 'function',
        function: {
          name: 'calculator',
          parameters: { type: 'object' },
          apiKey: '123456',
        },
      },
    ];

    expect(maybeLoadToolsFromExternalFile(tools, vars)).toEqual(expected);
  });

  it('should render variables and load from external file', () => {
    const tools = 'file://{{ file_path }}.json';
    const vars = { file_path: 'tools' };

    maybeLoadToolsFromExternalFile(tools, vars);

    // Should resolve the file path with variables first
    expect(fs.existsSync).toHaveBeenCalledWith(expect.stringContaining('tools.json'));
    expect(fs.readFileSync).toHaveBeenCalledWith(expect.stringContaining('tools.json'), 'utf8');
  });

  it('should handle array of file paths', () => {
    const tools = ['file://tools1.json', 'file://tools2.json'];

    maybeLoadToolsFromExternalFile(tools);

    expect(fs.existsSync).toHaveBeenCalledTimes(2);
    expect(fs.readFileSync).toHaveBeenCalledTimes(2);
  });
});

describe('util', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('writeOutput', () => {
    let consoleLogSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      // @ts-ignore
      jest.mocked(getDb).mockReturnValue({
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([]),
          }),
        }),
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([]),
          }),
        }),
      });
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
    });
    it('writeOutput with CSV output', async () => {
      // @ts-ignore
      jest.mocked(getDb).mockReturnValue({
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({ all: jest.fn().mockResolvedValue([]) }),
          }),
        }),
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([]),
          }),
        }),
      });
      const outputPath = 'output.csv';
      const results: EvaluateResult[] = [
        {
          success: true,
          failureReason: ResultFailureReason.NONE,
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
          promptIdx: 0,
          testIdx: 0,
          testCase: {},
          promptId: 'foo',
        },
      ];
      const eval_ = new Eval({});
      await eval_.addResult(results[0]);

      const shareableUrl = null;
      await writeOutput(outputPath, eval_, shareableUrl);

      expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
    });

    it('writeOutput with JSON output', async () => {
      const outputPath = 'output.json';
      const eval_ = new Eval({});
      await writeOutput(outputPath, eval_, null);

      expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
    });

    it('writeOutput with YAML output', async () => {
      const outputPath = 'output.yaml';
      const eval_ = new Eval({});
      await writeOutput(outputPath, eval_, null);

      expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
    });

    it('writeOutput with json and txt output', async () => {
      const outputPath = ['output.json', 'output.txt'];
      const eval_ = new Eval({});

      await writeMultipleOutputs(outputPath, eval_, null);

      expect(fs.writeFileSync).toHaveBeenCalledTimes(2);
    });

    it('writeOutput with HTML template escapes special characters', async () => {
      // Use the real fs module to read the template
      const realFs = jest.requireActual('fs') as typeof fs;
      const templatePath = path.resolve(__dirname, '../../src/tableOutput.html');
      const templateContent = realFs.readFileSync(templatePath, 'utf-8');

      // Check that the template has escape filters on all user-provided content
      expect(templateContent).toContain('{{ header | escape }}');
      expect(templateContent).toContain('{{ cell | escape }}');

      // Ensure both data-content attribute and cell content are escaped
      const cellRegex =
        /<td[^>]*data-content="\{\{ cell \| escape \}\}"[^>]*>\{\{ cell \| escape \}\}<\/td>/;
      expect(templateContent).toMatch(cellRegex);
    });

    it('writes output to Google Sheets', async () => {
      const outputPath = 'https://docs.google.com/spreadsheets/d/1234567890/edit#gid=0';

      const config = { description: 'Test config' };
      const shareableUrl = null;
      const eval_ = new Eval(config);

      await writeOutput(outputPath, eval_, shareableUrl);

      expect(googleSheets.writeCsvToGoogleSheet).toHaveBeenCalledTimes(1);
    });

    it('writes output to JavaScript handler', async () => {
      const handler = jest.fn();
      const importModule = jest.mocked(jest.requireMock('../../src/esm').importModule);
      importModule.mockResolvedValue(handler);

      const eval_ = new Eval({});
      const summary = { foo: 'bar' } as any;
      jest.spyOn(eval_, 'toEvaluateSummary').mockResolvedValue(summary);

      await writeOutput('file://handler.js', eval_, null);

      expect(importModule).toHaveBeenCalledWith(expect.stringContaining('handler.js'), undefined);
      expect(handler).toHaveBeenCalledWith({
        evalId: eval_.id,
        results: summary,
        config: eval_.config,
        shareableUrl: null,
      });
    });

    it('writes output to JavaScript handler with function name', async () => {
      const handler = { processResults: jest.fn() };
      const importModule = jest.mocked(jest.requireMock('../../src/esm').importModule);
      importModule.mockResolvedValue(handler.processResults);

      const eval_ = new Eval({});
      const summary = { foo: 'bar' } as any;
      jest.spyOn(eval_, 'toEvaluateSummary').mockResolvedValue(summary);

      await writeOutput('file://handler.js:processResults', eval_, null);

      expect(importModule).toHaveBeenCalledWith(
        expect.stringMatching(/handler\.js$/),
        'processResults',
      );
      expect(handler.processResults).toHaveBeenCalledWith({
        evalId: eval_.id,
        results: summary,
        config: eval_.config,
        shareableUrl: null,
      });
    });

    it('writes output to JavaScript handler without file:// prefix', async () => {
      const handler = jest.fn();
      const importModule = jest.mocked(jest.requireMock('../../src/esm').importModule);
      importModule.mockResolvedValue(handler);

      const eval_ = new Eval({});
      const summary = { foo: 'bar' } as any;
      jest.spyOn(eval_, 'toEvaluateSummary').mockResolvedValue(summary);

      await writeOutput('./handlers/results.js', eval_, null);

      expect(importModule).toHaveBeenCalledWith(
        expect.stringMatching(/handlers[/\\]results\.js$/),
        undefined,
      );
      expect(handler).toHaveBeenCalledWith({
        evalId: eval_.id,
        results: summary,
        config: eval_.config,
        shareableUrl: null,
      });
    });

    it('writes output to Python handler', async () => {
      const runPython = jest.requireMock('../../src/python/pythonUtils').runPython;
      runPython.mockResolvedValue(undefined);

      const eval_ = new Eval({});
      const summary = { foo: 'bar' } as any;
      jest.spyOn(eval_, 'toEvaluateSummary').mockResolvedValue(summary);

      await writeOutput('file://handler.py:save', eval_, 'url');

      expect(runPython).toHaveBeenCalledWith(expect.stringMatching(/handler\.py$/), 'save', [
        {
          evalId: eval_.id,
          results: summary,
          config: eval_.config,
          shareableUrl: 'url',
        },
      ]);
    });

    it('writes output to Python handler with default function', async () => {
      const runPython = jest.requireMock('../../src/python/pythonUtils').runPython;
      runPython.mockResolvedValue(undefined);

      const eval_ = new Eval({});
      const summary = { foo: 'bar' } as any;
      jest.spyOn(eval_, 'toEvaluateSummary').mockResolvedValue(summary);

      await writeOutput('file://handler.py', eval_, null);

      expect(runPython).toHaveBeenCalledWith(
        expect.stringMatching(/handler\.py$/),
        'handle_output',
        [
          {
            evalId: eval_.id,
            results: summary,
            config: eval_.config,
            shareableUrl: null,
          },
        ],
      );
    });

    it('writes output to JavaScript handler with default export', async () => {
      const handler = jest.fn();
      const importModule = jest.mocked(jest.requireMock('../../src/esm').importModule);
      importModule.mockResolvedValue({ default: handler });

      const eval_ = new Eval({});
      const summary = { foo: 'bar' } as any;
      jest.spyOn(eval_, 'toEvaluateSummary').mockResolvedValue(summary);

      await writeOutput('file://handler.js', eval_, null);

      expect(importModule).toHaveBeenCalledWith(expect.stringMatching(/handler\.js$/), undefined);
      expect(handler).toHaveBeenCalledWith({
        evalId: eval_.id,
        results: summary,
        config: eval_.config,
        shareableUrl: null,
      });
    });

    it('throws error when handler does not export a function', async () => {
      const importModule = jest.mocked(jest.requireMock('../../src/esm').importModule);
      importModule.mockResolvedValue({ notAFunction: 'test' });

      const eval_ = new Eval({});
      jest.spyOn(eval_, 'toEvaluateSummary').mockResolvedValue({} as any);

      await expect(writeOutput('file://handler.js', eval_, null)).rejects.toThrow(
        /Output handler .+handler\.js must export a function \(or export default\)/,
      );
    });

    it('handles TypeScript handler files', async () => {
      const handler = jest.fn();
      const importModule = jest.mocked(jest.requireMock('../../src/esm').importModule);
      importModule.mockResolvedValue(handler);

      const eval_ = new Eval({});
      const summary = { foo: 'bar' } as any;
      jest.spyOn(eval_, 'toEvaluateSummary').mockResolvedValue(summary);

      await writeOutput('file://handler.ts', eval_, null);

      expect(importModule).toHaveBeenCalledWith(expect.stringMatching(/handler\.ts$/), undefined);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          evalId: eval_.id,
          results: summary,
          config: eval_.config,
          shareableUrl: null,
        }),
      );
    });

    it('throws error for unsupported handler file type', async () => {
      const eval_ = new Eval({});
      jest.spyOn(eval_, 'toEvaluateSummary').mockResolvedValue({} as any);

      await expect(writeOutput('file://handler.txt', eval_, null)).rejects.toThrow(
        'Unsupported handler file type: .txt',
      );
    });

    it('uses cliState.basePath for handler file resolution', async () => {
      const handler = jest.fn();
      const importModule = jest.mocked(jest.requireMock('../../src/esm').importModule);
      importModule.mockResolvedValue(handler);

      // Set a custom base path
      const originalBasePath = cliState.basePath;
      cliState.basePath = '/custom/base/path';

      const eval_ = new Eval({});
      const summary = { foo: 'bar' } as any;
      jest.spyOn(eval_, 'toEvaluateSummary').mockResolvedValue(summary);

      await writeOutput('file://handler.js', eval_, null);

      expect(importModule).toHaveBeenCalledWith(
        expect.stringMatching(/[/\\]custom[/\\]base[/\\]path[/\\]handler\.js$/),
        undefined,
      );
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          evalId: eval_.id,
          results: summary,
          config: eval_.config,
          shareableUrl: null,
        }),
      );

      // Restore original base path
      cliState.basePath = originalBasePath;
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

    const importModule = jest.mocked(jest.requireMock('../../src/esm').importModule);
    importModule.mockImplementation(() => mockFilter);

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

    it('should parse a Go file path with function name', () => {
      jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats);
      expect(parsePathOrGlob('/base', 'script.go:CallApi')).toEqual({
        extension: '.go',
        functionName: 'CallApi',
        isPathPattern: false,
        filePath: path.join('/base', 'script.go'),
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

    it('should properly test file existence when function name in the path', () => {
      jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats);
      parsePathOrGlob('/base', 'script.py:myFunction');
      expect(fs.statSync).toHaveBeenCalledWith(path.join('/base', 'script.py'));
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

    it('should handle file:// prefix with Go function', () => {
      jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats);
      expect(parsePathOrGlob('/base', 'file://script.go:CallApi')).toEqual({
        extension: '.go',
        functionName: 'CallApi',
        isPathPattern: false,
        filePath: path.join('/base', 'script.go'),
      });
    });

    it('should handle file:// prefix with absolute path and Go function', () => {
      jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats);
      expect(parsePathOrGlob('/base', 'file:///absolute/path/script.go:CallApi')).toEqual({
        extension: '.go',
        functionName: 'CallApi',
        isPathPattern: false,
        filePath: expect.stringMatching(/^[/\\]absolute[/\\]path[/\\]script\.go$/),
      });
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

describe('setupEnv', () => {
  let originalEnv: typeof process.env;
  let dotenvConfigSpy: jest.SpyInstance<
    dotenv.DotenvConfigOutput,
    [options?: dotenv.DotenvConfigOptions]
  >;

  beforeEach(() => {
    originalEnv = { ...process.env };
    // Ensure NODE_ENV is not set at the start of each test
    delete process.env.NODE_ENV;
    // Spy on dotenv.config to verify it's called with the right parameters
    dotenvConfigSpy = jest.spyOn(dotenv, 'config').mockImplementation(() => ({ parsed: {} }));
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.resetAllMocks();
  });

  it('should call dotenv.config without parameters when envPath is undefined', () => {
    setupEnv(undefined);

    expect(dotenvConfigSpy).toHaveBeenCalledTimes(1);
    expect(dotenvConfigSpy).toHaveBeenCalledWith();
  });

  it('should call dotenv.config with path and override=true when envPath is specified', () => {
    const testEnvPath = '.env.test';

    setupEnv(testEnvPath);

    expect(dotenvConfigSpy).toHaveBeenCalledTimes(1);
    expect(dotenvConfigSpy).toHaveBeenCalledWith({
      path: testEnvPath,
      override: true,
    });
  });

  it('should load environment variables with override when specified env file has conflicting values', () => {
    // Mock dotenv.config to simulate loading variables
    dotenvConfigSpy.mockImplementation((options?: dotenv.DotenvConfigOptions) => {
      if (options?.path === '.env.production') {
        if (options.override) {
          process.env.NODE_ENV = 'production';
        } else if (!process.env.NODE_ENV) {
          process.env.NODE_ENV = 'production';
        }
      } else {
        // Default .env file
        if (!process.env.NODE_ENV) {
          process.env.NODE_ENV = 'development';
        }
      }
      return { parsed: {} };
    });

    // First load the default .env (setting NODE_ENV to 'development')
    setupEnv(undefined);
    expect(process.env.NODE_ENV).toBe('development');

    // Then load .env.production with override (should change NODE_ENV to 'production')
    setupEnv('.env.production');
    expect(process.env.NODE_ENV).toBe('production');
  });
});

describe('renderVarsInObject', () => {
  beforeEach(() => {
    delete process.env.PROMPTFOO_DISABLE_TEMPLATING;
  });

  afterEach(() => {
    delete process.env.TEST_ENV_VAR;
    delete process.env.PROMPTFOO_DISABLE_TEMPLATING;
  });

  it('should render environment variables in objects', () => {
    process.env.TEST_ENV_VAR = 'env_value';
    const obj = { text: '{{ env.TEST_ENV_VAR }}' };
    const rendered = renderVarsInObject(obj, {});
    expect(rendered).toEqual({ text: 'env_value' });
  });

  it('should return object unchanged when no vars provided', () => {
    const obj = { text: '{{ variable }}', number: 42 };
    const rendered = renderVarsInObject(obj);
    expect(rendered).toEqual(obj);
  });

  it('should return object unchanged when vars is empty object', () => {
    const obj = { text: '{{ variable }}', number: 42 };
    const rendered = renderVarsInObject(obj, {});
    // Empty object {} is truthy, so templating still runs but with no variables
    expect(rendered).toEqual({ text: '', number: 42 });
  });

  it('should return object unchanged when PROMPTFOO_DISABLE_TEMPLATING is true', () => {
    process.env.PROMPTFOO_DISABLE_TEMPLATING = 'true';
    const obj = { text: '{{ variable }}' };
    const vars = { variable: 'test_value' };
    const rendered = renderVarsInObject(obj, vars);
    expect(rendered).toEqual(obj);
  });

  it('should render variables in string objects', () => {
    const obj = 'Hello {{ name }}!';
    const vars = { name: 'World' };
    const rendered = renderVarsInObject(obj, vars);
    expect(rendered).toBe('Hello World!');
  });

  it('should render variables in array objects', () => {
    const obj = ['{{ greeting }}', '{{ name }}', 42];
    const vars = { greeting: 'Hello', name: 'World' };
    const rendered = renderVarsInObject(obj, vars);
    expect(rendered).toEqual(['Hello', 'World', 42]);
  });

  it('should render variables in nested arrays', () => {
    const obj = [
      ['{{ item1 }}', '{{ item2 }}'],
      ['static', '{{ item3 }}'],
    ];
    const vars = { item1: 'first', item2: 'second', item3: 'third' };
    const rendered = renderVarsInObject(obj, vars);
    expect(rendered).toEqual([
      ['first', 'second'],
      ['static', 'third'],
    ]);
  });

  it('should render variables in nested objects', () => {
    const obj = {
      level1: {
        level2: {
          text: '{{ variable }}',
          number: 42,
        },
        array: ['{{ item }}'],
      },
    };
    const vars = { variable: 'nested_value', item: 'array_item' };
    const rendered = renderVarsInObject(obj, vars);
    expect(rendered).toEqual({
      level1: {
        level2: {
          text: 'nested_value',
          number: 42,
        },
        array: ['array_item'],
      },
    });
  });

  it('should handle function objects by calling them with vars', () => {
    const mockFunction = jest.fn().mockReturnValue({ result: '{{ value }}' });
    const vars = { value: 'function_result' };
    const rendered = renderVarsInObject(mockFunction, vars);

    expect(mockFunction).toHaveBeenCalledWith({ vars });
    // Function result is NOT recursively templated because vars is not passed in recursive call
    expect(rendered).toEqual({ result: '{{ value }}' });
  });

  it('should handle null values', () => {
    const obj = null;
    const vars = { variable: 'test' };
    const rendered = renderVarsInObject(obj, vars);
    expect(rendered).toBeNull();
  });

  it('should handle undefined values', () => {
    const obj = undefined;
    const vars = { variable: 'test' };
    const rendered = renderVarsInObject(obj, vars);
    expect(rendered).toBeUndefined();
  });

  it('should handle primitive number values', () => {
    const obj = 42;
    const vars = { variable: 'test' };
    const rendered = renderVarsInObject(obj, vars);
    expect(rendered).toBe(42);
  });

  it('should handle primitive boolean values', () => {
    const obj = true;
    const vars = { variable: 'test' };
    const rendered = renderVarsInObject(obj, vars);
    expect(rendered).toBe(true);
  });

  it('should handle objects with null properties', () => {
    const obj = { nullProp: null, text: '{{ variable }}' };
    const vars = { variable: 'test_value' };
    const rendered = renderVarsInObject(obj, vars);
    expect(rendered).toEqual({ nullProp: null, text: 'test_value' });
  });

  it('should handle mixed type objects', () => {
    const obj = {
      string: '{{ text }}',
      number: 42,
      boolean: true,
      nullValue: null,
      array: ['{{ item }}', 123],
      nested: {
        deep: '{{ deep_value }}',
      },
    };
    const vars = { text: 'rendered', item: 'array_item', deep_value: 'deep_rendered' };
    const rendered = renderVarsInObject(obj, vars);
    expect(rendered).toEqual({
      string: 'rendered',
      number: 42,
      boolean: true,
      nullValue: null,
      array: ['array_item', 123],
      nested: {
        deep: 'deep_rendered',
      },
    });
  });

  it('should handle function that returns complex object structure', () => {
    const complexFunction = jest.fn().mockReturnValue({
      data: {
        items: ['{{ item1 }}', '{{ item2 }}'],
        metadata: { value: '{{ meta }}' },
      },
    });
    const vars = { item1: 'first', item2: 'second', meta: 'metadata_value' };
    const rendered = renderVarsInObject(complexFunction, vars);

    expect(complexFunction).toHaveBeenCalledWith({ vars });
    // Function result is NOT recursively templated because vars is not passed in recursive call
    expect(rendered).toEqual({
      data: {
        items: ['{{ item1 }}', '{{ item2 }}'],
        metadata: { value: '{{ meta }}' },
      },
    });
  });
});
