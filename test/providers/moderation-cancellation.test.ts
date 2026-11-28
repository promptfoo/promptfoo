import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache, getCache, getScopedCacheKey, isCacheEnabled } from '../../src/cache';
import { AzureModerationProvider } from '../../src/providers/azure/moderation';
import { OpenAiModerationProvider } from '../../src/providers/openai/moderation';
import { fetchWithProxy } from '../../src/util/fetch/index';
import { createDeferred } from '../util/utils';

vi.mock('../../src/cache');
vi.mock('../../src/util/fetch/index');
vi.mock('../../src/logger');

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(isCacheEnabled).mockReturnValue(true);
  vi.mocked(getScopedCacheKey).mockImplementation((key) => key);
  vi.mocked(fetchWithCache).mockResolvedValue({
    data: { results: [] },
    status: 200,
    statusText: 'OK',
    cached: false,
  });
  vi.mocked(fetchWithProxy).mockResolvedValue(
    new Response(JSON.stringify({ categoriesAnalysis: [] })),
  );
});

afterEach(() => {
  vi.resetAllMocks();
  vi.restoreAllMocks();
});

describe.each([
  {
    name: 'OpenAI',
    createProvider: () =>
      new OpenAiModerationProvider(undefined, { config: { apiKey: 'test-key' } }),
    cachedResponse: JSON.stringify({ flags: [] }),
  },
  {
    name: 'Azure',
    createProvider: () =>
      new AzureModerationProvider('text-content-safety', {
        config: { apiKey: 'test-key', endpoint: 'https://example.com' },
      }),
    cachedResponse: { flags: [] },
  },
])('$name moderation cancellation', ({ createProvider, cachedResponse }) => {
  it.each(['hit', 'miss', 'error'] as const)(
    'stops waiting for a cache read before its %s outcome',
    async (outcome) => {
      const read = createDeferred<unknown>();
      const started = createDeferred<void>();
      const cache = {
        get: vi.fn(() => {
          started.resolve();
          return read.promise;
        }),
        set: vi.fn(),
      };
      vi.mocked(getCache).mockReturnValue(cache as unknown as ReturnType<typeof getCache>);
      const controller = new AbortController();
      const result = createProvider()
        .callModerationApi('prompt', 'response', undefined, { abortSignal: controller.signal })
        .catch((error: unknown) => error);

      await started.promise;
      controller.abort('cancelled during cache read');
      // Give rejection handlers a turn without allowing the cache read to finish.
      const aborted = await Promise.race([
        result,
        new Promise((resolve) => setImmediate(() => resolve('still waiting'))),
      ]);
      if (outcome === 'error') {
        read.reject(new Error('cache unavailable'));
      } else {
        read.resolve(outcome === 'hit' ? cachedResponse : undefined);
      }
      await result;
      await new Promise<void>((resolve) => setImmediate(resolve));

      expect(aborted).toMatchObject({
        name: 'AbortError',
        message: 'cancelled during cache read',
        cause: 'cancelled during cache read',
      });
      expect(fetchWithCache).not.toHaveBeenCalled();
      expect(fetchWithProxy).not.toHaveBeenCalled();
      expect(cache.set).not.toHaveBeenCalled();
    },
  );

  it('stops waiting for a cache write when cancelled', async () => {
    const write = createDeferred<void>();
    const started = createDeferred<void>();
    const cache = {
      get: vi.fn().mockResolvedValue(undefined),
      set: vi.fn(() => {
        started.resolve();
        return write.promise;
      }),
    };
    vi.mocked(getCache).mockReturnValue(cache as unknown as ReturnType<typeof getCache>);
    const controller = new AbortController();
    const result = createProvider()
      .callModerationApi('prompt', 'response', undefined, { abortSignal: controller.signal })
      .catch((error: unknown) => error);

    await started.promise;
    controller.abort();
    const aborted = await Promise.race([
      result,
      new Promise((resolve) => setImmediate(() => resolve('still waiting'))),
    ]);
    write.resolve();
    await result;

    expect(aborted).toMatchObject({ name: 'AbortError' });
  });
});

it('cancels Azure moderation while initialization is pending', async () => {
  const provider = new AzureModerationProvider('text-content-safety', {
    config: { apiKey: 'test-key', endpoint: 'https://example.com' },
  });
  const initialization = createDeferred<void>();
  vi.spyOn(provider, 'ensureInitialized').mockReturnValue(initialization.promise);
  vi.mocked(isCacheEnabled).mockReturnValue(false);
  const controller = new AbortController();
  const result = provider
    .callModerationApi('prompt', 'response', undefined, { abortSignal: controller.signal })
    .catch((error: unknown) => error);

  controller.abort();
  const aborted = await Promise.race([
    result,
    new Promise((resolve) => setImmediate(() => resolve('still waiting'))),
  ]);
  initialization.resolve();
  await result;
  await new Promise<void>((resolve) => setImmediate(resolve));

  expect(aborted).toMatchObject({ name: 'AbortError' });
  expect(fetchWithProxy).not.toHaveBeenCalled();
});
