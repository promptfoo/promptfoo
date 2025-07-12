import dotenv from 'dotenv';
import * as fs from 'fs';
import { globSync } from 'glob';
import * as os from 'os';
import * as path from 'path';
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
  appendFileSync: jest.fn(),
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
    beforeEach(() => {
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
      } as any);
      jest.useFakeTimers().setSystemTime(new Date('2024-01-01T01:00:00Z'));
      jest.spyOn(os, 'platform').mockReturnValue('linux');
      jest.spyOn(os, 'arch').mockReturnValue('arm64');
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('writeOutput with CSV output', async () => {
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
      } as any);

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
          } as any,
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
      const eval_ = new Eval({} as any);
      await eval_.addResult(results[0]);

      const shareableUrl = null;
      await writeOutput(outputPath, eval_, shareableUrl);

      expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
    });

    it('writes output to Google Sheets', async () => {
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
      } as any);

      const outputPath = 'https://docs.google.com/spreadsheets/d/1234567890/edit#gid=0';

      const config = { description: 'Test config' };
      const shareableUrl = null;
      const eval_ = new Eval(config as any);
      jest
        .spyOn(eval_, 'getTable')
        .mockImplementation()
        .mockResolvedValue({
          head: {
            vars: ['var1'],
            prompts: [{ label: 'Prompt1', provider: 'foo', raw: '' }] as any,
          },
          body: [
            {
              vars: ['val1'],
              outputs: [
                {
                  pass: true,
                  failureReason: ResultFailureReason.NONE,
                  score: 1,
                  namedScores: {},
                  text: 'result',
                  cost: 0,
                  id: '',
                  latencyMs: 0,
                  prompt: {} as any,
                  testCase: {} as any,
                },
              ],
            } as any,
          ],
        });
      eval_.id = 'test-eval-id';
      eval_.config = config as any;

      await writeOutput(outputPath, eval_, shareableUrl);

      expect(googleSheets.writeCsvToGoogleSheet).toHaveBeenCalledTimes(1);
    });
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

describe('readFilters', () => {
  it('readFilters', async () => {
    const mockFilter = jest.fn();
    jest.doMock(path.resolve('filter.js'), () => mockFilter, { virtual: true });

    jest.mocked(globSync).mockImplementation((pathOrGlob) => [pathOrGlob].flat());

    const filters = await readFilters({ testFilter: 'filter.js' });

    expect(filters.testFilter).toBe(mockFilter);
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

  it('should handle file:// prefix', () => {
    jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as fs.Stats);
    expect(parsePathOrGlob('/base', 'file://script.go:CallApi')).toEqual({
      extension: '.go',
      functionName: 'CallApi',
      isPathPattern: false,
      filePath: path.join('/base', 'script.go'),
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

describe('setupEnv', () => {
  let originalEnv: typeof process.env;
  let dotenvConfigSpy: jest.SpyInstance<
    dotenv.DotenvConfigOutput,
    [options?: dotenv.DotenvConfigOptions]
  >;

  beforeEach(() => {
    originalEnv = { ...process.env };
    delete process.env.NODE_ENV;
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
    dotenvConfigSpy.mockImplementation((options?: dotenv.DotenvConfigOptions) => {
      if (options?.path === '.env.production') {
        if (options.override) {
          process.env.NODE_ENV = 'production';
        } else if (!process.env.NODE_ENV) {
          process.env.NODE_ENV = 'production';
        }
      } else {
        if (!process.env.NODE_ENV) {
          process.env.NODE_ENV = 'development';
        }
      }
      return { parsed: {} };
    });

    setupEnv(undefined);
    expect(process.env.NODE_ENV).toBe('development');

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

  it('should handle function objects', () => {
    const obj = {
      fn: ({ vars }: { vars: Record<string, string> }) => vars.value,
    };
    const vars = { value: 'test_value' };
    const rendered = renderVarsInObject(obj, vars);
    expect(rendered).toEqual({ fn: 'test_value' });
  });
});
