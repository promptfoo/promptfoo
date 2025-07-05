import type { EvaluateResult } from '../types';
import { ResultFailureReason } from '../types';
import { safeJsonStringify, summarizeEvaluateResultForLogging } from './json';

describe('JSON utilities for large data handling', () => {
  // Create test EvaluateResult with reasonable data size
  const createTestEvaluateResult = (): EvaluateResult => {
    return {
      id: 'test-eval-result',
      testIdx: 0,
      promptIdx: 0,
      success: false,
      score: 0.5,
      error: 'Test error',
      failureReason: ResultFailureReason.ERROR,
      latencyMs: 100,
      promptId: 'test-prompt-id',
      provider: {
        id: 'test-provider',
        label: 'Test Provider',
      },
      response: {
        output: 'This is a test output that is reasonably sized for testing purposes.',
        error: undefined,
        cached: false,
        cost: 0.01,
        tokenUsage: {
          total: 1000,
          prompt: 500,
          completion: 500,
        },
        metadata: {
          model: 'gpt-4',
          timestamp: '2024-01-01T00:00:00Z',
          additionalData: 'Some additional metadata for testing',
        },
      },
      testCase: {
        description: 'Test case with regular data',
        vars: {
          input: 'test input',
          context: 'test context',
        },
      },
      prompt: {
        raw: 'Test prompt',
        display: 'Test Prompt Display',
        label: 'Test Prompt Label',
      },
      vars: {
        userInput: 'test user input',
        systemPrompt: 'test system prompt',
      },
      namedScores: {},
    };
  };

  describe('safeJsonStringify', () => {
    it('should handle normal objects without modification', () => {
      const normalObject = { id: 1, name: 'test', data: 'small data' };
      const result = safeJsonStringify(normalObject);

      expect(result).toBe(JSON.stringify(normalObject));
      expect(result).not.toContain('...[truncated]');
    });

    it('should handle circular references', () => {
      const obj: any = { id: 1, name: 'test' };
      obj.circular = obj;

      const result = safeJsonStringify(obj);
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
      expect(result).not.toContain('circular');
    });

    it('should handle objects gracefully', () => {
      const testResult = createTestEvaluateResult();

      expect(() => {
        const result = safeJsonStringify(testResult);
        expect(result).toBeDefined();
        expect(typeof result).toBe('string');
      }).not.toThrow();
    });

    it('should return undefined for other types of errors', () => {
      const originalStringify = JSON.stringify;
      jest.spyOn(JSON, 'stringify').mockImplementation(() => {
        throw new Error('Different error');
      });

      const result = safeJsonStringify({ test: 'data' });
      expect(result).toBeUndefined();

      JSON.stringify = originalStringify;
    });

    it('should fallback to truncated version for RangeError', () => {
      const originalStringify = JSON.stringify;
      jest.spyOn(JSON, 'stringify').mockImplementation(() => {
        throw new RangeError('Invalid string length');
      });

      const result = safeJsonStringify({ test: 'data' });
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');

      JSON.stringify = originalStringify;
    });
  });

  describe('summarizeEvaluateResultForLogging', () => {
    it('should throw TypeError for null or undefined input', () => {
      expect(() => summarizeEvaluateResultForLogging(null as any)).toThrow(TypeError);
      expect(() => summarizeEvaluateResultForLogging(undefined as any)).toThrow(TypeError);
    });

    it('should create a safe summary of evaluation results', () => {
      const testResult = createTestEvaluateResult();
      const summary = summarizeEvaluateResultForLogging(testResult);

      expect(summary.id).toBe('test-eval-result');
      expect(summary.testIdx).toBe(0);
      expect(summary.promptIdx).toBe(0);
      expect(summary.success).toBe(false);
      expect(summary.score).toBe(0.5);
      expect(summary.error).toBe('Test error');
      expect(summary.failureReason).toBe(ResultFailureReason.ERROR);

      expect(summary.provider?.id).toBe('test-provider');
      expect(summary.provider?.label).toBe('Test Provider');

      expect(summary.response?.output).toBeDefined();
      expect(summary.response?.cached).toBe(false);
      expect(summary.response?.cost).toBe(0.01);
      expect(summary.response?.tokenUsage).toEqual({
        total: 1000,
        prompt: 500,
        completion: 500,
      });

      expect(summary.response?.metadata?.keys).toContain('model');
      expect(summary.response?.metadata?.keys).toContain('timestamp');
      expect(summary.response?.metadata?.keys).toContain('additionalData');
      expect(summary.response?.metadata?.keyCount).toBe(3);

      expect(summary.testCase?.description).toBe('Test case with regular data');
      expect(summary.testCase?.vars).toEqual(['input', 'context']);
    });

    it('should handle custom options', () => {
      const testResult = createTestEvaluateResult();
      const summary = summarizeEvaluateResultForLogging(testResult, 20, false);

      expect(summary.response?.output?.length).toBeLessThanOrEqual(35); // 20 + '...[truncated]'
      expect(summary.response?.metadata).toBeUndefined();
    });

    it('should handle EvaluateResult with minimal data', () => {
      const minimalResult: EvaluateResult = {
        id: 'minimal-result',
        testIdx: 1,
        promptIdx: 2,
        success: true,
        score: 1.0,
        failureReason: ResultFailureReason.NONE,
        latencyMs: 50,
        promptId: 'minimal-prompt-id',
        provider: { id: 'minimal-provider' },
        prompt: {
          raw: 'test prompt',
          label: 'Test Prompt',
        },
        vars: {},
        testCase: { vars: {} },
        namedScores: {},
      };

      const summary = summarizeEvaluateResultForLogging(minimalResult);

      expect(summary.id).toBe('minimal-result');
      expect(summary.success).toBe(true);
      expect(summary.score).toBe(1.0);
      expect(summary.provider?.id).toBe('minimal-provider');
    });

    it('should handle long output strings by truncating them', () => {
      const longOutput = 'A'.repeat(1000);
      const resultWithLongOutput: EvaluateResult = {
        ...createTestEvaluateResult(),
        response: {
          output: longOutput,
          cached: false,
        },
      };

      const summary = summarizeEvaluateResultForLogging(resultWithLongOutput, 100);

      expect(summary.response?.output?.length).toBeLessThanOrEqual(115); // 100 + '...[truncated]'
      expect(summary.response?.output).toContain('...[truncated]');
    });

    it('should be safely stringifiable', () => {
      const testResult = createTestEvaluateResult();
      const summary = summarizeEvaluateResultForLogging(testResult);

      expect(() => {
        const result = safeJsonStringify(summary);
        expect(result).toBeDefined();
        expect(typeof result).toBe('string');
      }).not.toThrow();
    });

    it('should handle non-string output values', () => {
      const resultWithObjectOutput: EvaluateResult = {
        ...createTestEvaluateResult(),
        response: {
          output: { complexObject: 'value', nested: { data: 'test' } },
          cached: false,
        },
      };

      const summary = summarizeEvaluateResultForLogging(resultWithObjectOutput);

      expect(summary.response?.output).toBe('[object Object]');
    });
  });

  describe('Integration test - evaluator error logging scenario', () => {
    it('should handle the exact scenario from evaluator.ts without throwing', () => {
      const testEvalResult = createTestEvaluateResult();
      const mockError = new Error('Database connection failed');

      expect(() => {
        const resultSummary = summarizeEvaluateResultForLogging(testEvalResult);
        const logMessage = `Error saving result: ${mockError} ${safeJsonStringify(resultSummary)}`;

        expect(logMessage).toBeDefined();
        expect(logMessage).toContain('Error saving result: Error: Database connection failed');
        expect(logMessage).toContain('"id":"test-eval-result"');
        expect(logMessage).toContain('"success":false');
        expect(logMessage.length).toBeLessThan(5000);
      }).not.toThrow();
    });

    it('should perform efficiently', () => {
      const testResult = createTestEvaluateResult();

      const start = Date.now();
      const summary = summarizeEvaluateResultForLogging(testResult);
      const stringified = safeJsonStringify(summary);
      const duration = Date.now() - start;

      expect(duration).toBeLessThan(100);
      expect(stringified).toBeDefined();
    });
  });
});
