import { describe, expect, it } from 'vitest';
import { convertTestResultsToTableRow } from '../../../src/util/exportToFile/index';

import type EvalResult from '../../../src/models/evalResult';

/**
 * Creates a minimal mock EvalResult for testing.
 * We use a partial type and cast to avoid needing the full EvalResult class.
 */
function createMockEvalResult(overrides: Partial<EvalResult> = {}): EvalResult {
  const defaultResult = {
    id: 'test-id',
    testIdx: 0,
    promptIdx: 0,
    description: 'Test description',
    testCase: {
      vars: {},
    },
    prompt: {
      raw: 'test prompt',
    },
    response: {
      output: 'test output',
    },
    provider: {
      id: 'test-provider',
      label: 'Test Provider',
    },
    success: true,
    score: 1,
    latencyMs: 100,
    error: undefined,
    metadata: undefined,
    namedScores: {},
    gradingResult: undefined,
    cost: 0,
  };

  return {
    ...defaultResult,
    ...overrides,
    testCase: {
      ...defaultResult.testCase,
      ...(overrides.testCase || {}),
    },
    prompt: {
      ...defaultResult.prompt,
      ...(overrides.prompt || {}),
    },
    response: {
      ...defaultResult.response,
      ...(overrides.response || {}),
    },
    provider: {
      ...defaultResult.provider,
      ...(overrides.provider || {}),
    },
  } as EvalResult;
}

