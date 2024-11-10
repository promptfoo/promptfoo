import invariant from 'tiny-invariant';
import { matchesAnswerRelevance } from '../matchers';
import type { AssertionParams, GradingConfig, GradingResult } from '../types';

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
  // TODO: Vars does not exist on any of the types. Fix the type
  const options = test.options as GradingConfig & { vars: Record<string, unknown> };
  const input = typeof options?.vars?.query === 'string' ? options.vars.query : prompt;
  return {
    assertion,
    ...(await matchesAnswerRelevance(input, output, assertion.threshold || 0, options)),
  };
};
