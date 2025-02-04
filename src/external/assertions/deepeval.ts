// These assertions are ported from DeepEval.
// https://docs.confident-ai.com/docs/metrics-conversation-relevancy. See APACHE_LICENSE for license.
import type { AssertionParams, GradingResult } from '../../types';
import invariant from '../../util/invariant';
import { matchesConversationRelevance } from '../matchers';
import type { Message } from '../matchers';

const DEFAULT_WINDOW_SIZE = 5;

export const handleConversationRelevance = async ({
  assertion,
  outputString,
  prompt,
  test,
}: AssertionParams): Promise<GradingResult> => {
  let messages: Message[] = [];
  if (test.vars?._conversation && (test.vars._conversation as Message[]).length > 0) {
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
  const windowSize = assertion.config?.windowSize || DEFAULT_WINDOW_SIZE;
  const threshold = assertion.threshold || 0;
  let relevantCount = 0;
  let totalWindows = 0;
  let failureReason: string | undefined;

  // Process each possible window
  for (let i = 0; i <= messages.length - windowSize; i++) {
    const windowMessages = messages.slice(i, i + windowSize);
    const result = await matchesConversationRelevance(
      windowMessages,
      threshold,
      test.vars,
      test.options,
    );

    if (result.pass) {
      relevantCount++;
    } else if (result.reason) {
      failureReason = result.reason;
    }
    totalWindows++;
  }

  // If we don't have enough messages for a window, evaluate the entire conversation
  if (totalWindows === 0) {
    const result = await matchesConversationRelevance(messages, threshold, test.vars, test.options);
    // Update totalWindows to the number of messages such that the
    // final score is always less than or equal to 1.0

    totalWindows = messages.length;
    relevantCount = result.pass ? messages.length : 0;
    if (!result.pass && result.reason) {
      failureReason = result.reason;
    }
  }

  const score = relevantCount / totalWindows;
  const pass = score >= threshold - Number.EPSILON;

  return {
    assertion,
    pass,
    score,
    reason:
      failureReason || `${relevantCount} out of ${totalWindows} conversation windows were relevant`,
  };
};
