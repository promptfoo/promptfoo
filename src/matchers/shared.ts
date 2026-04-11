import type { GradingResult, TokenUsage } from '../types/index';

/**
 * Normalize token usage for matcher results. Unlike the evaluator-level
 * normalizeTokenUsage, this excludes the `assertions` field and preserves
 * the existing completionDetails shape (passing through whatever the
 * provider returned, or undefined if not present).
 */
export function normalizeMatcherTokenUsage(
  tokenUsage: Partial<TokenUsage> | undefined,
): TokenUsage {
  return {
    total: tokenUsage?.total || 0,
    prompt: tokenUsage?.prompt || 0,
    completion: tokenUsage?.completion || 0,
    cached: tokenUsage?.cached || 0,
    numRequests: tokenUsage?.numRequests || 0,
    completionDetails: tokenUsage?.completionDetails || {
      reasoning: 0,
      acceptedPrediction: 0,
      rejectedPrediction: 0,
    },
  };
}

export function fail(
  reason: string,
  tokensUsed?: Partial<TokenUsage>,
): Omit<GradingResult, 'assertion'> {
  return {
    pass: false,
    reason,
    score: 0,
    tokensUsed: normalizeMatcherTokenUsage(tokensUsed),
  };
}

export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must be of equal length');
  }
  const dotProduct = vecA.reduce((acc, val, idx) => acc + val * vecB[idx], 0);
  const vecAMagnitude = Math.sqrt(vecA.reduce((acc, val) => acc + val * val, 0));
  const vecBMagnitude = Math.sqrt(vecB.reduce((acc, val) => acc + val * val, 0));
  if (vecAMagnitude === 0 || vecBMagnitude === 0) {
    return 0;
  }
  return dotProduct / (vecAMagnitude * vecBMagnitude);
}

export function dotProduct(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must be of equal length');
  }
  return vecA.reduce((acc, val, idx) => acc + val * vecB[idx], 0);
}

export function euclideanDistance(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must be of equal length');
  }
  const sumSquaredDiff = vecA.reduce((acc, val, idx) => {
    const diff = val - vecB[idx];
    return acc + diff * diff;
  }, 0);
  return Math.sqrt(sumSquaredDiff);
}

export function tryParse(content: string) {
  try {
    return JSON.parse(content);
  } catch {}
  return content;
}

export function splitIntoSentences(text: string) {
  return text.split('\n').filter((sentence) => sentence.trim() !== '');
}
