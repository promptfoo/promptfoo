import invariant from '../util/invariant';

import type { AssertionParams, GradingResult } from '../types/index';

function isStartsWithValue(value: unknown): value is string | number {
  return (
    (typeof value === 'string' && value !== '') ||
    (typeof value === 'number' && !Number.isNaN(value))
  );
}

export const handleStartsWith = ({
  assertion,
  renderedValue,
  outputString,
  inverse,
}: AssertionParams): GradingResult => {
  invariant(
    isStartsWithValue(renderedValue),
    '"starts-with" assertion type must have a string or number value',
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
