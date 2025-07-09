import * as fs from 'fs';
import { globSync } from 'glob';
import yaml from 'js-yaml';
import { getEnvBool, getEnvString } from '../../src/envars';
import { fetchCsvFromGoogleSheet } from '../../src/googleSheets';
import { loadApiProvider } from '../../src/providers';
import type { AssertionType, TestCase, TestCaseWithVarsFile } from '../../src/types';
import { readStandaloneTestsFile, readTest, readTests } from '../../src/util/testCaseReader';

jest.mock('../../src/fetch', () => ({
  fetchWithTimeout: jest.fn().mockResolvedValue({ ok: true }),
}));

jest.mock('proxy-agent', () => ({
  ProxyAgent: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('glob', () => ({
  globSync: jest.fn(),
}));

jest.mock('../../src/providers', () => ({
  loadApiProvider: jest.fn(),
}));

jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  statSync: jest.fn(),
  readdirSync: jest.fn(),
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  promises: {
    readFile: jest.fn(),
  },
}));

jest.mock('../../src/database', () => ({
  getDb: jest.fn(),
}));

jest.mock('../../src/googleSheets', () => ({
  fetchCsvFromGoogleSheet: jest.fn(),
}));

jest.mock('../../src/envars', () => ({
  ...jest.requireActual('../../src/envars'),
  getEnvBool: jest.fn(),
  getEnvString: jest.fn(),
}));

jest.mock('../../src/python/pythonUtils', () => ({
  runPython: jest.fn(),
}));

jest.mock('../../src/integrations/huggingfaceDatasets', () => ({
  fetchHuggingFaceDataset: jest.fn(),
}));

jest.mock('../../src/telemetry', () => {
  const mockTelemetry = {
    record: jest.fn().mockResolvedValue(undefined),
    identify: jest.fn(),
    saveConsent: jest.fn().mockResolvedValue(undefined),
    disabled: false,
  };
  return {
    __esModule: true,
    default: mockTelemetry,
    Telemetry: jest.fn().mockImplementation(() => mockTelemetry),
  };
});

jest.mock('../../src/esm', () => ({
  importModule: jest.fn(),
}));

jest.mock('../../src/util/file', () => ({
  maybeLoadConfigFromExternalFile: jest.fn((config) => {
    if (config && typeof config === 'object') {
      const result = { ...config };
      for (const [key, value] of Object.entries(config)) {
        if (typeof value === 'string' && value.startsWith('file://')) {
          const filePath = value.slice('file://'.length);
          const fs = jest.requireMock('fs');
          const fileContent = fs.readFileSync(filePath, 'utf-8');
          if (typeof fileContent === 'string') {
            try {
              result[key] = JSON.parse(fileContent);
            } catch {
              result[key] = fileContent;
            }
          }
        }
      }
      return result;
    }
    return config;
  }),
}));

jest.mock('xlsx', () => ({
  readFile: jest.fn(),
  utils: { sheet_to_json: jest.fn() },
}));

const clearAllMocks = () => {
  jest.clearAllMocks();
  jest.mocked(globSync).mockReset();
  jest.mocked(fs.readFileSync).mockReset();
  jest.mocked(getEnvBool).mockReset();
  jest.mocked(getEnvString).mockReset();
  jest.mocked(fetchCsvFromGoogleSheet).mockReset();
  jest.mocked(loadApiProvider).mockReset();
  const mockRunPython = jest.requireMock('../../src/python/pythonUtils').runPython;
  mockRunPython.mockReset();
  const mockImportModule = jest.requireMock('../../src/esm').importModule;
  mockImportModule.mockReset();
  const mockFetchHuggingFaceDataset = jest.requireMock(
    '../../src/integrations/huggingfaceDatasets',
  ).fetchHuggingFaceDataset;
  mockFetchHuggingFaceDataset.mockReset();
};

