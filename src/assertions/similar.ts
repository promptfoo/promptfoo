import { matchesSimilarity } from '../matchers';
import invariant from '../util/invariant';

import type { AssertionParams, GradingResult } from '../types';

export const handleSimilar = async ({
  assertion,
  renderedValue,
  outputString,
  inverse,
  test,
}: AssertionParams): Promise<GradingResult> => {
  invariant(
    typeof renderedValue === 'string' || Array.isArray(renderedValue),
    'Similarity assertion type must have a string or array of strings value',
  );
  const threshold = assertion.threshold ?? 0.75;

  if (Array.isArray(renderedValue)) {
    let minScore = Number.POSITIVE_INFINITY;
    for (const value of renderedValue) {
      const result = await matchesSimilarity(value, outputString, threshold, inverse, test.options);
      if (result.pass) {
        return {
          assertion,
          ...result,
        };
      }
      if (result.score < minScore) {
        minScore = result.score;
      }
    }
    return {
      assertion,
      pass: false,
      score: minScore,
      reason: `None of the provided values met the similarity threshold`,
    };
  } else {
    return {
      assertion,
      ...(await matchesSimilarity(renderedValue, outputString, threshold, inverse, test.options)),
    };
  }
};
