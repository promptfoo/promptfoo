import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PromptCacheService } from '../../../src/server/services/promptCacheService';
import { getPrompts } from '../../../src/util/database';

vi.mock('../../../src/util/database', () => ({
  getPrompts: vi.fn(),
}));

describe('PromptCacheService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('caches prompts until invalidated', async () => {
    vi.mocked(getPrompts)
      .mockResolvedValueOnce([{ id: 'first' }] as never)
      .mockResolvedValueOnce([{ id: 'second' }] as never);
    const service = new PromptCacheService();

    expect(await service.getAll()).toEqual([{ id: 'first' }]);
    expect(await service.getAll()).toEqual([{ id: 'first' }]);
    expect(getPrompts).toHaveBeenCalledOnce();

    service.invalidate();

    expect(await service.getAll()).toEqual([{ id: 'second' }]);
    expect(getPrompts).toHaveBeenCalledTimes(2);
  });
});