describe('readStandaloneTestsFile', () => {
  beforeEach(() => {
    clearAllMocks();
    jest.mocked(getEnvString).mockImplementation((key, defaultValue) => defaultValue || '');
  });

  afterEach(() => {
    clearAllMocks();
  });

  it('should read CSV file and return test cases', async () => {
    jest
      .mocked(fs.readFileSync)
      .mockReturnValue('var1,var2,__expected\nvalue1,value2,expected1\nvalue3,value4,expected2');
    const result = await readStandaloneTestsFile('test.csv');

    expect(fs.readFileSync).toHaveBeenCalledWith(expect.stringContaining('test.csv'), 'utf-8');
    expect(result).toEqual([
      {
        assert: [{ metric: undefined, type: 'equals', value: 'expected1' }],
        description: 'Row #1',
        options: {},
        vars: { var1: 'value1', var2: 'value2' },
      },
      {
        assert: [{ metric: undefined, type: 'equals', value: 'expected2' }],
        description: 'Row #2',
        options: {},
        vars: { var1: 'value3', var2: 'value4' },
      },
    ]);
  });

  it('should read CSV file with BOM (Byte Order Mark) and return test cases', async () => {
    jest
      .mocked(fs.readFileSync)
      .mockReturnValue(
        '\uFEFFvar1,var2,__expected\nvalue1,value2,expected1\nvalue3,value4,expected2',
      );
    const result = await readStandaloneTestsFile('test.csv');

    expect(fs.readFileSync).toHaveBeenCalledWith(expect.stringContaining('test.csv'), 'utf-8');
    expect(result).toEqual([
      {
        assert: [{ metric: undefined, type: 'equals', value: 'expected1' }],
        description: 'Row #1',
        options: {},
        vars: { var1: 'value1', var2: 'value2' },
      },
      {
        assert: [{ metric: undefined, type: 'equals', value: 'expected2' }],
        description: 'Row #2',
        options: {},
        vars: { var1: 'value3', var2: 'value4' },
      },
    ]);
  });

  it('should read JSON file and return test cases', async () => {
    jest.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify([
        {
          vars: { var1: 'value1', var2: 'value2' },
          assert: [{ type: 'equals', value: 'expected1' }],
          description: 'Test #1',
        },
        {
          vars: { var1: 'value3', var2: 'value4' },
          assert: [{ type: 'contains', value: 'expected2' }],
          description: 'Test #2',
        },
      ]),
    );
    const result = await readStandaloneTestsFile('test.json');

    expect(fs.readFileSync).toHaveBeenCalledWith(expect.stringContaining('test.json'), 'utf-8');
    expect(result).toEqual([
      {
        vars: { var1: 'value1', var2: 'value2' },
        assert: [{ type: 'equals', value: 'expected1' }],
        description: 'Test #1',
      },
      {
        vars: { var1: 'value3', var2: 'value4' },
        assert: [{ type: 'contains', value: 'expected2' }],
        description: 'Test #2',
      },
    ]);
  });

  it('should read JSONL file and return test cases', async () => {
    jest
      .mocked(fs.readFileSync)
      .mockReturnValue(
        '{"vars":{"var1":"value1","var2":"value2"},"assert":[{"type":"equals","value":"Hello World"}]}\n' +
          '{"vars":{"var1":"value3","var2":"value4"},"assert":[{"type":"equals","value":"Hello World"}]}',
      );
    const result = await readStandaloneTestsFile('test.jsonl');

    expect(fs.readFileSync).toHaveBeenCalledWith(expect.stringContaining('test.jsonl'), 'utf-8');
    expect(result).toEqual([
      {
        assert: [{ type: 'equals', value: 'Hello World' }],
        description: 'Row #1',
        vars: { var1: 'value1', var2: 'value2' },
      },
      {
        assert: [{ type: 'equals', value: 'Hello World' }],
        description: 'Row #2',
        vars: { var1: 'value3', var2: 'value4' },
      },
    ]);
  });

  it('should read YAML file and return test cases', async () => {
    const yamlContent = `
      - var1: value1
        var2: value2
      - var1: value3
        var2: value4
    `;
    jest.mocked(fs.readFileSync).mockReturnValue(yamlContent);
    const result = await readStandaloneTestsFile('test.yaml');

    expect(fs.readFileSync).toHaveBeenCalledWith(expect.stringContaining('test.yaml'), 'utf-8');
    expect(result).toEqual([
      { assert: [], description: 'Row #1', options: {}, vars: { var1: 'value1', var2: 'value2' } },
      { assert: [], description: 'Row #2', options: {}, vars: { var1: 'value3', var2: 'value4' } },
    ]);
  });

  it('should read Google Sheets and return test cases', async () => {
    const mockFetchCsvFromGoogleSheet = jest.mocked(fetchCsvFromGoogleSheet);
    mockFetchCsvFromGoogleSheet.mockResolvedValue([
      { var1: 'value1', var2: 'value2', __expected: 'expected1' },
      { var1: 'value3', var2: 'value4', __expected: 'expected2' },
    ]);
    const result = await readStandaloneTestsFile('https://docs.google.com/spreadsheets/d/example');

    expect(mockFetchCsvFromGoogleSheet).toHaveBeenCalledWith(
      'https://docs.google.com/spreadsheets/d/example',
    );
    expect(result).toEqual([
      {
        assert: [{ metric: undefined, type: 'equals', value: 'expected1' }],
        description: 'Row #1',
        options: {},
        vars: { var1: 'value1', var2: 'value2' },
      },
      {
        assert: [{ metric: undefined, type: 'equals', value: 'expected2' }],
        description: 'Row #2',
        options: {},
        vars: { var1: 'value3', var2: 'value4' },
      },
    ]);
  });

  it('should read JS file and return test cases', async () => {
    const mockTestCases = [
      { vars: { var1: 'value1', var2: 'value2' } },
      { vars: { var1: 'value3', var2: 'value4' } },
    ];

    jest.mocked(jest.requireMock('../../src/esm').importModule).mockResolvedValue(mockTestCases);

    const result = await readStandaloneTestsFile('test.js');

    expect(jest.requireMock('../../src/esm').importModule).toHaveBeenCalledWith(
      expect.stringContaining('test.js'),
      undefined,
    );
    expect(result).toEqual(mockTestCases);
  });

  it('should pass config to JS test generator function', async () => {
    const mockFn = jest.fn().mockResolvedValue([{ vars: { a: 1 } }]);
    jest.mocked(jest.requireMock('../../src/esm').importModule).mockResolvedValue(mockFn);

    const config = { foo: 'bar' };
    const result = await readStandaloneTestsFile('test_gen.js', '', config);

    expect(jest.requireMock('../../src/esm').importModule).toHaveBeenCalledWith(
      expect.stringContaining('test_gen.js'),
      undefined,
    );
    expect(mockFn).toHaveBeenCalledWith(config);
    expect(result).toEqual([{ vars: { a: 1 } }]);
  });

  it('should load file references in config for JS generator', async () => {
    const mockResult = [{ vars: { a: 1 } }];
    const mockFn = jest.fn().mockResolvedValue(mockResult);
    jest.mocked(jest.requireMock('../../src/esm').importModule).mockResolvedValue(mockFn);

    jest.mocked(fs.existsSync).mockReturnValueOnce(true);
    jest.mocked(fs.readFileSync).mockReturnValueOnce('{"foo": "bar"}');

    const config = { data: 'file://config.json' };
    const result = await readStandaloneTestsFile('test_config_gen.js', '', config);

    expect(jest.requireMock('../../src/esm').importModule).toHaveBeenCalledWith(
      expect.stringContaining('test_config_gen.js'),
      undefined,
    );
    expect(mockFn).toHaveBeenCalledWith({ data: { foo: 'bar' } });
    expect(result).toEqual(mockResult);
  });

  it('should handle file:// prefix in file path', async () => {
    jest.mocked(fs.readFileSync).mockReturnValue('var1,var2\nvalue1,value2');
    await readStandaloneTestsFile('file://test.csv');

    expect(fs.readFileSync).toHaveBeenCalledWith(expect.not.stringContaining('file://'), 'utf-8');
  });

  it('should read CSV file with custom delimiter', async () => {
    jest.mocked(getEnvString).mockReturnValue(';');
    jest
      .mocked(fs.readFileSync)
      .mockReturnValue('var1;var2;__expected\nvalue1;value2;expected1\nvalue3;value4;expected2');

    const result = await readStandaloneTestsFile('test.csv');

    expect(getEnvString).toHaveBeenCalledWith('PROMPTFOO_CSV_DELIMITER', ',');
    expect(fs.readFileSync).toHaveBeenCalledWith(expect.stringContaining('test.csv'), 'utf-8');
    expect(result).toEqual([
      {
        assert: [{ metric: undefined, type: 'equals', value: 'expected1' }],
        description: 'Row #1',
        options: {},
        vars: { var1: 'value1', var2: 'value2' },
      },
      {
        assert: [{ metric: undefined, type: 'equals', value: 'expected2' }],
        description: 'Row #2',
        options: {},
        vars: { var1: 'value3', var2: 'value4' },
      },
    ]);
  });

  it('should handle Python files with default function name', async () => {
    const pythonResult = [
      { vars: { var1: 'value1' }, assert: [{ type: 'equals', value: 'expected1' }] },
      { vars: { var2: 'value2' }, assert: [{ type: 'equals', value: 'expected2' }] },
    ];
    const mockRunPython = jest.requireMock('../../src/python/pythonUtils').runPython;
    mockRunPython.mockResolvedValueOnce(pythonResult);

    const result = await readStandaloneTestsFile('test.py');

    expect(mockRunPython).toHaveBeenCalledWith(
      expect.stringContaining('test.py'),
      'generate_tests',
      [],
    );
    expect(result).toEqual(pythonResult);
  });

  it('should handle Python files with custom function name', async () => {
    const pythonResult = [
      { vars: { var1: 'value1' }, assert: [{ type: 'equals', value: 'expected1' }] },
    ];
    const mockRunPython = jest.requireMock('../../src/python/pythonUtils').runPython;
    mockRunPython.mockResolvedValueOnce(pythonResult);

    const result = await readStandaloneTestsFile('test.py:custom_function');

    expect(mockRunPython).toHaveBeenCalledWith(
      expect.stringContaining('test.py'),
      'custom_function',
      [],
    );
    expect(result).toEqual(pythonResult);
  });

  it('should pass config to Python generate_tests function', async () => {
    const pythonResult = [{ vars: { a: 1 }, assert: [] }];
    const mockRunPython = jest.requireMock('../../src/python/pythonUtils').runPython;
    mockRunPython.mockResolvedValueOnce(pythonResult);

    const config = { dataset: 'demo' };
    const result = await readStandaloneTestsFile('test.py', '', config);

    expect(mockRunPython).toHaveBeenCalledWith(
      expect.stringContaining('test.py'),
      'generate_tests',
      [config],
    );
    expect(result).toEqual(pythonResult);
  });

  it('should load file references in config for Python generator', async () => {
    const pythonResult = [{ vars: { a: 1 }, assert: [] }];
    const mockRunPython = jest.requireMock('../../src/python/pythonUtils').runPython;
    mockRunPython.mockResolvedValueOnce(pythonResult);

    jest.mocked(fs.existsSync).mockReturnValueOnce(true);
    jest.mocked(fs.readFileSync).mockReturnValueOnce('{"foo": "bar"}');
    const config = { data: 'file://config.json' };
    await readStandaloneTestsFile('test.py', '', config);

    expect(mockRunPython).toHaveBeenCalledWith(
      expect.stringContaining('test.py'),
      'generate_tests',
      [{ data: { foo: 'bar' } }],
    );
  });

  it('should throw error when Python file returns non-array', async () => {
    const mockRunPython = jest.requireMock('../../src/python/pythonUtils').runPython;
    mockRunPython.mockReset();
    mockRunPython.mockResolvedValueOnce({ not: 'an array' });

    await expect(readStandaloneTestsFile('test.py')).rejects.toThrow(
      'Python test function must return a list of test cases, got object',
    );
  });

  it('should handle Python files with invalid function name in readStandaloneTestsFile', async () => {
    await expect(readStandaloneTestsFile('test.py:invalid:extra')).rejects.toThrow(
      'Too many colons. Invalid test file script path: test.py:invalid:extra',
    );
  });

  it('should read JSON file with a single test case object', async () => {
    jest.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        vars: { var1: 'value1', var2: 'value2' },
        assert: [{ type: 'equals', value: 'expected1' }],
        description: 'Single Test',
      }),
    );
    const result = await readStandaloneTestsFile('test.json');

    expect(fs.readFileSync).toHaveBeenCalledWith(expect.stringContaining('test.json'), 'utf-8');
    expect(result).toEqual([
      {
        vars: { var1: 'value1', var2: 'value2' },
        assert: [{ type: 'equals', value: 'expected1' }],
        description: 'Single Test',
      },
    ]);
  });
});

