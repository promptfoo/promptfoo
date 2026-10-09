import { describe, expect, it } from 'vitest';
import { handleRougeScore } from '../../src/assertions/rouge';

import type { Assertion, AssertionParams } from '../../src/types/index';

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
    // Case folding must retain repeated-token counts.
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

  // js-rouge before 3.2.1 undercounted repeated L/S matches.
  describe.each([
    ['rouge-n', 'ROUGE-N'],
    ['rouge-l', 'ROUGE-L'],
    ['rouge-s', 'ROUGE-S'],
  ])('%s', (baseType, label) => {
    it('scores identical text 1.0 even when a token repeats', () => {
      const text = 'the cat sat on the mat';
      const result = handleRougeScore(makeParams(text, text, { baseType }));

      expect(result.score).toBe(1);
      expect(result.pass).toBe(true);
      expect(result.reason).toBe(`${label} score 1.00 is greater than or equal to threshold 0.75`);
    });

    it('scores disjoint text 0', () => {
      const result = handleRougeScore(
        makeParams('alpha beta gamma', 'delta epsilon zeta', { baseType }),
      );

      expect(result.score).toBe(0);
      expect(result.pass).toBe(false);
    });

    it.each([false, true])('uses threshold zero for blank text with inverse=%s', (inverse) => {
      const result = handleRougeScore(
        makeParams('', 'reference', { baseType, threshold: 0, inverse }),
      );
      expect(result).toMatchObject({ pass: !inverse, score: inverse ? 1 : 0 });
      expect(result.reason).toBe(`${label} score 0.00 is greater than or equal to threshold 0`);
    });

    it('keeps a partial match between 0 and 1', () => {
      const result = handleRougeScore(
        makeParams('the dog sat on the mat', 'the cat sat on the mat', { baseType }),
      );

      expect(result.score).toBeGreaterThan(0);
      expect(result.score).toBeLessThan(1);
    });

    it.each(['', ' ', '\n', '\u0085', ' \u0085\n'])(
      'scores blank output %j 0 instead of throwing',
      (blank) => {
        const result = handleRougeScore(makeParams(blank, 'the cat sat', { baseType }));

        expect(result.score).toBe(0);
        expect(result.pass).toBe(false);
      },
    );

    it.each(['', ' ', '\n', '\u0085', ' \u0085\n'])(
      'scores a blank reference %j 0 instead of throwing',
      (blank) => {
        const result = handleRougeScore(makeParams('the cat sat', blank, { baseType }));

        expect(result.score).toBe(0);
        expect(result.pass).toBe(false);
      },
    );

    it.each([
      ['', ''],
      [' ', '\n'],
      ['\u0085', ' \u0085\n'],
    ])('scores a blank output %j against a blank reference %j 0', (output, reference) => {
      const result = handleRougeScore(makeParams(output, reference, { baseType }));

      expect(result.score).toBe(0);
      expect(result.pass).toBe(false);
    });
  });

  it('preserves ROUGE-N whole-text punctuation tokens', () => {
    const result = handleRougeScore(makeParams('hello world. next', 'hello world next'));
    expect(result.score).toBeCloseTo(2 / 3, 12);
  });

  describe('js-rouge scoring', () => {
    it.each([
      ['rouge-l', 'the the cat'],
      ['rouge-s', 'the the cat'],
      ['rouge-l', 'a b a b a'],
      ['rouge-s', 'a b a b a'],
    ])('%s scores identical text %j 1.0', (baseType, text) => {
      const result = handleRougeScore(makeParams(text, text, { baseType }));

      expect(result.score).toBe(1);
      expect(result.pass).toBe(true);
    });

    it.each([
      // Tokens [hello, world, ., next] vs [hello, world, next]: the period after
      // "world" is its own token, so "world" still matches.
      // L: 3 matches, P 3/4, R 3/3 -> 6/7. S: 3 of 6 vs 3 of 3 skip-bigrams -> 2/3.
      ['rouge-l', 6 / 7, true, 'ROUGE-L score 0.86 is greater than or equal to threshold 0.75'],
      ['rouge-s', 2 / 3, false, 'ROUGE-S score 0.67 is less than threshold 0.75'],
    ])(
      '%s splits a mid-output period from the word before it',
      (baseType, expected, pass, reason) => {
        const result = handleRougeScore(
          makeParams('hello world. next', 'hello world next', { baseType }),
        );

        expect(result.score).toBeCloseTo(expected, 12);
        expect(result.pass).toBe(pass);
        expect(result.reason).toBe(reason);
      },
    );

    it('rouge-l is summary-level (ROUGE-Lsum): reordering whole sentences scores 1.0', () => {
      // Each reference sentence is matched against every output sentence, so the
      // order of the sentences does not matter.
      const result = handleRougeScore(
        makeParams('the cat sat. a dog ran.', 'a dog ran. the cat sat.', { baseType: 'rouge-l' }),
      );

      expect(result.score).toBe(1);
      expect(result.pass).toBe(true);
    });

    it('rouge-s scores the same sentence reorder below 1.0', () => {
      // Tokens [the, cat, sat, ., a, dog, ran, .] vs [a, dog, ran, ., the, cat, sat, .],
      // 28 skip-bigrams each. Matching pairs: 3 within each sentence, plus 7 that
      // involve a period (each word before a period once, and the period pair) -> 13.
      const result = handleRougeScore(
        makeParams('the cat sat. a dog ran.', 'a dog ran. the cat sat.', { baseType: 'rouge-s' }),
      );

      expect(result.score).toBeCloseTo(13 / 28, 12);
      expect(result.pass).toBe(false);
    });

    it.each([false, true])(
      'rouge-l matches reordered quoted sentences with inverse=%s',
      (inverse) => {
        const result = handleRougeScore(
          makeParams('"The cat sat." "A dog ran."', '"A dog ran." "The cat sat."', {
            baseType: 'rouge-l',
            inverse,
          }),
        );

        expect(result.score).toBe(inverse ? 0 : 1);
        expect(result.pass).toBe(!inverse);
      },
    );

    describe.each([
      ['rouge-l', 5 / 7],
      ['rouge-s', 2 / 3],
    ])('%s line wrapping', (baseType, expected) => {
      it.each(['\n', '\r\n'])('scores a %j wrap like a space', (separator) => {
        const reference = 'Sat on the mat the cat.';
        const flat = handleRougeScore(
          makeParams('The cat sat on the mat.', reference, { baseType }),
        );
        const wrapped = handleRougeScore(
          makeParams(`The cat${separator}sat on the mat.`, reference, { baseType }),
        );

        expect(flat.score).toBeCloseTo(expected, 12);
        expect(wrapped.score).toBeCloseTo(expected, 12);
        expect(flat.pass).toBe(false);
        expect(wrapped.pass).toBe(false);
      });
    });

    it.each([
      ['rouge-l', 1],
      ['rouge-s', 0],
    ])('%s scores a single identical token %d', (baseType, expected) => {
      // A skip-bigram needs two tokens, so ROUGE-S has nothing to match.
      const result = handleRougeScore(makeParams('hello', 'hello', { baseType }));

      expect(result.score).toBe(expected);
    });
  });

  it.each(['rouge-n', 'rouge-l', 'rouge-s'])('%s rejects non-string references', (baseType) => {
    expect(() =>
      handleRougeScore({
        ...makeParams('actual text', 'expected text', { baseType }),
        renderedValue: 123 as any,
      }),
    ).toThrow('"rouge" assertion type must be a string value');
  });
});
