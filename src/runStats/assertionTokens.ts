import { safeJsonStringify } from '../util/json';
import { createEmptyAssertions } from '../util/tokenUsageUtils';

import type { EvaluateStats, GradingResult } from '../types/index';
import type { TokenUsage } from '../types/shared';
import type { AssertionTokenUsage, StatableResult } from './types';

type AssertionTokenAccumulator = NonNullable<TokenUsage['assertions']>;

const TOKEN_FIELDS = ['total', 'prompt', 'completion', 'cached', 'numRequests'] as const;
const DETAIL_FIELDS = [
  'reasoning',
  'acceptedPrediction',
  'rejectedPrediction',
  'cacheReadInputTokens',
  'cacheCreationInputTokens',
] as const;

function accumulateAssertionTokens(
  target: AssertionTokenAccumulator,
  usage: Partial<TokenUsage> | undefined,
  direction = 1,
) {
  if (!usage) {
    return;
  }
  for (const field of TOKEN_FIELDS) {
    target[field] = Math.max(0, (target[field] ?? 0) + direction * (usage[field] ?? 0));
  }
  if (usage.completionDetails) {
    target.completionDetails ??= {};
    for (const field of DETAIL_FIELDS) {
      target.completionDetails[field] = Math.max(
        0,
        (target.completionDetails[field] ?? 0) + direction * (usage.completionDetails[field] ?? 0),
      );
    }
  }
}

function getComponentTokenUsage(component: GradingResult): Partial<TokenUsage> | undefined {
  if (component.tokensUsed) {
    return component.tokensUsed;
  }
  const usage = createAssertionTokenAccumulator();
  let found = false;
  for (const child of component.componentResults ?? []) {
    const childUsage = getComponentTokenUsage(child);
    accumulateAssertionTokens(usage, childUsage);
    found ||= Boolean(childUsage);
  }
  return found ? usage : undefined;
}

export function createAssertionTokenAccumulator(): AssertionTokenAccumulator {
  return createEmptyAssertions();
}

export function accumulateResultAssertionTokenUsage(
  target: AssertionTokenAccumulator,
  result: StatableResult,
  seenComparisonTokenUsage?: Set<string>,
): boolean {
  const components = result.gradingResult?.componentResults ?? [];
  const componentUsage = createAssertionTokenAccumulator();
  const duplicates: Partial<TokenUsage>[] = [];
  const occurrences = new Map<string, number>();
  let found = Boolean(result.gradingResult?.tokensUsed);
  for (let index = 0; index < components.length; index++) {
    const component = components[index];
    // AssertionsResult emits each aggregate followed by its already-counted children.
    index += component.componentResults?.length ?? 0;
    const usage = getComponentTokenUsage(component);
    accumulateAssertionTokens(componentUsage, usage);
    found ||= Boolean(usage);
    if (
      component.assertion?.type !== 'select-best' ||
      !component.tokensUsed ||
      result.testIdx === undefined ||
      !seenComparisonTokenUsage
    ) {
      continue;
    }
    const identity = safeJsonStringify(component.assertion) ?? 'select-best';
    const occurrence = occurrences.get(identity) ?? 0;
    occurrences.set(identity, occurrence + 1);
    const key = `${result.testIdx}:${identity}:${occurrence}`;
    if (seenComparisonTokenUsage.has(key)) {
      duplicates.push(component.tokensUsed);
    } else {
      seenComparisonTokenUsage.add(key);
    }
  }
  const rowUsage = createAssertionTokenAccumulator();
  const aggregate = result.gradingResult?.tokensUsed;
  accumulateAssertionTokens(rowUsage, aggregate ?? componentUsage);
  if (aggregate && aggregate.numRequests === undefined) {
    rowUsage.numRequests = componentUsage.numRequests;
  }
  for (const duplicate of duplicates) {
    accumulateAssertionTokens(rowUsage, duplicate, -1);
  }
  accumulateAssertionTokens(target, rowUsage);
  return found;
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
