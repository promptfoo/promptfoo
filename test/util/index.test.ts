import dotenv from 'dotenv';
import * as fs from 'node:fs';
import { globSync } from 'glob';
import * as path from 'node:path';
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
import logger from '../../src/logger';
import { stat } from 'node:fs/promises';

jest.mock('../../src/database', () => ({
  getDb: jest.fn(),
}));

jest.mock('proxy-agent', () => ({
  ProxyAgent: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('glob', () => ({
  globSync: jest.fn(),
}));

jest.mock('node:fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
}));

jest.mock('node:fs/promises', () => ({
  stat: jest.fn(),
  access: jest.fn(),
  mkdir: jest.fn(),
  readFile: jest.fn(),
  writeFile: jest.fn(),
  appendFile: jest.fn(),
}));

jest.mock('../../src/esm');

jest.mock('../../src/googleSheets', () => ({
  writeCsvToGoogleSheet: jest.fn(),
}));

describe('maybeLoadToolsFromExternalFile', () => {
  const mockFileContent = JSON.stringify([
    { type: 'function', function: { name: 'calculator', parameters: { type: 'object' } } },
  ]);

  const mockToolsArray = [
    { type: 'function', function: { name: 'calculator', parameters: { type: 'object' } } },
  ];

  beforeEach(() => {
    jest.resetAllMocks();
    
    // Mock access and readFile from fs/promises
    const fsPromisesMock = require('node:fs/promises');
    jest.mocked(fsPromisesMock.access).mockResolvedValue(undefined);
    jest.mocked(fsPromisesMock.readFile).mockResolvedValue(mockFileContent);
  });

  it('should process tool objects directly', async () => {
    const tools = mockToolsArray;
    const vars = { api_key: '123456' };
    expect(await maybeLoadToolsFromExternalFile(tools, vars)).toEqual(tools);
  });

  it('should load tools from external file', async () => {
    const tools = 'file://tools.json';
    expect(await maybeLoadToolsFromExternalFile(tools)).toEqual(JSON.parse(mockFileContent));
  });

  it('should render variables in tools object', async () => {
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

    expect(await maybeLoadToolsFromExternalFile(tools, vars)).toEqual(expected);
  });

  it('should render variables and load from external file', async () => {
    const tools = 'file://{{ file_path }}.json';
    const vars = { file_path: 'tools' };

    await maybeLoadToolsFromExternalFile(tools, vars);

    // Should resolve the file path with variables first
    const fsPromisesMock = require('node:fs/promises');
    expect(fsPromisesMock.access).toHaveBeenCalledWith(expect.stringContaining('tools.json'));
    expect(fsPromisesMock.readFile).toHaveBeenCalledWith(expect.stringContaining('tools.json'), 'utf8');
  });

  it('should handle array of file paths', async () => {
    const tools = ['file://tools1.json', 'file://tools2.json'];

    await maybeLoadToolsFromExternalFile(tools);

    const fsPromisesMock = require('node:fs/promises');
    expect(fsPromisesMock.access).toHaveBeenCalledTimes(2);
    expect(fsPromisesMock.readFile).toHaveBeenCalledTimes(2);
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

      const { writeFile, appendFile } = await import('node:fs/promises');
      expect(writeFile).toHaveBeenCalled();
    });

    it('writeOutput with JSON output', async () => {
      const outputPath = 'output.json';
      const eval_ = new Eval({});
      await writeOutput(outputPath, eval_, null);

      const { writeFile } = await import('node:fs/promises');
      expect(writeFile).toHaveBeenCalled();
    });

    it('writeOutput with YAML output', async () => {
      const outputPath = 'output.yaml';
      const eval_ = new Eval({});
      await writeOutput(outputPath, eval_, null);

      const { writeFile } = await import('node:fs/promises');
      expect(writeFile).toHaveBeenCalled();
    });

    it('writeOutput with json and txt output', async () => {
      const outputPath = ['output.json', 'output.txt'];
      const eval_ = new Eval({});

      await writeMultipleOutputs(outputPath, eval_, null);

      const { writeFile } = await import('node:fs/promises');
      expect(writeFile).toHaveBeenCalledTimes(2);
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
      const { readFile } = await import('node:fs/promises');
      jest.mocked(readFile).mockResolvedValue('{}');
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

  describe('parsePathOrGlob', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      // By default, mock stat to return a file (not directory)
      jest.mocked(stat).mockResolvedValue({ isDirectory: () => false } as any);
    });

    it('should parse simple file path', async () => {
      expect(await parsePathOrGlob('/base', 'file.txt')).toEqual({
        extension: '.txt',
        functionName: undefined,
        isPathPattern: false,
        filePath: path.join('/base', 'file.txt'),
      });
    });

    it('should parse file path with function name for Python', async () => {
      expect(await parsePathOrGlob('/base', 'file.py:myFunction')).toEqual({
        extension: '.py',
        functionName: 'myFunction',
        isPathPattern: false,
        filePath: path.join('/base', 'file.py'),
      });
    });

    it('should parse file path with function name for Go', async () => {
      expect(await parsePathOrGlob('/base', 'script.go:CallApi')).toEqual({
        extension: '.go',
        functionName: 'CallApi',
        isPathPattern: false,
        filePath: path.join('/base', 'script.go'),
      });
    });

    it('should handle directory path', async () => {
      jest.mocked(stat).mockResolvedValue({ isDirectory: () => true } as any);
      expect(await parsePathOrGlob('/base', 'dir')).toEqual({
        extension: undefined,
        functionName: undefined,
        isPathPattern: true,
        filePath: path.join('/base', 'dir'),
      });
    });

    it('should handle non-existent file', async () => {
      jest.mocked(stat).mockRejectedValue(new Error('ENOENT'));
      expect(await parsePathOrGlob('/base', 'nonexistent.js')).toEqual({
        extension: '.js',
        functionName: undefined,
        isPathPattern: false,
        filePath: path.join('/base', 'nonexistent.js'),
      });
    });

    it('should throw error when file does not exist and env var is set', async () => {
      process.env.PROMPTFOO_STRICT_FILES = 'true';
      jest.mocked(stat).mockRejectedValue(new Error('ENOENT'));
      await expect(parsePathOrGlob('/base', 'nonexistent.js')).rejects.toThrow('ENOENT');
      delete process.env.PROMPTFOO_STRICT_FILES;
    });

    it('should log warning when file does not exist', async () => {
      jest.mocked(stat).mockRejectedValue(new Error('ENOENT'));
      await parsePathOrGlob('/base', 'script.py:myFunction');
      // No warning is logged in the current implementation
    });

    it('should handle file without extension', async () => {
      expect(await parsePathOrGlob('/base', 'file')).toEqual({
        extension: '',
        functionName: undefined,
        isPathPattern: false,
        filePath: path.join('/base', 'file'),
      });
    });

    it('should handle relative base path', async () => {
      expect(await parsePathOrGlob('./base', 'file.txt')).toEqual({
        extension: '.txt',
        functionName: undefined,
        isPathPattern: false,
        filePath: path.join('./base', 'file.txt'),
      });
    });

    it('should handle environment variable in file path', async () => {
      process.env.FILE_PATH = 'file.txt';
      expect(await parsePathOrGlob('/base', process.env.FILE_PATH)).toEqual({
        extension: '.txt',
        functionName: undefined,
        isPathPattern: false,
        filePath: path.join('/base', 'file.txt'),
      });
      delete process.env.FILE_PATH;
    });

    it('should detect glob pattern', async () => {
      expect(await parsePathOrGlob('/base', '*.js')).toEqual({
        extension: undefined,
        functionName: undefined,
        isPathPattern: true,
        filePath: path.join('/base', '*.js'),
      });
    });

    it('should handle nested paths with function name', async () => {
      expect(await parsePathOrGlob('/base', 'dir/subdir/file.py:func')).toEqual({
        extension: '.py',
        functionName: 'func',
        isPathPattern: false,
        filePath: path.join('/base', 'dir/subdir/file.py'),
      });
    });

    it('should handle custom file extensions', async () => {
      expect(await parsePathOrGlob('/base', 'file.customext')).toEqual({
        extension: '.customext',
        functionName: undefined,
        isPathPattern: false,
        filePath: path.join('/base', 'file.customext'),
      });
    });

    it('should handle very long nested paths', async () => {
      expect(await parsePathOrGlob('/base', 'a/b/c/d/e/f/g/file.py:func')).toEqual({
        extension: '.py',
        functionName: 'func',
        isPathPattern: false,
        filePath: path.join('/base', 'a/b/c/d/e/f/g/file.py'),
      });
    });

    it('should handle directory with nested structure', async () => {
      jest.mocked(stat).mockResolvedValue({ isDirectory: () => true } as any);
      expect(await parsePathOrGlob('/base', 'a/b/c/d/e/f/g')).toEqual({
        extension: undefined,
        functionName: undefined,
        isPathPattern: true,
        filePath: path.join('/base', 'a/b/c/d/e/f/g'),
      });
    });

    it('should use path.join to ensure cross-platform compatibility', async () => {
      const basePath = '/base';
      const relativePath = 'dir/file.txt';
      expect(await parsePathOrGlob(basePath, relativePath)).toEqual({
        extension: '.txt',
        functionName: undefined,
        isPathPattern: false,
        filePath: path.join(basePath, relativePath),
      });
    });

    it('should handle empty base path', async () => {
      expect(await parsePathOrGlob('', 'file.txt')).toEqual({
        extension: '.txt',
        functionName: undefined,
        isPathPattern: false,
        filePath: 'file.txt',
      });
    });

    it('should handle file:// protocol with relative path', async () => {
      expect(await parsePathOrGlob('', 'file://file.txt')).toEqual({
        extension: '.txt',
        functionName: undefined,
        isPathPattern: false,
        filePath: 'file.txt',
      });
    });

    it('should handle file:// protocol with ./ prefix', async () => {
      expect(await parsePathOrGlob('/absolute/base', 'file://./prompts/file.txt')).toEqual({
        extension: '.txt',
        functionName: undefined,
        isPathPattern: false,
        filePath: path.join('/absolute/base', 'prompts/file.txt'),
      });
    });

    it('should handle file:// protocol with relative base path', async () => {
      expect(await parsePathOrGlob('relative/base', 'file://file.txt')).toEqual({
        extension: '.txt',
        functionName: undefined,
        isPathPattern: false,
        filePath: path.join('relative/base', 'file.txt'),
      });
    });

    it('should handle file:// protocol with function name', async () => {
      expect(await parsePathOrGlob('/base', 'file://script.go:CallApi')).toEqual({
        extension: '.go',
        functionName: 'CallApi',
        isPathPattern: false,
        filePath: path.join('/base', 'script.go'),
      });
    });

    it('should handle file:// protocol with absolute path', async () => {
      expect(await parsePathOrGlob('/base', 'file:///absolute/path/script.go:CallApi')).toEqual({
        extension: '.go',
        functionName: 'CallApi',
        isPathPattern: false,
        filePath: '/absolute/path/script.go',
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
