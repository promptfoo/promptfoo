import { describe, expect, it } from 'vitest';
import { handleRougeScore } from '../../src/assertions/rouge';

import type { Assertion, AssertionParams } from '../../src/types/index';

// Uses the real js-rouge library (no mock) to verify end-to-end that ROUGE
// scoring is case-insensitive, consistent with bleu/gleu/meteor.
describe('handleRougeScore casing (real js-rouge)', () => {
  const makeParams = (outputString: string, renderedValue: string): AssertionParams => {
    const assertion: Assertion = { type: 'rouge-n', value: renderedValue };
    return {
      baseType: 'rouge-n' as any,
      assertion,
      renderedValue,
      outputString,
      inverse: false,
      assertionValueContext: {
        prompt: 'test prompt',
        vars: {},
        test: { assert: [assertion] },
        logProbs: undefined,
        provider: undefined,
        providerResponse: { raw: outputString },
      },
      output: { text: outputString },
      providerResponse: { raw: outputString },
      test: { assert: [assertion] },
    } as AssertionParams;
  };

  it('scores a case-only difference as a perfect match', () => {
    // Before the fix js-rouge defaulted to caseSensitive: true and scored this 0.
    const result = handleRougeScore(makeParams('The CAT Sat', 'the cat sat'));

    expect(result.score).toBe(1);
    expect(result.pass).toBe(true);
  });
});
