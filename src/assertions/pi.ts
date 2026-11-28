import { matchesPiScore } from '../matchers/llmGrading';
import invariant from '../util/invariant';
import { finalizeGradedAssertion } from './ragDefaults';

import type { AssertionParams, GradingResult } from '../types/index';

export const handlePiScorer = async ({
  assertion,
  inverse,
  prompt,
  renderedValue,
  outputString,
}: AssertionParams): Promise<GradingResult> => {
  invariant(typeof renderedValue === 'string', '"pi" assertion type must have a string value');
  invariant(typeof prompt === 'string', '"pi" assertion must have a prompt that is a string');
  const result = await matchesPiScore(renderedValue, prompt, outputString, assertion);
  return finalizeGradedAssertion(result, assertion, inverse);
};
