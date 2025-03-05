/**
 * @jest-environment node
 */
import * as fs from 'fs';
import * as glob from 'glob';
import { getDb } from '../../src/database';
import * as esm from '../../src/esm';
import * as googleSheets from '../../src/googleSheets';
import Eval from '../../src/models/eval';
import { ResultFailureReason, type EvaluateResult } from '../../src/types';
import { readOutput, writeMultipleOutputs, writeOutput } from '../../src/util';
import * as util from '../../src/util';
import { getNunjucksEngine } from '../../src/util/templates';
import { TestGrader } from './utils';

jest.mock('../../src/database', () => ({
  getDb: jest.fn(),
}));

jest.mock('proxy-agent', () => ({
  ProxyAgent: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('glob', () => ({
  globSync: jest.fn(),
}));

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  statSync: jest.fn(),
  readdirSync: jest.fn(),
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
}));

jest.mock('../../src/esm', () => ({
  ...jest.requireActual('../../src/esm'),
  importModule: jest.fn(),
}));

jest.mock('../../src/util/templates', () => ({
  getNunjucksEngine: jest.fn(),
}));

jest.mock('../../src/googleSheets', () => ({
  writeCsvToGoogleSheet: jest.fn(),
}));

describe('util', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('renderVarsInObject', () => {
    let mockRenderString: jest.Mock;

    beforeEach(() => {
      mockRenderString = jest.fn();
      mockRenderString.mockImplementation((template: string) => template);
      jest.mocked(getNunjucksEngine).mockReturnValue({
        renderString: mockRenderString,
      });
    });

    it('should return the object as-is if no vars are provided', () => {
      const obj = { key: 'value' };
      expect(util.renderVarsInObject(obj)).toEqual(obj);
    });

    it('should return the object as-is if PROMPTFOO_DISABLE_TEMPLATING is set', () => {
      process.env.PROMPTFOO_DISABLE_TEMPLATING = 'true';
      const obj = { key: 'value' };
      expect(util.renderVarsInObject(obj, { var: 'value' })).toEqual(obj);
      delete process.env.PROMPTFOO_DISABLE_TEMPLATING;
    });

    it('should render templated variables in strings', () => {
      const obj = 'Hello {{name}}';
      const vars = { name: 'World' };
      util.renderVarsInObject(obj, vars);
      expect(mockRenderString).toHaveBeenCalledWith(obj, vars);
    });

    it('should recursively render templates in arrays', () => {
      const obj = ['Hello {{name}}', 'Goodbye {{name}}'];
      const vars = { name: 'World' };
      util.renderVarsInObject(obj, vars);
      expect(mockRenderString).toHaveBeenCalledTimes(2);
      expect(mockRenderString).toHaveBeenCalledWith(obj[0], vars);
      expect(mockRenderString).toHaveBeenCalledWith(obj[1], vars);
    });

    it('should recursively render templates in objects', () => {
      const obj = {
        greeting: 'Hello {{name}}',
        farewell: 'Goodbye {{name}}',
      };
      const vars = { name: 'World' };
      util.renderVarsInObject(obj, vars);
      expect(mockRenderString).toHaveBeenCalledTimes(2);
      expect(mockRenderString).toHaveBeenCalledWith(obj.greeting, vars);
      expect(mockRenderString).toHaveBeenCalledWith(obj.farewell, vars);
    });

    it('should handle deeply nested objects and arrays', () => {
      const obj = {
        greeting: 'Hello {{name}}',
        nested: {
          array: ['Goodbye {{name}}', { deep: 'Very {{name}}' }],
        },
      };
      const vars = { name: 'World' };
      util.renderVarsInObject(obj, vars);
      expect(mockRenderString).toHaveBeenCalledTimes(3);
      expect(mockRenderString).toHaveBeenCalledWith(obj.greeting, vars);
      expect(mockRenderString).toHaveBeenCalledWith(obj.nested.array[0], vars);
      const nestedObj = obj.nested.array[1] as { deep: string };
      expect(mockRenderString).toHaveBeenCalledWith(nestedObj.deep, vars);
    });

    it('should handle functions by evaluating and parsing them', () => {
      const fn = jest.fn().mockReturnValue('Hello {{name}}');
      const vars = { name: 'World' };
      util.renderVarsInObject(fn, vars);
      expect(fn).toHaveBeenCalledWith({ vars });
      expect(mockRenderString).toHaveBeenCalledWith('Hello {{name}}', vars);
    });
  });

  describe('providerToIdentifier', () => {
    it('should return undefined for undefined provider', () => {
      expect(util.providerToIdentifier(undefined)).toBeUndefined();
    });

    it('should return id for API provider', () => {
      const mockApiProvider = {
        id: jest.fn().mockReturnValue('api-provider-id'),
        callApi: jest.fn(),
      };
      expect(util.providerToIdentifier(mockApiProvider)).toBe('api-provider-id');
      expect(mockApiProvider.id).toHaveBeenCalledWith();
    });

    it('should return id for provider options', () => {
      const provider = {
        id: 'provider-id',
      };
      expect(util.providerToIdentifier(provider)).toBe('provider-id');
    });

    it('should return string as-is for string provider', () => {
      expect(util.providerToIdentifier('provider-id')).toBe('provider-id');
    });
  });

  describe('varsMatch', () => {
    it('should return true for matching vars', () => {
      const vars1 = { key: 'value' };
      const vars2 = { key: 'value' };
      expect(util.varsMatch(vars1, vars2)).toBe(true);
    });

    it('should return false for non-matching vars', () => {
      const vars1 = { key: 'value' };
      const vars2 = { key: 'other-value' };
      expect(util.varsMatch(vars1, vars2)).toBe(false);
    });

    it('should return true if both vars are undefined', () => {
      expect(util.varsMatch(undefined, undefined)).toBe(true);
    });

    it('should handle deeply nested objects', () => {
      const vars1 = { nested: { key: 'value' } };
      const vars2 = { nested: { key: 'value' } };
      expect(util.varsMatch(vars1, vars2)).toBe(true);
    });
  });

  describe('resultIsForTestCase', () => {
    it('should return true if vars and provider match', () => {
      const result = {
        vars: { key: 'value' },
        provider: 'provider-id',
        promptIdx: 0,
        testIdx: 0,
        testCase: {} as any,
        promptId: '',
        prompt: '',
        response: '',
        responseJson: null,
        score: null,
        success: true,
        cached: false,
        gradingResult: null,
      } as EvaluateResult;

      const testCase = {
        vars: { key: 'value' },
        provider: 'provider-id',
      };
      expect(util.resultIsForTestCase(result, testCase)).toBe(true);
    });

    it('should return false if vars do not match', () => {
      const result = {
        vars: { key: 'value' },
        provider: 'provider-id',
        promptIdx: 0,
        testIdx: 0,
        testCase: {} as any,
        promptId: '',
        prompt: '',
        response: '',
        responseJson: null,
        score: null,
        success: true,
        cached: false,
        gradingResult: null,
      } as EvaluateResult;

      const testCase = {
        vars: { key: 'other-value' },
        provider: 'provider-id',
      };
      expect(util.resultIsForTestCase(result, testCase)).toBe(false);
    });

    it('should return false if provider does not match', () => {
      const result = {
        vars: { key: 'value' },
        provider: 'provider-id',
        promptIdx: 0,
        testIdx: 0,
        testCase: {} as any,
        promptId: '',
        prompt: '',
        response: '',
        responseJson: null,
        score: null,
        success: true,
        cached: false,
        gradingResult: null,
      } as EvaluateResult;

      const testCase = {
        vars: { key: 'value' },
        provider: 'other-provider-id',
      };
      expect(util.resultIsForTestCase(result, testCase)).toBe(false);
    });

    it('should ignore provider if not specified in test case', () => {
      const result = {
        vars: { key: 'value' },
        provider: 'provider-id',
        promptIdx: 0,
        testIdx: 0,
        testCase: {} as any,
        promptId: '',
        prompt: '',
        response: '',
        responseJson: null,
        score: null,
        success: true,
        cached: false,
        gradingResult: null,
      } as EvaluateResult;

      const testCase = {
        vars: { key: 'value' },
      };
      expect(util.resultIsForTestCase(result, testCase)).toBe(true);
    });
  });

  describe('isRunningUnderNpx', () => {
    afterEach(() => {
      delete process.env.npm_execpath;
      delete process.env.npm_lifecycle_script;
    });

    it('should return true if npm_execpath includes npx', () => {
      process.env.npm_execpath = '/path/to/npx';
      expect(util.isRunningUnderNpx()).toBe(true);
    });

    it('should return true if npm_lifecycle_script includes npx', () => {
      process.env.npm_lifecycle_script = 'npx some-command';
      expect(util.isRunningUnderNpx()).toBe(true);
    });

    it('should return false if neither condition is met', () => {
      process.env.npm_execpath = '/path/to/npm';
      process.env.npm_lifecycle_script = 'npm run something';
      expect(util.isRunningUnderNpx()).toBe(false);
    });
  });

  describe('readFilters', () => {
    beforeEach(() => {
      jest.resetModules();
      jest.clearAllMocks();

      // Reset the mocks directly
      jest.mocked(glob.globSync).mockReset();
      jest.mocked(esm.importModule).mockReset();
    });

    it('should handle empty results from globSync', async () => {
      // Mock glob to return empty array
      jest.mocked(glob.globSync).mockReturnValue([]);

      // Mock importModule to return a function for direct import
      jest.mocked(esm.importModule).mockResolvedValue(() => 'direct import result');

      const result = await util.readFilters({ testFilter: 'nonexistent.js' }, '/test/path');

      // Verify the filter was loaded via direct import
      expect(result).toHaveProperty('testFilter');
      expect(typeof result.testFilter).toBe('function');
      expect(result.testFilter()).toBe('direct import result');

      // Verify importModule was called with the expected path
      expect(esm.importModule).toHaveBeenCalledWith(expect.stringContaining('nonexistent.js'));
    });
  });

  describe('writeOutput', () => {
    let consoleLogSpy: jest.SpyInstance;

    beforeEach(() => {
      consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      // @ts-ignore
      jest.mocked(getDb).mockReturnValue({
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockResolvedValue([]),
          }),
        }),
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([]),
          }),
        }),
      });
    });

    afterEach(() => {
      consoleLogSpy.mockRestore();
    });
    it('writeOutput with CSV output', async () => {
      // @ts-ignore
      jest.mocked(getDb).mockReturnValue({
        select: jest.fn().mockReturnValue({
          from: jest.fn().mockReturnValue({
            where: jest.fn().mockReturnValue({ all: jest.fn().mockResolvedValue([]) }),
          }),
        }),
        insert: jest.fn().mockReturnValue({
          values: jest.fn().mockReturnValue({
            returning: jest.fn().mockResolvedValue([]),
          }),
        }),
      });
      const outputPath = 'output.csv';
      const results: EvaluateResult[] = [
        {
          success: true,
          failureReason: ResultFailureReason.NONE,
          score: 1.0,
          namedScores: {},
          latencyMs: 1000,
          provider: {
            id: 'foo',
          },
          prompt: {
            raw: 'Test prompt',
            label: '[display] Test prompt',
          },
          response: {
            output: 'Test output',
          },
          vars: {
            var1: 'value1',
            var2: 'value2',
          },
          promptIdx: 0,
          testIdx: 0,
          testCase: {},
          promptId: 'foo',
        },
      ];
      const eval_ = new Eval({});
      await eval_.addResult(results[0]);

      const shareableUrl = null;
      await writeOutput(outputPath, eval_, shareableUrl);

      expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
    });

    it('writeOutput with JSON output', async () => {
      const outputPath = 'output.json';
      const eval_ = new Eval({});
      await writeOutput(outputPath, eval_, null);

      expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
    });

    it('writeOutput with YAML output', async () => {
      const outputPath = 'output.yaml';
      const eval_ = new Eval({});
      await writeOutput(outputPath, eval_, null);

      expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
    });

    it('writeOutput with json and txt output', async () => {
      const outputPath = ['output.json', 'output.txt'];
      const eval_ = new Eval({});

      await writeMultipleOutputs(outputPath, eval_, null);

      expect(fs.writeFileSync).toHaveBeenCalledTimes(2);
    });

    it('writes output to Google Sheets', async () => {
      const outputPath = 'https://docs.google.com/spreadsheets/d/1234567890/edit#gid=0';

      const config = { description: 'Test config' };
      const shareableUrl = null;
      const eval_ = new Eval(config);

      await writeOutput(outputPath, eval_, shareableUrl);

      expect(googleSheets.writeCsvToGoogleSheet).toHaveBeenCalledTimes(1);
    });
  });

  describe('readOutput', () => {
    it('reads JSON output', async () => {
      const outputPath = 'output.json';
      jest.mocked(fs.readFileSync).mockReturnValue('{}');
      const output = await readOutput(outputPath);
      expect(output).toEqual({});
    });

    it('fails for csv output', async () => {
      await expect(readOutput('output.csv')).rejects.toThrow(
        'Unsupported output file format: csv currently only supports json',
      );
    });

    it('fails for yaml output', async () => {
      await expect(readOutput('output.yaml')).rejects.toThrow(
        'Unsupported output file format: yaml currently only supports json',
      );

      await expect(readOutput('output.yml')).rejects.toThrow(
        'Unsupported output file format: yml currently only supports json',
      );
    });
  });

  describe('parsePathOrGlob', () => {
    // Note: Tests for parsePathOrGlob have been moved to test/util/file.test.ts
  });

  describe('Grader', () => {
    it('should have an id and callApi attributes', async () => {
      const Grader = new TestGrader();
      expect(Grader.id()).toBe('TestGradingProvider');
      await expect(Grader.callApi()).resolves.toEqual({
        output: JSON.stringify({
          pass: true,
          reason: 'Test grading output',
        }),
        tokenUsage: {
          completion: 5,
          prompt: 5,
          total: 10,
        },
      });
    });
  });
});
