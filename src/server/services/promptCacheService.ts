import { getPrompts } from '../../util/database';

import type { PromptWithMetadata } from '../../types';

export class PromptCacheService {
  private allPrompts: PromptWithMetadata[] | null = null;

  async getAll(): Promise<PromptWithMetadata[]> {
    if (this.allPrompts == null) {
      this.allPrompts = await getPrompts();
    }
    return this.allPrompts;
  }

  invalidate(): void {
    this.allPrompts = null;
  }
}

export const promptCacheService = new PromptCacheService();
