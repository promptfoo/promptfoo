export interface TokenUsage {
  cached?: number;
  completion?: number;
  prompt?: number;
  total?: number;
}

export type NunjucksFilterMap = Record<string, (...args: any[]) => string>;
