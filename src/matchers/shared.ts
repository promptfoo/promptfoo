import { accumulateTokenUsage } from '../util/tokenUsageUtils';

import type { GradingResult, TokenUsage } from '../types/index';

export function fail(
  reason: string,
  tokensUsed?: Partial<TokenUsage>,
): Omit<GradingResult, 'assertion'> {
  return {
    pass: false,
    reason,
    score: 0,
    tokensUsed: {
      total: tokensUsed?.total || 0,
      prompt: tokensUsed?.prompt || 0,
      completion: tokensUsed?.completion || 0,
      cached: tokensUsed?.cached || 0,
      numRequests: tokensUsed?.numRequests || 0,
      completionDetails: tokensUsed?.completionDetails,
    },
  };
}

export function accumulateTokens(target: TokenUsage, update?: Partial<TokenUsage>) {
  accumulateTokenUsage(target, update);
}

export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length !== vecB.length) {
    throw new Error('Vectors must be of equal length');
  }
  const dotProduct = vecA.reduce((acc, val, idx) => acc + val * vecB[idx], 0);
  const vecAMagnitude = Math.sqrt(vecA.reduce((acc, val) => acc + val * val, 0));
  const vecBMagnitude = Math.sqrt(vecB.reduce((acc, val) => acc + val * val, 0));
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
