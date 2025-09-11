import * as fs from 'fs';

import dedent from 'dedent';
import { globSync } from 'glob';
import yaml from 'js-yaml';
import { testCaseFromCsvRow } from '../../src/csv';
import { getEnvBool, getEnvString } from '../../src/envars';
import { fetchCsvFromGoogleSheet } from '../../src/googleSheets';
import logger from '../../src/logger';
import { loadApiProvider } from '../../src/providers';
import {
  loadTestsFromGlob,
  readStandaloneTestsFile,
  readTest,
  readTestFiles,
  readTests,
} from '../../src/util/testCaseReader';

import type { TestCase } from '../../src/types';

type TestAssertion = {
  type: string;
  value?: string | string[] | number | object;
  metric?: string;
};

// Mock fetchWithTimeout before any imports that might use telemetry
jest.mock('../../src/util/fetch', () => ({
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
jest.mock('../../src/util/fetch/index.ts');

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

jest.mock('../../src/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  setLevel: jest.fn(),
}));

jest.mock('../../src/googleSheets', () => ({
  fetchCsvFromGoogleSheet: jest.fn(),
}));

jest.mock('../../src/envars', () => ({
  getEnvBool: jest.fn(),
  getEnvString: jest.fn(),
  getEnvInt: jest.fn((key, defaultValue) => defaultValue),
}));

jest.mock('../../src/telemetry', () => ({
  record: jest.fn(),
}));

jest.mock('../../src/esm', () => ({
  importModule: jest.fn(),
}));

jest.mock('../../src/util/file', () => ({
  maybeLoadConfigFromExternalFile: jest.fn((config) => {
    // Mock implementation that handles file:// references

    // Handle arrays first to preserve their type
    if (Array.isArray(config)) {
      return config.map((item) => {
        const mockFn = jest.requireMock('../../src/util/file').maybeLoadConfigFromExternalFile;
        return mockFn(item);
      });
    }

    // Handle objects (but not arrays)
    if (config && typeof config === 'object' && config !== null) {
      const result = { ...config };
      for (const [key, value] of Object.entries(config)) {
        if (typeof value === 'string' && value.startsWith('file://')) {
          // Extract the file path from the file:// URL
          const filePath = value.slice('file://'.length);
          // Get the mocked file content using the extracted path
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

// Helper to clear all mocks
const clearAllMocks = () => {
  jest.clearAllMocks();
  jest.mocked(globSync).mockReset();
  jest.mocked(fs.readFileSync).mockReset();
  jest.mocked(getEnvBool).mockReset();
  jest.mocked(getEnvString).mockReset();
  jest.mocked(loadApiProvider).mockReset();
  jest.mocked(fetchCsvFromGoogleSheet).mockReset();
};

describe('readStandaloneTestsFile', () => {
  beforeEach(() => {
    clearAllMocks();
  });

  it('should read CSV file and return test cases', async () => {
    const csvContent =
      'prompt,__expected\n"Hello {{name}}","Hello world"\n"Goodbye {{name}}","Goodbye world"';
    jest.mocked(fs.readFileSync).mockReturnValue(csvContent);

    const testCases = await readStandaloneTestsFile('test.csv');

    expect(testCases).toEqual([
      {
        description: 'Row #1',
        vars: { prompt: 'Hello {{name}}' },
        assert: [{ type: 'equals', value: 'Hello world', metric: undefined }],
        options: {},
      },
      {
        description: 'Row #2',
        vars: { prompt: 'Goodbye {{name}}' },
        assert: [{ type: 'equals', value: 'Goodbye world', metric: undefined }],
        options: {},
      },
    ]);
  });

  it('should read CSV file with BOM (Byte Order Mark) and return test cases', async () => {
    const csvContent = '\ufeffprompt,__expected\n"Hello {{name}}","Hello world"';
    jest.mocked(fs.readFileSync).mockReturnValue(csvContent);

    const testCases = await readStandaloneTestsFile('test.csv');

    expect(testCases).toEqual([
      {
        description: 'Row #1',
        vars: { prompt: 'Hello {{name}}' },
        assert: [{ type: 'equals', value: 'Hello world', metric: undefined }],
        options: {},
      },
    ]);
  });

  it('should read JSON file and return test cases', async () => {
    const jsonData = [
      { vars: { prompt: 'Hello {{name}}' }, assert: [{ type: 'equals', value: 'Hello world' }] },
      {
        vars: { prompt: 'Goodbye {{name}}' },
        assert: [{ type: 'equals', value: 'Goodbye world' }],
      },
    ];

    jest.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(jsonData));

    const testCases = await readStandaloneTestsFile('test.json');

    expect(testCases).toEqual([
      { 
        description: 'Row #1',
        vars: { prompt: 'Hello {{name}}' }, 
        assert: [{ type: 'equals', value: 'Hello world' }] 
      },
      {
        description: 'Row #2',
        vars: { prompt: 'Goodbye {{name}}' },
        assert: [{ type: 'equals', value: 'Goodbye world' }],
      },
    ]);
  });

  it('should read JSONL file and return test cases', async () => {
    const jsonlContent = dedent`
      {"vars": {"prompt": "Hello {{name}}"}, "assert": [{"type": "equals", "value": "Hello world"}]}
      {"vars": {"prompt": "Goodbye {{name}}"}, "assert": [{"type": "equals", "value": "Goodbye world"}]}
    `;

    jest.mocked(fs.readFileSync).mockReturnValue(jsonlContent);

    const testCases = await readStandaloneTestsFile('test.jsonl');

    expect(testCases).toEqual([
      { 
        description: 'Row #1',
        vars: { prompt: 'Hello {{name}}' }, 
        assert: [{ type: 'equals', value: 'Hello world' }] 
      },
      {
        description: 'Row #2',
        vars: { prompt: 'Goodbye {{name}}' },
        assert: [{ type: 'equals', value: 'Goodbye world' }],
      },
    ]);
  });

  it('should read YAML file and return test cases', async () => {
    const yamlData = [
      { vars: { prompt: 'Hello {{name}}' }, assert: [{ type: 'equals', value: 'Hello world' }] },
      {
        vars: { prompt: 'Goodbye {{name}}' },
        assert: [{ type: 'equals', value: 'Goodbye world' }],
      },
    ];

    jest.mocked(fs.readFileSync).mockReturnValue(yaml.dump(yamlData));

    const testCases = await readStandaloneTestsFile('test.yaml');

    expect(testCases).toEqual(yamlData);
  });

  it('should read Google Sheets and return test cases', async () => {
    const csvRows = [
      { prompt: 'Hello {{name}}', __expected: 'Hello world' }
    ];
    jest.mocked(fetchCsvFromGoogleSheet).mockResolvedValue(csvRows);

    const testCases = await readStandaloneTestsFile(
      'https://docs.google.com/spreadsheets/d/test-sheet-id/edit',
    );

    expect(testCases).toEqual([
      {
        description: 'Row #1',
        vars: { prompt: 'Hello {{name}}' },
        assert: [{ type: 'equals', value: 'Hello world', metric: undefined }],
        options: {},
      },
    ]);
  });

  it('should read JS file and return test cases', async () => {
    const jsFunction = jest
      .fn()
      .mockReturnValue([
        { vars: { prompt: 'Hello {{name}}' }, assert: [{ type: 'equals', value: 'Hello world' }] },
      ]);

    jest.mocked(jest.requireMock('../../src/esm').importModule).mockResolvedValue(jsFunction);

    const testCases = await readStandaloneTestsFile('/path/to/test.js:generateTests');

    expect(testCases).toEqual([
      { vars: { prompt: 'Hello {{name}}' }, assert: [{ type: 'equals', value: 'Hello world' }] },
    ]);
  });

  it('should pass config to JS test generator function', async () => {
    const jsFunction = jest.fn().mockReturnValue([]);
    const config = { foo: 'bar' };

    jest.mocked(jest.requireMock('../../src/esm').importModule).mockResolvedValue(jsFunction);

    await readStandaloneTestsFile('/path/to/test.js:generateTests', '', config);

    expect(jsFunction).toHaveBeenCalledWith(config);
  });

  it('should load file references in config for JS generator', async () => {
    const jsFunction = jest.fn().mockReturnValue([]);
    const config = { dataFile: 'file://data.json' };

    // Mock the file loading to return processed config
    const fileModule = jest.requireMock('../../src/util/file');
    fileModule.maybeLoadConfigFromExternalFile.mockReturnValue({
      dataFile: { processedData: true },
    });

    jest.mocked(jest.requireMock('../../src/esm').importModule).mockResolvedValue(jsFunction);

    await readStandaloneTestsFile('/path/to/test.js:generateTests', '', config);

    expect(fileModule.maybeLoadConfigFromExternalFile).toHaveBeenCalledWith(config);
    expect(jsFunction).toHaveBeenCalledWith({ dataFile: { processedData: true } });
  });

  it('should handle file:// prefix in file path', async () => {
    const csvContent = 'prompt,__expected\n"Hello {{name}}","Hello world"';
    jest.mocked(fs.readFileSync).mockReturnValue(csvContent);

    const testCases = await readStandaloneTestsFile('file://test.csv');

    expect(testCases).toEqual([
      {
        description: 'Row #1',
        vars: { prompt: 'Hello {{name}}' },
        assert: [{ type: 'equals', value: 'Hello world', metric: undefined }],
        options: {},
      },
    ]);
  });

  it('should return an empty array for unsupported file types', async () => {
    const testCases = await readStandaloneTestsFile('test.unsupported');
    expect(testCases).toEqual([]);
  });

  it('should read CSV file with default delimiter', async () => {
    const csvContent = 'prompt,__expected\n"Hello {{name}}","Hello world"';
    jest.mocked(fs.readFileSync).mockReturnValue(csvContent);
    jest.mocked(getEnvString).mockReturnValue(','); // Default delimiter

    const testCases = await readStandaloneTestsFile('test.csv');

    expect(testCases).toEqual([
      {
        description: 'Row #1',
        vars: { prompt: 'Hello {{name}}' },
        assert: [{ type: 'equals', value: 'Hello world', metric: undefined }],
        options: {},
      },
    ]);
  });

  it('should read CSV file with custom delimiter', async () => {
    const csvContent = 'prompt;__expected\n"Hello {{name}}";"Hello world"';
    jest.mocked(fs.readFileSync).mockReturnValue(csvContent);
    jest.mocked(getEnvString).mockReturnValue(';'); // Custom delimiter

    const testCases = await readStandaloneTestsFile('test.csv');

    expect(testCases).toEqual([
      {
        description: 'Row #1',
        vars: { prompt: 'Hello {{name}}' },
        assert: [{ type: 'equals', value: 'Hello world', metric: undefined }],
        options: {},
      },
    ]);
  });

  it('should handle Python files with default function name', async () => {
    const mockRunPython = jest
      .fn()
      .mockResolvedValue([
        { vars: { prompt: 'Hello {{name}}' }, assert: [{ type: 'equals', value: 'Hello world' }] },
      ]);
    jest.doMock('../../src/python/pythonUtils', () => ({
      runPython: mockRunPython,
    }));

    const testCases = await readStandaloneTestsFile('/path/to/test.py');
    expect(testCases).toEqual([
      { vars: { prompt: 'Hello {{name}}' }, assert: [{ type: 'equals', value: 'Hello world' }] },
    ]);
  });

  it('should handle Python files with custom function name', async () => {
    const mockRunPython = jest
      .fn()
      .mockResolvedValue([
        { vars: { prompt: 'Hello {{name}}' }, assert: [{ type: 'equals', value: 'Hello world' }] },
      ]);
    jest.doMock('../../src/python/pythonUtils', () => ({
      runPython: mockRunPython,
    }));

    const testCases = await readStandaloneTestsFile('/path/to/test.py:customFunction');
    expect(testCases).toEqual([
      { vars: { prompt: 'Hello {{name}}' }, assert: [{ type: 'equals', value: 'Hello world' }] },
    ]);
  });

  it('should pass config to Python generate_tests function', async () => {
    const mockRunPython = jest.fn().mockResolvedValue([]);
    const config = { foo: 'bar' };

    jest.doMock('../../src/python/pythonUtils', () => ({
      runPython: mockRunPython,
    }));

    await readStandaloneTestsFile('/path/to/test.py:generateTests', '', config);

    expect(mockRunPython).toHaveBeenCalledWith(
      expect.stringContaining('test.py'),
      'generateTests',
      [config],
    );
  });

  it('should load file references in config for Python generator', async () => {
    const mockRunPython = jest.fn().mockResolvedValue([]);
    const config = { dataFile: 'file://data.json' };

    // Mock the file loading to return processed config
    const fileModule = jest.requireMock('../../src/util/file');
    fileModule.maybeLoadConfigFromExternalFile.mockReturnValue({
      dataFile: { processedData: true },
    });

    jest.doMock('../../src/python/pythonUtils', () => ({
      runPython: mockRunPython,
    }));

    await readStandaloneTestsFile('/path/to/test.py:generateTests', '', config);

    expect(fileModule.maybeLoadConfigFromExternalFile).toHaveBeenCalledWith(config);
    expect(mockRunPython).toHaveBeenCalledWith(
      expect.stringContaining('test.py'),
      'generateTests',
      [{ dataFile: { processedData: true } }],
    );
  });

  it('should throw error when Python file returns non-array', async () => {
    const mockRunPython = jest.fn().mockResolvedValue({ notAnArray: true });

    jest.doMock('../../src/python/pythonUtils', () => ({
      runPython: mockRunPython,
    }));

    await expect(readStandaloneTestsFile('/path/to/test.py')).rejects.toThrow(
      'Python test generator must return an array of test cases',
    );
  });

  it('should handle Python files with invalid function name in readStandaloneTestsFile', async () => {
    const mockRunPython = jest.fn().mockRejectedValue(new Error('Function not found'));

    jest.doMock('../../src/python/pythonUtils', () => ({
      runPython: mockRunPython,
    }));

    await expect(readStandaloneTestsFile('/path/to/test.py:invalidFunction')).rejects.toThrow(
      'Function not found',
    );
  });

  it('should read JSON file with a single test case object', async () => {
    const jsonData = {
      vars: { prompt: 'Hello {{name}}' },
      assert: [{ type: 'equals', value: 'Hello world' }],
    };

    jest.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(jsonData));

    const testCases = await readStandaloneTestsFile('test.json');

    expect(testCases).toEqual([jsonData]);
  });
});

describe('readTest', () => {
  beforeEach(() => {
    clearAllMocks();
  });

  it('readTest with string input (path to test config)', async () => {
    const testCase = { vars: { name: 'Test' }, assert: [{ type: 'equals', value: 'Expected' } as TestAssertion] };
    jest.mocked(fs.readFileSync).mockReturnValue(yaml.dump(testCase));

    const result = await readTest(testCase as TestCase, '/path/to/test');

    expect(result).toEqual(testCase);
  });

  it('readTest with TestCase input', async () => {
    const testCase = { vars: { name: 'Test' }, assert: [{ type: 'equals', value: 'Expected' } as TestAssertion] };

    const result = await readTest(testCase as TestCase, '/path/to/test');

    expect(result).toEqual(testCase);
  });

  it('readTest with invalid input', async () => {
    const invalidInput = null;

    await expect(readTest(invalidInput as any, '/path/to/test')).rejects.toThrow();
  });

  it('readTest with TestCase that contains a vars glob input', async () => {
    const testCase: TestCase = {
      vars: 'file://vars.yaml',
      assert: [{ type: 'equals', value: 'Expected' } as TestAssertion],
    };

    // Mock file loading for vars
    const fileModule = jest.requireMock('../../src/util/file');
    fileModule.maybeLoadConfigFromExternalFile.mockImplementation((config: any) => {
      if (typeof config === 'string' && config.startsWith('file://')) {
        return { name: 'Test' };
      }
      return config;
    });

    const result = await readTest(testCase, '/path/to/test');

    expect(result.vars).toEqual({ name: 'Test' });
  });

  it('should skip validation when isDefaultTest is true', async () => {
    const incompleteTestCase = { assert: [{ type: 'equals', value: 'Expected' }] };

    const result = await readTest(incompleteTestCase as TestCase, '/path/to/test', true);

    expect(result).toEqual(incompleteTestCase);
  });

  it('should skip validation for defaultTest with model-graded eval provider', async () => {
    const incompleteTestCase = { provider: 'python:provider.py' };

    const result = await readTest(incompleteTestCase as TestCase, '/path/to/test', true);

    expect(result).toEqual(incompleteTestCase);
  });

  it('should skip validation for defaultTest with text provider configuration', async () => {
    const incompleteTestCase = { provider: { id: 'text', config: { text: 'test' } } };

    const result = await readTest(incompleteTestCase as TestCase, '/path/to/test', true);

    expect(result).toEqual(incompleteTestCase);
  });

  it('should skip validation for defaultTest with provider object configuration', async () => {
    const incompleteTestCase = { provider: { id: 'openai:gpt-4' } };

    const result = await readTest(incompleteTestCase as TestCase, '/path/to/test', true);

    expect(result).toEqual(incompleteTestCase);
  });

  it('should throw when not a defaultTest and missing required properties', async () => {
    const incompleteTestCase = { assert: [{ type: 'equals', value: 'Expected' }] };

    await expect(
      readTest(incompleteTestCase as TestCase, '/path/to/test', false),
    ).rejects.toThrow();
  });

  it('should read test from file', async () => {
    const testCase = { vars: { name: 'Test' }, assert: [{ type: 'equals', value: 'Expected' }] };
    jest.mocked(fs.readFileSync).mockReturnValue(yaml.dump(testCase));

    const result = await readTest('/path/to/test.yaml', '/path/to/base');

    expect(result).toEqual(testCase);
  });

  describe('readTest with provider', () => {
    it('should load provider when provider is a string', async () => {
      const testCase = {
        vars: { name: 'Test' },
        assert: [{ type: 'equals', value: 'Expected' }],
        provider: 'openai:gpt-4',
      };

      const mockProvider = { id: 'openai:gpt-4' };
      jest.mocked(loadApiProvider).mockResolvedValue(mockProvider as any);

      const result = await readTest(testCase, '/path/to/test');

      expect(loadApiProvider).toHaveBeenCalledWith('openai:gpt-4', {
        basePath: '/path/to/test',
        transformApiCall: undefined,
      });
      expect(result.provider).toEqual(mockProvider);
    });

    it('should load provider when provider is an object with id', async () => {
      const testCase = {
        vars: { name: 'Test' },
        assert: [{ type: 'equals', value: 'Expected' }],
        provider: { id: 'openai:gpt-4', config: { temperature: 0.5 } },
      };

      const mockProvider = { id: 'openai:gpt-4', config: { temperature: 0.5 } };
      jest.mocked(loadApiProvider).mockResolvedValue(mockProvider as any);

      const result = await readTest(testCase, '/path/to/test');

      expect(loadApiProvider).toHaveBeenCalledWith(
        { id: 'openai:gpt-4', config: { temperature: 0.5 } },
        { basePath: '/path/to/test', transformApiCall: undefined },
      );
      expect(result.provider).toEqual(mockProvider);
    });
  });
});

describe('readTests', () => {
  beforeEach(() => {
    clearAllMocks();
  });

  it('readTests with string input (CSV file path)', async () => {
    const csvContent = 'prompt,__expected\n"Hello {{name}}","Hello world"';
    jest.mocked(fs.readFileSync).mockReturnValue(csvContent);

    const testCases = await readTests('test.csv', '');

    expect(testCases).toEqual([
      {
        description: 'Row #1',
        vars: { prompt: 'Hello {{name}}' },
        assert: [{ type: 'equals', value: 'Hello world', metric: undefined }],
        options: {},
      },
    ]);
  });

  it('readTests with string input (CSV file path with file:// prefix)', async () => {
    const csvContent = 'prompt,__expected\n"Hello {{name}}","Hello world"';
    jest.mocked(fs.readFileSync).mockReturnValue(csvContent);

    const testCases = await readTests('file://test.csv', '');

    expect(testCases).toEqual([
      {
        description: 'Row #1',
        vars: { prompt: 'Hello {{name}}' },
        assert: [{ type: 'equals', value: 'Hello world', metric: undefined }],
        options: {},
      },
    ]);
  });

  it('readTests with multiple __expected in CSV', async () => {
    const csvContent = 'prompt,__expected,__expected2\n"Hello {{name}}","Hello world","Hi world"';
    jest.mocked(fs.readFileSync).mockReturnValue(csvContent);

    const testCases = await readTests('test.csv', '');

    expect(testCases[0].assert).toEqual([
      { type: 'equals', value: 'Hello world' },
      { type: 'equals', value: 'Hi world' },
    ]);
  });

  it('readTests with array input (TestCase[])', async () => {
    const inputTestCases = [
      { vars: { prompt: 'Hello {{name}}' }, assert: [{ type: 'equals', value: 'Hello world' } as TestAssertion] },
    ];

    const testCases = await readTests(inputTestCases as TestCase[], '');

    expect(testCases).toEqual(inputTestCases);
  });

  it('readTests with string array input (paths to test configs)', async () => {
    const testCase1 = { vars: { name: 'Test1' }, assert: [{ type: 'equals', value: 'Expected1' } as TestAssertion] };
    const testCase2 = { vars: { name: 'Test2' }, assert: [{ type: 'equals', value: 'Expected2' } as TestAssertion] };

    jest
      .mocked(fs.readFileSync)
      .mockReturnValueOnce(yaml.dump(testCase1))
      .mockReturnValueOnce(yaml.dump(testCase2));

    const testCases = await readTests(['test1.yaml', 'test2.yaml'], '');

    expect(testCases).toEqual([testCase1, testCase2]);
  });

  it('readTests with vars glob input (paths to vars configs)', async () => {
    const testSuite = {
      tests: [{ assert: [{ type: 'equals', value: 'Expected' } as TestAssertion] }],
      scenarios: [{ config: { vars: 'file://vars.yaml' } }],
    };

    // Mock file loading for vars
    const fileModule = jest.requireMock('../../src/util/file');
    fileModule.maybeLoadConfigFromExternalFile.mockReturnValue({ name: 'Test' });

    const testCases = await readTests(testSuite as any, '');

    expect(testCases[0].vars).toEqual({ name: 'Test' });
  });

  it('readTests with single TestCase content', async () => {
    const testCase = { vars: { name: 'Test' }, assert: [{ type: 'equals', value: 'Expected' } as TestAssertion] };

    const testCases = await readTests(testCase as TestCase, '');

    expect(testCases).toEqual([testCase]);
  });

  it('should read tests from a Google Sheets URL', async () => {
    const csvRows = [
      { prompt: 'Hello {{name}}', __expected: 'Hello world' }
    ];
    jest.mocked(fetchCsvFromGoogleSheet).mockResolvedValue(csvRows);

    const testCases = await readTests(
      'https://docs.google.com/spreadsheets/d/test-sheet-id/edit',
      '',
    );

    expect(testCases).toEqual([
      {
        description: 'Row #1',
        vars: { prompt: 'Hello {{name}}' },
        assert: [{ type: 'equals', value: 'Hello world', metric: undefined }],
        options: {},
      },
    ]);
  });

  it('should log a warning for unsupported test format', async () => {
    await readTests({} as any, '');

    expect(logger.warn).toHaveBeenCalledWith('Unsupported test format');
  });

  it('should not log a warning if tests is undefined', async () => {
    const testCases = await readTests(undefined, '');

    expect(testCases).toEqual([]);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('should read tests from multiple Google Sheets URLs', async () => {
    const csvRows1 = [
      { prompt: 'Hello {{name}}', __expected: 'Hello world' }
    ];
    const csvRows2 = [
      { prompt: 'Goodbye {{name}}', __expected: 'Goodbye world' }
    ];

    jest
      .mocked(fetchCsvFromGoogleSheet)
      .mockResolvedValueOnce(csvRows1)
      .mockResolvedValueOnce(csvRows2);

    const testCases = await readTests(
      [
        'https://docs.google.com/spreadsheets/d/test-sheet-id-1/edit',
        'https://docs.google.com/spreadsheets/d/test-sheet-id-2/edit',
      ],
      '',
    );

    expect(testCases).toEqual([
      {
        description: 'Row #1',
        vars: { prompt: 'Hello {{name}}' },
        assert: [{ type: 'equals', value: 'Hello world', metric: undefined }],
        options: {},
      },
      {
        description: 'Row #1',
        vars: { prompt: 'Goodbye {{name}}' },
        assert: [{ type: 'equals', value: 'Goodbye world', metric: undefined }],
        options: {},
      },
    ]);
  });

  it('should handle HuggingFace dataset URLs', async () => {
    const mockDataset = [{ vars: { prompt: 'Hello' }, assert: [{ type: 'equals', value: 'Hi' }] }];

    jest.doMock('../../src/integrations/huggingfaceDatasets', () => ({
      fetchHuggingFaceDataset: jest.fn().mockResolvedValue(mockDataset),
    }));

    const testCases = await readTests(
      'https://huggingface.co/datasets/example/dataset/resolve/main/test.json',
      '',
    );

    expect(testCases).toEqual(mockDataset);
  });

  it('should handle JSONL files', async () => {
    const jsonlContent = dedent`
      {"vars": {"prompt": "Hello {{name}}"}, "assert": [{"type": "equals", "value": "Hello world"}]}
      {"vars": {"prompt": "Goodbye {{name}}"}, "assert": [{"type": "equals", "value": "Goodbye world"}]}
    `;

    jest.mocked(fs.readFileSync).mockReturnValue(jsonlContent);

    const testCases = await readTests('test.jsonl', '');

    expect(testCases).toEqual([
      { vars: { prompt: 'Hello {{name}}' }, assert: [{ type: 'equals', value: 'Hello world' }] },
      {
        vars: { prompt: 'Goodbye {{name}}' },
        assert: [{ type: 'equals', value: 'Goodbye world' }],
      },
    ]);
  });

  it('should handle file read errors gracefully', async () => {
    jest.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('File not found');
    });

    await expect(readTests('nonexistent.csv', '')).rejects.toThrow('File not found');
  });

  it('should handle Python files in readTests', async () => {
    const mockRunPython = jest
      .fn()
      .mockResolvedValue([
        { vars: { prompt: 'Hello {{name}}' }, assert: [{ type: 'equals', value: 'Hello world' }] },
      ]);

    jest.doMock('../../src/python/pythonUtils', () => ({
      runPython: mockRunPython,
    }));

    const testCases = await readTests('/path/to/test.py', '');

    expect(testCases).toEqual([
      { vars: { prompt: 'Hello {{name}}' }, assert: [{ type: 'equals', value: 'Hello world' }] },
    ]);
  });

  it('should handle Python files with custom function in readTests', async () => {
    const mockRunPython = jest
      .fn()
      .mockResolvedValue([
        { vars: { prompt: 'Hello {{name}}' }, assert: [{ type: 'equals', value: 'Hello world' }] },
      ]);

    jest.doMock('../../src/python/pythonUtils', () => ({
      runPython: mockRunPython,
    }));

    const testCases = await readTests('/path/to/test.py:customFunction', '');

    expect(testCases).toEqual([
      { vars: { prompt: 'Hello {{name}}' }, assert: [{ type: 'equals', value: 'Hello world' }] },
    ]);
  });

  it('should pass config to Python generator in readTests', async () => {
    const mockRunPython = jest.fn().mockResolvedValue([]);
    const config = { foo: 'bar' };

    jest.doMock('../../src/python/pythonUtils', () => ({
      runPython: mockRunPython,
    }));

    const testSuite = { tests: '/path/to/test.py:generateTests', config };

    await readTests(testSuite as any, '');

    expect(mockRunPython).toHaveBeenCalledWith(
      expect.stringContaining('test.py'),
      'generateTests',
      [config],
    );
  });

  it('should handle Python files with invalid function name in readTests', async () => {
    const mockRunPython = jest.fn().mockRejectedValue(new Error('Function not found'));

    jest.doMock('../../src/python/pythonUtils', () => ({
      runPython: mockRunPython,
    }));

    await expect(readTests('/path/to/test.py:invalidFunction', '')).rejects.toThrow(
      'Function not found',
    );
  });

  it('should handle Python files that return non-array in readTests', async () => {
    const mockRunPython = jest.fn().mockResolvedValue({ notAnArray: true });

    jest.doMock('../../src/python/pythonUtils', () => ({
      runPython: mockRunPython,
    }));

    await expect(readTests('/path/to/test.py', '')).rejects.toThrow(
      'Python test generator must return an array of test cases',
    );
  });

  it('should handle file:// URLs with YAML files correctly in readTests', async () => {
    const yamlData = [
      { vars: { prompt: 'Hello {{name}}' }, assert: [{ type: 'equals', value: 'Hello world' }] },
    ];

    jest.mocked(fs.readFileSync).mockReturnValue(yaml.dump(yamlData));

    const testCases = await readTests('file://test.yaml', '');

    expect(testCases).toEqual(yamlData);
  });

  it('should warn when assert is found in vars', async () => {
    const testCase = {
      vars: { name: 'Test', assert: 'This should not be here' },
      assert: [{ type: 'equals', value: 'Expected' } as TestAssertion],
    };

    await readTests([testCase as TestCase], '');

    expect(logger.warn).toHaveBeenCalledWith(
      'Found `assert` in test case vars. Did you mean to put this in the `assert` property?',
    );
  });

  it('should not warn about assert in vars when environment variable is set', async () => {
    jest.mocked(getEnvBool).mockReturnValue(true);

    const testCase = {
      vars: { name: 'Test', assert: 'This should not be here' },
      assert: [{ type: 'equals', value: 'Expected' } as TestAssertion],
    };

    await readTests([testCase as TestCase], '');

    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('should handle file:// URLs with function names in readTests', async () => {
    const mockRunPython = jest
      .fn()
      .mockResolvedValue([
        { vars: { prompt: 'Hello {{name}}' }, assert: [{ type: 'equals', value: 'Hello world' }] },
      ]);

    jest.doMock('../../src/python/pythonUtils', () => ({
      runPython: mockRunPython,
    }));

    const testCases = await readTests('file:///path/to/test.py:customFunction', '');

    expect(testCases).toEqual([
      { vars: { prompt: 'Hello {{name}}' }, assert: [{ type: 'equals', value: 'Hello world' }] },
    ]);
  });
});

describe('testCaseFromCsvRow', () => {
  it('should convert a CSV row to a TestCase object', () => {
    const csvRow = {
      prompt: 'Hello {{name}}',
      expected: 'Hello world',
      __expected: 'Hello world',
      __expected2: 'Hi world',
    };

    const testCase = testCaseFromCsvRow(csvRow);

    expect(testCase).toEqual({
      vars: { prompt: 'Hello {{name}}', expected: 'Hello world' },
      assert: [
        { type: 'equals', value: 'Hello world', metric: undefined },
        { type: 'equals', value: 'Hi world', metric: undefined },
      ],
      options: {},
    });
  });
});

describe('readVarsFiles', () => {
  beforeEach(() => {
    clearAllMocks();
  });

  it('should read variables from a single YAML file', async () => {
    const varsData = { name: 'Test', value: 42 };
    jest.mocked(fs.readFileSync).mockReturnValue(yaml.dump(varsData));
    jest.mocked(globSync).mockReturnValue(['/path/to/vars.yaml']);

    const result = await readTestFiles(['/path/to/vars.yaml']);

    expect(result).toEqual(varsData);
  });

  it('should read variables from multiple YAML files', async () => {
    const varsData1 = { name: 'Test1', value: 42 };
    const varsData2 = { name: 'Test2', other: 'data' };

    jest
      .mocked(fs.readFileSync)
      .mockReturnValueOnce(yaml.dump(varsData1))
      .mockReturnValueOnce(yaml.dump(varsData2));
    jest.mocked(globSync).mockReturnValue(['/path/to/vars1.yaml', '/path/to/vars2.yaml']);

    const result = await readTestFiles(['/path/to/vars*.yaml']);

    expect(result).toEqual({ ...varsData1, ...varsData2 });
  });
});

describe('loadTestsFromGlob', () => {
  beforeEach(() => {
    clearAllMocks();
  });

  it('should handle Hugging Face dataset URLs', async () => {
    const mockDataset = [{ vars: { prompt: 'Hello' }, assert: [{ type: 'equals', value: 'Hi' } as TestAssertion] }];

    jest.doMock('../../src/integrations/huggingfaceDatasets', () => ({
      fetchHuggingFaceDataset: jest.fn().mockResolvedValue(mockDataset),
    }));

    const testCases = await loadTestsFromGlob(
      'https://huggingface.co/datasets/example/dataset/resolve/main/test.json',
      '',
    );

    expect(testCases).toEqual(mockDataset);
  });

  it('should recursively resolve file:// references in YAML test files', async () => {
    // Mock maybeLoadConfigFromExternalFile to resolve file:// references
    const mockYamlContent = [
      {
        vars: { prompt: 'Hello {{name}}' },
        assert: [{ type: 'equals', value: 'file://expected.txt' }],
      },
    ];

    const fileModule = jest.requireMock('../../src/util/file');
    fileModule.maybeLoadConfigFromExternalFile.mockReturnValue([
      {
        vars: { prompt: 'Hello {{name}}' },
        assert: [{ type: 'equals', value: 'Hello world' }],
      },
    ]);

    jest.mocked(fs.readFileSync).mockReturnValue(yaml.dump(mockYamlContent));
    jest.mocked(globSync).mockReturnValue(['/path/to/test.yaml']);

    const testCases = await loadTestsFromGlob('/path/to/*.yaml', '');

    expect(fileModule.maybeLoadConfigFromExternalFile).toHaveBeenCalledWith(mockYamlContent);
    expect(testCases).toEqual([
      {
        vars: { prompt: 'Hello {{name}}' },
        assert: [{ type: 'equals', value: 'Hello world' }],
      },
    ]);
  });

  it('should handle nested file:// references in complex test structures', async () => {
    const mockComplexContent = [
      {
        vars: { prompt: 'Hello {{name}}' },
        assert: [
          { type: 'equals', value: 'file://expected1.txt' },
          { type: 'contains', value: 'file://expected2.txt' },
        ],
      },
    ];

    const fileModule = jest.requireMock('../../src/util/file');
    fileModule.maybeLoadConfigFromExternalFile.mockReturnValue([
      {
        vars: { prompt: 'Hello {{name}}' },
        assert: [
          { type: 'equals', value: 'Hello world' },
          { type: 'contains', value: 'world' },
        ],
      },
    ]);

    jest.mocked(fs.readFileSync).mockReturnValue(yaml.dump(mockComplexContent));
    jest.mocked(globSync).mockReturnValue(['/path/to/complex.yaml']);

    const testCases = await loadTestsFromGlob('/path/to/*.yaml', '');

    expect(fileModule.maybeLoadConfigFromExternalFile).toHaveBeenCalledWith(mockComplexContent);
    expect(testCases).toEqual([
      {
        vars: { prompt: 'Hello {{name}}' },
        assert: [
          { type: 'equals', value: 'Hello world' },
          { type: 'contains', value: 'world' },
        ],
      },
    ]);
  });
});

describe('CSV parsing with JSON fields', () => {
  beforeEach(() => {
    clearAllMocks();
  });

  it('should parse CSV file containing properly escaped JSON fields in strict mode', async () => {
    jest
      .mocked(getEnvBool)
      .mockImplementation((key, defaultValue = false) =>
        key === 'PROMPTFOO_CSV_STRICT' ? true : defaultValue,
      );

    const csvContent = `label,query,expected_json_format,context
my_test_label,What is the date?,"{""answer"":""""}",file://../get_context.py`;

    jest.spyOn(fs, 'readFileSync').mockReturnValue(csvContent);

    const testCases = await readStandaloneTestsFile('dummy.csv');
    expect(testCases).toHaveLength(1);
    expect(testCases[0].vars?.query).toBe('What is the date?');
    expect(testCases[0].vars?.expected_json_format).toBe('{"answer":""}');
    expect(testCases[0].vars?.context).toBe('file://../get_context.py');

    jest.mocked(fs.readFileSync).mockRestore();
  });

  it('should fall back to relaxed parsing for unescaped JSON fields', async () => {
    // Use default settings (not strict mode) to allow fallback
    jest.mocked(getEnvBool).mockImplementation((key, defaultValue = false) => defaultValue);
    jest
      .mocked(getEnvString)
      .mockImplementation((key, defaultValue) =>
        key === 'PROMPTFOO_CSV_DELIMITER' ? ',' : defaultValue || '',
      );

    const csvContent = `label,query,expected_json_format,context
my_test_label,What is the date?,{"answer":""},file://../get_context.py`;

    jest.spyOn(fs, 'readFileSync').mockReturnValue(csvContent);

    const testCases = await readStandaloneTestsFile('dummy.csv');
    expect(testCases).toHaveLength(1);
    expect(testCases[0].vars?.query).toBe('What is the date?');
    expect(testCases[0].vars?.expected_json_format).toBe('{"answer":""}');
    expect(testCases[0].vars?.context).toBe('file://../get_context.py');

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
    // Create CSV content with inconsistent column count to trigger "Invalid Record Length" error
    const csvContent = `label,query,expected_json_format,context
my_test_label,What is the date?
another_label,What is the time?,too,many,columns,here`;

    jest.spyOn(fs, 'readFileSync').mockReturnValue(csvContent);

    // Use default settings (not strict mode) to get past quote checking
    jest.mocked(getEnvBool).mockImplementation((key, defaultValue = false) => defaultValue);
    jest
      .mocked(getEnvString)
      .mockImplementation((key, defaultValue) =>
        key === 'PROMPTFOO_CSV_DELIMITER' ? ',' : defaultValue || '',
      );

    // The CSV parser should throw an error about inconsistent column count
    await expect(readStandaloneTestsFile('dummy.csv')).rejects.toThrow('Invalid Record Length');

    jest.mocked(fs.readFileSync).mockRestore();
  });
});
