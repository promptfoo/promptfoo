import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache, getCache, getCacheClearGeneration, isCacheEnabled } from '../../src/cache';
import {
  ReplicateImageProvider,
  ReplicateModerationProvider,
  ReplicateProvider,
} from '../../src/providers/replicate';

vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWithCache: vi.fn(),
  getCache: vi.fn(),
  getCacheClearGeneration: vi.fn(),
  isCacheEnabled: vi.fn(),
}));
beforeEach(() => {
  vi.mocked(fetchWithCache).mockReset();
  vi.mocked(getCache).mockReset();
  vi.mocked(getCacheClearGeneration).mockReset().mockReturnValue(0);
  vi.mocked(isCacheEnabled).mockReset().mockReturnValue(false);
  vi.useFakeTimers();
});
afterEach(() => {
  vi.resetAllMocks();
  vi.useRealTimers();
});
function reply(status: string, output?: unknown) {
  return {
    data: { id: 'fixture-prediction', status, output },
    status: 200,
    statusText: 'OK',
    cached: false,
  };
}

it.each([
  [ReplicateProvider, 'shared output'],
  [ReplicateImageProvider, 'https://example.invalid/shared.png'],
])(
  'shares a cached %s prediction across row signals while cancelling only its caller',
  async (Provider, output) => {
    vi.mocked(isCacheEnabled).mockReturnValue(true);
    vi.mocked(getCache).mockReturnValue({ get: vi.fn(), set: vi.fn() } as any);
    let finish!: (value: ReturnType<typeof reply>) => void;
    vi.mocked(fetchWithCache).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const provider = new Provider('owner/model', { config: { apiKey: 'fixture' } });
    const first = new AbortController();
    const second = new AbortController();
    const result1 = provider.callApi('Hello', undefined, { abortSignal: first.signal });
    const result2 = provider.callApi('Hello', undefined, { abortSignal: second.signal });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchWithCache).toHaveBeenCalledTimes(1);
    const sharedSignal = vi.mocked(fetchWithCache).mock.calls[0][1]?.signal;
    expect(sharedSignal).toBeInstanceOf(AbortSignal);
    first.abort();
    await expect(result1).rejects.toMatchObject({ name: 'AbortError' });
    expect(sharedSignal?.aborted).toBe(false);
    finish(reply('succeeded', output));
    const surviving = await result2;
    expect(surviving).toMatchObject({ output: expect.stringContaining(output) });
    if (Provider === ReplicateProvider) {
      expect(surviving.tokenUsage?.numRequests).toBe(1);
    } else {
      expect(surviving.cached).toBe(false);
    }
  },
);

it('counts only the creator when concurrent rows share a prediction', async () => {
  vi.mocked(isCacheEnabled).mockReturnValue(true);
  vi.mocked(getCache).mockReturnValue({ get: vi.fn(), set: vi.fn() } as any);
  let finish!: (value: ReturnType<typeof reply>) => void;
  vi.mocked(fetchWithCache).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const provider = new ReplicateProvider('owner/model', { config: { apiKey: 'fixture' } });
  const first = provider.callApi('Hello', undefined, { abortSignal: new AbortController().signal });
  const second = provider.callApi('Hello', undefined, {
    abortSignal: new AbortController().signal,
  });
  await vi.advanceTimersByTimeAsync(0);
  expect(fetchWithCache).toHaveBeenCalledTimes(1);
  finish(reply('succeeded', 'shared output'));
  expect((await first).tokenUsage?.numRequests).toBe(1);
  expect((await second).tokenUsage?.numRequests).toBe(0);
});

