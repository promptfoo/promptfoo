import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import { HyperbolicAudioProvider } from '../../../src/providers/hyperbolic/audio';
import { HyperbolicImageProvider } from '../../../src/providers/hyperbolic/image';
import { createDeferred } from '../../util/utils';
import { createMockFetchResponse } from '../mockProviderResponses';

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
    'Invalid JSON response from API',
  ],
  [
    'image',
    () => new HyperbolicImageProvider('SDXL1.0-base', { config: { apiKey: 'fixture' } }),
    { images: [{ image: 'aW1hZ2U=' }] },
    'No images returned from API',
  ],
] as const)('Hyperbolic %s transport', (_name, create, data, invalidPayloadError) => {
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

  it.each([null, false, 0, '', 'invalid'])('reports a malformed JSON payload: %j', async (data) => {
    vi.mocked(fetchWithCache).mockResolvedValue({
      data,
      cached: false,
      status: 200,
      statusText: 'OK',
    });
    expect(await create().callApi('hello')).toEqual({ error: invalidPayloadError });
  });
});

describe.each([HyperbolicAudioProvider, HyperbolicImageProvider])('%s credentials', (Provider) => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ['explicit', 'scoped', 'named', 'default', 'explicit'],
    [undefined, 'scoped', 'named', 'default', 'scoped'],
    [undefined, undefined, 'named', 'default', 'named'],
    [undefined, undefined, undefined, 'default', 'default'],
    [undefined, undefined, undefined, undefined, 'ambient'],
    ['', 'scoped', 'named', 'default', ''],
    [undefined, '', 'named', 'default', ''],
    [undefined, undefined, '', 'default', ''],
    [undefined, undefined, undefined, '', ''],
  ])(
    'resolves key %j, named %j/%j and default %j',
    async (apiKey, scoped, named, fallback, expected) => {
      vi.stubEnv('HYPERBOLIC_API_KEY', 'ambient');
      vi.stubEnv('CUSTOM_HYPERBOLIC_KEY', named);
      const provider = new Provider('model', {
        config: { apiKey, apiKeyEnvar: 'CUSTOM_HYPERBOLIC_KEY' },
        env: { CUSTOM_HYPERBOLIC_KEY: scoped, HYPERBOLIC_API_KEY: fallback },
      });

      expect(provider.getApiKey()).toBe(expected);
      if (!expected) {
        await expect(provider.callApi('hello')).rejects.toThrow('Hyperbolic API key is not set');
        expect(fetchWithCache).not.toHaveBeenCalled();
        return;
      }
      vi.mocked(fetchWithCache).mockResolvedValue(
        createMockFetchResponse({ audio: 'YXVkaW8=', images: [{ image: 'aW1hZ2U=' }] }),
      );
      expect((await provider.callApi('hello')).error).toBeUndefined();
      expect(vi.mocked(fetchWithCache).mock.calls[0][1]?.headers).toMatchObject({
        Authorization: `Bearer ${expected}`,
      });
    },
  );
});
