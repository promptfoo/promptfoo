import * as fs from 'fs';
import * as path from 'path';

import yaml from 'js-yaml';
import { globSync } from 'glob';

import {
  readPrompts,
  writeOutput,
  readGlobalConfig,
  maybeRecordFirstRun,
  resetGlobalConfig,
} from '../src/util';

import type { EvaluateResult, EvaluateTable, Prompt } from '../src/types';

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

jest.mock('../src/esm.js');

function toPrompt(text: string): Prompt {
  return { raw: text, display: text };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('util', () => {
  test('readPrompts with single prompt file', () => {
    (fs.readFileSync as jest.Mock).mockReturnValue('Test prompt 1\n---\nTest prompt 2');
    (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false });
    const promptPaths = ['prompts.txt'];
    (globSync as jest.Mock).mockImplementation((pathOrGlob) => [pathOrGlob]);

    const result = readPrompts(promptPaths);

    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    expect(result).toEqual([toPrompt('Test prompt 1'), toPrompt('Test prompt 2')]);
  });

  test('readPrompts with multiple prompt files', () => {
    (fs.readFileSync as jest.Mock)
      .mockReturnValueOnce('Test prompt 1')
      .mockReturnValueOnce('Test prompt 2');
    (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false });
    const promptPaths = ['prompt1.txt', 'prompt2.txt'];
    (globSync as jest.Mock).mockImplementation((pathOrGlob) => [pathOrGlob]);

    const result = readPrompts(promptPaths);

    expect(fs.readFileSync).toHaveBeenCalledTimes(2);
    expect(result).toEqual([toPrompt('Test prompt 1'), toPrompt('Test prompt 2')]);
  });

  test('readPrompts with directory', () => {
    (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => true });
    (globSync as jest.Mock).mockImplementation((pathOrGlob) => [pathOrGlob]);
    (fs.readdirSync as jest.Mock).mockReturnValue(['prompt1.txt', 'prompt2.txt']);
    (fs.readFileSync as jest.Mock).mockImplementation((filePath) => {
      if (filePath.endsWith(path.join('prompts', 'prompt1.txt'))) {
        return 'Test prompt 1';
      } else if (filePath.endsWith(path.join('prompts', 'prompt2.txt'))) {
        return 'Test prompt 2';
      }
    });
    const promptPaths = ['prompts'];

    const result = readPrompts(promptPaths);

    expect(fs.statSync).toHaveBeenCalledTimes(1);
    expect(fs.readdirSync).toHaveBeenCalledTimes(1);
    expect(fs.readFileSync).toHaveBeenCalledTimes(2);
    expect(result).toEqual([toPrompt('Test prompt 1'), toPrompt('Test prompt 2')]);
  });

  test('readPrompts with empty input', () => {
    (fs.readFileSync as jest.Mock).mockReturnValue('');
    (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false });
    const promptPaths = ['prompts.txt'];

    const result = readPrompts(promptPaths);

    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    expect(result).toEqual([toPrompt('')]);
  });

  test('readPrompts with map input', () => {
    (fs.readFileSync as jest.Mock).mockReturnValue('some raw text');
    (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false });

    const result = readPrompts({
      'prompts.txt': 'foo bar',
    });

    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    expect(result).toEqual([{ raw: 'some raw text', display: 'foo bar' }]);
  });

  test('readPrompts with JSONL file', () => {
    const data = [
      [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Who won the world series in {{ year }}?' },
      ],
      [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Who won the superbowl in {{ year }}?' },
      ],
    ];

    (fs.readFileSync as jest.Mock).mockReturnValue(data.map((o) => JSON.stringify(o)).join('\n'));
    (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false });
    const promptPaths = ['prompts.jsonl'];

    const result = readPrompts(promptPaths);

    expect(fs.readFileSync).toHaveBeenCalledTimes(1);
    expect(result).toEqual([toPrompt(JSON.stringify(data[0])), toPrompt(JSON.stringify(data[1]))]);
  });

  test('writeOutput with CSV output', () => {
    const outputPath = 'output.csv';
    const results: EvaluateResult[] = [
      {
        success: true,
        score: 1.0,
        latencyMs: 1000,
        provider: {
          id: 'foo',
        },
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
      head: {
        prompts: [{ raw: 'Test prompt', display: '[display] Test prompt' }],
        vars: ['var1', 'var2'],
      },
      body: [
        {
          outputs: [
            { pass: true, score: 1.0, text: 'Test output', prompt: 'Test prompt', latencyMs: 1000 },
          ],
          vars: ['value1', 'value2'],
        },
      ],
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
    const config = {
      description: 'test',
    };
    const shareableUrl = null;
    writeOutput(outputPath, summary, config, shareableUrl);

    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
  });

  test('writeOutput with JSON output', () => {
    const outputPath = 'output.json';
    const results: EvaluateResult[] = [
      {
        success: true,
        score: 1.0,
        latencyMs: 1000,
        provider: {
          id: 'foo',
        },
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
      head: {
        prompts: [{ raw: 'Test prompt', display: '[display] Test prompt' }],
        vars: ['var1', 'var2'],
      },
      body: [
        {
          outputs: [
            { pass: true, score: 1.0, text: 'Test output', prompt: 'Test prompt', latencyMs: 1000 },
          ],
          vars: ['value1', 'value2'],
        },
      ],
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
    const config = {
      description: 'test',
    };
    const shareableUrl = null;
    writeOutput(outputPath, summary, config, shareableUrl);

    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
  });

  test('writeOutput with YAML output', () => {
    const outputPath = 'output.yaml';
    const results: EvaluateResult[] = [
      {
        success: true,
        score: 1.0,
        latencyMs: 1000,
        provider: {
          id: 'foo',
        },
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
      head: {
        prompts: [{ raw: 'Test prompt', display: '[display] Test prompt' }],
        vars: ['var1', 'var2'],
      },
      body: [
        {
          outputs: [
            { pass: true, score: 1.0, text: 'Test output', prompt: 'Test prompt', latencyMs: 1000 },
          ],
          vars: ['value1', 'value2'],
        },
      ],
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
    const config = {
      description: 'test',
    };
    const shareableUrl = null;
    writeOutput(outputPath, summary, config, shareableUrl);

    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
  });

  describe('readCliConfig', () => {
    afterEach(() => {
      jest.clearAllMocks();
      resetGlobalConfig();
    });

    test('reads from existing config', () => {
      const config = { hasRun: false };
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(yaml.dump(config));

      const result = readGlobalConfig();

      expect(fs.existsSync).toHaveBeenCalledTimes(1);
      expect(fs.readFileSync).toHaveBeenCalledTimes(1);
      expect(result).toEqual(config);
    });

    test('creates new config if none exists', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      (fs.writeFileSync as jest.Mock).mockImplementation();

      const result = readGlobalConfig();

      expect(fs.existsSync).toHaveBeenCalledTimes(2);
      expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ hasRun: false });
    });
  });

  describe('maybeRecordFirstRun', () => {
    afterEach(() => {
      resetGlobalConfig();
      jest.clearAllMocks();
    });

    test('returns true if it is the first run', () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      (fs.writeFileSync as jest.Mock).mockImplementation();

      const result = maybeRecordFirstRun();

      expect(fs.writeFileSync).toHaveBeenCalledTimes(2);
      expect(result).toBe(true);
    });

    test('returns false if it is not the first run', () => {
      const config = { hasRun: true };
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock).mockReturnValue(yaml.dump(config));

      const result = maybeRecordFirstRun();

      expect(fs.readFileSync).toHaveBeenCalledTimes(1);
      expect(result).toBe(false);
    });
  });
});
