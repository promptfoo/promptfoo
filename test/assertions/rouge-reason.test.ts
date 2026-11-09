import { describe, expect, it } from 'vitest';
import { handleRougeScore } from '../../src/assertions/rouge';

import type { Assertion, AssertionParams } from '../../src/types/index';

function makeParams(
  outputString: string,
  renderedValue: string,
  options: { baseType?: string; threshold?: number; inverse?: boolean } = {},
): AssertionParams {
  const { baseType = 'rouge-n', threshold, inverse = false } = options;
  const assertion = {
    type: baseType,
    value: renderedValue,
    ...(threshold == null ? {} : { threshold }),
  } as Assertion;
  return { baseType, assertion, renderedValue, outputString, inverse } as AssertionParams;
}

describe('handleRougeScore reason consistency with bleu/gleu/meteor', () => {
  it('reports "Assertion passed" when the rouge assertion passes', () => {
    const result = handleRougeScore(makeParams('the cat sat on the mat', 'the cat sat on the mat'));

    expect(result.pass).toBe(true);
    expect(result.reason).toBe('Assertion passed');
  });

  it('reports "Assertion passed" when an inverted rouge assertion passes', () => {
    const result = handleRougeScore(
      makeParams('some different output', 'This is the expected output.', { inverse: true }),
    );

    expect(result.pass).toBe(true);
    expect(result.reason).toBe('Assertion passed');
  });

  it('reports "Assertion passed" for a passing rouge-l and rouge-s assertion', () => {
    for (const baseType of ['rouge-l', 'rouge-s']) {
      const result = handleRougeScore(
        makeParams('the cat sat on the mat', 'the cat sat on the mat', { baseType }),
      );

      expect(result.pass).toBe(true);
      expect(result.reason).toBe('Assertion passed');
    }
  });

  it('still explains the threshold comparison when the assertion fails', () => {
    const result = handleRougeScore(
      makeParams('some different output', 'This is the expected output.'),
    );

    expect(result.pass).toBe(false);
    expect(result.reason).toBe('ROUGE-N score 0.22 is less than threshold 0.75');
  });

  it('still explains the threshold comparison when an inverted assertion fails', () => {
    const result = handleRougeScore(
      makeParams('the cat sat on the mat', 'the cat sat on the mat', { inverse: true }),
    );

    expect(result.pass).toBe(false);
    expect(result.reason).toBe('ROUGE-N score 1.00 is greater than or equal to threshold 0.75');
  });
});
