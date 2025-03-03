import dedent from 'dedent';
import * as fs from 'fs';
import { globSync } from 'glob';
import yaml from 'js-yaml';
import { testCaseFromCsvRow } from '../../src/csv';
import { getEnvBool, getEnvString } from '../../src/envars';
import { fetchCsvFromGoogleSheet } from '../../src/googleSheets';
import logger from '../../src/logger';
import { loadApiProvider } from '../../src/providers';
import type { AssertionType, TestCase, TestCaseWithVarsFile } from '../../src/types';
import {
  loadTestsFromGlob,
  readStandaloneTestsFile,
  readTest,
  readTests,
  readTestFiles,
} from '../../src/util/testCaseReader';

jest.mock('proxy-agent', () => ({
  ProxyAgent: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('glob', () => ({
  globSync: jest.fn(),
}));
jest.mock('../../src/providers', () => ({
  loadApiProvider: jest.fn(),
}));
jest.mock('../../src/fetch');

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

describe('readStandaloneTestsFile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
        { var1: 'value1', var2: 'value2' },
        { var1: 'value3', var2: 'value4' },
      ]),
    );
    const result = await readStandaloneTestsFile('test.json');

    expect(fs.readFileSync).toHaveBeenCalledWith(expect.stringContaining('test.json'), 'utf-8');
    expect(result).toEqual([
      { assert: [], description: 'Row #1', options: {}, vars: { var1: 'value1', var2: 'value2' } },
      { assert: [], description: 'Row #2', options: {}, vars: { var1: 'value3', var2: 'value4' } },
    ]);
  });

  it('should read YAML file and return test cases', async () => {
    jest.mocked(fs.readFileSync).mockReturnValue(dedent`
      - var1: value1
        var2: value2
      - var1: value3
        var2: value4
    `);
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
    jest.mock(
      '../../test.js',
      () => [
        { vars: { var1: 'value1', var2: 'value2' } },
        { vars: { var1: 'value3', var2: 'value4' } },
      ],
      { virtual: true },
    );

    const result = await readStandaloneTestsFile('test.js');
    expect(result).toEqual([
      {
        vars: { var1: 'value1', var2: 'value2' },
      },
      {
        vars: { var1: 'value3', var2: 'value4' },
      },
    ]);
  });

  it('should handle file:// prefix in file path', async () => {
    jest.mocked(fs.readFileSync).mockReturnValue('var1,var2\nvalue1,value2');
    await readStandaloneTestsFile('file://test.csv');

    expect(fs.readFileSync).toHaveBeenCalledWith(expect.not.stringContaining('file://'), 'utf-8');
  });

  it('should return an empty array for unsupported file types', async () => {
    await expect(readStandaloneTestsFile('test.txt')).resolves.toEqual([]);
  });

  it('should read CSV file with default delimiter', async () => {
    jest.mocked(getEnvString).mockReturnValue(',');
    jest
      .mocked(fs.readFileSync)
      .mockReturnValue('var1,var2,__expected\nvalue1,value2,expected1\nvalue3,value4,expected2');

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

  it('should throw error when Python file returns non-array', async () => {
    const mockRunPython = jest.requireMock('../../src/python/pythonUtils').runPython;
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
});

describe('readTest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
    const input: any = 123;

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
        },
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
    jest.resetAllMocks();
    jest.mocked(globSync).mockReturnValue([]);
  });

  it('readTests with string input (CSV file path)', async () => {
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

  it('readTests with string input (CSV file path with file:// prefix)', async () => {
    jest
      .mocked(fs.readFileSync)
      .mockReturnValue('var1,var2,__expected\nvalue1,value2,value1\nvalue3,value4,fn:value5');
    const testsPath = 'file://tests.csv';

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

  it('readTests with multiple __expected in CSV', async () => {
    jest
      .mocked(fs.readFileSync)
      .mockReturnValue(
        'var1,var2,__expected1,__expected2,__expected3\nvalue1,value2,value1,value1.2,value1.3\nvalue3,value4,fn:value5,fn:value5.2,fn:value5.3',
      );
    const testsPath = 'tests.csv';

    const result = await readTests(testsPath);

    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      {
        description: 'Row #1',
        vars: { var1: 'value1', var2: 'value2' },
        assert: [
          { type: 'equals', value: 'value1' },
          { type: 'equals', value: 'value1.2' },
          { type: 'equals', value: 'value1.3' },
        ],
        options: {},
      },
      {
        description: 'Row #2',
        vars: { var1: 'value3', var2: 'value4' },
        assert: [
          { type: 'javascript', value: 'value5' },
          { type: 'javascript', value: 'value5.2' },
          { type: 'javascript', value: 'value5.3' },
        ],
        options: {},
      },
    ]);
  });

  it('readTests with array input (TestCase[])', async () => {
    const input: TestCase[] = [
      {
        description: 'Test 1',
        vars: { var1: 'value1', var2: 'value2' },
        assert: [{ type: 'equals', value: 'value1' }],
      },
      {
        description: 'Test 2',
        vars: { var1: 'value3', var2: 'value4' },
        assert: [{ type: 'contains-json', value: 'value3' }],
      },
    ];

    const result = await readTests(input);

    expect(result).toEqual(input);
  });

  it('readTests with string array input (paths to test configs)', async () => {
    const testsPaths = ['test1.yaml', 'test2.yaml'];
    const test1Content = [
      {
        description: 'Test 1',
        vars: { var1: 'value1', var2: 'value2' },
        assert: [{ type: 'equals', value: 'value1' }],
      },
    ];
    const test2Content = [
      {
        description: 'Test 2',
        vars: { var1: 'value3', var2: 'value4' },
        assert: [{ type: 'contains-json', value: 'value3' }],
      },
    ];
    jest
      .mocked(fs.readFileSync)
      .mockReturnValueOnce(yaml.dump(test1Content))
      .mockReturnValueOnce(yaml.dump(test2Content));
    jest.mocked(globSync).mockImplementation((pathOrGlob) => [pathOrGlob].flat());

    const result = await readTests(testsPaths);

    expect(fs.readFileSync).toHaveBeenCalledTimes(2);
    expect(result).toEqual([...test1Content, ...test2Content]);
  });

  it('readTests with vars glob input (paths to vars configs)', async () => {
    const testsPaths = ['test1.yaml'];
    const test1Content = [
      {
        description: 'Test 1',
        vars: 'vars1.yaml',
        assert: [{ type: 'equals', value: 'value1' }],
      },
    ];
    const vars1Content = {
      var1: 'value1',
      var2: 'value2',
    };
    jest
      .mocked(fs.readFileSync)
      .mockReturnValueOnce(yaml.dump(test1Content))
      .mockReturnValueOnce(yaml.dump(vars1Content));
    jest.mocked(globSync).mockImplementation((pathOrGlob) => [pathOrGlob].flat());

    const result = await readTests(testsPaths);

    expect(fs.readFileSync).toHaveBeenCalledTimes(2);
    expect(result).toEqual([Object.assign({}, test1Content[0], { vars: vars1Content })]);
  });

  it('readTests with single TestCase content', async () => {
    const testsPaths = ['test1.yaml'];
    const test1Content = {
      description: 'Test 1',
      assert: [{ type: 'equals', value: 'value1' }],
    };
    jest.mocked(fs.readFileSync).mockReturnValueOnce(yaml.dump(test1Content));
    jest.mocked(globSync).mockImplementation((pathOrGlob) => [pathOrGlob].flat());

    const result = await readTests(testsPaths);

    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    expect(result).toEqual([test1Content]);
  });

  it('should read tests from a Google Sheets URL', async () => {
    const mockFetchCsvFromGoogleSheet =
      jest.requireMock('../../src/googleSheets').fetchCsvFromGoogleSheet;
    mockFetchCsvFromGoogleSheet.mockResolvedValue([
      { var1: 'value1', var2: 'value2', __expected: 'expected1' },
      { var1: 'value3', var2: 'value4', __expected: 'expected2' },
    ]);

    const result = await readTests('https://docs.google.com/spreadsheets/d/example');

    expect(mockFetchCsvFromGoogleSheet).toHaveBeenCalledWith(
      'https://docs.google.com/spreadsheets/d/example',
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      description: 'Row #1',
      vars: { var1: 'value1', var2: 'value2' },
      assert: [{ type: 'equals', value: 'expected1' }],
    });
    expect(result[1]).toMatchObject({
      description: 'Row #2',
      vars: { var1: 'value3', var2: 'value4' },
      assert: [{ type: 'equals', value: 'expected2' }],
    });
  });

  it('should log a warning for unsupported test format', async () => {
    const unsupportedTests = { invalid: 'format' };

    await readTests(unsupportedTests as any);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Warning: Unsupported 'tests' format in promptfooconfig.yaml."),
    );
  });

  it('should not log a warning if tests is undefined', async () => {
    await readTests(undefined);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('should read tests from multiple Google Sheets URLs', async () => {
    jest.mocked(globSync).mockReturnValueOnce([]);
    const mockFetchCsvFromGoogleSheet = jest.mocked(fetchCsvFromGoogleSheet);
    mockFetchCsvFromGoogleSheet
      .mockResolvedValueOnce([
        { var1: 'value1', var2: 'value2', __expected: 'expected1' },
        { var1: 'value3', var2: 'value4', __expected: 'expected2' },
      ])
      .mockResolvedValueOnce([
        { var1: 'value5', var2: 'value6', __expected: 'expected3' },
        { var1: 'value7', var2: 'value8', __expected: 'expected4' },
      ]);

    const result = await readTests([
      'https://docs.google.com/spreadsheets/d/example1',
      'https://docs.google.com/spreadsheets/d/example2',
    ]);

    expect(mockFetchCsvFromGoogleSheet).toHaveBeenCalledTimes(2);
    expect(mockFetchCsvFromGoogleSheet).toHaveBeenCalledWith(
      'https://docs.google.com/spreadsheets/d/example1',
    );
    expect(mockFetchCsvFromGoogleSheet).toHaveBeenCalledWith(
      'https://docs.google.com/spreadsheets/d/example2',
    );
    expect(result).toHaveLength(4);
    expect(result[0]).toMatchObject({
      description: 'Row #1',
      vars: { var1: 'value1', var2: 'value2' },
      assert: [{ type: 'equals', value: 'expected1' }],
    });
    expect(result[2]).toMatchObject({
      description: 'Row #1',
      vars: { var1: 'value5', var2: 'value6' },
      assert: [{ type: 'equals', value: 'expected3' }],
    });
  });

  it('should handle HuggingFace dataset URLs', async () => {
    const mockDataset: TestCase[] = [
      {
        description: 'Test 1',
        vars: { var1: 'value1' },
        assert: [{ type: 'equals', value: 'expected1' }],
        options: {},
      },
      {
        description: 'Test 2',
        vars: { var2: 'value2' },
        assert: [{ type: 'equals', value: 'expected2' }],
        options: {},
      },
    ];
    const mockFetchHuggingFaceDataset = jest.requireMock(
      '../../src/integrations/huggingfaceDatasets',
    ).fetchHuggingFaceDataset;
    mockFetchHuggingFaceDataset.mockImplementation(async () => mockDataset);
    jest.mocked(globSync).mockReturnValueOnce([]);

    const result = await readTests('huggingface://datasets/example/dataset');

    expect(mockFetchHuggingFaceDataset).toHaveBeenCalledWith(
      'huggingface://datasets/example/dataset',
    );
    expect(result).toEqual(mockDataset);
  });

  it('should handle JSONL files', async () => {
    const expectedTests: TestCase[] = [
      {
        description: 'Test 1',
        vars: { var1: 'value1' },
        assert: [{ type: 'equals', value: 'expected1' }],
        options: {},
      },
      {
        description: 'Test 2',
        vars: { var2: 'value2' },
        assert: [{ type: 'equals', value: 'expected2' }],
        options: {},
      },
    ];
    const jsonlContent = expectedTests.map((test) => JSON.stringify(test)).join('\n');
    jest.mocked(fs.readFileSync).mockReturnValueOnce(jsonlContent);
    jest.mocked(globSync).mockImplementation((pathOrGlob) => [pathOrGlob].flat());

    const result = await readTests(['test.jsonl']);

    expect(result).toEqual(expectedTests);
  });

  it('should handle file read errors gracefully', async () => {
    jest.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('File read error');
    });
    jest.mocked(globSync).mockImplementation((pathOrGlob) => [pathOrGlob].flat());

    await expect(readTests(['test.yaml'])).rejects.toThrow('File read error');
  });

  it('should handle Python files in readTests', async () => {
    const pythonTests: TestCase[] = [
      {
        description: 'Python Test 1',
        vars: { var1: 'value1' },
        assert: [{ type: 'equals', value: 'expected1' }],
        options: {},
      },
      {
        description: 'Python Test 2',
        vars: { var2: 'value2' },
        assert: [{ type: 'equals', value: 'expected2' }],
        options: {},
      },
    ];
    const mockRunPython = jest.requireMock('../../src/python/pythonUtils').runPython;
    mockRunPython.mockResolvedValue(pythonTests);
    jest.mocked(globSync).mockReturnValue(['test.py']);

    const result = await readTests(['test.py']);

    expect(mockRunPython).toHaveBeenCalledWith(
      expect.stringContaining('test.py'),
      'generate_tests',
      [],
    );
    expect(result).toHaveLength(2);
    expect(result).toEqual(pythonTests);
  });

  it('should handle Python files with custom function in readTests', async () => {
    const pythonTests: TestCase[] = [
      {
        description: 'Python Test 1',
        vars: { var1: 'value1' },
        assert: [{ type: 'equals', value: 'expected1' }],
        options: {},
      },
    ];
    const mockRunPython = jest.requireMock('../../src/python/pythonUtils').runPython;
    mockRunPython.mockReset();
    mockRunPython.mockResolvedValueOnce(pythonTests);
    jest.mocked(globSync).mockReturnValueOnce(['test.py']);

    const result = await readTests(['test.py:custom_function']);

    expect(mockRunPython).toHaveBeenCalledWith(
      expect.stringContaining('test.py'),
      'custom_function',
      [],
    );
    expect(result).toEqual(pythonTests);
  });

  it('should handle Python files with invalid function name in readTests', async () => {
    await expect(readTests(['test.py:invalid:extra'])).rejects.toThrow(
      'Too many colons. Invalid test file script path: test.py:invalid:extra',
    );
  });

  it('should handle Python files that return non-array in readTests', async () => {
    const mockRunPython = jest.requireMock('../../src/python/pythonUtils').runPython;
    mockRunPython.mockReset();
    mockRunPython.mockResolvedValueOnce({ not: 'an array' });
    jest.mocked(globSync).mockReturnValueOnce(['test.py']);

    await expect(readTests(['test.py'])).rejects.toThrow(
      'Python test function must return a list of test cases, got object',
    );
  });

  it('should handle file:// URLs with YAML files correctly in readTests', async () => {
    const yamlTests = [
      {
        description: 'Test 1',
        vars: { key1: 'value1' },
        assert: [{ type: 'equals', value: 'expected1' }],
      },
      {
        description: 'Test 2',
        vars: { key2: 'value2' },
        assert: [{ type: 'equals', value: 'expected2' }],
      },
    ];

    jest.mocked(fs.readFileSync).mockReturnValue(yaml.dump(yamlTests));
    jest.mocked(globSync).mockReturnValue(['products.yaml']);

    const result = await readTests(['file://products.yaml']);

    expect(result).toEqual(yamlTests);
    expect(globSync).toHaveBeenCalledWith(
      expect.stringContaining('products.yaml'),
      expect.any(Object),
    );
  });

  it('should warn when assert is found in vars', async () => {
    const testWithAssertInVars = [
      {
        description: 'Test case',
        vars: {
          assert: [{ type: 'equals', value: 'test' }],
        },
      },
    ];
    jest.mocked(fs.readFileSync).mockReturnValue(yaml.dump(testWithAssertInVars));
    jest.mocked(globSync).mockReturnValue(['test.yaml']);
    jest
      .mocked(getEnvBool)
      .mockImplementation((key) => !key.includes('PROMPTFOO_NO_TESTCASE_ASSERT_WARNING'));

    const result = await readTests(['test.yaml']);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(testWithAssertInVars[0]);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('PROMPTFOO_NO_TESTCASE_ASSERT_WARNING'),
    );
  });

  it('should not warn about assert in vars when environment variable is set', async () => {
    const testWithAssertInVars = [
      {
        description: 'Test case',
        vars: {
          assert: { type: 'equals', value: 'test' },
        },
      },
    ];
    jest.mocked(fs.readFileSync).mockReturnValue(yaml.dump(testWithAssertInVars));
    jest.mocked(globSync).mockReturnValue(['test.yaml']);
    jest
      .mocked(getEnvBool)
      .mockImplementation((key) => (key === 'PROMPTFOO_NO_TESTCASE_ASSERT_WARNING' ? true : false));

    await readTests('test.yaml');

    expect(logger.warn).not.toHaveBeenCalledWith(
      expect.stringContaining('PROMPTFOO_NO_TESTCASE_ASSERT_WARNING'),
    );
  });

  it('should handle file:// URLs with function names in readTests', async () => {
    const pythonTests: TestCase[] = [
      {
        description: 'Python Test with file:// URL',
        vars: { var1: 'value1' },
        assert: [{ type: 'equals', value: 'expected1' }],
        options: {},
      },
    ];
    const mockRunPython = jest.requireMock('../../src/python/pythonUtils').runPython;
    mockRunPython.mockReset();
    mockRunPython.mockResolvedValueOnce(pythonTests);
    jest.mocked(globSync).mockReturnValueOnce(['test.py']);

    const result = await readTests(['file://test.py:custom_function']);

    expect(mockRunPython).toHaveBeenCalledWith(
      expect.stringContaining('test.py'),
      'custom_function',
      [],
    );
    expect(result).toEqual(pythonTests);
  });
});

