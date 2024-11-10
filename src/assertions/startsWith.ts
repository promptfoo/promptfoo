import invariant from 'tiny-invariant';
import type { AssertionParams, GradingResult } from '../types';
import { coerceString } from './utils';

export const handleStartsWith = ({
  assertion,
  renderedValue,
  output,
  inverse,
}: AssertionParams): GradingResult => {
  invariant(renderedValue, '"starts-with" assertion type must have a string value');
  invariant(
    typeof renderedValue === 'string',
    '"starts-with" assertion type must have a string value',
  );
  const outputString = coerceString(output);
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
