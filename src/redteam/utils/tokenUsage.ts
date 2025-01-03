import type { TokenUsage } from '../../types';

export function createTokenUsage(): TokenUsage {
  return {
    total: 0,
    prompt: 0,
    completion: 0,
    numRequests: 0,
    cached: 0,
  };
}

export function mergeTokenUsage(base: TokenUsage, addition?: TokenUsage): TokenUsage {
  if (!addition) {
    return {
      ...base,
      numRequests: (base.numRequests || 0) + 1,
    };
  }

  return {
    total: (base.total || 0) + (addition.total || 0),
    prompt: (base.prompt || 0) + (addition.prompt || 0),
    completion: (base.completion || 0) + (addition.completion || 0),
    numRequests: (base.numRequests || 0) + (addition.numRequests ?? 1),
    cached: (base.cached || 0) + (addition.cached || 0),
  };
}

export function trackApiCall<T extends { tokenUsage?: TokenUsage }>(
  result: T,
  tokenUsage: TokenUsage,
): TokenUsage {
  return mergeTokenUsage(tokenUsage, result.tokenUsage);
}

// New helper for tracking multiple API calls in sequence
export function trackApiCalls<T extends { tokenUsage?: TokenUsage }>(
  results: T[],
  initialTokenUsage: TokenUsage,
): TokenUsage {
  return results.reduce((usage, result) => trackApiCall(result, usage), initialTokenUsage);
}
