import type { EvaluateResult, Prompt } from '../../src/types';
import { ResultFailureReason } from '../../src/types';
import {
  extractFirstJsonObject,
  extractJsonObjects,
  isValidJson,
  orderKeys,
  safeJsonStringify,
  safeJsonStringifyTruncated,
  summarizeEvaluateResultForLogging,
} from '../../src/util/json';

describe('json utilities', () => {
  describe('isValidJson', () => {
    it('should return true for valid JSON', () => {
      expect(isValidJson('{"a": 1}')).toBe(true);
      expect(isValidJson('[1,2,3]')).toBe(true);
      expect(isValidJson('"test"')).toBe(true);
    });

    it('should return false for invalid JSON', () => {
      expect(isValidJson('{')).toBe(false);
      expect(isValidJson('not json')).toBe(false);
      expect(isValidJson('')).toBe(false);
    });
  });

  describe('safeJsonStringify', () => {
    it('should handle circular references', () => {
      const obj: any = { a: 1 };
      obj.self = obj;
      expect(safeJsonStringify(obj)).toBeDefined();
    });

    it('should handle large objects', () => {
      const largeStr = 'a'.repeat(1000000);
      const obj = { str: largeStr };
      const result = safeJsonStringifyTruncated(obj);
      expect(result).toBeDefined();
      expect(result).toContain('...[truncated]');
    });

    it('should handle pretty printing', () => {
      const obj = { a: 1, b: 2 };
      const result = safeJsonStringify(obj, true);
      expect(result).toContain('\n');
      expect(result).toContain('  ');
    });
  });

  describe('extractJsonObjects', () => {
    it('should extract valid JSON objects from text', () => {
      const text = 'Some text {"a": 1} more text {"b": 2}';
      const results = extractJsonObjects(text);
      expect(results).toHaveLength(2);
      expect(results[0]).toEqual({ a: 1 });
      expect(results[1]).toEqual({ b: 2 });
    });

    it('should handle nested objects', () => {
      const text = '{"outer": {"inner": 1}}';
      const results = extractJsonObjects(text);
      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({ outer: { inner: 1 } });
    });

    it('should handle malformed JSON', () => {
      const text = '{"a": 1} {bad json} {"b": 2}';
      const results = extractJsonObjects(text);
      expect(results[0]).toEqual({ a: 1 });
      expect(results[results.length - 1]).toEqual({ b: 2 });
    });
  });

  describe('extractFirstJsonObject', () => {
    it('should extract first valid JSON object', () => {
      const text = 'Some text {"a": 1} {"b": 2}';
      const result = extractFirstJsonObject(text);
      expect(result).toEqual({ a: 1 });
    });

    it('should throw if no valid JSON object found', () => {
      expect(() => extractFirstJsonObject('no json here')).toThrow('Expected a JSON object');
    });
  });

  describe('orderKeys', () => {
    it('should order object keys according to specified order', () => {
      const obj = { c: 3, a: 1, b: 2 };
      const ordered = orderKeys(obj, ['a', 'b', 'c']);
      const keys = Object.keys(ordered);
      expect(keys).toEqual(['a', 'b', 'c']);
    });

    it('should handle missing keys in order array', () => {
      const obj = { a: 1, b: 2, c: 3 };
      const ordered = orderKeys(obj, ['a']);
      const keys = Object.keys(ordered);
      expect(keys[0]).toBe('a');
      expect(keys).toContain('b');
      expect(keys).toContain('c');
    });

    it('should handle symbol keys', () => {
      const sym = Symbol('test');
      const obj = { a: 1, [sym]: 'symbol' };
      const ordered = orderKeys(obj, ['a']);
      expect(ordered[sym]).toBe('symbol');
    });
  });

  describe('summarizeEvaluateResultForLogging', () => {
    const baseResult: EvaluateResult = {
      id: 'test-id',
      testIdx: 1,
      promptIdx: 2,
      success: true,
      score: 0.8,
      error: undefined,
      failureReason: ResultFailureReason.NONE,
      promptId: 'test-prompt',
      prompt: { text: 'Test prompt', raw: 'Test prompt', label: 'test' } as Prompt,
      vars: {},
      latencyMs: 100,
      namedScores: {},
      provider: {
        id: 'test-provider',
        label: 'Test Provider',
      },
      response: {
        output: 'This is a test response with some length',
        error: undefined,
        cached: true,
        cost: 0.001,
        tokenUsage: { total: 100 },
        metadata: {
          key1: 'value1',
          key2: 'value2',
        },
      },
      testCase: {
        description: 'Test case description',
        vars: {
          var1: 'value1',
          var2: 'value2',
        },
      },
    };

    it('should throw TypeError for null/undefined input', () => {
      expect(() => summarizeEvaluateResultForLogging(null as any)).toThrow(TypeError);
      expect(() => summarizeEvaluateResultForLogging(undefined as any)).toThrow(TypeError);
    });

    it('should handle basic result with default parameters', () => {
      const summary = summarizeEvaluateResultForLogging(baseResult);
      expect(summary).toMatchObject({
        id: 'test-id',
        testIdx: 1,
        promptIdx: 2,
        success: true,
        score: 0.8,
        error: undefined,
        failureReason: ResultFailureReason.NONE,
      });
    });

    it('should truncate response output based on maxOutputLength', () => {
      const longOutput = 'a'.repeat(1000);
      const result = {
        ...baseResult,
        response: {
          ...baseResult.response!,
          output: longOutput,
        },
      } as EvaluateResult;

      const summary = summarizeEvaluateResultForLogging(result, 100);
      expect(summary.response?.output).toHaveLength(100 + '...[truncated]'.length);
      expect(summary.response?.output?.endsWith('...[truncated]')).toBe(true);
    });

    it('should handle provider with missing id', () => {
      const result = {
        ...baseResult,
        provider: {
          label: 'Test Provider',
        },
      } as EvaluateResult;

      const summary = summarizeEvaluateResultForLogging(result);
      expect(summary.provider?.id).toBe('');
    });

    it('should handle null response output', () => {
      const result = {
        ...baseResult,
        response: {
          ...baseResult.response!,
          output: null,
        },
      } as EvaluateResult;

      const summary = summarizeEvaluateResultForLogging(result);
      expect(summary.response?.output).toBeUndefined();
    });

    it('should include metadata keys when includeMetadataKeys is true', () => {
      const summary = summarizeEvaluateResultForLogging(baseResult, 500, true);
      expect(summary.response?.metadata).toEqual({
        keys: ['key1', 'key2'],
        keyCount: 2,
      });
    });

    it('should exclude metadata when includeMetadataKeys is false', () => {
      const summary = summarizeEvaluateResultForLogging(baseResult, 500, false);
      expect(summary.response?.metadata).toBeUndefined();
    });

    it('should handle missing optional fields', () => {
      const minimalResult = {
        testIdx: 0,
        promptIdx: 0,
        success: false,
        score: 0,
        failureReason: ResultFailureReason.NONE,
        promptId: 'test',
        prompt: { text: 'test', raw: 'test', label: 'test' } as Prompt,
        vars: {},
        latencyMs: 0,
        namedScores: {},
        testCase: {},
        provider: { id: 'test' },
      } as EvaluateResult;

      const summary = summarizeEvaluateResultForLogging(minimalResult);
      expect(summary).toMatchObject({
        testIdx: 0,
        promptIdx: 0,
        success: false,
        score: 0,
        failureReason: ResultFailureReason.NONE,
      });
    });

    it('should handle undefined response', () => {
      const result = {
        ...baseResult,
        response: undefined,
      } as EvaluateResult;

      const summary = summarizeEvaluateResultForLogging(result);
      expect(summary.response).toBeUndefined();
    });

    it('should handle empty metadata', () => {
      const result = {
        ...baseResult,
        response: {
          ...baseResult.response!,
          metadata: {},
        },
      } as EvaluateResult;

      const summary = summarizeEvaluateResultForLogging(result);
      expect(summary.response?.metadata).toEqual({
        keys: [],
        keyCount: 0,
      });
    });

    it('should handle undefined testCase vars', () => {
      const result = {
        ...baseResult,
        testCase: {
          description: 'Test case',
        },
      } as EvaluateResult;

      const summary = summarizeEvaluateResultForLogging(result);
      expect(summary.testCase?.vars).toBeUndefined();
    });
  });
});
