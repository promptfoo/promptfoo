import { matchesAnswerRelevance } from '../matchers';
import invariant from '../util/invariant';

import type { AssertionParams, GradingResult } from '../types/index';

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
  const result = await matchesAnswerRelevance(input, output, (assertion.threshold as number) ?? 0, test.options);
  return {
    assertion,
    ...result,
  };
};
