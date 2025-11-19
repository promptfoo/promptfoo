import * as fs from 'fs';
import * as path from 'path';

import dotenv from 'dotenv';
import { globSync } from 'glob';
import { getDb } from '../../src/database/index';
import * as googleSheets from '../../src/googleSheets';
import Eval from '../../src/models/eval';
import {
  type ApiProvider,
  type EvaluateResult,
  ResultFailureReason,
  type TestCase,
} from '../../src/types/index';
import {
  maybeLoadToolsFromExternalFile,
  parsePathOrGlob,
  providerToIdentifier,
  readFilters,
  readOutput,
  renderEnvOnlyInObject,
  renderVarsInObject,
  resultIsForTestCase,
  setupEnv,
  varsMatch,
  writeMultipleOutputs,
  writeOutput,
  createOutputMetadata,
} from '../../src/util/index';
import { TestGrader } from './utils';

jest.mock('../../src/database', () => ({
  getDb: jest.fn(),
}));

jest.mock('proxy-agent', () => ({
  ProxyAgent: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('glob', () => ({
  globSync: jest.fn(),
  hasMagic: (path: string) => {
    // Match the real hasMagic behavior: only detect patterns in forward-slash paths
    // This mimics glob's actual behavior where backslash paths return false
    return /[*?[\]{}]/.test(path) && !path.includes('\\');
  },
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

jest.mock('../../src/esm');

jest.mock('../../src/googleSheets', () => ({
  writeCsvToGoogleSheet: jest.fn(),
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

    it('writeOutput with XML output', async () => {
      const outputPath = 'output.xml';
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

    it('fails for xml output', async () => {
      await expect(readOutput('output.xml')).rejects.toThrow(
        'Unsupported output file format: xml currently only supports json',
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
    it('works with provider string', () => {
      expect(providerToIdentifier('gpt-3.5-turbo')).toStrictEqual('gpt-3.5-turbo');
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

    it('uses label when present on ProviderOptions', () => {
      const providerOptions = {
        id: 'file://provider.js',
        label: 'my-provider',
      };

      expect(providerToIdentifier(providerOptions)).toStrictEqual('my-provider');
    });

    it('canonicalizes relative file paths to absolute', () => {
      const originalCwd = process.cwd();
      expect(providerToIdentifier('file://./provider.js')).toStrictEqual(
        `file://${path.join(originalCwd, 'provider.js')}`,
      );
    });

    it('canonicalizes JavaScript files without file:// prefix', () => {
      const originalCwd = process.cwd();
      expect(providerToIdentifier('./provider.js')).toStrictEqual(
        `file://${path.join(originalCwd, 'provider.js')}`,
      );
    });

    it('preserves absolute file paths', () => {
      expect(providerToIdentifier('file:///absolute/path/provider.js')).toStrictEqual(
        'file:///absolute/path/provider.js',
      );
    });

    it('canonicalizes exec: paths', () => {
      const originalCwd = process.cwd();
      expect(providerToIdentifier('exec:./script.py')).toStrictEqual(
        `exec:${path.join(originalCwd, 'script.py')}`,
      );
    });

    it('canonicalizes python: paths', () => {
      const originalCwd = process.cwd();
      expect(providerToIdentifier('python:./provider.py')).toStrictEqual(
        `python:${path.join(originalCwd, 'provider.py')}`,
      );
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

    it('matches when test provider is label and result provider has label and id', () => {
      const labelledResult = {
        provider: { id: 'file://provider.js', label: 'provider' },
        vars: { key: 'value' },
      } as any as EvaluateResult;

      expect(resultIsForTestCase(labelledResult, testCase)).toBe(true);
    });

    it('matches when test provider is relative path and result provider is absolute', () => {
      const relativePathTestCase: TestCase = {
        provider: 'file://./provider.js',
        vars: { key: 'value' },
      };

      const absolutePathResult = {
        provider: { id: `file://${path.join(process.cwd(), 'provider.js')}` },
        vars: { key: 'value' },
      } as any as EvaluateResult;

      expect(resultIsForTestCase(absolutePathResult, relativePathTestCase)).toBe(true);
    });

    it('matches when test provider has no file:// prefix and result has absolute path', () => {
      const noPathTestCase: TestCase = {
        provider: './provider.js',
        vars: { key: 'value' },
      };

      const absolutePathResult = {
        provider: `file://${path.join(process.cwd(), 'provider.js')}`,
        vars: { key: 'value' },
      } as any as EvaluateResult;

      expect(resultIsForTestCase(absolutePathResult, noPathTestCase)).toBe(true);
    });

    it('matches when result.vars has runtime variables like _conversation', () => {
      // This tests the fix for issue #5849 - cache behavior regression
      // result.vars contains runtime variables that should be filtered out
      const testCase: TestCase = {
        provider: 'provider',
        vars: {
          input: 'hello',
          language: 'en',
        },
      };

      const result = {
        provider: 'provider',
        vars: {
          input: 'hello',
          language: 'en',
          _conversation: [], // Runtime variable added during evaluation
        },
        testCase: {
          vars: {
            input: 'hello',
            language: 'en',
          },
        },
      } as any as EvaluateResult;

      // Should match because _conversation is filtered out
      expect(resultIsForTestCase(result, testCase)).toBe(true);
    });

    it('matches when result.vars has runtime variables and testCase also has them', () => {
      // Edge case: both have runtime vars (shouldn't happen in practice but should still work)
      const testCase: TestCase = {
        provider: 'provider',
        vars: {
          input: 'hello',
          language: 'en',
          _conversation: [],
        },
      };

      const result = {
        provider: 'provider',
        vars: {
          input: 'hello',
          language: 'en',
          _conversation: [],
        },
      } as any as EvaluateResult;

      // Should match because both have same vars after filtering
      expect(resultIsForTestCase(result, testCase)).toBe(true);
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

  it('should call dotenv.config with quiet=true when envPath is undefined', () => {
    setupEnv(undefined);

    expect(dotenvConfigSpy).toHaveBeenCalledTimes(1);
    expect(dotenvConfigSpy).toHaveBeenCalledWith({ quiet: true });
  });

  it('should call dotenv.config with path, override=true, and quiet=true when envPath is specified', () => {
    const testEnvPath = '.env.test';

    setupEnv(testEnvPath);

    expect(dotenvConfigSpy).toHaveBeenCalledTimes(1);
    expect(dotenvConfigSpy).toHaveBeenCalledWith({
      path: testEnvPath,
      override: true,
      quiet: true,
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

describe('renderEnvOnlyInObject', () => {
  beforeEach(() => {
    delete process.env.TEST_ENV_VAR;
    delete process.env.AZURE_ENDPOINT;
    delete process.env.API_VERSION;
    delete process.env.PORT;
    delete process.env.API_HOST;
    delete process.env.BASE_URL;
    delete process.env.EMPTY_VAR;
    delete process.env.SPECIAL_CHARS;
    delete process.env.PROMPTFOO_DISABLE_TEMPLATING;
  });

  afterEach(() => {
    delete process.env.TEST_ENV_VAR;
    delete process.env.AZURE_ENDPOINT;
    delete process.env.API_VERSION;
    delete process.env.PORT;
    delete process.env.API_HOST;
    delete process.env.BASE_URL;
    delete process.env.EMPTY_VAR;
    delete process.env.SPECIAL_CHARS;
    delete process.env.PROMPTFOO_DISABLE_TEMPLATING;
  });

  describe('Basic rendering', () => {
    it('should render simple dot notation env vars', () => {
      process.env.TEST_ENV_VAR = 'env_value';
      expect(renderEnvOnlyInObject('{{ env.TEST_ENV_VAR }}')).toBe('env_value');
    });

    it('should render bracket notation with single quotes', () => {
      process.env['VAR-WITH-DASH'] = 'dash_value';
      expect(renderEnvOnlyInObject("{{ env['VAR-WITH-DASH'] }}")).toBe('dash_value');
    });

    it('should render bracket notation with double quotes', () => {
      process.env['VAR_NAME'] = 'value';
      expect(renderEnvOnlyInObject('{{ env["VAR_NAME"] }}')).toBe('value');
    });

    it('should handle whitespace variations', () => {
      process.env.TEST = 'value';
      expect(renderEnvOnlyInObject('{{env.TEST}}')).toBe('value');
      expect(renderEnvOnlyInObject('{{  env.TEST  }}')).toBe('value');
      expect(renderEnvOnlyInObject('{{ env.TEST}}')).toBe('value');
      expect(renderEnvOnlyInObject('{{env.TEST }}')).toBe('value');
    });

    it('should render empty string env vars', () => {
      process.env.EMPTY_VAR = '';
      expect(renderEnvOnlyInObject('{{ env.EMPTY_VAR }}')).toBe('');
    });

    it('should render env vars with special characters in value', () => {
      process.env.SPECIAL_CHARS = 'value with spaces & $pecial chars!';
      expect(renderEnvOnlyInObject('{{ env.SPECIAL_CHARS }}')).toBe(
        'value with spaces & $pecial chars!',
      );
    });
  });

  describe('Filters and expressions (NEW functionality)', () => {
    it('should support default filter with fallback', () => {
      process.env.EXISTING = 'exists';
      expect(renderEnvOnlyInObject("{{ env.EXISTING | default('fallback') }}")).toBe('exists');
      // NEW: When env var doesn't exist but has default filter, Nunjucks renders it
      expect(renderEnvOnlyInObject("{{ env.NONEXISTENT | default('fallback') }}")).toBe('fallback');
    });

    it('should support upper filter', () => {
      process.env.LOWERCASE = 'lowercase';
      expect(renderEnvOnlyInObject('{{ env.LOWERCASE | upper }}')).toBe('LOWERCASE');
    });

    it('should support lower filter', () => {
      process.env.UPPERCASE = 'UPPERCASE';
      expect(renderEnvOnlyInObject('{{ env.UPPERCASE | lower }}')).toBe('uppercase');
    });

    it('should support chained filters', () => {
      process.env.TEST = 'test';
      expect(renderEnvOnlyInObject("{{ env.TEST | default('x') | upper }}")).toBe('TEST');
    });

    it('should support complex filter expressions', () => {
      process.env.PORT = '8080';
      expect(renderEnvOnlyInObject('{{ env.PORT | int }}')).toBe('8080');
    });

    it('should handle filter with closing brace in argument', () => {
      process.env.VAR = 'value';
      // This is a tricky case: the default value contains }
      expect(renderEnvOnlyInObject("{{ env.VAR | default('}') }}")).toBe('value');
    });
  });

  describe('Preservation of non-env templates', () => {
    it('should preserve vars templates', () => {
      process.env.TEST_ENV_VAR = 'env_value';
      expect(renderEnvOnlyInObject('{{ env.TEST_ENV_VAR }}, {{ vars.myVar }}')).toBe(
        'env_value, {{ vars.myVar }}',
      );
    });

    it('should preserve prompt templates', () => {
      process.env.TEST_ENV_VAR = 'env_value';
      expect(renderEnvOnlyInObject('{{ env.TEST_ENV_VAR }}, {{ prompt }}')).toBe(
        'env_value, {{ prompt }}',
      );
    });

    it('should preserve multiple non-env templates', () => {
      process.env.API_HOST = 'api.example.com';
      const template =
        'Host: {{ env.API_HOST }}, Message: {{ vars.msg }}, Context: {{ context }}, Prompt: {{ prompt }}';
      const expected =
        'Host: api.example.com, Message: {{ vars.msg }}, Context: {{ context }}, Prompt: {{ prompt }}';
      expect(renderEnvOnlyInObject(template)).toBe(expected);
    });

    it('should preserve templates with filters on non-env vars', () => {
      expect(renderEnvOnlyInObject("{{ vars.name | default('Guest') }}")).toBe(
        "{{ vars.name | default('Guest') }}",
      );
    });
  });

  describe('Undefined env vars', () => {
    it('should preserve template if env var does not exist', () => {
      expect(renderEnvOnlyInObject('{{ env.NONEXISTENT }}')).toBe('{{ env.NONEXISTENT }}');
    });

    it('should preserve bracket notation if env var does not exist', () => {
      expect(renderEnvOnlyInObject("{{ env['MISSING'] }}")).toBe("{{ env['MISSING'] }}");
    });
  });

  describe('Complex data structures', () => {
    it('should work with nested objects', () => {
      process.env.LEVEL1 = 'value1';
      process.env.LEVEL2 = 'value2';
      const obj = {
        level1: {
          level2: {
            env1: '{{ env.LEVEL1 }}',
            env2: '{{ env.LEVEL2 }}',
            vars: '{{ vars.test }}',
          },
        },
      };
      expect(renderEnvOnlyInObject(obj)).toEqual({
        level1: {
          level2: {
            env1: 'value1',
            env2: 'value2',
            vars: '{{ vars.test }}',
          },
        },
      });
    });

    it('should work with arrays', () => {
      process.env.ENV1 = 'value1';
      process.env.ENV2 = 'value2';
      const arr = ['{{ env.ENV1 }}', '{{ vars.test }}', '{{ env.ENV2 }}', 42];
      expect(renderEnvOnlyInObject(arr)).toEqual(['value1', '{{ vars.test }}', 'value2', 42]);
    });

    it('should work with mixed nested structures', () => {
      process.env.API_KEY = 'secret123';
      const config = {
        api: {
          key: '{{ env.API_KEY }}',
          endpoints: ['{{ env.BASE_URL }}/users', '{{ env.BASE_URL }}/posts'],
        },
        request: {
          body: { message: '{{ vars.message }}' },
          headers: { authorization: 'Bearer {{ env.API_KEY }}' },
        },
      };
      const rendered = renderEnvOnlyInObject(config);
      expect(rendered).toEqual({
        api: {
          key: 'secret123',
          endpoints: ['{{ env.BASE_URL }}/users', '{{ env.BASE_URL }}/posts'],
        },
        request: {
          body: { message: '{{ vars.message }}' },
          headers: { authorization: 'Bearer secret123' },
        },
      });
    });
  });

  describe('Primitive types', () => {
    it('should handle null', () => {
      expect(renderEnvOnlyInObject(null)).toBeNull();
    });

    it('should handle undefined', () => {
      expect(renderEnvOnlyInObject(undefined)).toBeUndefined();
    });

    it('should handle numbers', () => {
      expect(renderEnvOnlyInObject(42)).toBe(42);
    });

    it('should handle booleans', () => {
      expect(renderEnvOnlyInObject(true)).toBe(true);
      expect(renderEnvOnlyInObject(false)).toBe(false);
    });
  });

  describe('Error handling', () => {
    it('should preserve template on Nunjucks render error', () => {
      process.env.TEST = 'value';
      // Malformed filter that would cause Nunjucks error
      const template = '{{ env.TEST | nonexistent_filter }}';
      const rendered = renderEnvOnlyInObject(template);
      // Should preserve the template if rendering fails
      expect(rendered).toBe(template);
    });
  });

  describe('PROMPTFOO_DISABLE_TEMPLATING flag', () => {
    it('should return unchanged when flag is set', () => {
      process.env.PROMPTFOO_DISABLE_TEMPLATING = 'true';
      process.env.TEST_ENV_VAR = 'env_value';
      expect(renderEnvOnlyInObject('{{ env.TEST_ENV_VAR }}')).toBe('{{ env.TEST_ENV_VAR }}');
    });

    it('should return unchanged objects when flag is set', () => {
      process.env.PROMPTFOO_DISABLE_TEMPLATING = 'true';
      process.env.TEST = 'value';
      const obj = { key: '{{ env.TEST }}' };
      expect(renderEnvOnlyInObject(obj)).toEqual({ key: '{{ env.TEST }}' });
    });
  });

  describe('Real-world scenarios', () => {
    it('should handle Azure provider config with mixed templates', () => {
      process.env.AZURE_ENDPOINT = 'test.openai.azure.com';
      process.env.API_VERSION = '2024-02-15';
      const config = {
        apiHost: '{{ env.AZURE_ENDPOINT }}',
        apiVersion: '{{ env.API_VERSION }}',
        body: {
          message: '{{ vars.userMessage }}',
          user: '{{ vars.userId }}',
        },
      };
      expect(renderEnvOnlyInObject(config)).toEqual({
        apiHost: 'test.openai.azure.com',
        apiVersion: '2024-02-15',
        body: {
          message: '{{ vars.userMessage }}',
          user: '{{ vars.userId }}',
        },
      });
    });

    it('should handle HTTP provider with runtime vars', () => {
      process.env.BASE_URL = 'https://api.example.com';
      const config = {
        url: '{{ env.BASE_URL }}/query',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer {{ env.API_TOKEN }}',
        },
        body: {
          query: '{{ vars.userQuery }}',
          context: '{{ vars.context }}',
        },
      };
      const rendered = renderEnvOnlyInObject(config);
      expect(rendered).toEqual({
        url: 'https://api.example.com/query',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer {{ env.API_TOKEN }}', // Undefined, preserved
        },
        body: {
          query: '{{ vars.userQuery }}', // Runtime vars preserved
          context: '{{ vars.context }}', // Runtime vars preserved
        },
      });
    });

    it('should handle complex provider config with filters', () => {
      process.env.API_HOST = 'api.example.com';
      process.env.PORT = '8080';
      const config = {
        baseUrl: "{{ env.API_HOST | default('localhost') }}:{{ env.PORT }}",
        timeout: '{{ env.TIMEOUT | default(30000) }}',
        request: {
          body: '{{ vars.payload }}',
        },
      };
      const rendered = renderEnvOnlyInObject(config);
      expect(rendered).toEqual({
        baseUrl: 'api.example.com:8080',
        timeout: '30000', // TIMEOUT undefined, but default filter renders it
        request: {
          body: '{{ vars.payload }}',
        },
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle multiple env vars in same string', () => {
      process.env.HOST = 'example.com';
      process.env.PORT = '8080';
      expect(renderEnvOnlyInObject('{{ env.HOST }}:{{ env.PORT }}')).toBe('example.com:8080');
    });

    it('should handle env vars in middle of text', () => {
      process.env.NAME = 'World';
      expect(renderEnvOnlyInObject('Hello {{ env.NAME }}!')).toBe('Hello World!');
    });

    it('should handle templates with newlines', () => {
      process.env.VAR = 'value';
      expect(
        renderEnvOnlyInObject(`Line 1: {{ env.VAR }}
Line 2: {{ vars.test }}`),
      ).toBe(`Line 1: value
Line 2: {{ vars.test }}`);
    });

    it('should not confuse env in other contexts', () => {
      process.env.TEST = 'value';
      // Should not match "environment" or other words containing "env"
      expect(renderEnvOnlyInObject('environment {{ vars.test }}')).toBe(
        'environment {{ vars.test }}',
      );
    });
  });
});

describe('createOutputMetadata', () => {
  it('should create metadata with all fields when evalRecord has all data', () => {
    const evalRecord = {
      createdAt: new Date('2025-01-01T12:00:00.000Z').getTime(),
      author: 'test-author',
    } as any as Eval;

    const metadata = createOutputMetadata(evalRecord);

    expect(metadata).toMatchObject({
      promptfooVersion: expect.any(String),
      nodeVersion: expect.stringMatching(/^v\d+\.\d+\.\d+/),
      platform: expect.any(String),
      arch: expect.any(String),
      exportedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
      evaluationCreatedAt: '2025-01-01T12:00:00.000Z',
      author: 'test-author',
    });
  });

  it('should handle missing createdAt gracefully', () => {
    const evalRecord = {
      author: 'test-author',
    } as any as Eval;

    const metadata = createOutputMetadata(evalRecord);

    expect(metadata).toMatchObject({
      promptfooVersion: expect.any(String),
      nodeVersion: expect.stringMatching(/^v\d+\.\d+\.\d+/),
      platform: expect.any(String),
      arch: expect.any(String),
      exportedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
      evaluationCreatedAt: undefined,
      author: 'test-author',
    });
  });

  it('should handle missing author', () => {
    const evalRecord = {
      createdAt: new Date('2025-01-01T12:00:00.000Z').getTime(),
    } as any as Eval;

    const metadata = createOutputMetadata(evalRecord);

    expect(metadata).toMatchObject({
      promptfooVersion: expect.any(String),
      nodeVersion: expect.stringMatching(/^v\d+\.\d+\.\d+/),
      platform: expect.any(String),
      arch: expect.any(String),
      exportedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
      evaluationCreatedAt: '2025-01-01T12:00:00.000Z',
      author: undefined,
    });
  });

  it('should handle invalid date in createdAt', () => {
    const evalRecord = {
      createdAt: 'invalid-date',
      author: 'test-author',
    } as any as Eval;

    const metadata = createOutputMetadata(evalRecord);

    // When new Date() is given invalid input, it returns "Invalid Date"
    expect(metadata).toMatchObject({
      promptfooVersion: expect.any(String),
      nodeVersion: expect.stringMatching(/^v\d+\.\d+\.\d+/),
      platform: expect.any(String),
      arch: expect.any(String),
      exportedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
      evaluationCreatedAt: undefined,
      author: 'test-author',
    });
  });

  it('should create consistent exportedAt timestamps', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-01-15T10:30:00.000Z'));

    const evalRecord = {} as any as Eval;
    const metadata = createOutputMetadata(evalRecord);

    expect(metadata.exportedAt).toBe('2025-01-15T10:30:00.000Z');

    jest.useRealTimers();
  });
});
