import { LRUCache } from 'lru-cache';

import type { CompletedPrompt } from '../types/index';

export type StandaloneEval = CompletedPrompt & {
  evalId: string;
  description: string | null;
  datasetId: string | null;
  promptId: string | null;
  isRedteam: boolean;
  createdAt: number;

  pluginFailCount: Record<string, number>;
  pluginPassCount: Record<string, number>;
  uuid: string;
};

const standaloneEvalCache = new LRUCache<string, StandaloneEval[]>({
  ttl: 60 * 60 * 2 * 1000, // 2 hours in milliseconds
  // Cache entries are keyed by (limit, tag, description) filter combinations.
  // 2000 handles heavy automation scenarios while keeping memory bounded (~few MB).
  // On eviction, the next request simply re-queries the DB with minimal latency impact.
  max: 2000,
});

export function getCachedStandaloneEvals(cacheKey: string): StandaloneEval[] | undefined {
  return standaloneEvalCache.get(cacheKey);
}

export function setCachedStandaloneEvals(cacheKey: string, evals: StandaloneEval[]): void {
  standaloneEvalCache.set(cacheKey, evals);
}

export function clearStandaloneEvalCache(): void {
  standaloneEvalCache.clear();
}
