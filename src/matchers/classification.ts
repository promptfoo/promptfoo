import {
  callGradingProvider,
  getAndCheckProvider,
  getGradingProviderCallOptions,
} from './providers';
import { graderFail, normalizeMatcherTokenUsage } from './shared';

import type { ApiClassificationProvider, GradingConfig, GradingResult } from '../types/index';

/**
 *
 * @param expected Expected classification. If undefined, matches any classification.
 * @param output Text to classify.
 * @param threshold Value between 0 and 1. If the expected classification is undefined, the threshold is the minimum score for any classification. If the expected classification is defined, the threshold is the minimum score for that classification.
 * @param grading
 * @returns Pass if the output matches the classification with a score greater than or equal to the threshold.
 */
export async function matchesClassification(
  expected: string | undefined,
  output: string,
  threshold: number,
  grading?: GradingConfig,
): Promise<Omit<GradingResult, 'assertion'>> {
  const finalProvider = (await getAndCheckProvider(
    'classification',
    grading?.provider,
    null,
    'classification check',
  )) as ApiClassificationProvider;

  const callApiOptions = getGradingProviderCallOptions();
  const resp = await callGradingProvider(finalProvider, 'classification', () =>
    callApiOptions
      ? finalProvider.callClassificationApi(output, callApiOptions)
      : finalProvider.callClassificationApi(output),
  );

  if (!resp.classification) {
    const failure = graderFail(
      resp.error || 'Unknown error fetching classification',
      resp.tokenUsage,
    );
    return {
      ...failure,
      ...(resp.cached && { metadata: { ...failure.metadata, cachedResponse: true } }),
    };
  }
  const scores = Object.values(resp.classification);
  if (scores.length === 0) {
    // No scores means there is no verdict, even when a specific label was requested.
    const failure = graderFail('No classification scores returned', resp.tokenUsage);
    return {
      ...failure,
      ...(resp.cached && { metadata: { ...failure.metadata, cachedResponse: true } }),
    };
  }

  const tokenUsageResult = resp.tokenUsage
    ? { tokensUsed: normalizeMatcherTokenUsage(resp.tokenUsage) }
    : {};

  let score: number;
  if (expected === undefined) {
    score = Math.max(...scores);
  } else {
    score = resp.classification[expected] || 0;
  }

  if (score >= threshold - Number.EPSILON) {
    const reason =
      expected === undefined
        ? `Maximum classification score ${score.toFixed(2)} >= ${threshold}`
        : `Classification ${expected} has score ${score.toFixed(2)} >= ${threshold}`;
    return {
      pass: true,
      score,
      reason,
      ...tokenUsageResult,
      ...(resp.cached && { metadata: { cachedResponse: true } }),
    };
  }
  return {
    pass: false,
    score,
    reason:
      expected === undefined
        ? `Maximum classification score ${score.toFixed(2)} < ${threshold}`
        : `Classification ${expected} has score ${score.toFixed(2)} < ${threshold}`,
    ...tokenUsageResult,
    ...(resp.cached && { metadata: { cachedResponse: true } }),
  };
}
