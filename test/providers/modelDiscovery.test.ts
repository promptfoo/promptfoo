import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache, withCacheEnabled, withCacheNamespace } from '../../src/cache';
import { clearAimlApiModelsCache, fetchAimlApiModels } from '../../src/providers/aimlapi';
import { clearCometApiModelsCache, fetchCometApiModels } from '../../src/providers/cometapi';

import type { EnvOverrides } from '../../src/types/env';

vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWithCache: vi.fn(),
}));

function response(data: unknown, status = 200) {
  return {
    data,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    cached: false,
    headers: {},
    deleteFromCache: vi.fn(async () => {}),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(fetchWithCache).mockReset();
  vi.stubEnv('AIML_API_KEY', '');
  vi.stubEnv('COMETAPI_KEY', '');
  clearAimlApiModelsCache();
  clearCometApiModelsCache();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.resetAllMocks();
  clearAimlApiModelsCache();
  clearCometApiModelsCache();
});

describe.each([
  {
    name: 'AIML API',
    fetch: fetchAimlApiModels,
    clear: clearAimlApiModelsCache,
    key: 'AIML_API_KEY',
  },
  {
    name: 'CometAPI',
    fetch: fetchCometApiModels,
    clear: clearCometApiModelsCache,
    key: 'COMETAPI_KEY',
  },
])('$name discovery', ({ fetch, clear, key }) => {
  const env = (value: string): EnvOverrides => ({ [key]: value });

  it('refreshes successful and empty catalogues after five minutes', async () => {
    vi.mocked(fetchWithCache)
      .mockResolvedValueOnce(response({ data: [{ id: 'old-model' }] }))
      .mockResolvedValueOnce(response({ data: [] }))
      .mockResolvedValueOnce(response({ data: [{ id: 'new-model' }] }));
    expect(await fetch()).toEqual([{ id: 'old-model' }]);
    await vi.advanceTimersByTimeAsync(299_999);
    expect(await fetch()).toEqual([{ id: 'old-model' }]);
    await vi.advanceTimersByTimeAsync(1);
    expect(await fetch()).toEqual([]);
    expect(await fetch()).toEqual([]);
    expect(fetchWithCache).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(300_000);
    expect(await fetch()).toEqual([{ id: 'new-model' }]);
  });

  it.each([401, 429, 500, 503])('retries HTTP %i after a short cooldown', async (status) => {
    vi.mocked(fetchWithCache)
      .mockResolvedValueOnce(response({ data: [{ id: 'not-a-success' }] }, status))
      .mockResolvedValueOnce(response({ data: [{ id: 'recovered-model' }] }));
    expect(await fetch()).toEqual([]);
    await vi.advanceTimersByTimeAsync(4_999);
    expect(await fetch()).toEqual([]);
    expect(fetchWithCache).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await fetch()).toEqual([{ id: 'recovered-model' }]);
  });

  it.each([
    null,
    { error: 'temporarily unavailable' },
    { data: 'not an array' },
    { data: [null] },
    { data: [{ id: '' }] },
    { data: [{ id: 42 }] },
  ])('does not retain malformed responses: %j', async (data) => {
    vi.mocked(fetchWithCache)
      .mockResolvedValueOnce(response(data))
      .mockResolvedValueOnce(response({ data: [{ id: 'recovered-model' }] }));
    expect(await fetch()).toEqual([]);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await fetch()).toEqual([{ id: 'recovered-model' }]);
  });

  it('recovers from a rejected request', async () => {
    vi.mocked(fetchWithCache)
      .mockRejectedValueOnce(new Error('Request timed out'))
      .mockResolvedValueOnce(response({ data: [{ id: 'recovered-model' }] }));
    expect(await fetch()).toEqual([]);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await fetch()).toEqual([{ id: 'recovered-model' }]);
  });

  it('isolates anonymous, process, and scoped credentials', async () => {
    vi.mocked(fetchWithCache)
      .mockResolvedValueOnce(response({ data: [{ id: 'anonymous' }] }))
      .mockResolvedValueOnce(response({ data: [{ id: 'process' }] }))
      .mockResolvedValueOnce(response({ data: [{ id: 'scoped' }] }));
    expect(await fetch()).toEqual([{ id: 'anonymous' }]);
    vi.stubEnv(key, 'process-key');
    expect(await fetch()).toEqual([{ id: 'process' }]);
    expect(await fetch(env('scoped-key'))).toEqual([{ id: 'scoped' }]);
    expect(await fetch()).toEqual([{ id: 'process' }]);
    expect(await fetch(env('scoped-key'))).toEqual([{ id: 'scoped' }]);
    expect(fetchWithCache).toHaveBeenCalledTimes(3);
  });

  it('isolates failures from other accounts', async () => {
    vi.mocked(fetchWithCache)
      .mockResolvedValueOnce(response({ error: 'unauthorized' }, 401))
      .mockResolvedValueOnce(response({ data: [{ id: 'other-account' }] }));
    expect(await fetch(env('invalid-key'))).toEqual([]);
    expect(await fetch(env('valid-key'))).toEqual([{ id: 'other-account' }]);
    expect(await fetch(env('invalid-key'))).toEqual([]);
    expect(fetchWithCache).toHaveBeenCalledTimes(2);
  });

  it('isolates caller cache namespaces', async () => {
    vi.mocked(fetchWithCache)
      .mockResolvedValueOnce(response({ data: [{ id: 'first' }] }))
      .mockResolvedValueOnce(response({ data: [{ id: 'second' }] }));
    expect(await withCacheNamespace('first', () => fetch())).toEqual([{ id: 'first' }]);
    expect(await withCacheNamespace('second', () => fetch())).toEqual([{ id: 'second' }]);
    expect(await withCacheNamespace('first', () => fetch())).toEqual([{ id: 'first' }]);
  });

  it('coalesces concurrent requests only for the same account', async () => {
    vi.mocked(fetchWithCache).mockImplementation(async (_url, options) =>
      response({ data: [{ id: new Headers(options?.headers).get('Authorization') }] }),
    );
    const results = await Promise.all([fetch(env('one')), fetch(env('one')), fetch(env('two'))]);
    expect(results).toEqual([
      [{ id: 'Bearer one' }],
      [{ id: 'Bearer one' }],
      [{ id: 'Bearer two' }],
    ]);
    expect(fetchWithCache).toHaveBeenCalledTimes(2);
  });

  it('bounds retained account entries', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue(response({ data: [{ id: 'model' }] }));
    for (let i = 0; i <= 100; i++) {
      await fetch(env(`account-${i}`));
    }
    await fetch(env('account-100'));
    expect(fetchWithCache).toHaveBeenCalledTimes(101);
    await fetch(env('account-0'));
    expect(fetchWithCache).toHaveBeenCalledTimes(102);
  });

  it('honors disabled caching without replacing an existing entry', async () => {
    vi.mocked(fetchWithCache)
      .mockResolvedValueOnce(response({ data: [{ id: 'cached-model' }] }))
      .mockResolvedValue(response({ data: [{ id: 'fresh-model' }] }));
    expect(await fetch()).toEqual([{ id: 'cached-model' }]);
    await withCacheEnabled(false, async () => {
      expect(await fetch()).toEqual([{ id: 'fresh-model' }]);
      expect(await fetch()).toEqual([{ id: 'fresh-model' }]);
    });
    expect(await fetch()).toEqual([{ id: 'cached-model' }]);
    expect(fetchWithCache).toHaveBeenCalledTimes(3);
  });

  it('does not repopulate a cleared cache from an older in-flight request', async () => {
    let resolve!: (value: ReturnType<typeof response>) => void;
    vi.mocked(fetchWithCache)
      .mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      )
      .mockResolvedValueOnce(response({ data: [{ id: 'new-model' }] }));
    const pending = fetch();
    await vi.advanceTimersByTimeAsync(0);
    clear();
    expect(await fetch()).toEqual([{ id: 'new-model' }]);
    resolve(response({ data: [{ id: 'old-model' }] }));
    expect(await pending).toEqual([{ id: 'old-model' }]);
    expect(await fetch()).toEqual([{ id: 'new-model' }]);
  });

  it.each([
    { payload: { data: [{ id: 'model-a' }] } },
    { payload: { models: [{ model: 'model-a' }] } },
    { payload: [{ name: 'model-a' }] },
    { payload: ['model-a'] },
  ])('preserves supported response envelopes: %j', async ({ payload }) => {
    vi.mocked(fetchWithCache).mockResolvedValue(response(payload));
    expect(await fetch()).toEqual([{ id: 'model-a' }]);
  });
});

describe('provider-specific model identity', () => {
  it('preserves AIML aliases under the canonical ID without inventing duplicate models', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue(
      response({
        data: [{ id: 'vendor/canonical', aliases: ['alias', 'other-alias', 'alias'] }],
      }),
    );
    expect(await fetchAimlApiModels()).toEqual([
      { id: 'vendor/canonical', aliases: ['alias', 'other-alias'] },
    ]);
  });

  it.each([
    { aliases: 'alias' },
    { aliases: [null] },
    { aliases: [''] },
  ])('retries malformed AIML aliases: %j', async ({ aliases }) => {
    vi.mocked(fetchWithCache)
      .mockResolvedValueOnce(response({ data: [{ id: 'canonical', aliases }] }))
      .mockResolvedValueOnce(response({ data: [{ id: 'canonical', aliases: ['alias'] }] }));
    expect(await fetchAimlApiModels()).toEqual([]);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await fetchAimlApiModels()).toEqual([{ id: 'canonical', aliases: ['alias'] }]);
  });

  it('does not impose AIML alias fields on Comet models', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue(
      response({ data: [{ id: 'comet-model', aliases: 42 }] }),
    );
    expect(await fetchCometApiModels()).toEqual([{ id: 'comet-model' }]);
  });
});