it.each(['both-succeed', 'creator-aborts', 'all-abort'] as const)(
  'keeps prediction ownership and cleanup across a late joiner: %s',
  async (scenario) => {
    vi.mocked(isCacheEnabled).mockReturnValue(true);
    vi.mocked(getCache).mockReturnValue({ get: vi.fn(), set: vi.fn() } as any);
    const polls: Array<(response: ReturnType<typeof reply>) => void> = [];
    vi.mocked(fetchWithCache).mockImplementation((_url, request) =>
      request?.method === 'POST'
        ? Promise.resolve(reply('processing'))
        : new Promise((resolve, reject) => {
            request?.signal?.addEventListener('abort', () => reject(request.signal?.reason));
            polls.push(resolve);
          }),
    );
    const provider = new ReplicateProvider('owner/model', { config: { apiKey: 'fixture' } });
    const controller = new AbortController();
    const first = provider.callApi('Hello', undefined, { abortSignal: controller.signal });
    await vi.advanceTimersByTimeAsync(0);
    const lateController = new AbortController();
    const late = provider.callApi('Hello', undefined, { abortSignal: lateController.signal });
    await vi.advanceTimersByTimeAsync(0);
    expect(polls).toHaveLength(2);
    if (scenario === 'both-succeed') {
      polls.forEach((resolve) => resolve(reply('succeeded', 'shared output')));
      const results = await Promise.all([first, late]);
      expect(results.map((result) => result.tokenUsage?.numRequests).sort()).toEqual([0, 1]);
    } else {
      controller.abort();
      await expect(first).rejects.toMatchObject({ name: 'AbortError' });
      if (scenario === 'all-abort') {
        lateController.abort();
        await expect(late).rejects.toMatchObject({ name: 'AbortError' });
        const nextController = new AbortController();
        const next = provider.callApi('Hello', undefined, { abortSignal: nextController.signal });
        await vi.advanceTimersByTimeAsync(0);
        expect(
          vi.mocked(fetchWithCache).mock.calls.filter(([, request]) => request?.method === 'POST'),
        ).toHaveLength(2);
        nextController.abort();
        await expect(next).rejects.toMatchObject({ name: 'AbortError' });
        return;
      }
      polls[1](reply('succeeded', 'shared output'));
      expect((await late).tokenUsage?.numRequests).toBe(1);
    }
    expect(
      vi.mocked(fetchWithCache).mock.calls.filter(([, request]) => request?.method === 'POST'),
    ).toHaveLength(1);
  },
);

it.each([ReplicateProvider, ReplicateImageProvider])(
  '%s avoids creating a prediction when cancelled during cache lookup',
  async (Provider) => {
    vi.mocked(isCacheEnabled).mockReturnValue(true);
    let finishCache!: (value: undefined) => void;
    vi.mocked(getCache).mockReturnValue({
      get: vi.fn(
        () =>
          new Promise((resolve) => {
            finishCache = resolve;
          }),
      ),
      set: vi.fn(),
    } as any);
    const controller = new AbortController();
    const result = new Provider('owner/model', { config: { apiKey: 'fixture' } }).callApi(
      'Hello',
      undefined,
      { abortSignal: controller.signal },
    );
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    finishCache(undefined);
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetchWithCache).not.toHaveBeenCalled();
  },
);

it('caches an image completed by polling after replaying an incomplete creation', async () => {
  vi.mocked(isCacheEnabled).mockReturnValue(true);
  const cache = { get: vi.fn(), set: vi.fn() };
  vi.mocked(getCache).mockReturnValue(cache as any);
  vi.mocked(fetchWithCache)
    .mockResolvedValueOnce({ ...reply('processing'), cached: true })
    .mockResolvedValueOnce(reply('succeeded', ['https://example.invalid/complete.png']));
  const provider = new ReplicateImageProvider('owner/model', { config: { apiKey: 'fixture' } });
  const result = await provider.callApi('Hello');
  expect(result).toMatchObject({ cached: false, output: expect.stringContaining('complete.png') });
  expect(cache.set).toHaveBeenCalledWith(
    expect.any(String),
    JSON.stringify(['https://example.invalid/complete.png']),
  );
  cache.get.mockResolvedValueOnce(cache.set.mock.calls[0][1]);
  expect(await provider.callApi('Hello')).toMatchObject({ cached: true });
  expect(fetchWithCache).toHaveBeenCalledTimes(2);
});

it('starts a new prediction after the cache is cleared', async () => {
  vi.mocked(isCacheEnabled).mockReturnValue(true);
  vi.mocked(getCache).mockReturnValue({ get: vi.fn(), set: vi.fn() } as any);
  vi.mocked(fetchWithCache).mockImplementation(() => new Promise(() => {}));
  const provider = new ReplicateProvider('owner/model', { config: { apiKey: 'fixture' } });
  const firstSignal = new AbortController();
  const first = provider.callApi('Hello', undefined, { abortSignal: firstSignal.signal });
  await vi.advanceTimersByTimeAsync(0);
  vi.mocked(getCacheClearGeneration).mockReturnValue(1);
  const secondSignal = new AbortController();
  const second = provider.callApi('Hello', undefined, { abortSignal: secondSignal.signal });
  await vi.advanceTimersByTimeAsync(0);
  expect(fetchWithCache).toHaveBeenCalledTimes(2);
  firstSignal.abort();
  secondSignal.abort();
  await expect(first).rejects.toMatchObject({ name: 'AbortError' });
  await expect(second).rejects.toMatchObject({ name: 'AbortError' });
});

