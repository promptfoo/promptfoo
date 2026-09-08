import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache, getCache, isCacheEnabled } from '../../src/cache';
import {
  ReplicateImageProvider,
  ReplicateModerationProvider,
  ReplicateProvider,
} from '../../src/providers/replicate';

vi.mock('../../src/cache', async (importOriginal) => ({
  ...(await importOriginal()),
  fetchWithCache: vi.fn(),
  getCache: vi.fn(),
  isCacheEnabled: vi.fn(),
}));
beforeEach(() => {
  vi.mocked(fetchWithCache).mockReset();
  vi.mocked(getCache).mockReset();
  vi.mocked(isCacheEnabled).mockReturnValue(false);
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());
function reply(status: string, output?: unknown) {
  return {
    data: { id: 'fixture-prediction', status, output },
    status: 200,
    statusText: 'OK',
    cached: false,
  };
}

describe.each([ReplicateProvider, ReplicateImageProvider])('%s local cancellation', (Provider) => {
  it('rejects an already-aborted call before cache or network access', async () => {
    const controller = new AbortController();
    controller.abort(new Error('fixture abort'));
    const provider = new Provider('owner/model:version', { config: { apiKey: 'fixture' } });
    await expect(
      provider.callApi('Hello', undefined, { abortSignal: controller.signal }),
    ).rejects.toThrow('fixture abort');
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
        (error) => String(error),
      );
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchWithCache).toHaveBeenCalledTimes(2);
    for (const [, request] of vi.mocked(fetchWithCache).mock.calls) {
      expect(request?.signal).toBe(controller.signal);
    }
    controller.abort();
    expect(await result).toContain('cancelled by user');
    await vi.advanceTimersByTimeAsync(2000);
    expect(fetchWithCache).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
    expect(
      vi.mocked(fetchWithCache).mock.calls.every(([url]) => !String(url).endsWith('/cancel')),
    ).toBe(true);
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
    const result = await new ReplicateModerationProvider('owner/model', {
      config: { apiKey: 'fixture' },
    }).callModerationApi('Hello', 'World', undefined, { abortSignal: controller.signal });
    expect(result.error).toContain('fixture abort');
    expect(fetchWithCache).not.toHaveBeenCalled();
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
