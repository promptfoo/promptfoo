import { describe, expect, it } from 'vitest';
import { calculateBleuScore, handleBleuScore } from '../../src/assertions/bleu';

import type { AssertionParams } from '../../src/types/index';

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

  it('should not depend on the order of equidistant references', () => {
    const candidate = 'a b c d'; // 4 tokens
    const shorterRef = 'a b c'; // 3 tokens (distance 1 from candidate)
    const longerRef = 'a b c d e'; // 5 tokens (distance 1 from candidate)

    // When two references are equally close to the candidate length, BLEU breaks the
    // tie toward the shorter reference (Papineni et al. / NLTK `closest_ref_length`),
    // so the score must be independent of the order the references are provided in.
    const scoreShorterFirst = calculateBleuScore(candidate, [shorterRef, longerRef]);
    const scoreLongerFirst = calculateBleuScore(candidate, [longerRef, shorterRef]);

    expect(scoreLongerFirst).toBeCloseTo(scoreShorterFirst, 10);
  });

  it('should break equidistant ties toward the shorter reference (direction, not just determinism)', () => {
    // Two references equidistant from the candidate length (both distance 2): lengths 2
    // and 6. Every 1- to 4-gram of the candidate is contained in the longer reference, so
    // n-gram precision is perfect and the score reduces to the brevity penalty alone.
    // NLTK `closest_ref_length` breaks the tie toward the SHORTER reference (length 2);
    // the candidate (4 tokens) is longer than it, so the brevity penalty is 1 and the
    // score is exactly 1. Preferring the longer reference (length 6) would instead give
    // exp(1 - 6/4) ≈ 0.6065 — so this pins the tie-break DIRECTION. The order-independence
    // test above passes for either direction; only this test fails if the tie flips.
    const candidate = 'a b c d'; // 4 tokens
    const refs = ['a b', 'a b c d e f']; // lengths 2 and 6, both distance 2 from candidate

    expect(calculateBleuScore(candidate, refs)).toBe(1);
    expect(calculateBleuScore(candidate, [...refs].reverse())).toBe(1);
    // Guard: a regression preferring the longer reference would yield exp(1 - 6/4).
    expect(calculateBleuScore(candidate, refs)).not.toBeCloseTo(Math.exp(1 - 6 / 4), 5);
  });

  it('should penalize short candidates and never exceed 1.0', () => {
    // Every 1- to 4-gram of the candidate appears in the reference, so n-gram
    // precision is perfect, but the candidate is shorter than the reference. BLEU is
    // bounded by 1.0, so the brevity penalty must pull the score down (penalize),
    // never above 1.0. Per Papineni et al., BP = exp(1 - referenceLength/candidateLength)
    // for candidateLength <= referenceLength.
    const candidate = 'a b c d e'; // 5 tokens, perfect n-gram precision
    const reference = 'a b c d e f g'; // 7 tokens

    const score = calculateBleuScore(candidate, [reference]);

    expect(score).toBeLessThanOrEqual(1);
    // precision product is 1, so the score equals the brevity penalty itself.
    expect(score).toBeCloseTo(Math.exp(1 - 7 / 5), 10);
  });

  it('should not penalize a candidate at least as long as the reference (brevity penalty = 1 at c == r)', () => {
    // candidateLength === referenceLength is the boundary of the brevity-penalty
    // branch: exp(1 - referenceLength/candidateLength) = exp(0) = 1, so a perfect,
    // equal-length match must score exactly 1.0 — never penalized, never above 1.0.
    const candidate = 'a b c d e'; // 5 tokens
    const reference = 'a b c d e'; // 5 tokens, identical length and content

    const score = calculateBleuScore(candidate, [reference]);

    expect(score).toBe(1);
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

  it('should produce an order-independent score and verdict for an array of references', () => {
    // End-to-end guard through the public handler: the same equidistant references supplied
    // in different orders via renderedValue must yield the same score and pass/fail verdict.
    const outputString = 'a b c d'; // 4 tokens
    const refs = ['a b c', 'a b c d e']; // lengths 3 and 5, both distance 1 from candidate
    const base = {
      assertion: { type: 'bleu' },
      outputString,
      inverse: false,
    };
    const shorterFirst = handleBleuScore({ ...base, renderedValue: refs } as AssertionParams);
    const longerFirst = handleBleuScore({
      ...base,
      renderedValue: [...refs].reverse(),
    } as AssertionParams);

    expect(longerFirst.score).toBeCloseTo(shorterFirst.score, 10);
    expect(longerFirst.pass).toBe(shorterFirst.pass);
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

  it('should report a bounded [0, 1] score for inverse assertions on short candidates', () => {
    // Regression for the brevity-penalty bug: a short candidate with perfect n-gram
    // precision previously scored above 1.0 (~1.33), so the inverse path (1 - score)
    // reported a NEGATIVE score. With the score correctly bounded to [0, 1], the
    // inverse score stays in [0, 1] too.
    const params = {
      assertion: { type: 'bleu', value: 'a b c d e f g' },
      renderedValue: 'a b c d e f g', // 7 tokens
      outputString: 'a b c d e', // 5 tokens, shorter with perfect n-gram precision
      inverse: true,
    } as AssertionParams;

    const result = handleBleuScore(params);

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(1);
    // BLEU score is exp(1 - 7/5) ≈ 0.6703, so the inverse score is 1 - that.
    expect(result.score).toBeCloseTo(1 - Math.exp(1 - 7 / 5), 10);
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
