import dedent from 'dedent';
import * as fs from 'fs';
import { getEnvString } from '../../../src/envars';
import { importModule } from '../../../src/esm';
import { fetchCsvFromGoogleSheet } from '../../../src/googleSheets';
import { readStandaloneTestsFile } from '../../../src/util/testCaseReader';

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

jest.mock('../../../src/esm', () => ({
  importModule: jest.fn(),
}));

jest.mock('../../../src/util/file', () => ({
  maybeLoadConfigFromExternalFile: jest.fn((config) => {
    // Mock implementation that handles file:// references
    if (config && typeof config === 'object') {
      const result = { ...config };
      for (const [key, value] of Object.entries(config)) {
        if (typeof value === 'string' && value.startsWith('file://')) {
          // Get the mocked file content
          const fs = jest.requireMock('fs');
          const fileContent = fs.readFileSync();
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

describe('Test Case Reader - Standalone Files', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset getEnvString to default behavior
    jest.mocked(getEnvString).mockImplementation((key, defaultValue) => defaultValue || '');
  });

  afterEach(() => {
    jest.clearAllMocks();
    // Reset specific mocks that might cause issues
    jest.mocked(fs.readFileSync).mockReset();
    jest.mocked(importModule).mockReset();
    const mockRunPython = jest.requireMock('../../../src/python/pythonUtils').runPython;
    mockRunPython.mockReset();
  });

  it('reads CSV files and converts rows to test cases', async () => {
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

  it('handles CSV files with BOM (Byte Order Mark)', async () => {
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

  it('reads JSON arrays of test cases', async () => {
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

  it('reads JSONL files with one test case per line', async () => {
    jest.mocked(fs.readFileSync).mockReturnValue(
      `{"vars":{"var1":"value1","var2":"value2"},"assert":[{"type":"equals","value":"Hello World"}]}
        {"vars":{"var1":"value3","var2":"value4"},"assert":[{"type":"equals","value":"Hello World"}]}`,
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

  it('reads YAML arrays of test cases', async () => {
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

  it('fetches and parses test cases from Google Sheets', async () => {
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

  it('imports test cases from JavaScript modules', async () => {
    const mockTestCases = [
      { vars: { var1: 'value1', var2: 'value2' } },
      { vars: { var1: 'value3', var2: 'value4' } },
    ];

    jest.mocked(importModule).mockResolvedValue(mockTestCases);

    const result = await readStandaloneTestsFile('test.js');

    expect(importModule).toHaveBeenCalledWith(expect.stringContaining('test.js'), undefined);
    expect(result).toEqual(mockTestCases);
  });

  it('passes configuration to JavaScript generator functions', async () => {
    const mockFn = jest.fn().mockResolvedValue([{ vars: { a: 1 } }]);
    jest.mocked(importModule).mockResolvedValue(mockFn);

    const config = { foo: 'bar' };
    const result = await readStandaloneTestsFile('test_gen.js', '', config);

    expect(importModule).toHaveBeenCalledWith(expect.stringContaining('test_gen.js'), undefined);
    expect(mockFn).toHaveBeenCalledWith(config);
    expect(result).toEqual([{ vars: { a: 1 } }]);
  });

  it('resolves file:// references in JavaScript generator config', async () => {
    const mockResult = [{ vars: { a: 1 } }];
    const mockFn = jest.fn().mockResolvedValue(mockResult);
    jest.mocked(importModule).mockResolvedValue(mockFn);

    jest.mocked(fs.existsSync).mockReturnValueOnce(true);
    jest.mocked(fs.readFileSync).mockReturnValueOnce('{"foo": "bar"}');

    const config = { data: 'file://config.json' };
    const result = await readStandaloneTestsFile('test_config_gen.js', '', config);

    expect(importModule).toHaveBeenCalledWith(
      expect.stringContaining('test_config_gen.js'),
      undefined,
    );
    expect(mockFn).toHaveBeenCalledWith({ data: { foo: 'bar' } });
    expect(result).toEqual(mockResult);
  });

  it('strips file:// prefix from file paths', async () => {
    jest.mocked(fs.readFileSync).mockReturnValue('var1,var2\nvalue1,value2');
    await readStandaloneTestsFile('file://test.csv');

    expect(fs.readFileSync).toHaveBeenCalledWith(expect.not.stringContaining('file://'), 'utf-8');
  });

  it('returns empty array for unsupported file extensions', async () => {
    await expect(readStandaloneTestsFile('test.txt')).resolves.toEqual([]);
  });

  it('uses comma as default CSV delimiter', async () => {
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

  it('respects custom CSV delimiter from environment variable', async () => {
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

  it('executes Python files with default generate_tests function', async () => {
    const pythonResult = [
      { vars: { var1: 'value1' }, assert: [{ type: 'equals', value: 'expected1' }] },
      { vars: { var2: 'value2' }, assert: [{ type: 'equals', value: 'expected2' }] },
    ];
    const mockRunPython = jest.requireMock('../../../src/python/pythonUtils').runPython;
    mockRunPython.mockResolvedValueOnce(pythonResult);

    const result = await readStandaloneTestsFile('test.py');

    expect(mockRunPython).toHaveBeenCalledWith(
      expect.stringContaining('test.py'),
      'generate_tests',
      [],
    );
    expect(result).toEqual(pythonResult);
  });

  it('executes Python files with custom function names', async () => {
    const pythonResult = [
      { vars: { var1: 'value1' }, assert: [{ type: 'equals', value: 'expected1' }] },
    ];
    const mockRunPython = jest.requireMock('../../../src/python/pythonUtils').runPython;
    mockRunPython.mockResolvedValueOnce(pythonResult);

    const result = await readStandaloneTestsFile('test.py:custom_function');

    expect(mockRunPython).toHaveBeenCalledWith(
      expect.stringContaining('test.py'),
      'custom_function',
      [],
    );
    expect(result).toEqual(pythonResult);
  });

  it('passes configuration to Python generator functions', async () => {
    const pythonResult = [{ vars: { a: 1 }, assert: [] }];
    const mockRunPython = jest.requireMock('../../../src/python/pythonUtils').runPython;
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

  it('resolves file:// references in Python generator config', async () => {
    const pythonResult = [{ vars: { a: 1 }, assert: [] }];
    const mockRunPython = jest.requireMock('../../../src/python/pythonUtils').runPython;
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

  it('throws error when Python function returns non-array', async () => {
    const mockRunPython = jest.requireMock('../../../src/python/pythonUtils').runPython;
    mockRunPython.mockReset();
    mockRunPython.mockResolvedValueOnce({ not: 'an array' });

    await expect(readStandaloneTestsFile('test.py')).rejects.toThrow(
      'Python test function must return a list of test cases, got object',
    );
  });

  it('throws error for Python files with invalid function syntax', async () => {
    await expect(readStandaloneTestsFile('test.py:invalid:extra')).rejects.toThrow(
      'Too many colons. Invalid test file script path: test.py:invalid:extra',
    );
  });

  it('converts single JSON object to array of test cases', async () => {
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
