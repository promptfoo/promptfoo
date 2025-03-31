// for reasoning models
export interface CompletionTokenDetails {
  reasoning?: number;
  acceptedPrediction?: number;
  rejectedPrediction?: number;
}

export interface TokenUsage {
  cached?: number;
  completion?: number;
  prompt?: number;
  total?: number;
  numRequests?: number;
  completionDetails?: CompletionTokenDetails;
  assertions?: {
    total: number;
    prompt: number;
    completion: number;
    byType: Record<string, {
      total: number;
      prompt: number;
      completion: number;
      count: number;
    }>;
  };
}

export type NunjucksFilterMap = Record<string, (...args: any[]) => string>;
