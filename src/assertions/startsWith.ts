import invariant from '../util/invariant';

import type { AssertionParams, GradingResult } from '../types/index';

export const handleStartsWith = ({
  assertion,
  renderedValue,
  outputString,
  inverse,
}: AssertionParams): GradingResult => {
  invariant(
    (typeof renderedValue === 'string' && renderedValue.length > 0) ||
      Number.isFinite(renderedValue),
    '"starts-with" assertion type must have a non-empty string or finite number value',
  );
  const pass = outputString.startsWith(String(renderedValue)) !== inverse;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? 'Assertion passed'
      : `Expected output to ${inverse ? 'not ' : ''}start with "${renderedValue}"`,
    assertion,
  };
};
