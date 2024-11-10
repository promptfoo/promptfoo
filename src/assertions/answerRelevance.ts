import invariant from 'tiny-invariant';
import { matchesAnswerRelevance } from '../matchers';
import type { Assertion, GradingResult } from '../types';

export const handleAnswerRelevance = async (
  assertion: Assertion,
  output: string | object,
  prompt: string | undefined,
  options: any,
): Promise<GradingResult> => {
  invariant(
    typeof output === 'string',
    'answer-relevance assertion type must evaluate a string output',
  );
  invariant(prompt, 'answer-relevance assertion type must have a prompt');

  const input = typeof options?.vars?.query === 'string' ? options.vars.query : prompt;
  return {
    assertion,
    ...(await matchesAnswerRelevance(input, output, assertion.threshold || 0, options)),
  };
};
