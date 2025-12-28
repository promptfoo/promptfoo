import { matchesSimilarity } from '../matchers';
import invariant from '../util/invariant';
import { defineAssertions } from './assertionDefinition';

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
    let minScore = Number.POSITIVE_INFINITY;
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
        threshold,
        inverse,
        test.options,
        metric,
      )),
    };
  }
};

export const similarDefinitions = defineAssertions({
  similar: {
    label: 'Semantic Similarity',
    description: 'Output is semantically similar to expected text',
    tags: ['similarity', 'embeddings'],
    valueType: 'reference',
    requiresLlm: true,
    supportsThreshold: true,
    handler: handleSimilar,
    learnMoreUrl: 'https://promptfoo.dev/docs/configuration/expected-outputs/similar',
  },
  'similar:cosine': {
    label: 'Cosine Similarity',
    description: 'Cosine similarity between output and reference embeddings',
    tags: ['similarity', 'embeddings'],
    valueType: 'reference',
    requiresLlm: true,
    supportsThreshold: true,
    handler: handleSimilar,
  },
  'similar:dot': {
    label: 'Dot Product Similarity',
    description: 'Dot product similarity between output and reference embeddings',
    tags: ['similarity', 'embeddings'],
    valueType: 'reference',
    requiresLlm: true,
    supportsThreshold: true,
    handler: handleSimilar,
  },
  'similar:euclidean': {
    label: 'Euclidean Distance',
    description: 'Euclidean distance between output and reference embeddings',
    tags: ['similarity', 'embeddings'],
    valueType: 'reference',
    requiresLlm: true,
    supportsThreshold: true,
    handler: handleSimilar,
  },
});
