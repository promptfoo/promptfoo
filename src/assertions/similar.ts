import { matchesSimilarity } from '../matchers';
import type { AssertionParams, GradingResult } from '../types';
import invariant from '../util/invariant';

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
  if (Array.isArray(renderedValue)) {
    let minScore = Infinity;
    for (const value of renderedValue) {
      const result = await matchesSimilarity(
        value,
        outputString,
        assertion.threshold || 0.75,
        inverse,
        test.options,
      );
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
      ...(await matchesSimilarity(
        renderedValue,
        outputString,
        assertion.threshold || 0.75,
        inverse,
        test.options,
      )),
    };
  }
};
