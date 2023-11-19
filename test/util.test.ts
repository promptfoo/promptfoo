import * as fs from 'fs';
import * as path from 'path';

import { globSync } from 'glob';

import yaml from 'js-yaml';

import {
  writeOutput,
  writeMultipleOutputs,
  readGlobalConfig,
  maybeRecordFirstRun,
  resetGlobalConfig,
  readFilters,
  readConfigs,
} from '../src/util';

import type { EvaluateResult, EvaluateTable } from '../src/types';

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

jest.mock('../src/esm');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('util', () => {
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

  test('writeOutput with json and txt output', () => {
    const outputPath = ['output.json', 'output.txt'];
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
    writeMultipleOutputs(outputPath, summary, config, shareableUrl);

    expect(fs.writeFileSync).toHaveBeenCalledTimes(2);
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

  test('readFilters', () => {
    const mockFilter = jest.fn();
    jest.doMock(path.resolve('filter.js'), () => mockFilter, { virtual: true });

    (globSync as jest.Mock).mockImplementation((pathOrGlob) => [pathOrGlob]);

    const filters = readFilters({ testFilter: 'filter.js' });

    expect(filters.testFilter).toBe(mockFilter);
  });

  describe('readConfigs', () => {
    test('reads from existing configs', async () => {
      const config1 = { description: 'test1' };
      const config2 = { description: 'test2' };
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readFileSync as jest.Mock)
        .mockReturnValueOnce(JSON.stringify(config1))
        .mockReturnValueOnce(JSON.stringify(config2));

      const result = await readConfigs(['config1.json', 'config2.json']);

      expect(fs.existsSync).toHaveBeenCalledTimes(2);
      expect(fs.readFileSync).toHaveBeenCalledTimes(2);
      expect(result).toEqual({
        description: 'test1, test2',
        providers: [],
        prompts: [],
        tests: [],
        scenarios: [],
        defaultTest: {},
        nunjucksFilters: {},
        env: {},
        evaluateOptions: {},
        commandLineOptions: {},
      });
    });

    test('throws error for unsupported configuration file format', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      await expect(readConfigs(['config1.unsupported'])).rejects.toThrow(
        'Unsupported configuration file format: .unsupported'
      );
    });
  });
});
