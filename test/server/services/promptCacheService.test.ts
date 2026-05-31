import { afterEach, describe, expect, it, vi } from 'vitest';
import { PromptCacheService } from '../../../src/server/services/promptCacheService';
import { getPrompts } from '../../../src/util/database';
import { createDeferred } from '../../util/utils';

vi.mock('../../../src/util/database', () => ({
  getPrompts: vi.fn(),
}));

describe('PromptCacheService', () => {
  afterEach(() => {
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

  it('does not cache a load that resolves after invalidation', async () => {
    const pending = createDeferred<Awaited<ReturnType<typeof getPrompts>>>();
    vi.mocked(getPrompts)
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce([{ id: 'fresh' }] as never);
    const service = new PromptCacheService();

    const staleRequest = service.getAll();
    service.invalidate();
    pending.resolve([{ id: 'stale' }] as never);

    await expect(staleRequest).resolves.toEqual([{ id: 'stale' }]);
    await expect(service.getAll()).resolves.toEqual([{ id: 'fresh' }]);
    expect(getPrompts).toHaveBeenCalledTimes(2);
  });

  it('retries after a rejected load', async () => {
    vi.mocked(getPrompts)
      .mockRejectedValueOnce(new Error('database unavailable'))
      .mockResolvedValueOnce([{ id: 'fresh' }] as never);
    const service = new PromptCacheService();

    await expect(service.getAll()).rejects.toThrow('database unavailable');
    await expect(service.getAll()).resolves.toEqual([{ id: 'fresh' }]);
    expect(getPrompts).toHaveBeenCalledTimes(2);
  });

  it('does not coalesce concurrent cold loads (documents the no-single-flight contract)', async () => {
    // Two callers hitting an empty cache each trigger their own getPrompts(); the service caches
    // the result, not the in-flight promise. Pinning this guards against a future single-flight
    // "optimization" silently changing the contract the generation race relies on.
    const pending = createDeferred<Awaited<ReturnType<typeof getPrompts>>>();
    vi.mocked(getPrompts)
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce([{ id: 'second' }] as never);
    const service = new PromptCacheService();

    const first = service.getAll();
    const second = service.getAll();
    pending.resolve([{ id: 'first' }] as never);

    await expect(first).resolves.toEqual([{ id: 'first' }]);
    await expect(second).resolves.toEqual([{ id: 'second' }]);
    expect(getPrompts).toHaveBeenCalledTimes(2);
  });
});
