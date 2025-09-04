// These assertions are ported from DeepEval.
// https://docs.confident-ai.com/docs/metrics-conversation-relevancy. See APACHE_LICENSE for license.
import type { AssertionParams, GradingResult } from '../../types';
import invariant from '../../util/invariant';
import { matchesConversationRelevance } from '../matchers/deepeval';
import type { Message } from '../matchers/deepeval';
import { ConversationRelevancyTemplate } from '../matchers/conversationRelevancyTemplate';
import { getAndCheckProvider } from '../../matchers';
import { getDefaultProviders } from '../../providers/defaults';
import { extractJsonObjects } from '../../util/json';
import { createEmptyTokenUsage, accumulateTokenUsage } from '../../util/tokenUsageUtils';

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
  const irrelevancies: string[] = [];
  const tokensUsed = createEmptyTokenUsage();

  // Process each possible window using DeepEval's approach
  // DeepEval creates a window for each message position, with varying sizes
  for (let i = 0; i < messages.length; i++) {
    const windowMessages = messages.slice(Math.max(0, i - windowSize + 1), i + 1);
    const result = await matchesConversationRelevance(
      windowMessages,
      1.0, // Use 1.0 threshold for individual windows
      test.vars,
      test.options,
    );

    if (result.pass) {
      relevantCount++;
    } else if (
      result.reason &&
      result.reason !== 'Response is not relevant to the conversation context'
    ) {
      irrelevancies.push(result.reason);
    }

    // Accumulate token usage
    if (result.tokensUsed) {
      accumulateTokenUsage(tokensUsed, result.tokensUsed);
    }

    totalWindows++;
  }

  const score = totalWindows > 0 ? relevantCount / totalWindows : 0;
  const pass = score >= threshold - Number.EPSILON;

  // Generate a comprehensive reason if there are irrelevancies
  let reason: string;
  if (irrelevancies.length > 0 && score < 1.0) {
    // Use the template to generate a reason
    const textProvider = await getAndCheckProvider(
      'text',
      test.options?.provider,
      (await getDefaultProviders()).gradingProvider,
      'conversation relevancy reason generation',
    );

    const reasonPrompt = ConversationRelevancyTemplate.generateReason(score, irrelevancies);
    const resp = await textProvider.callApi(reasonPrompt);

    if (resp.output && typeof resp.output === 'string') {
      try {
        const jsonObjects = extractJsonObjects(resp.output);
        if (jsonObjects.length > 0) {
          const result = jsonObjects[0] as { reason: string };
          reason =
            result.reason ||
            `${relevantCount} out of ${totalWindows} conversation windows were relevant`;
        } else {
          reason = `${relevantCount} out of ${totalWindows} conversation windows were relevant`;
        }
      } catch {
        reason = `${relevantCount} out of ${totalWindows} conversation windows were relevant`;
      }

      // Add token usage from reason generation
      if (resp.tokenUsage) {
        accumulateTokenUsage(tokensUsed, resp.tokenUsage);
      }
    } else {
      reason = `${relevantCount} out of ${totalWindows} conversation windows were relevant`;
    }
  } else {
    reason = `${relevantCount} out of ${totalWindows} conversation windows were relevant`;
  }

  return {
    assertion,
    pass,
    score,
    reason,
    tokensUsed: tokensUsed.total > 0 ? tokensUsed : undefined,
  };
};
