import { describe, expect, it } from 'vitest';
import { handleRougeScore } from '../../src/assertions/rouge';

import type { Assertion, AssertionParams } from '../../src/types/index';

// These tests use the real js-rouge library (ROUGE-N is computed in-house with
// clipped counts; ROUGE-L/S delegate to js-rouge), so they assert real scores
// end-to-end rather than that a particular option is forwarded to a mock.
const makeParams = (
  outputString: string,
  renderedValue: string,
  options: { baseType?: string; threshold?: number; inverse?: boolean } = {},
): AssertionParams => {
  const { baseType = 'rouge-n', threshold, inverse = false } = options;
  const assertion = {
    type: baseType,
    value: renderedValue,
    ...(threshold == null ? {} : { threshold }),
  } as Assertion;
  return { baseType, assertion, renderedValue, outputString, inverse } as AssertionParams;
};

describe('handleRougeScore', () => {
  it('should pass when the score is above the default threshold', () => {
    const result = handleRougeScore(makeParams('the cat sat on the mat', 'the cat sat on the mat'));

    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
    expect(result.reason).toBe('ROUGE-N score 1.00 is greater than or equal to threshold 0.75');
  });

  it('should fail when the score is below the default threshold', () => {
    const result = handleRougeScore(
      makeParams('some different output', 'This is the expected output.'),
    );

    expect(result.pass).toBe(false);
    expect(result.score).toBeCloseTo(0.2222, 4);
    expect(result.reason).toBe('ROUGE-N score 0.22 is less than threshold 0.75');
  });

  it('should use a custom threshold when provided', () => {
    const result = handleRougeScore(
      makeParams('some different output', 'This is the expected output.', { threshold: 0.2 }),
    );

    expect(result.pass).toBe(true);
    expect(result.score).toBeCloseTo(0.2222, 4);
    expect(result.reason).toBe('ROUGE-N score 0.22 is greater than or equal to threshold 0.2');
  });

  it('should invert pass/fail and score for inverse assertions', () => {
    const high = handleRougeScore(
      makeParams('the cat sat on the mat', 'the cat sat on the mat', { inverse: true }),
    );
    expect(high.pass).toBe(false);
    expect(high.score).toBe(0);

    const low = handleRougeScore(
      makeParams('some different output', 'This is the expected output.', { inverse: true }),
    );
    expect(low.pass).toBe(true);
    expect(low.score).toBeCloseTo(0.7778, 4);
  });

  it('should score case-only differences as a perfect match (consistent with bleu/gleu/meteor)', () => {
    // Before scoring case-insensitively, js-rouge defaulted to caseSensitive: true
    // and scored this 0.
    const result = handleRougeScore(makeParams('The CAT Sat', 'the cat sat'));

    expect(result.score).toBe(1);
    expect(result.pass).toBe(true);
  });

  it('should score an identical answer 1.0 even when a token repeats', () => {
    // js-rouge counts deduplicated n-grams over total-count denominators, so it
    // scores these 0.83 and 0.5; clipped counts give the correct 1.0. This also
    // guards the case-collision regression: a sentence-initial "The" recurring as
    // lowercase "the" must not drop the score once inputs are lowercased.
    expect(
      handleRougeScore(makeParams('The cat sat on the mat', 'The cat sat on the mat')).score,
    ).toBe(1);
    expect(handleRougeScore(makeParams('Hello hello', 'Hello hello')).score).toBe(1);
  });

  it('should not let an inverse assertion pass on an identical answer with a repeated token', () => {
    // Regression guard: under js-rouge's case-insensitive scoring an identical
    // "Hello hello" scored 0.5, so not-rouge-n wrongly passed — asserting that an
    // identical string is "different." Clipped counts score it 1.0, so inverse fails.
    const result = handleRougeScore(makeParams('Hello hello', 'Hello hello', { inverse: true }));

    expect(result.pass).toBe(false);
    expect(result.score).toBe(0);
  });

  it('should score genuinely different text below the threshold (no over-passing)', () => {
    const result = handleRougeScore(
      makeParams('completely unrelated sentence', 'the cat sat on the mat'),
    );

    expect(result.pass).toBe(false);
    expect(result.score).toBeLessThan(0.75);
  });

  it('should support ROUGE-L case-insensitively', () => {
    const result = handleRougeScore(
      makeParams('The Quick Brown Fox', 'the quick brown fox', { baseType: 'rouge-l' }),
    );

    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
    expect(result.reason).toBe('ROUGE-L score 1.00 is greater than or equal to threshold 0.75');
  });

  it('should support ROUGE-S case-insensitively', () => {
    const result = handleRougeScore(
      makeParams('The Quick Brown Fox', 'the quick brown fox', { baseType: 'rouge-s' }),
    );

    expect(result.pass).toBe(true);
    expect(result.score).toBe(1);
    expect(result.reason).toBe('ROUGE-S score 1.00 is greater than or equal to threshold 0.75');
  });

  it('should throw if renderedValue is not a string', () => {
    expect(() =>
      handleRougeScore({
        ...makeParams('actual text', 'expected text'),
        renderedValue: 123 as any,
      }),
    ).toThrow('"rouge" assertion type must be a string value');
  });
});
