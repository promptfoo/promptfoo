import cliState from '../cliState';
import { getDefaultProviders } from '../providers/defaults';
import { shouldGenerateRemote } from '../redteam/remoteGeneration';
import { doRemoteGrading } from '../remoteGrading';
import { accumulateTokenUsage } from '../util/tokenUsageUtils';
import { getAndCheckProvider } from './providers';
import {
  cosineSimilarity,
  dotProduct,
  euclideanDistance,
  fail,
  normalizeMatcherTokenUsage,
} from './shared';

import type {
  ApiEmbeddingProvider,
  ApiSimilarityProvider,
  GradingConfig,
  GradingResult,
  TokenUsage,
} from '../types/index';

type SimilarityMetric = 'cosine' | 'dot_product' | 'euclidean';

function calculateSimilarityScore(
  expectedEmbedding: number[],
  outputEmbedding: number[],
  metric: SimilarityMetric,
  tokensUsed: TokenUsage,
): number | Omit<GradingResult, 'assertion'> {
  switch (metric) {
    case 'cosine':
      return cosineSimilarity(expectedEmbedding, outputEmbedding);
    case 'dot_product':
      return dotProduct(expectedEmbedding, outputEmbedding);
    case 'euclidean':
      // For euclidean distance, we store the distance in the similarity variable and
      // apply distance semantics when building the final grading result.
      return euclideanDistance(expectedEmbedding, outputEmbedding);
    default:
      return fail(`Unsupported metric: ${metric}`, tokensUsed);
  }
}

function buildSimilarityResult(
  similarity: number,
  threshold: number,
  inverse: boolean,
  metric: SimilarityMetric,
  tokensUsed: TokenUsage,
): Omit<GradingResult, 'assertion'> {
  if (metric === 'euclidean') {
    // For distance metrics: lower is better, threshold is maximum distance
    const distance = similarity;
    const pass = inverse
      ? distance >= threshold - Number.EPSILON
      : distance <= threshold + Number.EPSILON;
    // Convert distance to a 0-1 score: score = 1 / (1 + distance)
    const normalizedScore = 1 / (1 + distance);
    const score = inverse ? 1 - normalizedScore : normalizedScore;
    const belowThresholdReason = `Distance ${distance.toFixed(2)} is less than or equal to threshold ${threshold}`;
    const aboveThresholdReason = `Distance ${distance.toFixed(2)} is greater than threshold ${threshold}`;

    return {
      pass,
      score,
      reason: pass
        ? inverse
          ? aboveThresholdReason
          : belowThresholdReason
        : inverse
          ? belowThresholdReason
          : aboveThresholdReason,
      tokensUsed,
    };
  }

  // For similarity metrics: higher is better, threshold is minimum similarity
  const pass = inverse
    ? similarity <= threshold + Number.EPSILON
    : similarity >= threshold - Number.EPSILON;
  const score = inverse ? 1 - similarity : similarity;
  const greaterThanReason = `Similarity ${similarity.toFixed(2)} is greater than or equal to threshold ${threshold}`;
  const lessThanReason = `Similarity ${similarity.toFixed(2)} is less than threshold ${threshold}`;

  return {
    pass,
    score,
    reason: pass
      ? inverse
        ? lessThanReason
        : greaterThanReason
      : inverse
        ? greaterThanReason
        : lessThanReason,
    tokensUsed,
  };
}

async function calculateProviderSimilarity(
  finalProvider: ApiEmbeddingProvider | ApiSimilarityProvider,
  expected: string,
  output: string,
  metric: SimilarityMetric,
  tokensUsed: TokenUsage,
): Promise<number | Omit<GradingResult, 'assertion'>> {
  if (metric === 'cosine' && 'callSimilarityApi' in finalProvider) {
    const similarityResp = await finalProvider.callSimilarityApi(expected, output);
    accumulateTokenUsage(tokensUsed, similarityResp.tokenUsage);
    if (similarityResp.error) {
      return fail(similarityResp.error, tokensUsed);
    }
    if (similarityResp.similarity == null) {
      return fail('Unknown error fetching similarity', tokensUsed);
    }
    if (!Number.isFinite(similarityResp.similarity)) {
      return fail(`Invalid similarity score: ${similarityResp.similarity}`, tokensUsed);
    }
    return similarityResp.similarity;
  }

  const callEmbeddingApi =
    'callEmbeddingApi' in finalProvider ? finalProvider.callEmbeddingApi : undefined;
  if (typeof callEmbeddingApi !== 'function') {
    if ('callSimilarityApi' in finalProvider) {
      return fail(
        `Provider ${finalProvider.id()} only supports cosine similarity via callSimilarityApi`,
        tokensUsed,
      );
    }
    throw new Error('Provider must implement callSimilarityApi or callEmbeddingApi');
  }

  const [expectedEmbedding, outputEmbedding] = await Promise.all([
    callEmbeddingApi.call(finalProvider, expected),
    callEmbeddingApi.call(finalProvider, output),
  ]);

  const mergedUsage = normalizeMatcherTokenUsage(undefined);
  accumulateTokenUsage(mergedUsage, expectedEmbedding.tokenUsage);
  accumulateTokenUsage(mergedUsage, outputEmbedding.tokenUsage);
  accumulateTokenUsage(tokensUsed, mergedUsage);

  if (expectedEmbedding.error || outputEmbedding.error) {
    return fail(
      expectedEmbedding.error || outputEmbedding.error || 'Unknown error fetching embeddings',
      tokensUsed,
    );
  }

  if (!expectedEmbedding.embedding || !outputEmbedding.embedding) {
    return fail('Embedding not found', tokensUsed);
  }

  return calculateSimilarityScore(
    expectedEmbedding.embedding,
    outputEmbedding.embedding,
    metric,
    tokensUsed,
  );
}

export async function matchesSimilarity(
  expected: string,
  output: string,
  threshold: number,
  inverse: boolean = false,
  grading?: GradingConfig,
  metric: SimilarityMetric = 'cosine',
): Promise<Omit<GradingResult, 'assertion'>> {
  if (
    metric === 'cosine' &&
    cliState.config?.redteam &&
    shouldGenerateRemote({ requireEmbeddingProvider: true })
  ) {
    try {
      return await doRemoteGrading({
        task: 'similar',
        expected,
        output,
        threshold,
        inverse,
      });
    } catch (error) {
      return fail(`Could not perform remote grading: ${error}`);
    }
  }

  const defaults = await getDefaultProviders();
  const finalProvider = (await getAndCheckProvider(
    'embedding',
    grading?.provider,
    defaults.embeddingProvider,
    'similarity check',
  )) as ApiEmbeddingProvider | ApiSimilarityProvider;

  const tokensUsed = normalizeMatcherTokenUsage(undefined);
  const similarity = await calculateProviderSimilarity(
    finalProvider,
    expected,
    output,
    metric,
    tokensUsed,
  );

  if (typeof similarity !== 'number') {
    return similarity;
  }

  return buildSimilarityResult(similarity, threshold, inverse, metric, tokensUsed);
}
