import * as fs from 'fs';
import { globSync } from 'glob';
import yaml from 'js-yaml';
import { fetchCsvFromGoogleSheet } from '../src/googleSheets';
import { loadApiProvider } from '../src/providers';
import {
  generatePersonasPrompt,
  readStandaloneTestsFile,
  readTest,
  readVarsFiles,
  synthesize,
  testCasesPrompt,
  parseJson,
} from '../src/testCases';
import type { AssertionType, TestCase } from '../src/types';

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

describe('parseJson', () => {
  it('should parse valid JSON string', () => {
    const result = parseJson('{"key": "value"}');
    expect(result).toEqual({ key: 'value' });
  });

  it('should return undefined for invalid JSON string', () => {
    const result = parseJson('invalid json');
    expect(result).toBeUndefined();
  });
});

describe('readVarsFiles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

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

  it('should handle empty glob results', async () => {
    jest.mocked(globSync).mockReturnValue([]);
    const result = await readVarsFiles('nonexistent.yaml');
    expect(result).toEqual({});
  });
});

describe('readStandaloneTestsFile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should read CSV file and return test cases', async () => {
    jest.mocked(fs.readFileSync).mockReturnValue('var1,var2,__expected\nvalue1,value2,expected1');
    const result = await readStandaloneTestsFile('test.csv');

    expect(result).toEqual([
      {
        assert: [{ type: 'equals', value: 'expected1' }],
        description: 'Row #1',
        options: {},
        vars: { var1: 'value1', var2: 'value2' },
      },
    ]);
  });

  it('should read JSON file and return test cases', async () => {
    jest
      .mocked(fs.readFileSync)
      .mockReturnValue(JSON.stringify([{ var1: 'value1', var2: 'value2' }]));
    const result = await readStandaloneTestsFile('test.json');

    expect(result).toEqual([
      {
        assert: [],
        description: 'Row #1',
        options: {},
        vars: { var1: 'value1', var2: 'value2' },
      },
    ]);
  });

  it('should read Google Sheets and return test cases', async () => {
    const mockFetchCsvFromGoogleSheet = jest.mocked(fetchCsvFromGoogleSheet);
    mockFetchCsvFromGoogleSheet.mockResolvedValue([
      { var1: 'value1', var2: 'value2', __expected: 'expected1' },
    ]);

    const result = await readStandaloneTestsFile('https://docs.google.com/spreadsheets/d/example');
    expect(result).toEqual([
      {
        assert: [{ type: 'equals', value: 'expected1' }],
        description: 'Row #1',
        options: {},
        vars: { var1: 'value1', var2: 'value2' },
      },
    ]);
  });
});

describe('readTest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should read test from file path', async () => {
    const testContent = {
      description: 'Test 1',
      vars: { var1: 'value1' },
      assert: [{ type: 'equals' as AssertionType, value: 'expected' }],
    };
    jest.mocked(fs.readFileSync).mockReturnValue(yaml.dump(testContent));

    const result = await readTest('test.yaml');
    expect(result).toEqual(testContent);
  });

  it('should handle test case with provider string', async () => {
    const mockProvider = {
      id: () => 'mock-provider',
      callApi: jest.fn(),
    };
    jest.mocked(loadApiProvider).mockResolvedValue(mockProvider);

    const testCase: TestCase = {
      description: 'Test with provider',
      provider: 'mock-provider',
      assert: [{ type: 'equals', value: 'expected' }],
    };

    const result = await readTest(testCase);
    expect(result.provider).toBe(mockProvider);
  });
});

describe('synthesize', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should generate test cases based on prompts and personas', async () => {
    const mockProvider = {
      id: () => 'mock-provider',
      callApi: jest
        .fn()
        .mockResolvedValueOnce({ output: '{"personas": ["Persona 1"]}' })
        .mockResolvedValueOnce({ output: '{"vars": [{"var1": "value1"}]}' }),
    };
    jest.mocked(loadApiProvider).mockResolvedValue(mockProvider);

    const result = await synthesize({
      provider: 'mock-provider',
      prompts: ['Test prompt'],
      tests: [],
      numPersonas: 1,
      numTestCasesPerPersona: 1,
    });

    expect(result).toEqual([{ var1: 'value1' }]);
  });

  it('should handle different response formats', async () => {
    const mockProvider = {
      id: () => 'mock-provider',
      callApi: jest
        .fn()
        .mockResolvedValueOnce({ output: '{"personas": ["Persona 1"]}' })
        .mockResolvedValueOnce({ output: '[{"var1": "value1"}]' }),
    };
    jest.mocked(loadApiProvider).mockResolvedValue(mockProvider);

    const result = await synthesize({
      provider: 'mock-provider',
      prompts: ['Test prompt'],
      tests: [],
      numPersonas: 1,
      numTestCasesPerPersona: 1,
    });

    expect(result).toEqual([{ var1: 'value1' }]);
  });
});

describe('generatePersonasPrompt', () => {
  it('should generate prompt for single prompt', () => {
    const result = generatePersonasPrompt(['Test prompt'], 3);
    expect(result).toContain('Consider the following prompt for an LLM application:');
    expect(result).toContain('Test prompt');
    expect(result).toContain('List up to 3 user personas');
  });

  it('should generate prompt for multiple prompts', () => {
    const result = generatePersonasPrompt(['Prompt 1', 'Prompt 2'], 3);
    expect(result).toContain('Consider the following prompts for an LLM application:');
    expect(result).toContain('Prompt 1');
    expect(result).toContain('Prompt 2');
  });
});

describe('testCasesPrompt', () => {
  it('should generate test cases prompt', () => {
    const result = testCasesPrompt(
      ['Test prompt'],
      'Test persona',
      [],
      3,
      ['var1', 'var2'],
      'Additional instructions',
    );

    expect(result).toContain('Test prompt');
    expect(result).toContain('Test persona');
    expect(result).toContain('think of 3 sets of values');
    expect(result).toContain('Additional instructions');
  });
});
