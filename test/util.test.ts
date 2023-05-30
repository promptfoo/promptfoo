import * as fs from 'fs';
import * as path from 'path';

import { globSync } from 'glob';

import { readVars, readPrompts, writeOutput, readTests } from '../src/util.js';

import type { EvaluateResult, EvaluateTable, TestCase } from '../src/types.js';

jest.mock('node-fetch', () => jest.fn());
jest.mock('glob', () => ({
  globSync: jest.fn(),
}));

jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  statSync: jest.fn(),
  readdirSync: jest.fn(),
}));

jest.mock('../src/esm.js');

describe('util', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('readPrompts with single prompt file', () => {
    (fs.readFileSync as jest.Mock).mockReturnValue('Test prompt 1\n---\nTest prompt 2');
    (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false });
    const promptPaths = ['prompts.txt'];

    const result = readPrompts(promptPaths);

    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    expect(result).toEqual(['Test prompt 1', 'Test prompt 2']);
  });

  test('readPrompts with multiple prompt files', () => {
    (fs.readFileSync as jest.Mock)
      .mockReturnValueOnce('Test prompt 1')
      .mockReturnValueOnce('Test prompt 2');
    (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false });
    const promptPaths = ['prompt1.txt', 'prompt2.txt'];

    const result = readPrompts(promptPaths);

    expect(fs.readFileSync).toHaveBeenCalledTimes(2);
    expect(result).toEqual(['Test prompt 1', 'Test prompt 2']);
  });

  test('readPrompts with directory', () => {
    (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => true });
    (globSync as jest.Mock).mockReturnValue(['prompts']);
    (fs.readdirSync as jest.Mock).mockReturnValue(['prompt1.txt', 'prompt2.txt']);
    (fs.readFileSync as jest.Mock).mockImplementation((filePath) => {
      if (filePath === path.join('prompts', 'prompt1.txt')) {
        return 'Test prompt 1';
      } else if (filePath === path.join('prompts', 'prompt2.txt')) {
        return 'Test prompt 2';
      }
    });
    const promptPaths = ['prompts'];

    const result = readPrompts(promptPaths);

    expect(fs.statSync).toHaveBeenCalledTimes(1);
    expect(fs.readdirSync).toHaveBeenCalledTimes(1);
    expect(fs.readFileSync).toHaveBeenCalledTimes(2);
    expect(result).toEqual(['Test prompt 1', 'Test prompt 2']);
  });

  test('readPrompts with empty input', () => {
    (fs.readFileSync as jest.Mock).mockReturnValue('');
    (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false });
    const promptPaths = ['prompts.txt'];

    const result = readPrompts(promptPaths);

    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    expect(result).toEqual(['']);
  });

  test('readVars with CSV input', async () => {
    (fs.readFileSync as jest.Mock).mockReturnValue('var1,var2\nvalue1,value2');
    const varsPath = 'vars.csv';

    const result = await readVars(varsPath);

    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    expect(result).toEqual([{ var1: 'value1', var2: 'value2' }]);
  });

  test('readVars with JSON input', async () => {
    (fs.readFileSync as jest.Mock).mockReturnValue('[{"var1": "value1", "var2": "value2"}]');
    const varsPath = 'vars.json';

    const result = await readVars(varsPath);

    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    expect(result).toEqual([{ var1: 'value1', var2: 'value2' }]);
  });

  test('readVars with YAML input', async () => {
    (fs.readFileSync as jest.Mock).mockReturnValue('- var1: value1\n  var2: value2');
    const varsPath = 'vars.yaml';

    const result = await readVars(varsPath);

    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    expect(result).toEqual([{ var1: 'value1', var2: 'value2' }]);
  });

  test('writeOutput with CSV output', () => {
    const outputPath = 'output.csv';
    const results: EvaluateResult[] = [
      {
        success: true,
        prompt: {
          raw: 'Test prompt',
          display: '[display] Test prompt',
        },
        response: {
          output: 'Test output',
        },
        vars: {
          var1: 'value1',
          var2: 'value2',
        },
      },
    ];
    const table: EvaluateTable = {
      head: { prompts: ['Test prompt'], vars: ['var1', 'var2'] },
      body: [{ outputs: ['Test output'], vars: ['value1', 'value2'] }],
    };
    const summary = {
      version: 1,
      stats: {
        successes: 1,
        failures: 1,
        tokenUsage: {
          total: 10,
          prompt: 5,
          completion: 5,
          cached: 0,
        },
      },
      results,
      table,
    };
    writeOutput(outputPath, summary);

    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
  });

  test('writeOutput with JSON output', () => {
    const outputPath = 'output.json';
    const results: EvaluateResult[] = [
      {
        success: true,
        prompt: {
          raw: 'Test prompt',
          display: '[display] Test prompt',
        },
        response: {
          output: 'Test output',
        },
        vars: {
          var1: 'value1',
          var2: 'value2',
        },
      },
    ];
    const table: EvaluateTable = {
      head: { prompts: ['Test prompt'], vars: ['var1', 'var2'] },
      body: [{ outputs: ['Test output'], vars: ['value1', 'value2'] }],
    };
    const summary = {
      version: 1,
      stats: {
        successes: 1,
        failures: 1,
        tokenUsage: {
          total: 10,
          prompt: 5,
          completion: 5,
          cached: 0,
        },
      },
      results,
      table,
    };
    writeOutput(outputPath, summary);

    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
  });

  test('writeOutput with YAML output', () => {
    const outputPath = 'output.yaml';
    const results: EvaluateResult[] = [
      {
        success: true,
        prompt: {
          raw: 'Test prompt',
          display: '[display] Test prompt',
        },
        response: {
          output: 'Test output',
        },
        vars: {
          var1: 'value1',
          var2: 'value2',
        },
      },
    ];
    const table: EvaluateTable = {
      head: { prompts: ['Test prompt'], vars: ['var1', 'var2'] },
      body: [{ outputs: ['Test output'], vars: ['value1', 'value2'] }],
    };
    const summary = {
      version: 1,
      stats: {
        successes: 1,
        failures: 1,
        tokenUsage: {
          total: 10,
          prompt: 5,
          completion: 5,
          cached: 0,
        },
      },
      results,
      table,
    };
    writeOutput(outputPath, summary);

    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
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
    (fs.readFileSync as jest.Mock).mockReturnValue('var1,var2,__expected\nvalue1,value2,value1\nvalue3,value4,fn:value5');
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
});
