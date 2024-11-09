import invariant from 'tiny-invariant';
import type { Assertion, AssertionValue, GradingResult } from '../types';

export const handleStartsWith = (
  assertion: Assertion,
  renderedValue: AssertionValue | undefined,
  outputString: string,
  inverse: boolean,
): GradingResult => {
  invariant(renderedValue, '"starts-with" assertion type must have a string value');
  invariant(
    typeof renderedValue === 'string',
    '"starts-with" assertion type must have a string value',
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
