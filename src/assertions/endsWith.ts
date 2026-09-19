import invariant from '../util/invariant';

import type { AssertionParams, GradingResult } from '../types/index';

export const handleEndsWith = ({
  assertion,
  renderedValue,
  outputString,
  inverse,
}: AssertionParams): GradingResult => {
  invariant(renderedValue, '"ends-with" assertion type must have a string value');
  invariant(
    typeof renderedValue === 'string',
    '"ends-with" assertion type must have a string value',
  );
  const pass = outputString.endsWith(String(renderedValue)) !== inverse;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? 'Assertion passed'
      : `Expected output to ${inverse ? 'not ' : ''}end with "${renderedValue}"`,
    assertion,
  };
};
