import { matchesSimilarity } from '../matchers/similarity';
import invariant from '../util/invariant';

import type { AssertionParams, GradingResult } from '../types/index';

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
  invariant(
    !Array.isArray(renderedValue) || renderedValue.length > 0,
    'Similarity assertion must have at least one value to compare against',
  );
  const threshold = assertion.threshold ?? 0.75;

  // Parse metric from assertion type (e.g., 'similar:dot' -> 'dot_product')
  let metric: 'cosine' | 'dot_product' | 'euclidean' = 'cosine';
  if (assertion.type.includes(':')) {
    const metricSuffix = assertion.type.split(':')[1];
    switch (metricSuffix) {
      case 'cosine':
        metric = 'cosine';
        break;
      case 'dot':
        metric = 'dot_product';
        break;
      case 'euclidean':
        metric = 'euclidean';
        break;
      default:
        throw new Error(`Unknown similarity metric: ${metricSuffix}`);
    }
  }

  if (Array.isArray(renderedValue)) {
    // The assertion passes if the output matches ANY of the values (we return
    // early on the first pass), so when none pass, report the best (highest)
    // score — how close the output got to its closest value — not the worst.
    // matchesSimilarity normalizes score so higher is always better, including
    // for inverse and euclidean. This matches bleu/gleu/meteor (Math.max).
    let maxScore = Number.NEGATIVE_INFINITY;
    for (const value of renderedValue) {
      const result = await matchesSimilarity(
        value,
        outputString,
        threshold,
        inverse,
        test.options,
        metric,
      );
      if (result.pass) {
        return {
          assertion,
          ...result,
        };
      }
      if (result.score > maxScore) {
        maxScore = result.score;
      }
    }
    return {
      assertion,
      pass: false,
      score: maxScore,
      reason: `None of the provided values met the similarity threshold`,
    };
  } else {
    return {
      assertion,
      ...(await matchesSimilarity(
        renderedValue,
        outputString,
        threshold,
        inverse,
        test.options,
        metric,
      )),
    };
  }
};