describe('testCaseFromCsvRow', () => {
  it('should convert a CSV row to a TestCase object', () => {
    const csvRow = {
      var1: 'value1',
      var2: 'value2',
      __expected: 'foobar',
      __expected1: 'is-json',
      __prefix: 'test-prefix',
      __suffix: 'test-suffix',
    };
    const testCase = testCaseFromCsvRow(csvRow);
    expect(testCase).toEqual({
      vars: {
        var1: 'value1',
        var2: 'value2',
      },
      assert: [
        {
          type: 'equals',
          value: 'foobar',
        },
        {
          type: 'is-json',
        },
      ],
      options: {
        prefix: 'test-prefix',
        suffix: 'test-suffix',
      },
    });
  });
});

describe('readVarsFiles', () => {
  it('should read variables from a single YAML file', async () => {
    const yamlContent = 'var1: value1\nvar2: value2';
    jest.mocked(fs.readFileSync).mockReturnValue(yamlContent);
    jest.mocked(globSync).mockReturnValue(['vars.yaml']);

    const result = await readTestFiles('vars.yaml');

    expect(result).toEqual({ var1: 'value1', var2: 'value2' });
  });

  it('should read variables from multiple YAML files', async () => {
    const yamlContent1 = 'var1: value1';
    const yamlContent2 = 'var2: value2';
    jest
      .mocked(fs.readFileSync)
      .mockReturnValueOnce(yamlContent1)
      .mockReturnValueOnce(yamlContent2);
    jest.mocked(globSync).mockReturnValue(['vars1.yaml', 'vars2.yaml']);

    const result = await readTestFiles(['vars1.yaml', 'vars2.yaml']);

    expect(result).toEqual({ var1: 'value1', var2: 'value2' });
  });
});

