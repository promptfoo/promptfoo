import dedent from 'dedent';
import * as fs from 'fs';
import { globSync } from 'glob';
import yaml from 'js-yaml';
import { testCaseFromCsvRow } from '../src/csv';
import { getEnvString } from '../src/envars';
import { fetchCsvFromGoogleSheet } from '../src/googleSheets';
import logger from '../src/logger';
import { loadApiProvider } from '../src/providers';
import {
  generatePersonasPrompt,
  readStandaloneTestsFile,
  readTest,
  readTests,
  readVarsFiles,
  synthesize,
  testCasesPrompt,
} from '../src/testCases';
import type { AssertionType, TestCase, TestCaseWithVarsFile } from '../src/types';

jest.mock('proxy-agent', () => ({
  ProxyAgent: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('glob', () => ({
  globSync: jest.fn(),
}));
jest.mock('../src/providers', () => ({
  loadApiProvider: jest.fn(),
}));
jest.mock('../src/fetch');

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

jest.mock('../src/database', () => ({
  getDb: jest.fn(),
}));

jest.mock('../src/googleSheets', () => ({
  fetchCsvFromGoogleSheet: jest.fn(),
}));

jest.mock('../src/envars', () => ({
  ...jest.requireActual('../src/envars'),
  getEnvBool: jest.fn(),
  getEnvString: jest.fn().mockImplementation((key, defaultValue) => defaultValue),
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
      '../test.js',
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
      jest.requireMock('../src/googleSheets').fetchCsvFromGoogleSheet;
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
    const warnSpy = jest.spyOn(logger, 'warn');
    const unsupportedTests = { invalid: 'format' };

    await readTests(unsupportedTests as any);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Warning: Unsupported 'tests' format in promptfooconfig.yaml."),
    );
    warnSpy.mockRestore();
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

    const result = await readVarsFiles('vars.yaml');

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

    const result = await readVarsFiles(['vars1.yaml', 'vars2.yaml']);

    expect(result).toEqual({ var1: 'value1', var2: 'value2' });
  });
});

describe('synthesize', () => {
  it('should generate test cases based on prompts and personas', async () => {
    let i = 0;
    const mockProvider = {
      id: () => 'mock-provider',
      callApi: jest.fn(() => {
        if (i === 0) {
          i++;
          return Promise.resolve({ output: '{"personas": ["Persona 1", "Persona 2"]}' });
        }
        return Promise.resolve({ output: '{"vars": [{"var1": "value1"}, {"var2": "value2"}]}' });
      }),
    };
    jest.mocked(loadApiProvider).mockResolvedValue(mockProvider);
    const result = await synthesize({
      provider: 'mock-provider',
      prompts: ['Test prompt'],
      tests: [],
      numPersonas: 2,
      numTestCasesPerPersona: 1,
    });

    expect(result).toHaveLength(2);
    expect(result).toEqual([{ var1: 'value1' }, { var2: 'value2' }]);
  });
});

describe('generatePersonasPrompt', () => {
  it('should generate a prompt for a single prompt input', () => {
    const prompts = ['What is the capital of France?'];
    const numPersonas = 3;
    const result = generatePersonasPrompt(prompts, numPersonas);

    expect(result).toBe(dedent`
      Consider the following prompt for an LLM application:

      <Prompts>
      <Prompt>
      What is the capital of France?
      </Prompt>
      </Prompts>

      List up to 3 user personas that would send this prompt. Your response should be JSON of the form {personas: string[]}
    `);
  });

  it('should generate a prompt for multiple prompt inputs', () => {
    const prompts = ['What is the capital of France?', 'Who wrote Romeo and Juliet?'];
    const numPersonas = 5;
    const result = generatePersonasPrompt(prompts, numPersonas);

    expect(result).toBe(dedent`
      Consider the following prompts for an LLM application:

      <Prompts>
      <Prompt>
      What is the capital of France?
      </Prompt>
      <Prompt>
      Who wrote Romeo and Juliet?
      </Prompt>
      </Prompts>

      List up to 5 user personas that would send these prompts. Your response should be JSON of the form {personas: string[]}
    `);
  });
});

describe('testCasesPrompt', () => {
  it('should generate a test cases prompt with single prompt and no existing tests', () => {
    const prompts = ['What is the capital of {{country}}?'];
    const persona = 'A curious student';
    const tests: TestCase[] = [];
    const numTestCasesPerPersona = 3;
    const variables = ['country'];
    const result = testCasesPrompt(prompts, persona, tests, numTestCasesPerPersona, variables);

    expect(result).toBe(dedent`
      Consider this prompt, which contains some {{variables}}:
      <Prompts>
      <Prompt>
      What is the capital of {{country}}?
      </Prompt>
      </Prompts>

      This is your persona:
      <Persona>
      A curious student
      </Persona>

      Here are some existing tests:

      Fully embody this persona and determine a value for each variable, such that the prompt would be sent by this persona.

      You are a tester, so try to think of 3 sets of values that would be interesting or unusual to test.

      Your response should contain a JSON map of variable names to values, of the form {vars: {country: string}[]}
    `);
  });

  it('should generate a test cases prompt with multiple prompts and existing tests', () => {
    const prompts = ['What is the capital of {{country}}?', 'What is the population of {{city}}?'];
    const persona = 'A geography enthusiast';
    const tests: TestCase[] = [
      { vars: { country: 'France', city: 'Paris' } },
      { vars: { country: 'Japan', city: 'Tokyo' } },
    ];
    const numTestCasesPerPersona = 2;
    const variables = ['country', 'city'];
    const instructions = 'Focus on less known countries and cities.';
    const result = testCasesPrompt(
      prompts,
      persona,
      tests,
      numTestCasesPerPersona,
      variables,
      instructions,
    );

    expect(result).toBe(dedent`
      Consider these prompts, which contains some {{variables}}:
      <Prompts>
      <Prompt>
      What is the capital of {{country}}?
      </Prompt>
      <Prompt>
      What is the population of {{city}}?
      </Prompt>
      </Prompts>

      This is your persona:
      <Persona>
      A geography enthusiast
      </Persona>

      Here are some existing tests:
      <Test>
        {
      "country": "France",
      "city": "Paris"
      }
        </Test>
      <Test>
        {
      "country": "Japan",
      "city": "Tokyo"
      }
        </Test>

      Fully embody this persona and determine a value for each variable, such that the prompt would be sent by this persona.

      You are a tester, so try to think of 2 sets of values that would be interesting or unusual to test. Focus on less known countries and cities.

      Your response should contain a JSON map of variable names to values, of the form {vars: {country: string, city: string}[]}
    `);
  });
});
