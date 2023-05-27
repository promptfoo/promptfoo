import * as fs from 'fs';

import { readVars, readPrompts, writeOutput } from '../src/util.js';

import type { EvaluateResult, EvaluateTable } from '../src/types.js';

jest.mock('node-fetch', () => jest.fn());
jest.mock('glob', () => ({
  globSync: jest.fn(),
}));

jest.mock('fs', () => ({
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

jest.mock('../src/esm.js');

describe('util', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('readPrompts with single prompt file', () => {
    (fs.readFileSync as jest.Mock).mockReturnValue('Test prompt 1\n---\nTest prompt 2');
    const promptPaths = ['prompts.txt'];

    const result = readPrompts(promptPaths);

    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    expect(result).toEqual(['Test prompt 1', 'Test prompt 2']);
  });

  test('readPrompts with multiple prompt files', () => {
    (fs.readFileSync as jest.Mock)
      .mockReturnValueOnce('Test prompt 1')
      .mockReturnValueOnce('Test prompt 2');
    const promptPaths = ['prompt1.txt', 'prompt2.txt'];

    const result = readPrompts(promptPaths);

    expect(fs.readFileSync).toHaveBeenCalledTimes(2);
    expect(result).toEqual(['Test prompt 1', 'Test prompt 2']);
  });

  test('readPrompts with empty input', () => {
    (fs.readFileSync as jest.Mock).mockReturnValue('');
    const promptPaths = ['prompts.txt'];

    const result = readPrompts(promptPaths);

    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    expect(result).toEqual(['']);
  });

  test('readVars with CSV input', () => {
    (fs.readFileSync as jest.Mock).mockReturnValue('var1,var2\nvalue1,value2');
    const varsPath = 'vars.csv';

    const result = readVars(varsPath);

    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    expect(result).toEqual([{ var1: 'value1', var2: 'value2' }]);
  });

  test('readVars with JSON input', () => {
    (fs.readFileSync as jest.Mock).mockReturnValue('[{"var1": "value1", "var2": "value2"}]');
    const varsPath = 'vars.json';

    const result = readVars(varsPath);

    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    expect(result).toEqual([{ var1: 'value1', var2: 'value2' }]);
  });

  test('readVars with YAML input', () => {
    (fs.readFileSync as jest.Mock).mockReturnValue('- var1: value1\n  var2: value2');
    const varsPath = 'vars.yaml';

    const result = readVars(varsPath);

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
        },
      },
      results,
      table,
    };
    writeOutput(outputPath, summary);

    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
  });
});
