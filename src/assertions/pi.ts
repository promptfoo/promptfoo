import { matchesPiScore } from '../matchers/llmGrading';
import { invertScore } from '../matchers/shared';
import invariant from '../util/invariant';

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
  if (!Number.isFinite(result.score)) {
    return {
      ...result,
      pass: false,
      score: 0,
      reason: 'Pi scorer returned an invalid score',
      metadata: { ...result.metadata, graderError: true },
    };
  }
  return inverse ? { ...result, pass: !result.pass, score: invertScore(result.score) } : result;
};