describe('readTest', () => {
  beforeEach(() => {
    clearAllMocks();
  });

  afterEach(() => {
    clearAllMocks();
  });

  it('readTest with string input (path to test config)', async () => {
    const testPath = 'test1.yaml';
    const testContent = {
      description: 'Test 1',
      vars: { var1: 'value1', var2: 'value2' },
      assert: [{ type: 'equals', value: 'value1' }],
    };
    jest.mocked(fs.readFileSync).mockReturnValueOnce(yaml.dump(testContent));

    const result = await readTest(testPath);

    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    expect(result).toEqual(testContent);
  });

  it('readTest with TestCase input', async () => {
    const input: TestCase = {
      description: 'Test 1',
      vars: { var1: 'value1', var2: 'value2' },
      assert: [{ type: 'equals', value: 'value1' }],
    };

    const result = await readTest(input);

    expect(result).toEqual(input);
  });

  it('readTest with invalid input', async () => {
    const input = {} as TestCase;

    await expect(readTest(input)).rejects.toThrow(
      'Test case must contain one of the following properties: assert, vars, options, metadata, provider, providerOutput, threshold.\n\nInstead got:\n{}',
    );
  });

  it('readTest with TestCase that contains a vars glob input', async () => {
    const input: TestCaseWithVarsFile = {
      description: 'Test 1',
      vars: 'vars/*.yaml',
      assert: [{ type: 'equals' as AssertionType, value: 'value1' }],
    };
    const varsContent1 = { var1: 'value1' };
    const varsContent2 = { var2: 'value2' };
    jest.mocked(globSync).mockReturnValueOnce(['vars/vars1.yaml', 'vars/vars2.yaml']);
    jest
      .mocked(fs.readFileSync)
      .mockReturnValueOnce(yaml.dump(varsContent1))
      .mockReturnValueOnce(yaml.dump(varsContent2));

    const result = await readTest(input);

    expect(globSync).toHaveBeenCalledTimes(1);
    expect(fs.readFileSync).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      description: 'Test 1',
      vars: { var1: 'value1', var2: 'value2' },
      assert: [{ type: 'equals', value: 'value1' }],
    });
  });

  describe('readTest with provider', () => {
    it('should load provider when provider is a string', async () => {
      const mockProvider = { callApi: jest.fn(), id: jest.fn().mockReturnValue('mock-provider') };
      jest.mocked(loadApiProvider).mockResolvedValue(mockProvider);

      const testCase: TestCase = {
        description: 'Test with string provider',
        provider: 'mock-provider',
        assert: [{ type: 'equals', value: 'expected' }],
      };

      const result = await readTest(testCase);

      expect(loadApiProvider).toHaveBeenCalledWith('mock-provider');
      expect(result.provider).toBe(mockProvider);
    });

    it('should load provider when provider is an object with id', async () => {
      const mockProvider = { callApi: jest.fn(), id: jest.fn().mockReturnValue('mock-provider') };
      jest.mocked(loadApiProvider).mockResolvedValue(mockProvider);

      const testCase: TestCase = {
        description: 'Test with provider object',
        provider: {
          id: 'mock-provider',
          callApi: jest.fn(),
        } as any,
        assert: [{ type: 'equals', value: 'expected' }],
      };

      const result = await readTest(testCase);

      expect(loadApiProvider).toHaveBeenCalledWith('mock-provider', {
        options: { id: 'mock-provider', callApi: expect.any(Function) },
        basePath: '',
      });
      expect(result.provider).toBe(mockProvider);
    });
  });
});

