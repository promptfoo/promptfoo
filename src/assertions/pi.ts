import { matchesPiScore } from '../matchers.js';
import invariant from '../util/invariant.js';

import type { AssertionParams, GradingResult } from '../types/index.js';

export const handlePiScorer = async ({
  assertion,
  prompt,
  renderedValue,
  outputString,
}: AssertionParams): Promise<GradingResult> => {
  invariant(typeof renderedValue === 'string', '"pi" assertion type must have a string value');
  invariant(typeof prompt === 'string', '"pi" assertion must have a prompt that is a string');
  return matchesPiScore(renderedValue, prompt, outputString, assertion);
};
