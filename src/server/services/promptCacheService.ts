import { getPrompts } from '../../util/database';

import type { PromptWithMetadata } from '../../types';

/**
 * Process-local cache for the `/api/prompts` response. Relies on the single-threaded Node event
 * loop: `invalidate()` is atomic and the only yield point in `getAll()` is `await getPrompts()`,
 * so a load that started before an `invalidate()` is detected by the `generation` epoch check and
 * is never written into the cache. `getAll()` always resolves to a coherent snapshot (possibly
 * stale by one request during a concurrent invalidation); the next request re-reads the DB.
 */
export class PromptCacheService {
  private allPrompts: PromptWithMetadata[] | null = null;
  private generation = 0;

  async getAll(): Promise<PromptWithMetadata[]> {
    if (this.allPrompts != null) {
      return this.allPrompts;
    }

    const generation = this.generation;
    const prompts = await getPrompts();
    if (generation === this.generation) {
      this.allPrompts = prompts;
    }
    // Return the value we just fetched, not `this.allPrompts`: a concurrent `invalidate()` may
    // have reset the field to null (and the generation check above kept our result out of the
    // cache), so re-reading it could hand back null. This caller still gets a coherent snapshot;
    // the stale-vs-invalidator race resolves on the next request, which re-reads the DB.
    return prompts;
  }

  invalidate(): void {
    this.generation += 1;
    this.allPrompts = null;
  }
}

export const promptCacheService = new PromptCacheService();
