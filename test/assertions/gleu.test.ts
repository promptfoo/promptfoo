import type { AssertionParams } from 'src/types';
import { calculateGleuScore, handleGleuScore } from '../../src/assertions/gleu';

describe('GLEU score calculation', () => {
  it('identical sentences should have GLEU score close to, but not equal to one due to smoothing', () => {
    const references = ['The cat sat on the mat'];
    const candidate = 'The cat sat on the mat';

    const score = calculateGleuScore(candidate, references);
    expect(score).toBeGreaterThan(0.999);
  });

  it('should handle period after words', () => {
    const references = ['The cat sat on the mat'];
    const candidate = 'The cat sat on the mat.';

    const score = calculateGleuScore(candidate, references);
    expect(score).toBeGreaterThan(0.999);
  });

  it('should handle the infamous "the the the … " example', () => {
    const references = ['The cat sat on the mat'];
    const candidate = 'the the the the the the the';

    const score = calculateGleuScore(candidate, references);
    expect(score).toBeGreaterThan(0.08);
    expect(score).toBeLessThan(0.12);
  });

  it('An example to evaluate normal machine translation outputs', () => {
    const references = [
      'It is a guide to action that ensures that the military will forever heed Party commands',
    ];
    const candidate =
      'It is a guide to action which ensures that the military always obeys the commands of the party';

    const score = calculateGleuScore(candidate, references);
    expect(score).toBeGreaterThan(0.4);
    expect(score).toBeLessThan(0.5);
  });

  it('Another example to evaluate normal machine translation outputs', () => {
    const references = [
      'It is a guide to action that ensures that the military will forever heed Party commands',
    ];
    const candidate =
      'It is to insure the troops forever hearing the activity guidebook that party direct';

    const score = calculateGleuScore(candidate, references);
    expect(score).toBeGreaterThan(0.12);
    expect(score).toBeLessThan(0.15);
  });

  it('should handle empty or single word sentences', () => {
    const references = ['cat'];
    const candidate = 'cat';

    const score = calculateGleuScore(candidate, references);
    expect(score).toBeGreaterThan(0.0);
  });

  it('should handle sentences with different lengths', () => {
    const references = ['The cat sat on the mat.'];
    const candidate = 'The cat sat.';

    const score = calculateGleuScore(candidate, references);
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

    const score = calculateGleuScore(candidate, references);
    expect(score).toBeGreaterThan(0.25);
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
    expect(score).toBeGreaterThan(0.999);
  });

  it('should handle different minN values', () => {
    const references = ['The cat sat on the mat.'];
    const candidate = 'the the the the the the.';

    const score = calculateGleuScore(candidate, references, 2);
    expect(score).toBe(0); // This will equal to 0 because there are no 2/3/4 gram lists of candidate that match with the corresponding n-gram lists of the reference.
  });

  it('should handle different maxN values', () => {
    const references = ['The cat sat on the mat.'];
    const candidate = 'the the the the the the the.';

    const score = calculateGleuScore(candidate, references, 1, 3);
    expect(score).toBeGreaterThan(0.1);
    expect(score).toBeLessThan(0.12);
  });

  it('should handle different minN & maxN values', () => {
    const references = ['The cat sat on the mat.'];
    const candidate = 'the the the the the the the.';

    const score = calculateGleuScore(candidate, references, 2, 4); //// This will equal to 0 because there are no 2/3/4 gram lists of candidate that match with the corresponding n-gram lists of the reference.
    expect(score).toBe(0);
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