describe('loadTestsFromGlob', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('should handle Hugging Face dataset URLs', async () => {
    const mockDataset: TestCase[] = [
      {
        description: 'Test 1',
        vars: { var1: 'value1' },
        assert: [{ type: 'equals', value: 'expected1' }],
        options: {},
      },
      {
        description: 'Test 2',
        vars: { var2: 'value2' },
        assert: [{ type: 'equals', value: 'expected2' }],
        options: {},
      },
    ];
    const mockFetchHuggingFaceDataset = jest.requireMock(
      '../../src/integrations/huggingfaceDatasets',
    ).fetchHuggingFaceDataset;
    mockFetchHuggingFaceDataset.mockImplementation(async () => mockDataset);

    const result = await loadTestsFromGlob('huggingface://datasets/example/dataset');

    expect(mockFetchHuggingFaceDataset).toHaveBeenCalledWith(
      'huggingface://datasets/example/dataset',
    );
    expect(result).toEqual(mockDataset);
  });
});

describe('CSV parsing with JSON fields', () => {
  beforeEach(() => {
    jest.mocked(getEnvBool).mockImplementation((key, defaultValue = false) => defaultValue);
    jest.mocked(getEnvString).mockImplementation((key, defaultValue) => defaultValue);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.resetModules();
  });

  it('should parse CSV file containing properly escaped JSON fields in strict mode', async () => {
    const csvContent = `label,query,expected_json_format,context
my_test_label,What is the date?,"{\""answer\"":""""}",file://../get_context.py`;

    jest.spyOn(fs, 'readFileSync').mockReturnValue(csvContent);

    const testCases = await readStandaloneTestsFile('dummy.csv');

    expect(testCases).toHaveLength(1);
    expect(testCases[0].vars).toEqual({
      label: 'my_test_label',
      query: 'What is the date?',
      expected_json_format: '{"answer":""}',
      context: 'file://../get_context.py',
    });

    jest.mocked(fs.readFileSync).mockRestore();
  });

  it('should fall back to relaxed parsing for unescaped JSON fields', async () => {
    const csvContent = `label,query,expected_json_format,context
my_test_label,What is the date?,{"answer":""},file://../get_context.py`;

    jest.spyOn(fs, 'readFileSync').mockReturnValue(csvContent);

    const testCases = await readStandaloneTestsFile('dummy.csv');

    expect(testCases).toHaveLength(1);
    expect(testCases[0].vars).toEqual({
      label: 'my_test_label',
      query: 'What is the date?',
      expected_json_format: '{"answer":""}',
      context: 'file://../get_context.py',
    });

    jest.mocked(fs.readFileSync).mockRestore();
  });

  it('should enforce strict mode when PROMPTFOO_CSV_STRICT=true', async () => {
    jest
      .mocked(getEnvBool)
      .mockImplementation((key, defaultValue = false) =>
        key === 'PROMPTFOO_CSV_STRICT' ? true : defaultValue,
      );

    const csvContent = `label,query,expected_json_format,context
my_test_label,What is the date?,{"answer":""},file://../get_context.py`;

    jest.spyOn(fs, 'readFileSync').mockReturnValue(csvContent);

    await expect(readStandaloneTestsFile('dummy.csv')).rejects.toThrow(
      'Invalid Opening Quote: a quote is found on field',
    );

    jest.mocked(fs.readFileSync).mockRestore();
  });

  it('should propagate non-quote-related CSV errors', async () => {
    const mockParse = jest.fn().mockImplementation(() => {
      const error = new Error('Some other CSV error');
      (error as any).code = 'CSV_OTHER_ERROR';
      throw error;
    });

    jest.mock('csv-parse/sync', () => ({
      parse: mockParse,
    }));

    const csvContent = `label,query,expected_json_format,context
my_test_label,What is the date?,"{\""answer\"":""""}",file://../get_context.py`;

    jest.spyOn(fs, 'readFileSync').mockReturnValue(csvContent);
    const { readStandaloneTestsFile } = await import('../../src/util/testCaseReader');
    await expect(readStandaloneTestsFile('dummy.csv')).rejects.toThrow('Some other CSV error');

    jest.mocked(fs.readFileSync).mockRestore();
  });
});
