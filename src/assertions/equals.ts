import util from 'util';

import { normalizeForComparison } from './normalize';

import type { AssertionParams, GradingResult } from '../types/index';

export const handleEquals = async ({
  assertion,
  renderedValue,
  outputString,
  inverse,
}: Pick<
  AssertionParams,
  'assertion' | 'renderedValue' | 'outputString' | 'inverse'
>): Promise<GradingResult> => {
  let pass: boolean;
  if (typeof renderedValue === 'object') {
    try {
      pass = util.isDeepStrictEqual(renderedValue, JSON.parse(outputString)) !== inverse;
    } catch {
      // The output is not valid JSON, so it cannot deep-equal the object value (the "equal"
      // result is false). Respect `inverse` (false !== inverse) so `not-equals` passes here
      // instead of falsely failing.
      pass = inverse;
    }
    renderedValue = JSON.stringify(renderedValue);
  } else {
    // Opt-in Unicode normalization. Off by default so existing assertions are
    // unchanged. `true` is NFC, which folds only canonical differences such as
    // NFC/NFD accents; the compatibility forms must be named, because NFKC
    // would score "x2" as equal to "x²".
    const normalize = assertion.normalizeUnicode;
    pass =
      (normalizeForComparison(String(renderedValue), normalize) ===
        normalizeForComparison(outputString, normalize)) !==
      inverse;
  }

  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? 'Assertion passed'
      : `Expected output "${outputString}" to ${inverse ? 'not ' : ''}equal "${renderedValue}"`,
    assertion,
  };
};
