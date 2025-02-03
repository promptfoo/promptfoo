// These assertions are ported from DeepEval.
// https://docs.confident-ai.com/docs/metrics-conversation-relevancy. See APACHE_LICENSE for license.
import type { AssertionParams, GradingResult } from '../../types';
import invariant from '../../util/invariant';
import { matchesConversationRelevance } from '../matchers';

export const handleConversationRelevance = async ({
  assertion,
  renderedValue,
  prompt,
  test,
}: AssertionParams): Promise<GradingResult> => {
  invariant(
    typeof renderedValue === 'string',
    'conversational-relevance assertion type must have a string value',
  );
  invariant(prompt, 'conversational-relevance assertion type must have a prompt');

  return {
    assertion,
    ...(await matchesConversationRelevance(
      [{ input: prompt, actualOutput: renderedValue }],
      assertion.threshold || 0,
      test.vars,
      test.options,
    )),
  };
};
