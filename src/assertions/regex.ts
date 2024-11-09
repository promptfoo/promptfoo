import invariant from 'tiny-invariant';
import type { Assertion, AssertionValue, GradingResult } from '../types';

export const handleRegex = (
  assertion: Assertion,
  renderedValue: AssertionValue | undefined,
  outputString: string,
  inverse: boolean,
): GradingResult => {
  invariant(renderedValue, '"regex" assertion type must have a string value');
  invariant(typeof renderedValue === 'string', '"regex" assertion type must have a string value');
  const regex = new RegExp(renderedValue);
  const pass = regex.test(outputString) !== inverse;
  return {
    pass,
    score: pass ? 1 : 0,
    reason: pass
      ? 'Assertion passed'
      : `Expected output to ${inverse ? 'not ' : ''}match regex "${renderedValue}"`,
    assertion,
  };
};
