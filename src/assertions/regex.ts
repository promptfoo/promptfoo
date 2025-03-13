import type { AssertionParams, GradingResult } from '../types';
import invariant from '../util/invariant';

export const handleRegex = ({
  assertion,
  renderedValue,
  outputString,
  inverse,
}: AssertionParams): GradingResult => {
  invariant(renderedValue, '"regex" assertion type must have a string value');
  invariant(typeof renderedValue === 'string', '"regex" assertion type must have a string value');
  let regex: RegExp;
  try {
    regex = new RegExp(renderedValue);
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
      : `Expected output to ${inverse ? 'not ' : ''}match regex "${renderedValue}"`,
    assertion,
  };
};
