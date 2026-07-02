import { matchesAnswerRelevance } from '../matchers/rag';
import invariant from '../util/invariant';

import type { AssertionParams, GradingResult } from '../types/index';

export const handleAnswerRelevance = async ({
  assertion,
  output,
  prompt,
  test,
  providerCallContext,
}: AssertionParams): Promise<GradingResult> => {
  invariant(
    typeof output === 'string',
    'answer-relevance assertion type must evaluate a string output',
  );
  invariant(prompt, 'answer-relevance assertion type must have a prompt');
  const input = typeof test?.vars?.query === 'string' ? test.vars.query : prompt;

  return {
    assertion,
    ...(await matchesAnswerRelevance(
      input,
      output,
      // Default to 0.7 (the value shown in the docs' primary example) rather than 0.
      // A 0 default made answer-relevance a no-op that always passed, since the
      // relevance score is >= 0 for any answer.
      assertion.threshold ?? 0.7,
      test.options,
      providerCallContext,
    )),
  };
};
