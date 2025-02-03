// These assertions are ported from DeepEval.
// https://docs.confident-ai.com/docs/metrics-conversation-relevancy. See APACHE_LICENSE for license.
import type { AssertionParams, GradingResult } from '../../types';
import invariant from '../../util/invariant';
import { matchesConversationRelevance } from '../matchers';
import type { Message } from '../matchers';

export const handleConversationRelevance = async ({
  assertion,
  outputString,
  prompt,
  test,
}: AssertionParams): Promise<GradingResult> => {
  let messages: Message[] = [];
  if (test.vars?._conversation) {
    messages = test.vars?._conversation as Message[];
  } else {
    invariant(
      typeof outputString === 'string',
      'conversational-relevance assertion type must have a string value',
    );
    invariant(prompt, 'conversational-relevance assertion type must have a prompt');
    messages = [
      {
        input: prompt,
        output: outputString,
      },
    ];
  }

  return {
    assertion,
    ...(await matchesConversationRelevance(
      messages,
      assertion.threshold || 0,
      test.vars,
      test.options,
    )),
  };
};
