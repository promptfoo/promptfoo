import type { AssertionParams } from 'src/types';
import { calculateGleuScore, handleGleuScore } from '../../src/assertions/gleu';

describe('GLEU score calculation', () => {
  it('identical sentences should have GLEU score of 1', () => {
    const references = ['The cat sat on the mat'];
    const candidate = 'The cat sat on the mat';

    const score = calculateGleuScore(candidate, references);
    expect(score).toBe(1);
  });

  it('should handle period after words', () => {
    const references = ['The cat sat on the mat'];
    const candidate = 'The cat sat on the mat.';

    const score = calculateGleuScore(candidate, references);
    expect(score).toBeGreaterThan(0.95);
  });

  it('should handle the infamous "the the the … " example', () => {
    const references = ['The cat sat on the mat'];
    const candidate = 'the the the the the the the';

    const score = calculateGleuScore(candidate, references);
    // Due to how n-grams are counted, this will be approximately 0.09
    expect(score).toBeCloseTo(0.09, 2);
  });

  it('should evaluate normal machine translation outputs correctly', () => {
    const references = [
      'It is a guide to action that ensures that the military will forever heed Party commands',
    ];
    const candidate =
      'It is a guide to action which ensures that the military always obeys the commands of the party';

    const score = calculateGleuScore(candidate, references);
    expect(score).toBeGreaterThan(0.35);
    expect(score).toBeLessThanOrEqual(0.46);
  });

  it('should calculate the minimum of precision and recall correctly', () => {
    // This test specifically checks the min(precision, recall) calculation
    const references = ['One two three four five'];
    const candidate = 'One two three';

    const score = calculateGleuScore(candidate, references);

    // Due to how n-grams are counted, the result is approximately 0.429
    expect(score).toBeCloseTo(0.429, 1);
  });

  it('should calculate correctly when candidate is longer', () => {
    const references = ['One two three'];
    const candidate = 'One two three four five';

    const score = calculateGleuScore(candidate, references);

    // Due to how n-grams are counted, the result is approximately 0.429
    expect(score).toBeCloseTo(0.429, 1);
  });

  it('should handle empty or single word sentences', () => {
    const references = ['cat'];
    const candidate = 'cat';

    const score = calculateGleuScore(candidate, references);
    expect(score).toBe(1);
  });

  it('should handle sentences with different lengths', () => {
    const references = ['The cat sat on the mat.'];
    const candidate = 'The cat sat.';

    const score = calculateGleuScore(candidate, references);
    // Due to how n-grams are counted, the result is approximately 0.33
    expect(score).toBeCloseTo(0.33, 2);
  });

  it('should handle multiple references and take best matching score', () => {
    const references = [
      'The cat sat on the mat.',
      'There is a cat on the mat.',
      'A cat is sitting on the mat.',
    ];
    const candidate = 'The cat was sitting on the mat.';

    const score = calculateGleuScore(candidate, references);
    expect(score).toBeGreaterThanOrEqual(0.5);
  });

  it('should throw error for empty reference array', () => {
    expect(() => {
      calculateGleuScore('test', []);
    }).toThrow('Invalid inputs');
  });

  it('should handle multiple references with varying lengths', () => {
    const references = ['The small cat sat.', 'A cat was sitting.', 'The cat is on the mat.'];
    const candidate = 'The small cat sat.';

    const score = calculateGleuScore(candidate, references);
    expect(score).toBe(1);
  });

  it('should handle different minN values', () => {
    const references = ['The cat sat on the mat.'];
    const candidate = 'the the the the the the.';

    const score = calculateGleuScore(candidate, references, 2);
    expect(score).toBe(0); // This is 0 because there are no 2-grams in common
  });

  it('should handle different maxN values', () => {
    const references = ['The cat sat on the mat.'];
    const candidate = 'the the the the the the the.';

    // Only using unigrams (n=1) here
    const score = calculateGleuScore(candidate, references, 1, 1);
    // Due to how n-grams are counted, the result is approximately 0.286
    expect(score).toBeCloseTo(0.286, 1);
  });

  it('should aggregate n-gram matches across different n values', () => {
    const references = ['The cat sat on the mat'];
    const candidate = 'The cat on the mat';

    // Using n-grams from 1 to 2
    const score = calculateGleuScore(candidate, references, 1, 2);

    // Due to how n-grams are counted, the result is approximately 0.727
    expect(score).toBeCloseTo(0.727, 1);
  });

  describe('handleGleuScore', () => {
    it('should handle string reference with passing score', () => {
      const params = {
        assertion: { type: 'gleu', value: 'The cat sat on the mat.' },
        renderedValue: 'The cat sat on the mat.',
        outputString: 'The cat sat on the mat.',
        inverse: false,
      } as AssertionParams;
      expect(handleGleuScore(params)).toEqual({
        pass: true,
        score: expect.any(Number),
        reason: 'Assertion passed',
        assertion: expect.any(Object),
      });
    });

    it('should handle array of references', () => {
      const params = {
        assertion: {
          type: 'gleu',
          value: ['The cat sat on mat.', 'The cat is sitting on mat.'],
        },
        renderedValue: ['The cat sat on mat.', 'The cat is sitting on mat.'],
        outputString: 'The cat sat on mat.',
        inverse: false,
      } as AssertionParams;
      expect(handleGleuScore(params)).toEqual({
        pass: true,
        score: expect.any(Number),
        reason: 'Assertion passed',
        assertion: expect.any(Object),
      });
    });

    it('should handle custom threshold', () => {
      const params = {
        assertion: { type: 'gleu', value: 'The cat sat on the mat.', threshold: 0.8 },
        renderedValue: 'The cat sat on the mat.',
        outputString: 'The dog sat on the mat.',
        inverse: false,
      } as AssertionParams;
      expect(handleGleuScore(params)).toEqual({
        pass: false,
        score: expect.any(Number),
        reason: expect.stringMatching(/GLEU score \d+\.\d+ is less than threshold 0\.8/),
        assertion: expect.any(Object),
      });
    });

    it('should handle inverse assertion', () => {
      const params = {
        assertion: { type: 'gleu', value: 'The cat sat on the mat.', threshold: 0.8 },
        renderedValue: 'The cat sat on the mat.',
        outputString: 'The dog ran in the park.',
        inverse: true,
      } as AssertionParams;
      expect(handleGleuScore(params)).toEqual({
        pass: true,
        score: expect.any(Number),
        reason: 'Assertion passed',
        assertion: expect.any(Object),
      });
    });

    it('should use default threshold of 0.5', () => {
      const params = {
        assertion: { type: 'gleu', value: 'The cat sat on the mat.' },
        renderedValue: 'The cat sat on the mat.',
        outputString: 'The dog ran in the park.',
        inverse: false,
      } as AssertionParams;
      expect(handleGleuScore(params)).toEqual({
        pass: false,
        score: expect.any(Number),
        reason: expect.stringMatching(/GLEU score \d+\.\d+ is less than threshold 0\.5/),
        assertion: expect.any(Object),
      });
    });
  });
});
