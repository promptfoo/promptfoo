import { safeJsonStringify } from '../util/json';
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

function subtractAssertionTokens(
  target: AssertionTokenAccumulator,
  usage: Partial<TokenUsage> | undefined,
) {
  if (!usage) {
    return;
  }

  target.total = Math.max(0, addNumbers(target.total, -(usage.total ?? 0)));
  target.prompt = Math.max(0, addNumbers(target.prompt, -(usage.prompt ?? 0)));
  target.completion = Math.max(0, addNumbers(target.completion, -(usage.completion ?? 0)));
  target.cached = Math.max(0, addNumbers(target.cached, -(usage.cached ?? 0)));
  target.numRequests = Math.max(0, addNumbers(target.numRequests, -(usage.numRequests ?? 0)));

  if (usage.completionDetails && target.completionDetails) {
    target.completionDetails.reasoning = Math.max(
      0,
      addNumbers(target.completionDetails.reasoning, -(usage.completionDetails.reasoning ?? 0)),
    );
    target.completionDetails.acceptedPrediction = Math.max(
      0,
      addNumbers(
        target.completionDetails.acceptedPrediction,
        -(usage.completionDetails.acceptedPrediction ?? 0),
      ),
    );
    target.completionDetails.rejectedPrediction = Math.max(
      0,
      addNumbers(
        target.completionDetails.rejectedPrediction,
        -(usage.completionDetails.rejectedPrediction ?? 0),
      ),
    );
    target.completionDetails.cacheReadInputTokens = Math.max(
      0,
      addNumbers(
        target.completionDetails.cacheReadInputTokens,
        -(usage.completionDetails.cacheReadInputTokens ?? 0),
      ),
    );
    target.completionDetails.cacheCreationInputTokens = Math.max(
      0,
      addNumbers(
        target.completionDetails.cacheCreationInputTokens,
        -(usage.completionDetails.cacheCreationInputTokens ?? 0),
      ),
    );
  }
}

function getDuplicateComparisonTokenUsage(
  result: StatableResult,
  seenComparisonTokenUsage: Set<string> | undefined,
): Set<number> {
  const duplicateIndexes = new Set<number>();
  if (result.testIdx === undefined || !seenComparisonTokenUsage) {
    return duplicateIndexes;
  }

  getCountableAssertionComponents(result).forEach((componentResult, index) => {
    if (componentResult.assertion?.type !== 'select-best' || !componentResult.tokensUsed) {
      return;
    }
    const key = `${result.testIdx}:${index}:${safeJsonStringify(componentResult.assertion)}:${safeJsonStringify(componentResult.tokensUsed)}`;
    if (seenComparisonTokenUsage.has(key)) {
      duplicateIndexes.add(index);
    } else {
      seenComparisonTokenUsage.add(key);
    }
  });
  return duplicateIndexes;
}

function getComponentAssertionRequestCount(
  result: StatableResult,
  duplicateComparisonIndexes: Set<number>,
): number {
  return getCountableAssertionComponents(result).reduce(
    (count, componentResult, index) =>
      count +
      (duplicateComparisonIndexes.has(index) ? 0 : (componentResult.tokensUsed?.numRequests ?? 0)),
    0,
  );
}

export function createAssertionTokenAccumulator(): AssertionTokenAccumulator {
  return createEmptyAssertions();
}

export function accumulateResultAssertionTokenUsage(
  target: AssertionTokenAccumulator,
  result: StatableResult,
  seenComparisonTokenUsage?: Set<string>,
): boolean {
  const components = getCountableAssertionComponents(result);
  const duplicateComparisonIndexes = getDuplicateComparisonTokenUsage(
    result,
    seenComparisonTokenUsage,
  );
  const topLevelTokenUsage = result.gradingResult?.tokensUsed;
  if (topLevelTokenUsage) {
    accumulateAssertionTokens(target, topLevelTokenUsage);
    for (const duplicateIndex of duplicateComparisonIndexes) {
      subtractAssertionTokens(target, components[duplicateIndex]?.tokensUsed);
    }

    // Comparison assertions can merge token totals into the row-level grading
    // result without preserving numRequests. Component results still retain
    // those request counts, so use them to fill only the missing request delta.
    const topLevelRequestCount = topLevelTokenUsage.numRequests ?? 0;
    const duplicateComparisonRequestCount = Array.from(duplicateComparisonIndexes).reduce(
      (count, index) => count + (components[index]?.tokensUsed?.numRequests ?? 0),
      0,
    );
    const retainedTopLevelRequestCount = Math.max(
      0,
      topLevelRequestCount - duplicateComparisonRequestCount,
    );
    const componentRequestCount = getComponentAssertionRequestCount(
      result,
      duplicateComparisonIndexes,
    );
    if (componentRequestCount > retainedTopLevelRequestCount) {
      target.numRequests = addNumbers(
        target.numRequests,
        componentRequestCount - retainedTopLevelRequestCount,
      );
    }

    return true;
  }

  let foundTokenUsage = false;
  for (const [index, componentResult] of components.entries()) {
    if (duplicateComparisonIndexes.has(index)) {
      continue;
    }
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
