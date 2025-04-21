import {  matchesPiScore } from '../matchers';
import type { AssertionParams, GradingResult } from '../types';
import invariant from '../util/invariant';

export const handlePiScorer = ({
  assertion,
  renderedValue,
  outputString,
  context,
  test,
}: AssertionParams): Promise<GradingResult> => {
  invariant(
    typeof renderedValue === 'string' || typeof renderedValue === 'undefined',
    '"llm-rubric" assertion type must have a string value',
  );

  return matchesPiScore(context.prompt || '', outputString, assertion);
};