it('aborts an unneeded shared prediction and allows a fresh creation', async () => {
  vi.mocked(isCacheEnabled).mockReturnValue(true);
  vi.mocked(getCache).mockReturnValue({ get: vi.fn(), set: vi.fn() } as any);
  vi.mocked(fetchWithCache).mockImplementation(
    (_url, request) =>
      new Promise((_resolve, reject) => {
        request?.signal?.addEventListener('abort', () => reject(request.signal?.reason), {
          once: true,
        });
      }),
  );
  const provider = new ReplicateProvider('owner/model', { config: { apiKey: 'fixture' } });
  const first = new AbortController();
  const second = new AbortController();
  const result1 = provider.callApi('Hello', undefined, { abortSignal: first.signal });
  const result2 = provider.callApi('Hello', undefined, { abortSignal: second.signal });
  await vi.advanceTimersByTimeAsync(0);
  const sharedSignal = vi.mocked(fetchWithCache).mock.calls[0][1]?.signal;
  first.abort();
  await expect(result1).rejects.toMatchObject({ name: 'AbortError' });
  expect(sharedSignal?.aborted).toBe(false);
  second.abort();
  await expect(result2).rejects.toMatchObject({ name: 'AbortError' });
  expect(sharedSignal?.aborted).toBe(true);
  const third = new AbortController();
  const result3 = provider.callApi('Hello', undefined, { abortSignal: third.signal });
  await vi.advanceTimersByTimeAsync(0);
  expect(fetchWithCache).toHaveBeenCalledTimes(2);
  third.abort();
  await expect(result3).rejects.toMatchObject({ name: 'AbortError' });
});

describe.each([ReplicateProvider, ReplicateImageProvider])('%s local cancellation', (Provider) => {
  it('rejects an already-aborted call before cache or network access', async () => {
    const controller = new AbortController();
    controller.abort(new Error('fixture abort'));
    const provider = new Provider('owner/model:version', { config: { apiKey: 'fixture' } });
    await expect(
      provider.callApi('Hello', undefined, { abortSignal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError', message: 'fixture abort' });
    expect(fetchWithCache).not.toHaveBeenCalled();
    expect(getCache).not.toHaveBeenCalled();
  });

  it.each(['owner/model', 'owner/model:version'])(
    'forwards signal while preserving %s creation and output',
    async (model) => {
      vi.mocked(fetchWithCache).mockResolvedValue(
        reply('succeeded', 'https://example.invalid/fixture.png'),
      );
      const signal = new AbortController().signal;
      const response = await new Provider(model, { config: { apiKey: 'fixture' } }).callApi(
        'Hello',
        undefined,
        { abortSignal: signal },
      );
      expect(response.output).toContain('https://example.invalid/fixture.png');
      expect(fetchWithCache).toHaveBeenCalledWith(
        model.includes(':')
          ? 'https://api.replicate.com/v1/predictions'
          : 'https://api.replicate.com/v1/models/owner/model/predictions',
        expect.objectContaining({
          method: 'POST',
          signal,
          headers: expect.objectContaining({ Prefer: 'wait=60' }),
        }),
        expect.any(Number),
        'json',
      );
    },
  );

  it('stops during the polling delay without cancelling a remote prediction', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue(reply('processing'));
    const controller = new AbortController();
    const result = new Provider('owner/model', { config: { apiKey: 'fixture' } })
      .callApi('Hello', undefined, { abortSignal: controller.signal })
      .then(
        (response) => response.error,
        (error) => error,
      );
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchWithCache).toHaveBeenCalledTimes(2);
    for (const [, request] of vi.mocked(fetchWithCache).mock.calls) {
      expect(request?.signal).toBe(controller.signal);
    }
    controller.abort();
    expect(await result).toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchWithCache).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
    expect(
      vi.mocked(fetchWithCache).mock.calls.every(([url]) => !String(url).endsWith('/cancel')),
    ).toBe(true);
  });

  it('preserves an in-flight transport AbortError', async () => {
    const error = new Error('transport aborted');
    error.name = 'AbortError';
    vi.mocked(fetchWithCache).mockRejectedValue(error);
    await expect(
      new Provider('owner/model', { config: { apiKey: 'fixture' } }).callApi('Hello'),
    ).rejects.toBe(error);
  });

  it('finishes an un-aborted prediction using the shared polling path', async () => {
    vi.mocked(fetchWithCache)
      .mockResolvedValueOnce(reply('processing'))
      .mockResolvedValueOnce(reply('succeeded', 'https://example.invalid/fixture.png'));
    const signal = new AbortController().signal;
    const response = await new Provider('owner/model', { config: { apiKey: 'fixture' } }).callApi(
      'Hello',
      undefined,
      { abortSignal: signal },
    );
    expect(response.output).toContain('https://example.invalid/fixture.png');
    expect(fetchWithCache).toHaveBeenLastCalledWith(
      'https://api.replicate.com/v1/predictions/fixture-prediction',
      expect.objectContaining({ method: 'GET', signal }),
      expect.any(Number),
      'json',
      true,
    );
  });
});

