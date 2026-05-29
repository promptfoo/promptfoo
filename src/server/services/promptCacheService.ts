import { getPrompts } from '../../util/database';

import type { PromptWithMetadata } from '../../types';

export class PromptCacheService {
  private allPrompts: PromptWithMetadata[] | null = null;
  private generation = 0;

  async getAll(): Promise<PromptWithMetadata[]> {
    if (this.allPrompts == null) {
      const generation = this.generation;
      const prompts = await getPrompts();
      if (generation === this.generation) {
        this.allPrompts = prompts;
      }
      return prompts;
    }
    return this.allPrompts;
  }

  invalidate(): void {
    this.generation += 1;
    this.allPrompts = null;
  }
}

export const promptCacheService = new PromptCacheService();
