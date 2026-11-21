import invariant from '../util/invariant';

import type { AssertionParams, GradingResult } from '../types/index';

export const handleRegex = ({
  assertion,
  renderedValue,
  outputString,
  inverse,
}: AssertionParams): GradingResult => {
  invariant(
    (typeof renderedValue === 'string' && renderedValue.length > 0) ||
      Number.isFinite(renderedValue),
    '"regex" assertion type must have a non-empty string or finite number value',
  );
  const pattern = String(renderedValue);
  let regex: RegExp;
  try {
    regex = new RegExp(pattern);
  } catch (error) {
    return {
      pass: false,
      score: 0,
      reason: `Invalid regex pattern: ${error instanceof Error ? error.message : 'unknown error'}`,
      assertion,
    };
  }
  const pass = regex.test(outputString) !== inverse;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? 'Assertion passed'
      : `Expected output to ${inverse ? 'not ' : ''}match regex "${pattern}"`,
    assertion,
  };
};