describe('readTests', () => {
  beforeEach(() => {
    clearAllMocks();
    jest.mocked(globSync).mockReturnValue([]);
  });

  afterEach(() => {
    clearAllMocks();
  });

  it('should handle undefined tests', async () => {
    const result = await readTests(undefined);
    expect(result).toEqual([]);
  });

  it('should handle string input (CSV file path)', async () => {
    jest
      .mocked(fs.readFileSync)
      .mockReturnValue('var1,var2,__expected\nvalue1,value2,value1\nvalue3,value4,fn:value5');
    const testsPath = 'tests.csv';

    const result = await readTests(testsPath);

    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      {
        description: 'Row #1',
        vars: { var1: 'value1', var2: 'value2' },
        assert: [{ type: 'equals', value: 'value1' }],
        options: {},
      },
      {
        description: 'Row #2',
        vars: { var1: 'value3', var2: 'value4' },
        assert: [{ type: 'javascript', value: 'value5' }],
        options: {},
      },
    ]);
  });

  it('should handle array of test cases', async () => {
    const tests = [
      {
        description: 'Test 1',
        vars: { var1: 'value1' },
        assert: [{ type: 'equals', value: 'expected1' }],
      },
      {
        description: 'Test 2',
        vars: { var2: 'value2' },
        assert: [{ type: 'equals', value: 'expected2' }],
      },
    ] as any;

    const result = await readTests(tests);

    expect(result).toEqual(tests);
  });

  it('should handle array of file paths', async () => {
    jest.mocked(globSync).mockReturnValueOnce(['test1.yaml', 'test2.yaml']);
    jest
      .mocked(fs.readFileSync)
      .mockReturnValueOnce(yaml.dump({ description: 'Test 1', vars: { var1: 'value1' } }))
      .mockReturnValueOnce(yaml.dump({ description: 'Test 2', vars: { var2: 'value2' } }));

    const result = await readTests(['*.yaml']);

    expect(globSync).toHaveBeenCalledTimes(1);
    expect(fs.readFileSync).toHaveBeenCalledTimes(2);
    expect(result).toEqual([
      { description: 'Test 1', vars: { var1: 'value1' } },
      { description: 'Test 2', vars: { var2: 'value2' } },
    ]);
  });

  it('should handle object with path and config', async () => {
    jest.mocked(fs.readFileSync).mockReturnValue('var1,var2,__expected\nvalue1,value2,expected1');

    const result = await readTests({
      path: 'test.csv',
      config: { someConfig: 'value' },
    });

    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      {
        description: 'Row #1',
        vars: { var1: 'value1', var2: 'value2' },
        assert: [{ type: 'equals', value: 'expected1' }],
        options: {},
      },
    ]);
  });
});
