import { afterEach, describe, expect, it, vi } from 'vitest';

const { fetchWithRetries } = vi.hoisted(() => ({ fetchWithRetries: vi.fn() }));
vi.mock('../src/util/fetch/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/util/fetch/index')>()),
  fetchWithRetries,
}));

afterEach(() => {
  vi.resetAllMocks();
});

async function loadCopies() {
  vi.resetModules();
  const first = await import('../src/cache');
  vi.resetModules();
  const second = await import('../src/cache');
  const agentic = await import('../src/providers/agentic-utils');
  first.enableCache();
  second.enableCache();
  return { first, second, agentic };
}

describe('cache policy across module copies', () => {
  it('skips HTTP cache reads and writes without changing the other copy default', async () => {
    const { first, second } = await loadCopies();
    expect(first.fetchWithCache).not.toBe(second.fetchWithCache);
    let requests = 0;
    fetchWithRetries.mockImplementation(async () => Response.json({ output: ++requests }));
    const request = () => second.fetchWithCache('https://example.test/cache-policy', {}, 1000);
    const warm = await request();
    expect(warm.data).toEqual({ output: 1 });
    await first.withCacheEnabled(false, async () => {
      expect(second.isCacheEnabled()).toBe(false);
      const fresh = await request();
      expect(fresh.cached).toBe(false);
      expect(fresh.data).toEqual({ output: 2 });
    });
    expect(second.isCacheEnabled()).toBe(true);
    const cached = await request();
    expect(cached.cached).toBe(true);
    expect(cached.data).toEqual({ output: 1 });
    expect(requests).toBe(2);
  });

  it('disables agentic reads and writes while concurrent cached calls stay enabled', async () => {
    const { first, second, agentic } = await loadCopies();
    const options = { cacheKeyPrefix: 'cross-module-agentic' };
    const keyData = { prompt: 'same prompt' };
    const warm = await agentic.initializeAgenticCache(options, keyData);
    await agentic.cacheResponse(warm, { output: 'original' });
    await Promise.all([
      first.withCacheEnabled(false, async () => {
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(second.isCacheEnabled()).toBe(false);
        const disabled = await agentic.initializeAgenticCache(options, keyData);
        expect(disabled.shouldReadCache).toBe(false);
        expect(disabled.shouldWriteCache).toBe(false);
        expect(await agentic.getCachedResponse(disabled)).toBeUndefined();
        await agentic.cacheResponse(disabled, { output: 'must not persist' });
      }),
      second.withCacheEnabled(true, async () => {
        await new Promise<void>((resolve) => setImmediate(resolve));
        expect(first.isCacheEnabled()).toBe(true);
        const enabled = await agentic.initializeAgenticCache(options, keyData);
        expect((await agentic.getCachedResponse(enabled))?.output).toBe('original');
      }),
    ]);
    expect((await agentic.getCachedResponse(warm))?.output).toBe('original');
    expect(first.isCacheEnabled()).toBe(true);
    expect(second.isCacheEnabled()).toBe(true);
  });

  it('restores the enclosing policy after a nested scope throws', async () => {
    const { first, second } = await loadCopies();
    await first.withCacheEnabled(false, async () => {
      await expect(
        second.withCacheEnabled(true, async () => {
          expect(first.isCacheEnabled()).toBe(true);
          throw new Error('provider failed');
        }),
      ).rejects.toThrow('provider failed');
      expect(first.isCacheEnabled()).toBe(false);
      expect(second.isCacheEnabled()).toBe(false);
    });
    expect(second.isCacheEnabled()).toBe(true);
  });
});
