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
  // Mutations clear cached history; the TTL bounds stale entries if an invalidation is missed.
  max: 2000,
});

export function getStandaloneEvalCacheKey({
  limit = DEFAULT_QUERY_LIMIT,
  tag,
  description,
}: StandaloneEvalCacheKeyOptions = {}): string {
  return JSON.stringify([limit, tag?.key, tag?.value, description]);
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
