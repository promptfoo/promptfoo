import { getPrompts } from '../../util/database';

import type { PromptWithMetadata } from '../../types';

/**
 * Process-local cache for the `/api/prompts` response. Relies on the single-threaded Node event
 * loop: `invalidate()` replaces the cache cell, and `getAll()` only yields at `await getPrompts()`.
 * A load that started before invalidation writes its detached cell and cannot refill the cache.
 * `getAll()` always resolves to a coherent snapshot (possibly
 * stale by one request during a concurrent invalidation); the next request re-reads the DB.
 */
export class PromptCacheService {
  private cache: { prompts: PromptWithMetadata[] | null } = { prompts: null };

  async getAll(): Promise<PromptWithMetadata[]> {
    const cache = this.cache;
    if (cache.prompts != null) {
      return cache.prompts;
    }

    const prompts = await getPrompts();
    cache.prompts = prompts;
    // Return the value we just fetched, not the current cache: concurrent invalidation may
    // have replaced the cell with an empty one. This load fills only its captured cell, so
    // re-reading the current cache could hand back null.
    return prompts;
  }

  invalidate(): void {
    this.cache = { prompts: null };
  }
}

export const promptCacheService = new PromptCacheService();
