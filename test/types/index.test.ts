import { isGradingResult } from '../../src/types';

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
