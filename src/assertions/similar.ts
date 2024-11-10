import invariant from 'tiny-invariant';
import { matchesSimilarity } from '../matchers';
import type { Assertion, AssertionValue, AtomicTestCase, GradingResult } from '../types';
import { coerceString } from './utils';

export const handleSimilar = async (
  assertion: Assertion,
  renderedValue: AssertionValue | undefined,
  output: string | object,
  inverse: boolean,
  test: AtomicTestCase,
): Promise<GradingResult> => {
  invariant(
    typeof renderedValue === 'string' || Array.isArray(renderedValue),
    'Similarity assertion type must have a string or array of strings value',
  );
  const outputString = coerceString(output);

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
