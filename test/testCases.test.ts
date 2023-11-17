import * as fs from 'fs';

import yaml from 'js-yaml';
import { globSync } from 'glob';

import { readTestsFile, readTest, readTests } from '../src/testCases';

import type { AssertionType, TestCase } from '../src/types';

jest.mock('node-fetch', () => jest.fn());
jest.mock('glob', () => ({
  globSync: jest.fn(),
}));

jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  statSync: jest.fn(),
  readdirSync: jest.fn(),
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('readTestsFile', () => {
  test('readVars with CSV input', async () => {
    (fs.readFileSync as jest.Mock).mockReturnValue('var1,var2\nvalue1,value2');
    const varsPath = 'vars.csv';

    const result = await readTestsFile(varsPath);

    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    expect(result).toEqual([{ var1: 'value1', var2: 'value2' }]);
  });

  test('readVars with JSON input', async () => {
    (fs.readFileSync as jest.Mock).mockReturnValue('[{"var1": "value1", "var2": "value2"}]');
    const varsPath = 'vars.json';

    const result = await readTestsFile(varsPath);

    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    expect(result).toEqual([{ var1: 'value1', var2: 'value2' }]);
  });

  test('readVars with YAML input', async () => {
    (fs.readFileSync as jest.Mock).mockReturnValue('- var1: value1\n  var2: value2');
    const varsPath = 'vars.yaml';

    const result = await readTestsFile(varsPath);

    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    expect(result).toEqual([{ var1: 'value1', var2: 'value2' }]);
  });
});

describe('readTest', () => {
  test('readTest with string input (path to test config)', async () => {
    const testPath = 'test1.yaml';
    const testContent = {
      description: 'Test 1',
      vars: { var1: 'value1', var2: 'value2' },
      assert: [{ type: 'equals', value: 'value1' }],
    };
    (fs.readFileSync as jest.Mock).mockReturnValueOnce(yaml.dump(testContent));

    const result = await readTest(testPath);

    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    expect(result).toEqual(testContent);
  });

  test('readTest with TestCase input', async () => {
    const input: TestCase = {
      description: 'Test 1',
      vars: { var1: 'value1', var2: 'value2' },
      assert: [{ type: 'equals', value: 'value1' }],
    };

    const result = await readTest(input);

    expect(result).toEqual(input);
  });

  test('readTest with invalid input', async () => {
    const input: any = 123;

    await expect(readTest(input)).rejects.toThrow();
  });

  test('readTest with TestCase that contains a vars glob input', async () => {
    const input = {
      description: 'Test 1',
      vars: 'vars/*.yaml',
      assert: [{ type: 'equals' as AssertionType, value: 'value1' }],
    };
    const varsContent1 = { var1: 'value1' };
    const varsContent2 = { var2: 'value2' };
    (globSync as jest.Mock).mockReturnValueOnce(['vars/vars1.yaml', 'vars/vars2.yaml']);
    (fs.readFileSync as jest.Mock)
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

  test('readTest with TestCase that contains a var with file:// prefix', async () => {
    const input = {
      description: 'Test 1',
      vars: { var1: 'file://vars/var1.yaml', var2: 'a normal var' },
      assert: [{ type: 'equals' as AssertionType, value: 'value1' }],
    };
    (fs.readFileSync as jest.Mock).mockReturnValueOnce('value1');

    const result = await readTest(input);

    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      description: 'Test 1',
      vars: { var1: 'value1', var2: 'a normal var' },
      assert: [{ type: 'equals', value: 'value1' }],
    });
  });
});

describe('readTests', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('readTests with no input', async () => {
    const result = await readTests(undefined);
    expect(result).toEqual([]);
  });

  test('readTests with string input (CSV file path)', async () => {
    (fs.readFileSync as jest.Mock).mockReturnValue(
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
      },
      {
        description: 'Row #2',
        vars: { var1: 'value3', var2: 'value4' },
        assert: [{ type: 'javascript', value: 'value5' }],
      },
    ]);
  });

  test('readTests with multiple __expected in CSV', async () => {
    (fs.readFileSync as jest.Mock).mockReturnValue(
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
      },
      {
        description: 'Row #2',
        vars: { var1: 'value3', var2: 'value4' },
        assert: [
          { type: 'javascript', value: 'value5' },
          { type: 'javascript', value: 'value5.2' },
          { type: 'javascript', value: 'value5.3' },
        ],
      },
    ]);
  });

  test('readTests with array input (TestCase[])', async () => {
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

  test('readTests with string array input (paths to test configs)', async () => {
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
    (fs.readFileSync as jest.Mock)
      .mockReturnValueOnce(yaml.dump(test1Content))
      .mockReturnValueOnce(yaml.dump(test2Content));
    (globSync as jest.Mock).mockImplementation((pathOrGlob) => [pathOrGlob]);

    const result = await readTests(testsPaths);

    expect(fs.readFileSync).toHaveBeenCalledTimes(2);
    expect(result).toEqual([...test1Content, ...test2Content]);
  });

  test('readTests with vars glob input (paths to vars configs)', async () => {
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
    (fs.readFileSync as jest.Mock)
      .mockReturnValueOnce(yaml.dump(test1Content))
      .mockReturnValueOnce(yaml.dump(vars1Content));
    (globSync as jest.Mock).mockImplementation((pathOrGlob) => [pathOrGlob]);

    const result = await readTests(testsPaths);

    expect(fs.readFileSync).toHaveBeenCalledTimes(2);
    expect(result).toEqual([Object.assign({}, test1Content[0], { vars: vars1Content })]);
  });
});
