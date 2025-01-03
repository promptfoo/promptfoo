export interface TokenUsage {
  total: number;
  prompt: number;
  completion: number;
  numRequests: number;
  cached: number;
}

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
      numRequests: base.numRequests + 1,
    };
  }

  return {
    total: base.total + (addition.total || 0),
    prompt: base.prompt + (addition.prompt || 0),
    completion: base.completion + (addition.completion || 0),
    numRequests: base.numRequests + (addition.numRequests ?? 1),
    cached: base.cached + (addition.cached || 0),
  };
}

export function trackApiCall<T extends { tokenUsage?: TokenUsage }>(
  result: T,
  tokenUsage: TokenUsage,
): TokenUsage {
  return mergeTokenUsage(tokenUsage, result.tokenUsage);
}
