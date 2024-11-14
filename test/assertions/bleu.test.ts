import { calculateBleuScore, handleBleuScore } from '../../src/assertions/bleu';
import type { AssertionParams } from '../../src/types';

describe('BLEU score calculation', () => {
  it('identical sentences should have BLEU score close to, but not equal to one due to smoothing', () => {
    const references = ['The cat sat on the mat.'];
    const candidate = 'The cat sat on the mat.';

    const score = calculateBleuScore(candidate, references);
    expect(score).toBeGreaterThan(0.999);
  });

  it('completely different sentences should have very low but non-zero BLEU score due to smoothing', () => {
    const references = ['The cat sat on the mat.'];
    const candidate = 'Dogs run in the park.';

    const score = calculateBleuScore(candidate, references);
    expect(score).toBeGreaterThan(0.0);
    expect(score).toBeLessThan(0.001);
  });

  it('partially matching sentences should have score between 0 and 1', () => {
    const references = ['The cat sat on the mat.'];
    const candidate = 'The dog sat on the mat.';

    const score = calculateBleuScore(candidate, references);
    expect(score).toBeGreaterThan(0.5);
    expect(score).toBeLessThan(1.0);
  });

  it('should handle custom weights', () => {
    const references = ['The cat sat on the mat.'];
    const candidate = 'The cat sat on the mat.';
    const weights = [0.25, 0.25, 0.25, 0.25];

    const score = calculateBleuScore(candidate, references, weights);
    expect(score).toBeGreaterThan(0.999);
  });

  it('should handle empty or single word sentences', () => {
    const references = ['cat'];
    const candidate = 'cat';

    const score = calculateBleuScore(candidate, references);
    expect(score).toBeGreaterThan(0.0);
  });

  it('should handle sentences with different lengths', () => {
    const references = ['The cat sat on the mat.'];
    const candidate = 'The cat sat.';

    const score = calculateBleuScore(candidate, references);
    expect(score).toBeGreaterThan(0.0);
    expect(score).toBeLessThan(1.0);
  });

  it('should handle multiple references and take best matching score', () => {
    const references = [
      'The cat sat on the mat.',
      'There is a cat on the mat.',
      'A cat is sitting on the mat.',
    ];
    const candidate = 'The cat was sitting on the mat.';

    const score = calculateBleuScore(candidate, references);
    expect(score).toBeGreaterThan(0.25);
  });

  it('should use closest reference length for brevity penalty', () => {
    const references = ['The cat sat on mat.', 'Cat mat.', 'A cat is sitting on a mat.'];
    const candidate = 'The cat sat on mat.';

    const score = calculateBleuScore(candidate, references);
    expect(score).toBeGreaterThan(0.999);
  });

  it('should throw error for empty reference array', () => {
    expect(() => {
      calculateBleuScore('test', []);
    }).toThrow('Invalid inputs');
  });

  it('should throw error for invalid weights', () => {
    const references = ['The cat sat on the mat.'];
    const invalidWeights = [0.5, 0.5, 0.5, 0.5];

    expect(() => {
      calculateBleuScore('test', references, invalidWeights);
    }).toThrow('Weights must sum to 1');
  });

  it('should throw error for wrong number of weights', () => {
    const references = ['The cat sat on the mat.'];
    const invalidWeights = [0.5, 0.5];

    expect(() => {
      calculateBleuScore('test', references, invalidWeights);
    }).toThrow('Invalid inputs');
  });

  it('should handle multiple references with varying lengths', () => {
    const references = ['The small cat sat.', 'A cat was sitting.', 'The cat is on the mat.'];
    const candidate = 'The small cat sat.';

    const score = calculateBleuScore(candidate, references);
    expect(score).toBeGreaterThan(0.999);
  });
});

describe('handleBleuScore', () => {
  it('should handle string reference with passing score', () => {
    const params = {
      assertion: { type: 'bleu', value: 'The cat sat on the mat.' },
      renderedValue: 'The cat sat on the mat.',
      outputString: 'The cat sat on the mat.',
      inverse: false,
    } as AssertionParams;
    expect(handleBleuScore(params)).toEqual({
      pass: true,
      score: expect.any(Number),
      reason: 'Assertion passed',
      assertion: expect.any(Object),
    });
  });

  it('should handle array of references', () => {
    const params = {
      assertion: {
        type: 'bleu',
        value: ['The cat sat on mat.', 'The cat is sitting on mat.'],
      },
      renderedValue: ['The cat sat on mat.', 'The cat is sitting on mat.'],
      outputString: 'The cat sat on mat.',
      inverse: false,
    } as AssertionParams;
    expect(handleBleuScore(params)).toEqual({
      pass: true,
      score: expect.any(Number),
      reason: 'Assertion passed',
      assertion: expect.any(Object),
    });
  });

  it('should handle custom threshold', () => {
    const params = {
      assertion: { type: 'bleu', value: 'The cat sat on the mat.', threshold: 0.8 },
      renderedValue: 'The cat sat on the mat.',
      outputString: 'The dog sat on the mat.',
      inverse: false,
    } as AssertionParams;
    expect(handleBleuScore(params)).toEqual({
      pass: false,
      score: expect.any(Number),
      reason: expect.stringMatching(/BLEU score \d+\.\d+ is less than threshold 0\.8/),
      assertion: expect.any(Object),
    });
  });

  it('should handle inverse assertion', () => {
    const params = {
      assertion: { type: 'bleu', value: 'The cat sat on the mat.', threshold: 0.8 },
      renderedValue: 'The cat sat on the mat.',
      outputString: 'The dog ran in the park.',
      inverse: true,
    } as AssertionParams;
    expect(handleBleuScore(params)).toEqual({
      pass: true,
      score: expect.any(Number),
      reason: 'Assertion passed',
      assertion: expect.any(Object),
    });
  });

  it('should use default threshold of 0.5', () => {
    const params = {
      assertion: { type: 'bleu', value: 'The cat sat on the mat.' },
      renderedValue: 'The cat sat on the mat.',
      outputString: 'The dog ran in the park.',
      inverse: false,
    } as AssertionParams;
    expect(handleBleuScore(params)).toEqual({
      pass: false,
      score: expect.any(Number),
      reason: expect.stringMatching(/BLEU score \d+\.\d+ is less than threshold 0\.5/),
      assertion: expect.any(Object),
    });
  });
});
