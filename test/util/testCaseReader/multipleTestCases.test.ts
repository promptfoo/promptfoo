import * as fs from 'fs';
import { globSync } from 'glob';
import * as yaml from 'js-yaml';
import { getEnvBool } from '../../../src/envars';
import { fetchCsvFromGoogleSheet } from '../../../src/googleSheets';
import logger from '../../../src/logger';
import type { TestCase } from '../../../src/types';
import { readTests } from '../../../src/util/testCaseReader';

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

jest.mock('glob', () => ({
  globSync: jest.fn(),
}));

jest.mock('../../../src/googleSheets', () => ({
  fetchCsvFromGoogleSheet: jest.fn(),
}));

jest.mock('../../../src/envars', () => ({
  ...jest.requireActual('../../../src/envars'),
  getEnvBool: jest.fn(),
  getEnvString: jest.fn(),
}));

jest.mock('../../../src/python/pythonUtils', () => ({
  runPython: jest.fn(),
}));

jest.mock('../../../src/integrations/huggingfaceDatasets', () => ({
  fetchHuggingFaceDataset: jest.fn(),
}));

jest.mock('../../../src/logger');

describe('Test Case Reader - Multiple Test Cases', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(globSync).mockReturnValue([]);
    const mockRunPython = jest.requireMock('../../../src/python/pythonUtils').runPython;
    mockRunPython.mockReset();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.mocked(fs.readFileSync).mockReset();
    jest.mocked(globSync).mockReset();
  });

  it('loads multiple test cases from CSV file', async () => {
    jest
      .mocked(fs.readFileSync)
      .mockReturnValueOnce('var1,var2,__expected\nvalue1,value2,value1\nvalue3,value4,fn:value5');
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

  it('handles CSV file paths with file:// prefix', async () => {
    jest
      .mocked(fs.readFileSync)
      .mockReturnValueOnce('var1,var2,__expected\nvalue1,value2,value1\nvalue3,value4,fn:value5');
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

  it('creates multiple assertions from CSV __expected columns', async () => {
    jest
      .mocked(fs.readFileSync)
      .mockReturnValueOnce(
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

  it('returns array of TestCase objects unchanged', async () => {
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

  it('loads and merges test cases from multiple file paths', async () => {
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

  it('expands vars file paths using glob patterns', async () => {
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

  it('wraps single TestCase in array', async () => {
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

  it('fetches test cases from Google Sheets URL', async () => {
    const mockFetchCsvFromGoogleSheet = jest.requireMock(
      '../../../src/googleSheets',
    ).fetchCsvFromGoogleSheet;
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

  it('warns about unsupported test format', async () => {
    const unsupportedTests = { invalid: 'format' };

    await readTests(unsupportedTests as any);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Warning: Unsupported 'tests' format in promptfooconfig.yaml."),
    );
  });

  it('skips warning when tests is undefined', async () => {
    await readTests(undefined);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('fetches and merges tests from multiple Google Sheets', async () => {
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

  it('loads test cases from HuggingFace datasets', async () => {
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
      '../../../src/integrations/huggingfaceDatasets',
    ).fetchHuggingFaceDataset;
    mockFetchHuggingFaceDataset.mockImplementation(async () => mockDataset);
    jest.mocked(globSync).mockReturnValueOnce([]);

    const result = await readTests('huggingface://datasets/example/dataset');

    expect(mockFetchHuggingFaceDataset).toHaveBeenCalledWith(
      'huggingface://datasets/example/dataset',
    );
    expect(result).toEqual(mockDataset);
  });

  it('parses JSONL files with one test per line', async () => {
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
    const result = await readTests(expectedTests);

    expect(result).toEqual(expectedTests);
  });

  it('propagates file read errors', async () => {
    jest.mocked(fs.readFileSync).mockReset();
    jest.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('File read error');
    });
    jest.mocked(globSync).mockReturnValueOnce(['test.csv']);

    await expect(readTests(['test.csv'])).rejects.toThrow('File read error');
  });

  it('executes Python test generators', async () => {
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
    const mockRunPython = jest.requireMock('../../../src/python/pythonUtils').runPython;
    mockRunPython.mockResolvedValue(pythonTests);
    jest.mocked(globSync).mockReturnValueOnce(['test.py']);

    const result = await readTests(['test.py']);

    expect(mockRunPython).toHaveBeenCalledWith(
      expect.stringContaining('test.py'),
      'generate_tests',
      [],
    );
    expect(result).toHaveLength(2);
    expect(result).toEqual(pythonTests);
  });

  it('executes Python files with custom function names', async () => {
    const pythonTests: TestCase[] = [
      {
        description: 'Python Test 1',
        vars: { var1: 'value1' },
        assert: [{ type: 'equals', value: 'expected1' }],
        options: {},
      },
    ];
    const mockRunPython = jest.requireMock('../../../src/python/pythonUtils').runPython;
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

  it('passes configuration objects to Python generators', async () => {
    const pythonTests: TestCase[] = [
      {
        description: 'Python Test 1',
        vars: { a: '1' },
        assert: [],
        options: {},
      },
    ];
    const mockRunPython = jest.requireMock('../../../src/python/pythonUtils').runPython;
    mockRunPython.mockReset();
    mockRunPython.mockResolvedValueOnce(pythonTests);
    jest.mocked(globSync).mockReturnValueOnce(['test.py']);

    const config = { foo: 'bar' };
    const result = await readTests([{ path: 'test.py', config }]);

    expect(mockRunPython).toHaveBeenCalledWith(
      expect.stringContaining('test.py'),
      'generate_tests',
      [config],
    );
    expect(result).toEqual(pythonTests);
  });

  it('throws error for invalid Python function syntax', async () => {
    await expect(readTests(['test.py:invalid:extra'])).rejects.toThrow(
      'Too many colons. Invalid test file script path: test.py:invalid:extra',
    );
  });

  it('throws error when Python returns non-array', async () => {
    const mockRunPython = jest.requireMock('../../../src/python/pythonUtils').runPython;
    mockRunPython.mockReset();
    mockRunPython.mockResolvedValueOnce({ not: 'an array' });
    jest.mocked(globSync).mockReturnValueOnce(['test.py']);

    await expect(readTests(['test.py'])).rejects.toThrow(
      'Python test function must return a list of test cases, got object',
    );
  });

  it('processes file:// URLs for YAML files', async () => {
    const yamlTests: TestCase[] = [
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

    const result = await readTests(yamlTests);

    expect(result).toEqual(yamlTests);
  });

  it('warns when assert property is mistakenly placed in vars', async () => {
    const testWithAssertInVars = [
      {
        description: 'Test case',
        vars: {
          assert: [{ type: 'equals', value: 'test' }],
        },
      },
    ];
    jest
      .mocked(getEnvBool)
      .mockImplementation((key) => !key.includes('PROMPTFOO_NO_TESTCASE_ASSERT_WARNING'));

    const result = await readTests(testWithAssertInVars);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(testWithAssertInVars[0]);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('PROMPTFOO_NO_TESTCASE_ASSERT_WARNING'),
    );
  });

  it('suppresses assert-in-vars warning when PROMPTFOO_NO_TESTCASE_ASSERT_WARNING is set', async () => {
    const testWithAssertInVars = [
      {
        description: 'Test case',
        vars: {
          assert: { type: 'equals', value: 'test' },
        },
      },
    ];

    jest
      .mocked(getEnvBool)
      .mockImplementation((key) => (key === 'PROMPTFOO_NO_TESTCASE_ASSERT_WARNING' ? true : false));

    await readTests(testWithAssertInVars);

    expect(logger.warn).not.toHaveBeenCalledWith(
      expect.stringContaining('PROMPTFOO_NO_TESTCASE_ASSERT_WARNING'),
    );
  });

  it('processes file:// URLs with Python function names', async () => {
    const pythonTests: TestCase[] = [
      {
        description: 'Python Test with file:// URL',
        vars: { var1: 'value1' },
        assert: [{ type: 'equals', value: 'expected1' }],
        options: {},
      },
    ];
    const mockRunPython = jest.requireMock('../../../src/python/pythonUtils').runPython;
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
