import * as fs from 'fs';

import dedent from 'dedent';
import { globSync } from 'glob';
import yaml from 'js-yaml';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testCaseFromCsvRow } from '../../src/csv';
import { getEnvBool, getEnvString } from '../../src/envars';
import { importModule } from '../../src/esm';
import { fetchCsvFromGoogleSheet } from '../../src/googleSheets';
import { fetchHuggingFaceDataset } from '../../src/integrations/huggingfaceDatasets';
import logger from '../../src/logger';
import { loadApiProvider } from '../../src/providers/index';
import { runPython } from '../../src/python/pythonUtils';
import { maybeLoadConfigFromExternalFile } from '../../src/util/file';
import {
  loadTestsFromGlob,
  readStandaloneTestsFile,
  readTest,
  readTestFiles,
  readTests,
} from '../../src/util/testCaseReader';

import type { AssertionType, TestCase, TestCaseWithVarsFile } from '../../src/types/index';
import type { ApiProvider, ProviderOptions } from '../../src/types/providers';

// Spy on logger.warn for tests that check warnings
vi.spyOn(logger, 'warn');

// Mock fetchWithTimeout before any imports that might use telemetry
vi.mock('../../src/util/fetch', () => ({
  fetchWithTimeout: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock('proxy-agent', () => ({
  ProxyAgent: vi.fn().mockImplementation(() => ({})),
}));
vi.mock('glob', () => ({
  globSync: vi.fn(),
  hasMagic: vi.fn((pattern: string | string[]) => {
    const p = Array.isArray(pattern) ? pattern.join('') : pattern;
    return p.includes('*') || p.includes('?') || p.includes('[') || p.includes('{');
  }),
}));
vi.mock('../../src/providers', () => ({
  loadApiProvider: vi.fn(),
}));
vi.mock('../../src/util/fetch/index.ts');

const mockReadFileSync = vi.hoisted(() => vi.fn());

vi.mock('fs', () => ({
  readFileSync: mockReadFileSync,
  writeFileSync: vi.fn(),
  statSync: vi.fn(),
  readdirSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  // Delegate to fs.readFileSync mock for shared test data
  readFile: vi.fn((...args: unknown[]) => {
    try {
      return Promise.resolve(mockReadFileSync(...args));
    } catch (error) {
      return Promise.reject(error);
    }
  }),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
}));

vi.mock('../../src/database', () => ({
  getDb: vi.fn(),
}));

vi.mock('../../src/googleSheets', () => ({
  fetchCsvFromGoogleSheet: vi.fn(),
}));

vi.mock('../../src/envars', async () => ({
  ...(await vi.importActual('../../src/envars')),
  getEnvBool: vi.fn(),
  getEnvString: vi.fn(),
}));

vi.mock('../../src/python/pythonUtils', () => ({
  runPython: vi.fn(),
}));

vi.mock('../../src/integrations/huggingfaceDatasets', () => ({
  fetchHuggingFaceDataset: vi.fn(),
}));

vi.mock('../../src/telemetry', () => {
  const mockTelemetry = {
    record: vi.fn().mockResolvedValue(undefined),
    identify: vi.fn(),
    saveConsent: vi.fn().mockResolvedValue(undefined),
    disabled: false,
  };
  return {
    __esModule: true,
    default: mockTelemetry,
    Telemetry: vi.fn().mockImplementation(() => mockTelemetry),
  };
});

vi.mock('../../src/esm', () => ({
  importModule: vi.fn(),
}));

vi.mock('../../src/util/file', () => ({
  maybeLoadConfigFromExternalFile: vi.fn((config) => {
    // Mock implementation that handles file:// references

    // Handle arrays first to preserve their type
    if (Array.isArray(config)) {
      return config.map((item) => {
        const mockFn = maybeLoadConfigFromExternalFile;
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
  vi.clearAllMocks();
  vi.mocked(globSync).mockReset();
  vi.mocked(fs.readFileSync).mockReset();
  vi.mocked(getEnvBool).mockReset();
  vi.mocked(getEnvString).mockReset();
  vi.mocked(fetchCsvFromGoogleSheet).mockReset();
  vi.mocked(loadApiProvider).mockReset();
  vi.mocked(runPython).mockReset();
  vi.mocked(fetchHuggingFaceDataset).mockReset();
  vi.mocked(maybeLoadConfigFromExternalFile).mockReset();
  vi.mocked(importModule).mockReset();
};

describe('readStandaloneTestsFile', () => {
  beforeEach(() => {
    clearAllMocks();
    // Reset getEnvString to default behavior
    vi.mocked(getEnvString).mockImplementation((_key, defaultValue) => defaultValue || '');
    // Restore maybeLoadConfigFromExternalFile mock
    vi.mocked(maybeLoadConfigFromExternalFile).mockImplementation((config) => {
      // Handle arrays first to preserve their type
      if (Array.isArray(config)) {
        return config.map((item) => {
          const mockFn = maybeLoadConfigFromExternalFile;
          return mockFn(item);
        });
      }

      // Mock implementation that handles file:// references
      if (config && typeof config === 'object' && config !== null) {
        const result = { ...config };
        for (const [key, value] of Object.entries(config)) {
          if (typeof value === 'string' && value.startsWith('file://')) {
            // Extract the file path from the file:// URL
            const filePath = value.slice('file://'.length);
            // Get the mocked file content using the extracted path
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
    });
  });

  afterEach(() => {
    clearAllMocks();
  });

  it('should read CSV file and return test cases', async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(
      'var1,var2,__expected\nvalue1,value2,expected1\nvalue3,value4,expected2',
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

  it('should read CSV file with BOM (Byte Order Mark) and return test cases', async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(
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
    vi.mocked(fs.readFileSync).mockReturnValue(
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
    vi.mocked(fs.readFileSync).mockReturnValue(
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

  it('should read YAML file and return test cases', async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(dedent`
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
    const mockFetchCsvFromGoogleSheet = vi.mocked(fetchCsvFromGoogleSheet);
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

    vi.mocked(importModule).mockResolvedValue(mockTestCases);

    const result = await readStandaloneTestsFile('test.js');

    expect(importModule).toHaveBeenCalledWith(expect.stringContaining('test.js'), undefined);
    expect(result).toEqual(mockTestCases);
  });

  it('should pass config to JS test generator function', async () => {
    const mockFn = vi.fn().mockResolvedValue([{ vars: { a: 1 } }]);
    vi.mocked(importModule).mockResolvedValue(mockFn);

    const config = { foo: 'bar' };
    const result = await readStandaloneTestsFile('test_gen.js', '', config);

    expect(importModule).toHaveBeenCalledWith(expect.stringContaining('test_gen.js'), undefined);
    expect(mockFn).toHaveBeenCalledWith(config);
    expect(result).toEqual([{ vars: { a: 1 } }]);
  });

  it('should load file references in config for JS generator', async () => {
    const mockResult = [{ vars: { a: 1 } }];
    const mockFn = vi.fn().mockResolvedValue(mockResult);
    vi.mocked(importModule).mockResolvedValue(mockFn);

    vi.mocked(fs.existsSync).mockReturnValueOnce(true);
    vi.mocked(fs.readFileSync).mockReturnValueOnce('{"foo": "bar"}');

    const config = { data: 'file://config.json' };
    const result = await readStandaloneTestsFile('test_config_gen.js', '', config);

    expect(importModule).toHaveBeenCalledWith(
      expect.stringContaining('test_config_gen.js'),
      undefined,
    );
    expect(mockFn).toHaveBeenCalledWith({ data: { foo: 'bar' } });
    expect(result).toEqual(mockResult);
  });

  it('should handle file:// prefix in file path', async () => {
    vi.mocked(fs.readFileSync).mockReturnValue('var1,var2\nvalue1,value2');
    await readStandaloneTestsFile('file://test.csv');

    expect(fs.readFileSync).toHaveBeenCalledWith(expect.not.stringContaining('file://'), 'utf-8');
  });

  it('should return an empty array for unsupported file types', async () => {
    await expect(readStandaloneTestsFile('test.txt')).resolves.toEqual([]);
  });

  it('should read CSV file with default delimiter', async () => {
    vi.mocked(getEnvString).mockReturnValue(',');
    vi.mocked(fs.readFileSync).mockReturnValue(
      'var1,var2,__expected\nvalue1,value2,expected1\nvalue3,value4,expected2',
    );

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
    vi.mocked(getEnvString).mockReturnValue(';');
    vi.mocked(fs.readFileSync).mockReturnValue(
      'var1;var2;__expected\nvalue1;value2;expected1\nvalue3;value4;expected2',
    );

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

  it('should read XLSX file and return test cases', async () => {
    // Mock parseXlsxFile to return processed CsvRow[] data
    const mockData = [
      { var1: 'value1', var2: 'value2', __expected: 'expected1' },
      { var1: 'value3', var2: 'value4', __expected: 'expected2' },
    ];

    vi.doMock('../../src/util/xlsx', () => ({
      parseXlsxFile: vi.fn().mockResolvedValue(mockData),
    }));

    vi.resetModules();

    try {
      const { readStandaloneTestsFile: freshReadStandaloneTestsFile } = await import(
        '../../src/util/testCaseReader'
      );

      const result = await freshReadStandaloneTestsFile('test.xlsx');

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
    } finally {
      vi.doUnmock('../../src/util/xlsx');
      vi.resetModules();
    }
  });

  // Note: parseXlsxFile error handling tests (module not installed, empty sheets, etc.)
  // are covered in test/util/xlsx.test.ts which uses proper hoisted mocks

  it('should read real XLSX file from examples (integration test)', async () => {
    // Integration test using the actual Excel file from examples
    const path = require('path');
    const exampleFile = path.join(__dirname, '../../examples/simple-csv/tests.xlsx');

    // Only run if read-excel-file is actually installed (in dev environment)
    try {
      await import('read-excel-file/node');
      const fs = require('fs');

      if (fs.existsSync(exampleFile)) {
        const result = await readStandaloneTestsFile(exampleFile);

        // Verify the structure matches expected test cases
        expect(result).toHaveLength(4); // Based on the known test data
        expect(result[0]).toMatchObject({
          vars: expect.objectContaining({
            language: expect.any(String),
            body: expect.any(String),
          }),
          assert: expect.any(Array),
        });

        // Verify specific test case content
        const frenchTest = result.find((test) => test.vars?.language === 'French');
        expect(frenchTest).toBeDefined();
        expect(frenchTest?.vars?.body).toBe('Hello world');
      } else {
        console.log('Skipping integration test - example Excel file not found');
      }
    } catch (error) {
      // Skip test if read-excel-file is not installed
      console.log('Skipping integration test - read-excel-file not available:', error);
    }
  });

  it('should handle Python files with default function name', async () => {
    const pythonResult = [
      { vars: { var1: 'value1' }, assert: [{ type: 'equals', value: 'expected1' }] },
      { vars: { var2: 'value2' }, assert: [{ type: 'equals', value: 'expected2' }] },
    ];
    vi.mocked(runPython).mockResolvedValue(pythonResult);

    const result = await readStandaloneTestsFile('test.py');

    expect(runPython).toHaveBeenCalledWith(
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
    vi.mocked(runPython).mockResolvedValue(pythonResult);

    const result = await readStandaloneTestsFile('test.py:custom_function');

    expect(runPython).toHaveBeenCalledWith(
      expect.stringContaining('test.py'),
      'custom_function',
      [],
    );
    expect(result).toEqual(pythonResult);
  });

  it('should pass config to Python generate_tests function', async () => {
    const pythonResult = [{ vars: { a: 1 }, assert: [] }];
    vi.mocked(runPython).mockResolvedValue(pythonResult);

    const config = { dataset: 'demo' };
    const result = await readStandaloneTestsFile('test.py', '', config);

    expect(runPython).toHaveBeenCalledWith(expect.stringContaining('test.py'), 'generate_tests', [
      config,
    ]);
    expect(result).toEqual(pythonResult);
  });

  it('should load file references in config for Python generator', async () => {
    const pythonResult = [{ vars: { a: 1 }, assert: [] }];
    vi.mocked(runPython).mockResolvedValue(pythonResult);

    // Mock maybeLoadConfigFromExternalFile to transform file:// references
    vi.mocked(maybeLoadConfigFromExternalFile).mockImplementation((config) => {
      // Handle arrays first to preserve their type
      if (Array.isArray(config)) {
        return config.map((item) => {
          const mockFn = maybeLoadConfigFromExternalFile;
          return mockFn(item);
        });
      }

      if (config && typeof config === 'object' && config !== null) {
        const result = { ...config };
        for (const [key, value] of Object.entries(config)) {
          if (typeof value === 'string' && value.startsWith('file://')) {
            result[key] = { foo: 'bar' }; // Return the expected transformed value
          }
        }
        return result;
      }
      return config;
    });

    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockImplementation((path) => {
      if (path.toString().includes('config.json')) {
        return '{"foo": "bar"}';
      }
      return '';
    });
    const config = { data: 'file://config.json' };
    const result = await readStandaloneTestsFile('test.py', '', config);

    expect(runPython).toHaveBeenCalledWith(expect.stringContaining('test.py'), 'generate_tests', [
      { data: { foo: 'bar' } },
    ]);
    expect(result).toEqual(pythonResult);
  });

  it('should throw error when Python file returns non-array', async () => {
    vi.mocked(runPython).mockResolvedValue({ not: 'an array' } as any);

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
    vi.mocked(fs.readFileSync).mockReturnValue(
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
    // Restore maybeLoadConfigFromExternalFile mock
    vi.mocked(maybeLoadConfigFromExternalFile).mockImplementation((config) => {
      // Handle arrays first to preserve their type
      if (Array.isArray(config)) {
        return config.map((item) => {
          const mockFn = maybeLoadConfigFromExternalFile;
          return mockFn(item);
        });
      }

      // Mock implementation that handles file:// references
      if (config && typeof config === 'object' && config !== null) {
        const result = { ...config };
        for (const [key, value] of Object.entries(config)) {
          if (typeof value === 'string' && value.startsWith('file://')) {
            // Extract the file path from the file:// URL
            const filePath = value.slice('file://'.length);
            // Get the mocked file content using the extracted path
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
    });
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
    vi.mocked(fs.readFileSync).mockReturnValueOnce(yaml.dump(testContent));

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
    vi.mocked(globSync).mockReturnValueOnce(['vars/vars1.yaml', 'vars/vars2.yaml']);
    vi.mocked(fs.readFileSync)
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
      const mockProvider = { callApi: vi.fn(), id: vi.fn().mockReturnValue('mock-provider') };
      vi.mocked(loadApiProvider).mockResolvedValue(mockProvider);

      const testCase: TestCase = {
        description: 'Test with string provider',
        provider: 'mock-provider',
        assert: [{ type: 'equals', value: 'expected' }],
      };

      const result = await readTest(testCase);

      expect(loadApiProvider).toHaveBeenCalledWith('mock-provider', { basePath: '' });
      expect(result.provider).toBe(mockProvider);
    });

    it('should load provider when provider is an object with id', async () => {
      const mockProvider = {
        callApi: vi.fn(),
        id: vi.fn().mockReturnValue('mock-provider'),
      } as ApiProvider;
      vi.mocked(loadApiProvider).mockResolvedValue(mockProvider);

      const providerInput: ProviderOptions & { callApi: ReturnType<typeof vi.fn> } = {
        id: 'mock-provider',
        callApi: vi.fn(),
      };
      const testCase: TestCase = {
        description: 'Test with provider object',
        provider: providerInput,
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

  it('should skip validation when isDefaultTest is true', async () => {
    const defaultTestInput = {
      options: {
        provider: {
          embedding: {
            id: 'bedrock:embeddings:amazon.titan-embed-text-v2:0',
            config: {
              region: 'us-east-1',
            },
          },
        },
      },
    };

    // This should not throw even though it doesn't have required properties
    const result = await readTest(defaultTestInput, '', true);
    expect(result.options).toEqual(defaultTestInput.options);
    expect(result.vars).toBeUndefined();
  });

  it('should skip validation for defaultTest with model-graded eval provider', async () => {
    const defaultTestInput = {
      options: {
        provider: 'openai:gpt-4.1-mini-0613',
      },
    };

    // This should not throw even though it doesn't have required properties
    const result = await readTest(defaultTestInput, '', true);
    expect(result.options?.provider).toBe('openai:gpt-4.1-mini-0613');
    expect(result.vars).toBeUndefined();
  });

  it('should skip validation for defaultTest with text provider configuration', async () => {
    const defaultTestInput = {
      options: {
        provider: {
          text: {
            id: 'openai:gpt-5.1-mini',
            config: {
              temperature: 0.7,
            },
          },
        },
      },
    };

    // This should not throw even though it doesn't have required properties
    const result = await readTest(defaultTestInput, '', true);
    expect(result.options?.provider).toBeDefined();
    expect(result.options?.provider).toEqual({
      text: {
        id: 'openai:gpt-5.1-mini',
        config: {
          temperature: 0.7,
        },
      },
    });
    expect(result.vars).toBeUndefined();
  });

  it('should skip validation for defaultTest with provider object configuration', async () => {
    const defaultTestInput = {
      options: {
        provider: {
          id: 'anthropic:claude-3-opus',
          config: {
            temperature: 0.5,
            max_tokens: 1000,
          },
        },
      },
    };

    // This should not throw even though it doesn't have required properties
    const result = await readTest(defaultTestInput, '', true);
    expect(result.options?.provider).toEqual({
      id: 'anthropic:claude-3-opus',
      config: {
        temperature: 0.5,
        max_tokens: 1000,
      },
    });
    expect(result.vars).toBeUndefined();
  });

  it('should throw when not a defaultTest and missing required properties', async () => {
    // Create a test input that truly has no valid properties after loadTestWithVars
    const invalidTestInput = {
      someInvalidProperty: 'invalid',
    } as any; // Cast to any to bypass type checking for invalid input

    await expect(readTest(invalidTestInput, '', false)).rejects.toThrow(
      'Test case must contain one of the following properties',
    );
  });

  it('should read test from file', async () => {
    const testPath = 'test1.yaml';
    const testContent = {
      description: 'Test 1',
      vars: { var1: 'value1', var2: 'value2' },
      assert: [{ type: 'equals', value: 'value1' }],
    };
    vi.mocked(fs.readFileSync).mockReturnValueOnce(yaml.dump(testContent));

    const result = await readTest(testPath);

    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    expect(result).toEqual(testContent);
  });
});

describe('readTests', () => {
  beforeEach(() => {
    clearAllMocks();
    vi.mocked(globSync).mockReturnValue([]);
    // Restore maybeLoadConfigFromExternalFile mock for readTests tests
    vi.mocked(maybeLoadConfigFromExternalFile).mockImplementation((config) => {
      // Handle arrays first to preserve their type
      if (Array.isArray(config)) {
        return config.map((item) => {
          const mockFn = maybeLoadConfigFromExternalFile;
          return mockFn(item);
        });
      }

      // Mock implementation that handles file:// references
      if (config && typeof config === 'object' && config !== null) {
        const result = { ...config };
        for (const [key, value] of Object.entries(config)) {
          if (typeof value === 'string' && value.startsWith('file://')) {
            // Extract the file path from the file:// URL
            const filePath = value.slice('file://'.length);
            // Get the mocked file content using the extracted path
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
    });
  });

  afterEach(() => {
    clearAllMocks();
  });

  it('readTests with string input (CSV file path)', async () => {
    vi.mocked(fs.readFileSync).mockReturnValue(
      'var1,var2,__expected\nvalue1,value2,value1\nvalue3,value4,fn:value5',
    );
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
    vi.mocked(fs.readFileSync).mockReturnValue(
      'var1,var2,__expected\nvalue1,value2,value1\nvalue3,value4,fn:value5',
    );
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
    vi.mocked(fs.readFileSync).mockReturnValue(
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
    vi.mocked(fs.readFileSync)
      .mockReturnValueOnce(yaml.dump(test1Content))
      .mockReturnValueOnce(yaml.dump(test2Content));
    vi.mocked(globSync).mockImplementation((pathOrGlob) => [pathOrGlob].flat());

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
    vi.mocked(fs.readFileSync)
      .mockReturnValueOnce(yaml.dump(test1Content))
      .mockReturnValueOnce(yaml.dump(vars1Content));
    vi.mocked(globSync).mockImplementation((pathOrGlob) => [pathOrGlob].flat());

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
    vi.mocked(fs.readFileSync).mockReturnValueOnce(yaml.dump(test1Content));
    vi.mocked(globSync).mockImplementation((pathOrGlob) => [pathOrGlob].flat());

    const result = await readTests(testsPaths);

    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    expect(result).toEqual([test1Content]);
  });

  it('should read tests from a Google Sheets URL', async () => {
    vi.mocked(fetchCsvFromGoogleSheet).mockResolvedValue([
      { var1: 'value1', var2: 'value2', __expected: 'expected1' },
      { var1: 'value3', var2: 'value4', __expected: 'expected2' },
    ]);

    const result = await readTests('https://docs.google.com/spreadsheets/d/example');

    expect(fetchCsvFromGoogleSheet).toHaveBeenCalledWith(
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
    vi.mocked(globSync).mockReturnValueOnce([]);
    const mockFetchCsvFromGoogleSheet = vi.mocked(fetchCsvFromGoogleSheet);
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
    vi.mocked(fetchHuggingFaceDataset).mockResolvedValue(mockDataset);

    const result = await loadTestsFromGlob('huggingface://datasets/example/dataset');

    expect(fetchHuggingFaceDataset).toHaveBeenCalledWith('huggingface://datasets/example/dataset');
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
    vi.mocked(fs.readFileSync).mockReturnValueOnce(jsonlContent);
    vi.mocked(globSync).mockImplementation((pathOrGlob) => [pathOrGlob].flat());

    const result = await readTests(['test.jsonl']);

    expect(result).toEqual(expectedTests);
  });

  it('should handle file read errors gracefully', async () => {
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw new Error('File read error');
    });
    vi.mocked(globSync).mockImplementation((pathOrGlob) => [pathOrGlob].flat());

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
    vi.mocked(runPython).mockResolvedValue(pythonTests);
    vi.mocked(globSync).mockReturnValueOnce(['test.py']);

    const result = await readTests(['test.py']);

    expect(runPython).toHaveBeenCalledWith(
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
    vi.mocked(runPython).mockResolvedValue(pythonTests);
    vi.mocked(globSync).mockReturnValueOnce(['test.py']);

    const result = await readTests(['test.py:custom_function']);

    expect(runPython).toHaveBeenCalledWith(
      expect.stringContaining('test.py'),
      'custom_function',
      [],
    );
    expect(result).toEqual(pythonTests);
  });

  it('should pass config to Python generator in readTests', async () => {
    const pythonTests: TestCase[] = [
      {
        description: 'Python Test 1',
        vars: { a: '1' },
        assert: [],
        options: {},
      },
    ];
    vi.mocked(runPython).mockResolvedValue(pythonTests);
    vi.mocked(globSync).mockReturnValueOnce(['test.py']);

    const config = { foo: 'bar' };
    const result = await readTests([{ path: 'test.py', config }]);

    expect(runPython).toHaveBeenCalledWith(expect.stringContaining('test.py'), 'generate_tests', [
      config,
    ]);
    expect(result).toEqual(pythonTests);
  });

  it('should handle Python files with invalid function name in readTests', async () => {
    await expect(readTests(['test.py:invalid:extra'])).rejects.toThrow(
      'Too many colons. Invalid test file script path: test.py:invalid:extra',
    );
  });

  it('should handle Python files that return non-array in readTests', async () => {
    vi.mocked(runPython).mockResolvedValue({ not: 'an array' } as any);
    vi.mocked(globSync).mockReturnValueOnce(['test.py']);

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

    vi.mocked(fs.readFileSync).mockReturnValue(yaml.dump(yamlTests));
    vi.mocked(globSync).mockReturnValue(['products.yaml']);

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
    vi.mocked(fs.readFileSync).mockReturnValue(yaml.dump(testWithAssertInVars));
    vi.mocked(globSync).mockReturnValue(['test.yaml']);
    vi.mocked(getEnvBool).mockImplementation(
      (key) => !key.includes('PROMPTFOO_NO_TESTCASE_ASSERT_WARNING'),
    );

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
    vi.mocked(fs.readFileSync).mockReturnValue(yaml.dump(testWithAssertInVars));
    vi.mocked(globSync).mockReturnValue(['test.yaml']);
    vi.mocked(getEnvBool).mockImplementation(
      (key) => key === 'PROMPTFOO_NO_TESTCASE_ASSERT_WARNING',
    );

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
    vi.mocked(runPython).mockResolvedValue(pythonTests);
    vi.mocked(globSync).mockReturnValueOnce(['test.py']);

    const result = await readTests(['file://test.py:custom_function']);

    expect(runPython).toHaveBeenCalledWith(
      expect.stringContaining('test.py'),
      'custom_function',
      [],
    );
    expect(result).toEqual(pythonTests);
  });

  it('should handle xlsx files in array format', async () => {
    // Mock parseXlsxFile to return processed CsvRow[] data
    const mockData = [
      { var1: 'value1', var2: 'value2', __expected: 'expected1' },
      { var1: 'value3', var2: 'value4', __expected: 'expected2' },
    ];

    vi.doMock('../../src/util/xlsx', () => ({
      parseXlsxFile: vi.fn().mockResolvedValue(mockData),
    }));

    vi.resetModules();

    try {
      const { readTests: freshReadTests } = await import('../../src/util/testCaseReader');

      const result = await freshReadTests(['test.xlsx']);

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
    } finally {
      vi.doUnmock('../../src/util/xlsx');
      vi.resetModules();
    }
  });

  it('should handle xlsx files with sheet specifier in array format', async () => {
    // Mock parseXlsxFile to return processed CsvRow[] data
    const mockData = [{ name: 'test1', value: 'result1' }];

    vi.doMock('../../src/util/xlsx', () => ({
      parseXlsxFile: vi.fn().mockResolvedValue(mockData),
    }));

    vi.resetModules();

    try {
      const { readTests: freshReadTests } = await import('../../src/util/testCaseReader');

      const result = await freshReadTests(['test.xlsx#DataSheet']);

      expect(result).toHaveLength(1);
      expect(result[0].vars).toEqual({ name: 'test1', value: 'result1' });
    } finally {
      vi.doUnmock('../../src/util/xlsx');
      vi.resetModules();
    }
  });

  it('should handle xls files in array format', async () => {
    // Mock parseXlsxFile to return processed CsvRow[] data
    const mockData = [{ col1: 'data1', col2: 'data2' }];

    vi.doMock('../../src/util/xlsx', () => ({
      parseXlsxFile: vi.fn().mockResolvedValue(mockData),
    }));

    vi.resetModules();

    try {
      const { readTests: freshReadTests } = await import('../../src/util/testCaseReader');

      const result = await freshReadTests(['legacy.xls']);

      expect(result).toHaveLength(1);
      expect(result[0].vars).toEqual({ col1: 'data1', col2: 'data2' });
    } finally {
      vi.doUnmock('../../src/util/xlsx');
      vi.resetModules();
    }
  });

  it('should handle file:// prefix with xlsx files in array format', async () => {
    // Mock parseXlsxFile to return processed CsvRow[] data
    const mockData = [{ input: 'hello', expected: 'world' }];

    vi.doMock('../../src/util/xlsx', () => ({
      parseXlsxFile: vi.fn().mockResolvedValue(mockData),
    }));

    vi.resetModules();

    try {
      const { readTests: freshReadTests } = await import('../../src/util/testCaseReader');

      const result = await freshReadTests(['file://test.xlsx']);

      expect(result).toHaveLength(1);
      expect(result[0].vars).toEqual({ input: 'hello', expected: 'world' });
    } finally {
      vi.doUnmock('../../src/util/xlsx');
      vi.resetModules();
    }
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
  beforeEach(() => {
    clearAllMocks();
    // Restore maybeLoadConfigFromExternalFile mock
    vi.mocked(maybeLoadConfigFromExternalFile).mockImplementation((config) => {
      // Handle arrays first to preserve their type
      if (Array.isArray(config)) {
        return config.map((item) => {
          const mockFn = maybeLoadConfigFromExternalFile;
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
    });
  });

  afterEach(() => {
    clearAllMocks();
  });

  it('should read variables from a single YAML file', async () => {
    const yamlContent = 'var1: value1\nvar2: value2';
    vi.mocked(fs.readFileSync).mockReturnValue(yamlContent);
    vi.mocked(globSync).mockReturnValue(['vars.yaml']);

    const result = await readTestFiles('vars.yaml');

    expect(result).toEqual({ var1: 'value1', var2: 'value2' });
  });

  it('should read variables from multiple YAML files', async () => {
    const yamlContent1 = 'var1: value1';
    const yamlContent2 = 'var2: value2';

    // Mock globSync to return both file paths
    vi.mocked(globSync).mockImplementation((pattern) => {
      if (pattern.includes('vars1.yaml')) {
        return ['vars1.yaml'];
      } else if (pattern.includes('vars2.yaml')) {
        return ['vars2.yaml'];
      }
      return [];
    });

    // Mock readFileSync to return different content for each file
    vi.mocked(fs.readFileSync).mockImplementation((path) => {
      if (path.toString().includes('vars1.yaml')) {
        return yamlContent1;
      } else if (path.toString().includes('vars2.yaml')) {
        return yamlContent2;
      }
      return '';
    });

    const result = await readTestFiles(['vars1.yaml', 'vars2.yaml']);

    expect(result).toEqual({ var1: 'value1', var2: 'value2' });
  });
});

describe('loadTestsFromGlob', () => {
  beforeEach(() => {
    clearAllMocks();
    // Explicitly set a simple pass-through mock to ensure no pollution from previous describe blocks
    // Individual tests will override this with their own specific implementations
    vi.mocked(maybeLoadConfigFromExternalFile).mockImplementation((config: any) => config);
  });

  afterEach(() => {
    clearAllMocks();
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
    vi.mocked(fetchHuggingFaceDataset).mockResolvedValue(mockDataset);

    const result = await loadTestsFromGlob('huggingface://datasets/example/dataset');

    expect(fetchHuggingFaceDataset).toHaveBeenCalledWith('huggingface://datasets/example/dataset');
    expect(result).toEqual(mockDataset);
  });

  it('should recursively resolve file:// references in YAML test files', async () => {
    // Set up mock implementation FIRST, before any other setup
    // Use vi.mocked() for consistency with clearAllMocks()
    const mockMaybeLoadConfig = vi.mocked(maybeLoadConfigFromExternalFile);
    mockMaybeLoadConfig.mockReset();

    const yamlContentWithRefs = [
      {
        description: 'Test with file refs',
        vars: {
          input: 'file://input.txt',
          expected: 'file://expected.json',
        },
        assert: ['file://assertions.yaml'],
      },
    ];

    const resolvedContent = [
      {
        description: 'Test with file refs',
        vars: {
          input: 'What is 2 + 2?',
          expected: { answer: '4' },
        },
        assert: [{ type: 'equals', value: '4' }],
      },
    ];

    // Mock maybeLoadConfigFromExternalFile to resolve file:// references
    mockMaybeLoadConfig.mockImplementation((config: any) => {
      // Handle arrays - preserve array type and return resolved content
      if (Array.isArray(config)) {
        // Map over array to handle each element
        return config.map((item) => {
          // If it matches our test data structure, return the resolved version
          if (item && item.description === 'Test with file refs') {
            return resolvedContent[0];
          }
          return item;
        });
      }
      // For objects, preserve them as-is
      if (config && typeof config === 'object') {
        return config;
      }
      return config;
    });

    // Set up file system mocks AFTER setting up the maybeLoadConfigFromExternalFile mock
    vi.mocked(globSync).mockReturnValue(['tests.yaml']);
    vi.mocked(fs.readFileSync).mockReturnValue(yaml.dump(yamlContentWithRefs));

    const result = await loadTestsFromGlob('tests.yaml');

    // The mock should be called with the array from YAML
    expect(mockMaybeLoadConfig).toHaveBeenCalled();
    expect(result).toEqual(resolvedContent);
  });

  it('should handle nested file:// references in complex test structures', async () => {
    // Set up mock implementation FIRST, before any other setup
    // Use vi.mocked() for consistency with clearAllMocks()
    const mockMaybeLoadConfig = vi.mocked(maybeLoadConfigFromExternalFile);
    mockMaybeLoadConfig.mockReset();

    const complexYamlWithRefs = [
      {
        description: 'Complex test',
        vars: {
          config: 'file://config.yaml',
          prompts: ['file://prompt1.txt', 'file://prompt2.txt'],
        },
        assert: ['file://assert1.yaml', 'file://assert2.yaml'],
      },
    ];

    const resolvedContent = [
      {
        description: 'Complex test',
        vars: {
          config: { temperature: 0.7, maxTokens: 100 },
          prompts: ['First prompt', 'Second prompt'],
        },
        assert: [
          { type: 'equals', value: 'expected1' },
          { type: 'contains', value: 'expected2' },
        ],
      },
    ];

    // Mock maybeLoadConfigFromExternalFile to resolve file:// references
    mockMaybeLoadConfig.mockImplementation((config: any) => {
      // Handle arrays - preserve array type and return resolved content
      if (Array.isArray(config)) {
        return config.map((item) => {
          if (item && item.description === 'Complex test') {
            return resolvedContent[0];
          }
          return item;
        });
      }
      // For objects, preserve them as-is
      if (config && typeof config === 'object') {
        return config;
      }
      return config;
    });

    // Set up file system mocks AFTER setting up the maybeLoadConfigFromExternalFile mock
    vi.mocked(globSync).mockReturnValue(['complex-tests.yaml']);
    vi.mocked(fs.readFileSync).mockReturnValue(yaml.dump(complexYamlWithRefs));

    const result = await loadTestsFromGlob('complex-tests.yaml');

    expect(mockMaybeLoadConfig).toHaveBeenCalled();
    // Note: provider field is not included in the resolved content from our test file structure
    expect(result[0].description).toEqual(resolvedContent[0].description);
    expect(result[0].vars).toEqual(resolvedContent[0].vars);
    expect(result[0].assert).toEqual(resolvedContent[0].assert);
  });

  it('should preserve Python assertion file references when loading YAML tests', async () => {
    // This test verifies the fix for issue #5519
    // Set up mock implementation FIRST, before any other setup
    // Use vi.mocked() for consistency with clearAllMocks()
    const mockMaybeLoadConfig = vi.mocked(maybeLoadConfigFromExternalFile);
    mockMaybeLoadConfig.mockReset();

    const yamlContentWithPythonAssertion = [
      {
        vars: { name: 'Should PASS' },
        assert: [
          {
            type: 'python',
            value: 'file://good_assertion.py',
          },
        ],
      },
    ];

    // Mock maybeLoadConfigFromExternalFile to preserve Python files in assertion contexts
    mockMaybeLoadConfig.mockImplementation((config: any) => {
      // Handle arrays - preserve array type
      if (Array.isArray(config)) {
        return config;
      }
      // For objects, preserve them as-is (including file:// references for Python assertions)
      if (config && typeof config === 'object') {
        return config;
      }
      return config;
    });

    // Set up file system mocks AFTER setting up the maybeLoadConfigFromExternalFile mock
    vi.mocked(globSync).mockReturnValue(['tests.yaml']);
    vi.mocked(fs.readFileSync).mockReturnValue(yaml.dump(yamlContentWithPythonAssertion));

    const result = await loadTestsFromGlob('tests.yaml');

    expect(mockMaybeLoadConfig).toHaveBeenCalled();
    expect((result[0].assert![0] as any).value).toBe('file://good_assertion.py'); // Should remain as file reference
  });
});

describe('CSV parsing with JSON fields', () => {
  beforeEach(() => {
    clearAllMocks();
    vi.mocked(getEnvBool).mockImplementation((_key, defaultValue = false) => defaultValue);
    vi.mocked(getEnvString).mockImplementation((_key, defaultValue) => defaultValue || '');
  });

  afterEach(() => {
    clearAllMocks();
  });

  it('should parse CSV file containing properly escaped JSON fields in strict mode', async () => {
    const csvContent = `label,query,expected_json_format,context
my_test_label,What is the date?,"{\""answer\"":""""}",file://../get_context.py`;

    vi.spyOn(fs, 'readFileSync').mockReturnValue(csvContent);

    const testCases = await readStandaloneTestsFile('dummy.csv');

    expect(testCases).toHaveLength(1);
    expect(testCases[0].vars).toEqual({
      label: 'my_test_label',
      query: 'What is the date?',
      expected_json_format: '{"answer":""}',
      context: 'file://../get_context.py',
    });

    vi.mocked(fs.readFileSync).mockRestore();
  });

  it('should fall back to relaxed parsing for unescaped JSON fields', async () => {
    const csvContent = `label,query,expected_json_format,context
my_test_label,What is the date?,{"answer":""},file://../get_context.py`;

    vi.spyOn(fs, 'readFileSync').mockReturnValue(csvContent);

    const testCases = await readStandaloneTestsFile('dummy.csv');

    expect(testCases).toHaveLength(1);
    expect(testCases[0].vars).toEqual({
      label: 'my_test_label',
      query: 'What is the date?',
      expected_json_format: '{"answer":""}',
      context: 'file://../get_context.py',
    });

    vi.mocked(fs.readFileSync).mockRestore();
  });

  it('should enforce strict mode when PROMPTFOO_CSV_STRICT=true', async () => {
    vi.mocked(getEnvBool).mockImplementation((key, defaultValue = false) =>
      key === 'PROMPTFOO_CSV_STRICT' ? true : defaultValue,
    );

    const csvContent = `label,query,expected_json_format,context
my_test_label,What is the date?,{"answer":""},file://../get_context.py`;

    vi.spyOn(fs, 'readFileSync').mockReturnValue(csvContent);

    await expect(readStandaloneTestsFile('dummy.csv')).rejects.toThrow(
      'Invalid Opening Quote: a quote is found on field',
    );

    vi.mocked(fs.readFileSync).mockRestore();
  });

  it('should propagate non-quote-related CSV errors', async () => {
    // Create CSV content with inconsistent column count to trigger "Invalid Record Length" error
    const csvContent = `label,query,expected_json_format,context
my_test_label,What is the date?
another_label,What is the time?,too,many,columns,here`;

    vi.spyOn(fs, 'readFileSync').mockReturnValue(csvContent);

    // Use default settings (not strict mode) to get past quote checking
    vi.mocked(getEnvBool).mockImplementation((_key, defaultValue = false) => defaultValue);
    vi.mocked(getEnvString).mockImplementation((key, defaultValue) =>
      key === 'PROMPTFOO_CSV_DELIMITER' ? ',' : defaultValue || '',
    );

    // The CSV parser should throw an error about inconsistent column count
    await expect(readStandaloneTestsFile('dummy.csv')).rejects.toThrow('Invalid Record Length');

    vi.mocked(fs.readFileSync).mockRestore();
  });
});
