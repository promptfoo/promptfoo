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

  const scores = Object.values(resp.classification ?? {});
  if (!resp.classification || scores.length === 0) {
    const failure = graderFail(
      resp.classification
        ? 'No classification scores returned'
        : resp.error || 'Unknown error fetching classification',
      resp.tokenUsage,
    );
    return {
      ...failure,
      ...(resp.cached && { metadata: { ...failure.metadata, cachedResponse: true } }),
    };
  }

  const score = expected === undefined ? Math.max(...scores) : resp.classification[expected] || 0;
  const pass = score >= threshold - Number.EPSILON;
  const subject =
    expected === undefined
      ? 'Maximum classification score'
      : `Classification ${expected} has score`;
  return {
    pass,
    score,
    reason: `${subject} ${score.toFixed(2)} ${pass ? '>=' : '<'} ${threshold}`,
    ...(resp.tokenUsage && { tokensUsed: normalizeMatcherTokenUsage(resp.tokenUsage) }),
    ...(resp.cached && { metadata: { cachedResponse: true } }),
  };
}