describe('convertTestResultsToTableRow', () => {
  describe('basic functionality', () => {
    it('should convert results to table row format', () => {
      const results = [
        createMockEvalResult({
          testCase: { vars: { question: 'What is AI?' } },
        }),
      ];
      const varsForHeader = ['question'];

      const row = convertTestResultsToTableRow(results, varsForHeader);

      expect(row.description).toBe('Test description');
      expect(row.vars).toEqual(['What is AI?']);
      expect(row.testIdx).toBe(0);
      expect(row.outputs).toHaveLength(1);
      expect(row.outputs[0].text).toBe('test output');
    });

    it('should handle multiple variables', () => {
      const results = [
        createMockEvalResult({
          testCase: {
            vars: {
              question: 'What is AI?',
              context: 'Some context',
              temperature: 0.5,
            },
          },
        }),
      ];
      const varsForHeader = ['context', 'question', 'temperature'];

      const row = convertTestResultsToTableRow(results, varsForHeader);

      expect(row.vars).toEqual(['Some context', 'What is AI?', '0.5']);
    });

    it('should handle missing variables', () => {
      const results = [
        createMockEvalResult({
          testCase: { vars: { question: 'What is AI?' } },
        }),
      ];
      const varsForHeader = ['question', 'missingVar'];

      const row = convertTestResultsToTableRow(results, varsForHeader);

      expect(row.vars).toEqual(['What is AI?', '']);
    });

    it('should handle object variables as JSON', () => {
      const results = [
        createMockEvalResult({
          testCase: {
            vars: {
              config: { nested: 'value', count: 42 },
            },
          },
        }),
      ];
      const varsForHeader = ['config'];

      const row = convertTestResultsToTableRow(results, varsForHeader);

      expect(row.vars[0]).toBe('{"nested":"value","count":42}');
    });
  });

  describe('sessionId handling', () => {
    it('should use sessionId from testCase.vars when present', () => {
      const results = [
        createMockEvalResult({
          testCase: { vars: { sessionId: 'user-session-123' } },
        }),
      ];
      const varsForHeader = ['sessionId'];

      const row = convertTestResultsToTableRow(results, varsForHeader);

      expect(row.vars).toEqual(['user-session-123']);
    });

    it('should use metadata.sessionId when vars.sessionId is not present', () => {
      const results = [
        createMockEvalResult({
          testCase: { vars: {} },
          metadata: { sessionId: 'metadata-session-456' },
        }),
      ];
      const varsForHeader = ['sessionId'];

      const row = convertTestResultsToTableRow(results, varsForHeader);

      expect(row.vars).toEqual(['metadata-session-456']);
    });

    it('should use metadata.sessionId when vars.sessionId is empty string', () => {
      const results = [
        createMockEvalResult({
          testCase: { vars: { sessionId: '' } },
          metadata: { sessionId: 'metadata-session-789' },
        }),
      ];
      const varsForHeader = ['sessionId'];

      const row = convertTestResultsToTableRow(results, varsForHeader);

      expect(row.vars).toEqual(['metadata-session-789']);
    });

    it('should not overwrite non-empty vars.sessionId with metadata.sessionId', () => {
      const results = [
        createMockEvalResult({
          testCase: { vars: { sessionId: 'user-provided-session' } },
          metadata: { sessionId: 'should-be-ignored' },
        }),
      ];
      const varsForHeader = ['sessionId'];

      const row = convertTestResultsToTableRow(results, varsForHeader);

      expect(row.vars).toEqual(['user-provided-session']);
    });

    it('should return empty string when no sessionId is available', () => {
      const results = [
        createMockEvalResult({
          testCase: { vars: {} },
          metadata: {},
        }),
      ];
      const varsForHeader = ['sessionId'];

      const row = convertTestResultsToTableRow(results, varsForHeader);

      expect(row.vars).toEqual(['']);
    });
  });

  describe('sessionIds array handling (multi-turn strategies)', () => {
    it('should join sessionIds array with newlines', () => {
      const results = [
        createMockEvalResult({
          testCase: { vars: {} },
          metadata: { sessionIds: ['session-1', 'session-2', 'session-3'] },
        }),
      ];
      const varsForHeader = ['sessionId'];

      const row = convertTestResultsToTableRow(results, varsForHeader);

      expect(row.vars).toEqual(['session-1\nsession-2\nsession-3']);
    });

    it('should handle single-element sessionIds array', () => {
      const results = [
        createMockEvalResult({
          testCase: { vars: {} },
          metadata: { sessionIds: ['only-session'] },
        }),
      ];
      const varsForHeader = ['sessionId'];

      const row = convertTestResultsToTableRow(results, varsForHeader);

      expect(row.vars).toEqual(['only-session']);
    });

    it('should prefer sessionIds array over sessionId when both exist', () => {
      const results = [
        createMockEvalResult({
          testCase: { vars: {} },
          metadata: {
            sessionId: 'single-session',
            sessionIds: ['multi-1', 'multi-2'],
          },
        }),
      ];
      const varsForHeader = ['sessionId'];

      const row = convertTestResultsToTableRow(results, varsForHeader);

      expect(row.vars).toEqual(['multi-1\nmulti-2']);
    });

    it('should fall back to sessionId when sessionIds is empty array', () => {
      const results = [
        createMockEvalResult({
          testCase: { vars: {} },
          metadata: {
            sessionId: 'fallback-session',
            sessionIds: [],
          },
        }),
      ];
      const varsForHeader = ['sessionId'];

      const row = convertTestResultsToTableRow(results, varsForHeader);

      expect(row.vars).toEqual(['fallback-session']);
    });

    it('should ignore non-array sessionIds and use sessionId instead', () => {
      const results = [
        createMockEvalResult({
          testCase: { vars: {} },
          metadata: {
            sessionId: 'fallback-session',
            sessionIds: 'not-an-array' as unknown as string[],
          },
        }),
      ];
      const varsForHeader = ['sessionId'];

      const row = convertTestResultsToTableRow(results, varsForHeader);

      expect(row.vars).toEqual(['fallback-session']);
    });

    it('should not use sessionIds array if vars.sessionId is provided', () => {
      const results = [
        createMockEvalResult({
          testCase: { vars: { sessionId: 'user-provided' } },
          metadata: { sessionIds: ['should-be-ignored-1', 'should-be-ignored-2'] },
        }),
      ];
      const varsForHeader = ['sessionId'];

      const row = convertTestResultsToTableRow(results, varsForHeader);

      expect(row.vars).toEqual(['user-provided']);
    });
  });

  describe('combined scenarios', () => {
    it('should handle sessionId with other variables', () => {
      const results = [
        createMockEvalResult({
          testCase: {
            vars: {
              question: 'What is AI?',
              context: 'Some context',
            },
          },
          metadata: { sessionIds: ['session-a', 'session-b'] },
        }),
      ];
      const varsForHeader = ['context', 'question', 'sessionId'];

      const row = convertTestResultsToTableRow(results, varsForHeader);

      expect(row.vars).toEqual(['Some context', 'What is AI?', 'session-a\nsession-b']);
    });

    it('should handle edge case with undefined metadata', () => {
      const results = [
        createMockEvalResult({
          testCase: { vars: { question: 'What is AI?' } },
          metadata: undefined,
        }),
      ];
      const varsForHeader = ['question', 'sessionId'];

      const row = convertTestResultsToTableRow(results, varsForHeader);

      expect(row.vars).toEqual(['What is AI?', '']);
    });

    it('should handle non-string sessionId values in metadata', () => {
      const results = [
        createMockEvalResult({
          testCase: { vars: {} },
          metadata: { sessionId: { complex: 'object' } as unknown as string },
        }),
      ];
      const varsForHeader = ['sessionId'];

      const row = convertTestResultsToTableRow(results, varsForHeader);

      // Should be JSON stringified
      expect(row.vars[0]).toBe('{"complex":"object"}');
    });

    it('should handle non-string sessionId values in vars', () => {
      const results = [
        createMockEvalResult({
          testCase: { vars: { sessionId: { complex: 'object' } as unknown as string } },
        }),
      ];
      const varsForHeader = ['sessionId'];

      const row = convertTestResultsToTableRow(results, varsForHeader);

      // Should be JSON stringified
      expect(row.vars[0]).toBe('{"complex":"object"}');
    });
  });

  describe('output formatting', () => {
    it('should format successful output correctly', () => {
      const results = [
        createMockEvalResult({
          success: true,
          response: { output: 'The answer is 42' },
        }),
      ];
      const varsForHeader: string[] = [];

      const row = convertTestResultsToTableRow(results, varsForHeader);

      expect(row.outputs[0].text).toBe('The answer is 42');
      expect(row.outputs[0].pass).toBe(true);
    });

    it('should format error output correctly', () => {
      const results = [
        createMockEvalResult({
          success: false,
          error: 'Provider error occurred',
          response: { output: '' },
        }),
      ];
      const varsForHeader: string[] = [];

      const row = convertTestResultsToTableRow(results, varsForHeader);

      expect(row.outputs[0].text).toBe('Provider error occurred');
      expect(row.outputs[0].pass).toBe(false);
    });

    it('should handle null output', () => {
      const results = [
        createMockEvalResult({
          response: { output: null },
          error: 'Null response',
        }),
      ];
      const varsForHeader: string[] = [];

      const row = convertTestResultsToTableRow(results, varsForHeader);

      expect(row.outputs[0].text).toBe('Null response');
    });

    it('should handle object output', () => {
      const results = [
        createMockEvalResult({
          response: { output: { key: 'value', nested: { data: 123 } } },
        }),
      ];
      const varsForHeader: string[] = [];

      const row = convertTestResultsToTableRow(results, varsForHeader);

      expect(row.outputs[0].text).toBe('{"key":"value","nested":{"data":123}}');
    });
  });
});
