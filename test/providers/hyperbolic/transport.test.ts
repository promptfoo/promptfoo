import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import { HyperbolicAudioProvider } from '../../../src/providers/hyperbolic/audio';
import { HyperbolicImageProvider } from '../../../src/providers/hyperbolic/image';
import { createDeferred } from '../../util/utils';

vi.mock('../../../src/cache');
vi.mock('../../../src/logger');
beforeEach(() => {
  vi.mocked(fetchWithCache).mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe.each([
  [
    'audio',
    () => new HyperbolicAudioProvider('Melo-TTS', { config: { apiKey: 'fixture' } }),
    { audio: 'YXVkaW8=' },
  ],
  [
    'image',
    () => new HyperbolicImageProvider('SDXL1.0-base', { config: { apiKey: 'fixture' } }),
    { images: [{ image: 'aW1hZ2U=' }] },
  ],
] as const)('Hyperbolic %s transport', (_name, create, data) => {
  it.each([{ bustCache: true }, { debug: true }, { bustCache: false, debug: true }])(
    'forwards cancellation and cache policy %j',
    async (policy) => {
      const controller = new AbortController();
      vi.mocked(fetchWithCache).mockResolvedValue({
        data,
        cached: true,
        status: 200,
        statusText: 'OK',
        latencyMs: 12,
      });
      const response = await create().callApi(
        'hello',
        { prompt: { raw: 'hello', label: 'hello' }, vars: {}, ...policy },
        { abortSignal: controller.signal },
      );
      expect(response).toMatchObject({ cached: true, latencyMs: 12, cost: 0 });
      const request = vi.mocked(fetchWithCache).mock.calls[0];
      expect(request[1]?.signal).toBe(controller.signal);
      expect(request[4]).toBe(policy.bustCache ?? policy.debug ?? false);
    },
  );

  it('does not dispatch a cancelled request', async () => {
    await expect(
      create().callApi('hello', undefined, {
        abortSignal: AbortSignal.abort(new Error('cancelled')),
      }),
    ).rejects.toThrow('cancelled');
    expect(fetchWithCache).not.toHaveBeenCalled();
  });

  it('propagates transport cancellation', async () => {
    const controller = new AbortController();
    const started = createDeferred<void>();
    vi.mocked(fetchWithCache).mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), {
            once: true,
          });
          started.resolve();
        }),
    );
    const pending = create().callApi('hello', undefined, { abortSignal: controller.signal });
    await started.promise;
    controller.abort(new Error('cancelled transport'));
    await expect(pending).rejects.toThrow('cancelled transport');
  });

  it('rejects a cached response when cancellation happens during cache lookup', async () => {
    const controller = new AbortController();
    const cached = createDeferred<Awaited<ReturnType<typeof fetchWithCache>>>();
    vi.mocked(fetchWithCache).mockReturnValueOnce(cached.promise);
    const pending = create().callApi('hello', undefined, { abortSignal: controller.signal });
    await vi.waitFor(() => expect(fetchWithCache).toHaveBeenCalledOnce());
    controller.abort(new Error('cancelled cache lookup'));
    cached.resolve({ data, cached: true, status: 200, statusText: 'OK' });
    await expect(pending).rejects.toThrow('cancelled cache lookup');
  });

  it.each([null, 'invalid'])('reports a malformed JSON payload: %j', async (data) => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data,
      cached: false,
      status: 200,
      statusText: 'OK',
    });
    expect(await create().callApi('hello')).toEqual({ error: 'Invalid JSON response from API' });
  });
});
