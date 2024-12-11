import { matchesAnswerRelevance } from '../matchers';
import type { AssertionParams, GradingResult } from '../types';
import invariant from '../util/invariant';

export const handleAnswerRelevance = async ({
  assertion,
  output,
  prompt,
  test,
}: AssertionParams): Promise<GradingResult> => {
  invariant(
    typeof output === 'string',
    'answer-relevance assertion type must evaluate a string output',
  );
  invariant(prompt, 'answer-relevance assertion type must have a prompt');
  const input = typeof test?.vars?.query === 'string' ? test.vars.query : prompt;
  return {
    assertion,
    ...(await matchesAnswerRelevance(input, output, assertion.threshold || 0, test.options)),
  };
};
