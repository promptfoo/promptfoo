import { createEmptyAssertions } from '../util/tokenUsageUtils';
import { getCountableAssertionComponents } from './assertionComponents';

import type { EvaluateStats } from '../types/index';
import type { TokenUsage } from '../types/shared';
import type { AssertionTokenUsage, StatableResult } from './types';

type AssertionTokenAccumulator = NonNullable<TokenUsage['assertions']>;

function addNumbers(left: number | undefined, right: number | undefined): number {
  return (left ?? 0) + (right ?? 0);
}

function accumulateAssertionTokens(
  target: AssertionTokenAccumulator,
  usage: Partial<TokenUsage> | undefined,
) {
  if (!usage) {
    return;
  }

  target.total = addNumbers(target.total, usage.total);
  target.prompt = addNumbers(target.prompt, usage.prompt);
  target.completion = addNumbers(target.completion, usage.completion);
  target.cached = addNumbers(target.cached, usage.cached);
  target.numRequests = addNumbers(target.numRequests, usage.numRequests);

  if (usage.completionDetails) {
    target.completionDetails ??= {};
    target.completionDetails.reasoning = addNumbers(
      target.completionDetails.reasoning,
      usage.completionDetails.reasoning,
    );
    target.completionDetails.acceptedPrediction = addNumbers(
      target.completionDetails.acceptedPrediction,
      usage.completionDetails.acceptedPrediction,
    );
    target.completionDetails.rejectedPrediction = addNumbers(
      target.completionDetails.rejectedPrediction,
      usage.completionDetails.rejectedPrediction,
    );
    target.completionDetails.cacheReadInputTokens = addNumbers(
      target.completionDetails.cacheReadInputTokens,
      usage.completionDetails.cacheReadInputTokens,
    );
    target.completionDetails.cacheCreationInputTokens = addNumbers(
      target.completionDetails.cacheCreationInputTokens,
      usage.completionDetails.cacheCreationInputTokens,
    );
  }
}

function getComponentAssertionRequestCount(result: StatableResult): number {
  return getCountableAssertionComponents(result).reduce(
    (count, componentResult) => count + (componentResult.tokensUsed?.numRequests ?? 0),
    0,
  );
}

export function createAssertionTokenAccumulator(): AssertionTokenAccumulator {
  return createEmptyAssertions();
}

export function accumulateResultAssertionTokenUsage(
  target: AssertionTokenAccumulator,
  result: StatableResult,
): boolean {
  const topLevelTokenUsage = result.gradingResult?.tokensUsed;
  if (topLevelTokenUsage) {
    accumulateAssertionTokens(target, topLevelTokenUsage);

    // Comparison assertions can merge token totals into the row-level grading
    // result without preserving numRequests. Component results still retain
    // those request counts, so use them to fill only the missing request delta.
    const topLevelRequestCount = topLevelTokenUsage.numRequests ?? 0;
    const componentRequestCount = getComponentAssertionRequestCount(result);
    if (componentRequestCount > topLevelRequestCount) {
      target.numRequests = addNumbers(
        target.numRequests,
        componentRequestCount - topLevelRequestCount,
      );
    }

    return true;
  }

  let foundTokenUsage = false;
  for (const componentResult of getCountableAssertionComponents(result)) {
    if (componentResult.tokensUsed) {
      accumulateAssertionTokens(target, componentResult.tokensUsed);
      foundTokenUsage = true;
    }
  }
  return foundTokenUsage;
}

export function getStatsAssertionTokenUsage(stats: EvaluateStats): AssertionTokenAccumulator {
  const tokenUsage = createAssertionTokenAccumulator();
  accumulateAssertionTokens(tokenUsage, stats.tokenUsage?.assertions);
  return tokenUsage;
}

export function toAssertionTokenUsage(tokenUsage: AssertionTokenAccumulator): AssertionTokenUsage {
  return {
    totalTokens: tokenUsage.total || 0,
    promptTokens: tokenUsage.prompt || 0,
    completionTokens: tokenUsage.completion || 0,
    cachedTokens: tokenUsage.cached || 0,
    numRequests: tokenUsage.numRequests || 0,
    reasoningTokens: tokenUsage.completionDetails?.reasoning || 0,
  };
}