describe('Replicate moderation cancellation', () => {
  it('forwards cancellation to its prediction call', async () => {
    const controller = new AbortController();
    controller.abort(new Error('fixture abort'));
    const result = new ReplicateModerationProvider('owner/model', {
      config: { apiKey: 'fixture' },
    }).callModerationApi('Hello', 'World', undefined, { abortSignal: controller.signal });
    await expect(result).rejects.toMatchObject({ name: 'AbortError', message: 'fixture abort' });
    expect(fetchWithCache).not.toHaveBeenCalled();
  });

  it('cancels moderation polling when call options carry a signal', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue(reply('processing'));
    const controller = new AbortController();
    const provider = new ReplicateModerationProvider('owner/model', {
      config: { apiKey: 'fixture' },
    });
    const result = provider
      .callModerationApi('Hello', 'World', undefined, {
        abortSignal: controller.signal,
      })
      .catch((error) => error);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchWithCache).toHaveBeenCalledTimes(2);
    controller.abort(new Error('fixture matcher abort'));
    expect(await result).toMatchObject({ name: 'AbortError', message: 'fixture matcher abort' });
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchWithCache).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
    expect(
      vi
        .mocked(fetchWithCache)
        .mock.calls.every(([, request]) => request?.signal === controller.signal),
    ).toBe(true);
  });

  it('preserves successful moderation with an explicit signal', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue(reply('succeeded', 'safe'));
    const explicitSignal = new AbortController().signal;
    const provider = new ReplicateModerationProvider('owner/model', {
      config: { apiKey: 'fixture' },
    });
    await expect(
      provider.callModerationApi('Hello', 'World', undefined, { abortSignal: explicitSignal }),
    ).resolves.toMatchObject({ flags: [] });
    expect(vi.mocked(fetchWithCache).mock.calls[0][1]?.signal).toBe(explicitSignal);
  });

  it('reports transport failures as API errors rather than malformed moderation', async () => {
    vi.mocked(fetchWithCache).mockRejectedValue(new Error('fixture transport failure'));
    const provider = new ReplicateModerationProvider('owner/model', {
      config: { apiKey: 'fixture' },
    });
    await expect(provider.callModerationApi('Hello', 'World')).resolves.toMatchObject({
      error: 'API call error: Error: fixture transport failure',
    });
  });

  it('preserves transport aborts through moderation parsing', async () => {
    const error = new Error('transport aborted');
    error.name = 'AbortError';
    vi.mocked(fetchWithCache).mockRejectedValue(error);
    const provider = new ReplicateModerationProvider('owner/model', {
      config: { apiKey: 'fixture' },
    });
    await expect(provider.callModerationApi('Hello', 'World')).rejects.toBe(error);
  });

  it('identifies a rejected prediction call as an API failure', async () => {
    const provider = new ReplicateModerationProvider('owner/model', {
      config: { apiKey: 'fixture' },
    });
    vi.spyOn(provider, 'callApi').mockRejectedValue(new Error('fixture configuration failure'));
    await expect(provider.callModerationApi('Hello', 'World')).resolves.toEqual({
      error: 'API call error: Error: fixture configuration failure',
    });
  });

  it('preserves moderation parsing on a successful signalled call', async () => {
    vi.mocked(fetchWithCache).mockResolvedValue(reply('succeeded', 'unsafe\nS1,S2'));
    const signal = new AbortController().signal;
    const result = await new ReplicateModerationProvider('owner/model', {
      config: { apiKey: 'fixture' },
    }).callModerationApi('Hello', 'World', undefined, { abortSignal: signal });
    expect(result.flags?.map((flag) => flag.code)).toEqual(['S1', 'S2']);
    expect(vi.mocked(fetchWithCache).mock.calls[0][1]?.signal).toBe(signal);
  });
});
