import { LRUCache } from 'lru-cache';
import { DEFAULT_QUERY_LIMIT } from '../constants';

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

export type StandaloneEvalCacheKeyOptions = {
  limit?: number;
  tag?: { key: string; value: string };
  description?: string;
};

const standaloneEvalCache = new LRUCache<string, StandaloneEval[]>({
  ttl: 60 * 60 * 2 * 1000, // 2 hours in milliseconds
  // Cache entries are keyed by (limit, tag, description) filter combinations.
  // Mutation paths clear the cache; this TTL is a backstop for quiet servers
  // and future missed invalidations.
  // 2000 handles heavy automation scenarios while keeping memory bounded (~few MB).
  // On eviction, the next request simply re-queries the DB with minimal latency impact.
  max: 2000,
});

export function getStandaloneEvalCacheKey({
  limit = DEFAULT_QUERY_LIMIT,
  tag,
  description,
}: StandaloneEvalCacheKeyOptions = {}): string {
  return `standalone_evals_${limit}_${tag?.key}_${tag?.value}_${description}`;
}

export function getCachedStandaloneEvals(cacheKey: string): StandaloneEval[] | undefined {
  return standaloneEvalCache.get(cacheKey);
}

export function setCachedStandaloneEvals(cacheKey: string, evals: StandaloneEval[]): void {
  standaloneEvalCache.set(cacheKey, evals);
}

export function clearStandaloneEvalCache(): void {
  standaloneEvalCache.clear();
}
