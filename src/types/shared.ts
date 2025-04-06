// for reasoning models
export interface CompletionTokenDetails {
  reasoning?: number;
  acceptedPrediction?: number;
  rejectedPrediction?: number;
}

export interface BaseTokenUsage {
  cached?: number;
  completion?: number;
  prompt?: number;
  total?: number;
  numRequests?: number;
  completionDetails?: CompletionTokenDetails;
}

export interface TokenUsage extends BaseTokenUsage {
  assertions?: BaseTokenUsage;
}

export type NunjucksFilterMap = Record<string, (...args: any[]) => string>;
