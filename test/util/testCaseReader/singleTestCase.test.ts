import * as fs from 'fs';
import { globSync } from 'glob';
import yaml from 'js-yaml';
import { loadApiProvider } from '../../../src/providers';
import type { AssertionType, TestCase, TestCaseWithVarsFile } from '../../../src/types';
import { readTest } from '../../../src/util/testCaseReader';

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

jest.mock('../../../src/providers', () => ({
  loadApiProvider: jest.fn(),
}));

describe('Test Case Reader - Single Test Case', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads test case from YAML file path', async () => {
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

  it('returns TestCase object unchanged', async () => {
    const input: TestCase = {
      description: 'Test 1',
      vars: { var1: 'value1', var2: 'value2' },
      assert: [{ type: 'equals', value: 'value1' }],
    };

    const result = await readTest(input);

    expect(result).toEqual(input);
  });

  it('throws error for invalid test case format', async () => {
    const input: any = 123;

    await expect(readTest(input)).rejects.toThrow(
      'Test case must contain one of the following properties: assert, vars, options, metadata, provider, providerOutput, threshold.\n\nInstead got:\n{}',
    );
  });

  it('expands glob patterns in vars property', async () => {
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

  describe('Provider Loading', () => {
    it('loads provider from string identifier', async () => {
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

    it('loads provider from object with id property', async () => {
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
