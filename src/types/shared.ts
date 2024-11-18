export interface TokenUsage {
  cached?: number;
  completion?: number;
  prompt?: number;
  total?: number;
  numRequests?: number;
}

export type NunjucksFilterMap = Record<string, (...args: any[]) => string>;
