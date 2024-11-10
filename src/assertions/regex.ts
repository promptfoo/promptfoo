import invariant from 'tiny-invariant';
import type { Assertion, AssertionValue, GradingResult } from '../types';
import { coerceString } from './utils';

export const handleRegex = (
  assertion: Assertion,
  renderedValue: AssertionValue | undefined,
  output: string | object,
  inverse: boolean,
): GradingResult => {
  invariant(renderedValue, '"regex" assertion type must have a string value');
  invariant(typeof renderedValue === 'string', '"regex" assertion type must have a string value');
  const regex = new RegExp(renderedValue);
  const outputString = coerceString(output);
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
