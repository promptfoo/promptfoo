import { calculateBertScore, handleBertScore } from '../../src/assertions/bertscore';

import type { AssertionParams } from '../../src/types';

// Mock the Python utilities since we're testing the fallback
jest.mock('../../src/python/pythonUtils', () => ({
  runPython: jest.fn().mockRejectedValue(new Error('Python not available')),
}));

describe('BERTScore calculation', () => {
  it('identical sentences should have high similarity score', async () => {
    const reference = 'The cat sat on the mat.';
    const candidate = 'The cat sat on the mat.';

    const score = await calculateBertScore(candidate, reference);
    expect(score).toBe(1.0);
  });

  it('completely different sentences should have low similarity score', async () => {
    const reference = 'The cat sat on the mat.';
    const candidate = 'Dogs run quickly through the forest.';

    const score = await calculateBertScore(candidate, reference);
    expect(score).toBeGreaterThanOrEqual(0.0);
    expect(score).toBeLessThan(0.3);
  });

  it('partially matching sentences should have intermediate score', async () => {
    const reference = 'The cat sat on the mat.';
    const candidate = 'The dog sat on the mat.';

    const score = await calculateBertScore(candidate, reference);
    expect(score).toBeGreaterThan(0.3);
    expect(score).toBeLessThan(1.0);
  });

  it('should handle empty strings', async () => {
    const reference = '';
    const candidate = '';

    const score = await calculateBertScore(candidate, reference);
    expect(score).toBe(1.0);
  });

  it('should handle one empty string', async () => {
    const reference = 'The cat sat on the mat.';
    const candidate = '';

    const score = await calculateBertScore(candidate, reference);
    expect(score).toBe(0.0);
  });

  it('should handle case differences', async () => {
    const reference = 'The Cat Sat On The Mat.';
    const candidate = 'the cat sat on the mat.';

    const score = await calculateBertScore(candidate, reference);
    expect(score).toBe(1.0);
  });
});

describe('handleBertScore', () => {
  const mockAssertion = {
    type: 'bertscore' as const,
    value: 'expected output',
  };

  const createAssertionParams = (
    renderedValue: string | string[],
    outputString: string,
    inverse = false,
    threshold?: number,
  ): Pick<AssertionParams, 'assertion' | 'renderedValue' | 'outputString' | 'inverse'> => ({
    assertion: threshold ? { ...mockAssertion, threshold } : mockAssertion,
    renderedValue,
    outputString,
    inverse,
  });

  it('should pass when BERTScore meets threshold', async () => {
    const params = createAssertionParams('The cat sat on the mat.', 'The cat sat on the mat.');
    
    const result = await handleBertScore(params);
    
    expect(result.pass).toBe(true);
    expect(result.score).toBe(1.0);
    expect(result.reason).toBe('Assertion passed');
  });

  it('should fail when BERTScore does not meet threshold', async () => {
    const params = createAssertionParams('The cat sat on the mat.', 'Dogs run in the forest.', false, 0.8);
    
    const result = await handleBertScore(params);
    
    expect(result.pass).toBe(false);
    expect(result.score).toBeLessThan(0.3);
    expect(result.reason).toContain('BERTScore');
    expect(result.reason).toContain('less than threshold');
  });

  it('should work with inverse assertion', async () => {
    const params = createAssertionParams('The cat sat on the mat.', 'Dogs run in the forest.', true, 0.8);
    
    const result = await handleBertScore(params);
    
    expect(result.pass).toBe(true);
    expect(result.score).toBeGreaterThan(0.7); // 1 - low_score
  });

  it('should handle array of reference values', async () => {
    const params = createAssertionParams(
      ['The cat sat on the mat.', 'A feline rested on a rug.'],
      'The cat sat on the mat.',
    );
    
    const result = await handleBertScore(params);
    
    expect(result.pass).toBe(true);
    expect(result.score).toBe(1.0);
  });

  it('should use the best match from multiple references', async () => {
    const params = createAssertionParams(
      ['Dogs run in the forest.', 'The cat sat on the mat.'],
      'The cat sat on the mat.',
    );
    
    const result = await handleBertScore(params);
    
    expect(result.pass).toBe(true);
    expect(result.score).toBe(1.0);
  });

  it('should use default threshold of 0.7', async () => {
    const params = createAssertionParams('The cat sat on the mat.', 'The dog sat on the mat.');
    
    const result = await handleBertScore(params);
    
    // Jaccard similarity: intersection/union = 4/6 = 0.667
    // {"the", "sat", "on", "mat"} / {"the", "cat", "sat", "on", "mat", "dog"}
    expect(result.score).toBeCloseTo(4/6, 2);
    expect(result.pass).toBe(false); // Should fail since 4/6 < 0.7
  });

  it('should throw error for invalid renderedValue type', async () => {
    const params = createAssertionParams(123 as any, 'test output');
    
    await expect(handleBertScore(params)).rejects.toThrow(
      '"bertscore" assertion type must have a string or array of strings value',
    );
  });

  it('should throw error for array with non-string values', async () => {
    const params = createAssertionParams(['valid string', 123] as any, 'test output');
    
    await expect(handleBertScore(params)).rejects.toThrow(
      '"bertscore" assertion type must have a string or array of strings value',
    );
  });
});