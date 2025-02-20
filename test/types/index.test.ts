import { isGradingResult, TestCaseSchema } from '../../src/types';

describe('isGradingResult', () => {
  it('should return true for valid grading result object', () => {
    const validResult = {
      pass: true,
      score: 0.8,
      reason: 'Test passed',
    };
    expect(isGradingResult(validResult)).toBe(true);
  });

  it('should return true for grading result with optional fields', () => {
    const resultWithOptional = {
      pass: false,
      score: 0.2,
      reason: 'Test failed',
      namedScores: { accuracy: 0.5 },
      tokensUsed: { total: 100 },
      componentResults: [],
      assertion: { type: 'equals', value: 'expected' },
      comment: 'Needs improvement',
    };
    expect(isGradingResult(resultWithOptional)).toBe(true);
  });

  it('should return false for null', () => {
    expect(isGradingResult(null)).toBe(false);
  });

  it('should return false for non-object', () => {
    expect(isGradingResult('not an object')).toBe(false);
    expect(isGradingResult(123)).toBe(false);
    expect(isGradingResult(undefined)).toBe(false);
  });

  it('should return false if missing required fields', () => {
    expect(isGradingResult({ score: 1, reason: 'test' })).toBe(false);
    expect(isGradingResult({ pass: true, reason: 'test' })).toBe(false);
    expect(isGradingResult({ pass: true, score: 1 })).toBe(false);
  });

  it('should return false if fields have wrong types', () => {
    expect(
      isGradingResult({
        pass: 'true',
        score: '0.8',
        reason: 123,
      }),
    ).toBe(false);
  });

  it('should return false if optional fields have wrong types', () => {
    expect(
      isGradingResult({
        pass: true,
        score: 0.8,
        reason: 'test',
        namedScores: 'invalid',
        tokensUsed: 'invalid',
        componentResults: 'invalid',
        assertion: 'invalid',
        comment: 123,
      }),
    ).toBe(false);
  });
});

describe('TestCaseSchema assertScoringFunction', () => {
  it('should validate test case with valid file-based scoring function', () => {
    const testCase = {
      description: 'Test with file scoring',
      assertScoringFunction: 'file://path/to/score.js:scoreFunc',
      vars: { input: 'test' },
    };
    expect(() => TestCaseSchema.parse(testCase)).not.toThrow();
  });

  it('should validate test case with valid custom scoring function', () => {
    const testCase = {
      description: 'Test with custom scoring',
      assertScoringFunction: async (scores: Record<string, number>) => {
        return {
          pass: scores.accuracy > 0.8,
          score: scores.accuracy,
          reason: 'Custom scoring applied',
        };
      },
      vars: { input: 'test' },
    };
    expect(() => TestCaseSchema.parse(testCase)).not.toThrow();
  });

  it('should validate test case with missing assertScoringFunction', () => {
    const testCase = {
      description: 'No scoring function',
      vars: { input: 'test' },
    };
    expect(() => TestCaseSchema.parse(testCase)).not.toThrow();
  });

  it('should validate test case with python file scoring function', () => {
    const testCase = {
      description: 'Python scoring function',
      assertScoringFunction: 'file://path/to/score.py:score_func',
      vars: { input: 'test' },
    };
    expect(() => TestCaseSchema.parse(testCase)).not.toThrow();
  });

  it('should validate test case with typescript file scoring function', () => {
    const testCase = {
      description: 'TypeScript scoring function',
      assertScoringFunction: 'file://path/to/score.ts:scoreFunc',
      vars: { input: 'test' },
    };
    expect(() => TestCaseSchema.parse(testCase)).not.toThrow();
  });

  it('should validate test case with file path containing dots', () => {
    const testCase = {
      description: 'File path with dots',
      assertScoringFunction: 'file://path/to/my.score.js:myNamespace.scoreFunc',
      vars: { input: 'test' },
    };
    expect(() => TestCaseSchema.parse(testCase)).not.toThrow();
  });

  it('should validate test case with absolute file path', () => {
    const testCase = {
      description: 'Absolute file path',
      assertScoringFunction: 'file:///absolute/path/to/score.js:scoreFunc',
      vars: { input: 'test' },
    };
    expect(() => TestCaseSchema.parse(testCase)).not.toThrow();
  });

  it('should validate test case with relative file path', () => {
    const testCase = {
      description: 'Relative file path',
      assertScoringFunction: 'file://./relative/path/score.js:scoreFunc',
      vars: { input: 'test' },
    };
    expect(() => TestCaseSchema.parse(testCase)).not.toThrow();
  });
});
