import { getAndCheckProvider } from './providers';
import { fail } from './shared';

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

  const resp = await finalProvider.callClassificationApi(output);

  if (!resp.classification) {
    return fail(resp.error || 'Unknown error fetching classification');
  }
  let score: number;
  if (expected === undefined) {
    const scores = Object.values(resp.classification);
    if (scores.length === 0) {
      return {
        pass: false,
        score: 0,
        reason: 'No classification scores returned',
      };
    }
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
    };
  }
  return {
    pass: false,
    score,
    reason:
      expected === undefined
        ? `Maximum classification score ${score.toFixed(2)} < ${threshold}`
        : `Classification ${expected} has score ${score.toFixed(2)} < ${threshold}`,
  };
}
