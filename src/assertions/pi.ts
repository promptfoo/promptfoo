import {  matchesPiScore } from '../matchers';
import type { AssertionParams, GradingResult } from '../types';
import invariant from '../util/invariant';

export const handlePiScorer = ({
  assertion,
  prompt,
  renderedValue,
  outputString,
  context,
  test,
}: AssertionParams): Promise<GradingResult> => {
  invariant(
    typeof renderedValue === 'string',
    '"pi" assertion type must have a string value',
  );
  invariant(typeof prompt === 'string', '"pi" assertion must have a prompt that is a string');
  return matchesPiScore(renderedValue, prompt, outputString, assertion);
};
