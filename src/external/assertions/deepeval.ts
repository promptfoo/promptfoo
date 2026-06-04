// These assertions are ported from DeepEval.
// https://docs.confident-ai.com/docs/metrics-conversation-relevancy. See APACHE_LICENSE for license.

import { callProviderWithContext, getAndCheckProvider } from '../../matchers/providers';
import { getDefaultProviders } from '../../providers/defaults';
import invariant from '../../util/invariant';
import { extractJsonObjects } from '../../util/json';
import { accumulateTokenUsage, createEmptyTokenUsage } from '../../util/tokenUsageUtils';
import { ConversationRelevancyTemplate } from '../matchers/conversationRelevancyTemplate';
import { matchesConversationRelevance } from '../matchers/deepeval';

import type { AssertionParams, GradingResult } from '../../types/index';
import type { Message } from '../matchers/deepeval';

const DEFAULT_WINDOW_SIZE = 5;

function getNonEmptyTokenUsage(tokensUsed: ReturnType<typeof createEmptyTokenUsage>) {
  return tokensUsed.total > 0 ? tokensUsed : undefined;
}

function getConversationMessages({
  outputString,
  prompt,
  test,
}: Pick<AssertionParams, 'outputString' | 'prompt' | 'test'>): Message[] {
  if (test.vars?._conversation && (test.vars._conversation as Message[]).length > 0) {
    return test.vars._conversation as Message[];
  }

  invariant(
    typeof outputString === 'string',
    'conversational-relevance assertion type must have a string value',
  );
  invariant(prompt, 'conversational-relevance assertion type must have a prompt');
  return [
    {
      input: prompt,
      output: outputString,
    },
  ];
}

export const handleConversationRelevance = async ({
  assertion,
  outputString,
  prompt,
  providerCallContext,
  test,
}: AssertionParams): Promise<GradingResult> => {
  const messages = getConversationMessages({ outputString, prompt, test });
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
      providerCallContext,
    );

    if (result.tokensUsed) {
      accumulateTokenUsage(tokensUsed, result.tokensUsed);
    }

    if (result.metadata?.graderError === true) {
      return {
        ...result,
        tokensUsed: getNonEmptyTokenUsage(tokensUsed),
        assertion,
      };
    }

    if (result.pass) {
      relevantCount++;
    } else if (
      result.reason &&
      result.reason !== 'Response is not relevant to the conversation context'
    ) {
      irrelevancies.push(result.reason);
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
    const resp = await callProviderWithContext(
      textProvider,
      reasonPrompt,
      'conversation-relevance-reason',
      { score: String(score), irrelevancies },
      providerCallContext,
    );

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
    tokensUsed: getNonEmptyTokenUsage(tokensUsed),
  };
};
