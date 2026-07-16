import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCache, getScopedCacheKey, isCacheEnabled } from '../../../src/cache';
import { OpenAiTtsProvider } from '../../../src/providers/openai/tts';
import { HttpRateLimitError } from '../../../src/util/fetch/errors';
import { fetchWithRetries } from '../../../src/util/fetch/index';
import { mockProcessEnv } from '../../util/utils';

vi.mock('../../../src/cache.ts');
vi.mock('../../../src/util/fetch/index.ts');

const mockedFetch = vi.mocked(fetchWithRetries);
const mockedGetCache = vi.mocked(getCache);
const mockedIsCacheEnabled = vi.mocked(isCacheEnabled);
const mockedGetScopedCacheKey = vi.mocked(getScopedCacheKey);

function audioResponse(bytes = new Uint8Array([1, 2, 3, 4])) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    arrayBuffer: async () => bytes.buffer,
  } as Response;
}

describe('OpenAiTtsProvider', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockedIsCacheEnabled.mockReturnValue(false);
    mockedGetScopedCacheKey.mockImplementation((cacheKey) => cacheKey);
  });

  it.each([
    'gpt-4o-mini-tts',
    'gpt-4o-mini-tts-2025-12-15',
    'gpt-4o-mini-tts-2025-03-20',
    'tts-1',
    'tts-1-1106',
    'tts-1-hd',
    'tts-1-hd-1106',
  ])('sends model %s to /v1/audio/speech and returns playable audio', async (model) => {
    mockedFetch.mockResolvedValue(audioResponse());
    const provider = new OpenAiTtsProvider(model, { config: { apiKey: 'test-key' } });

    const result = await provider.callApi('Hello from promptfoo');

    expect(mockedFetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/audio/speech',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-key' }),
        body: JSON.stringify({ model, input: 'Hello from promptfoo', voice: 'alloy' }),
      }),
      expect.any(Number),
      undefined,
    );
    expect(result).toMatchObject({
      output: 'Generated 20 characters of speech',
      audio: { data: 'AQIDBA==', format: 'mp3' },
      cached: false,
    });
  });

  it('passes supported speech controls through to the API', async () => {
    mockedFetch.mockResolvedValue(audioResponse());
    const provider = new OpenAiTtsProvider('gpt-4o-mini-tts', {
      config: {
        apiKey: 'test-key',
        voice: 'coral',
        instructions: 'Speak warmly and clearly.',
        response_format: 'wav',
        speed: 1.25,
      },
    });

    const result = await provider.callApi('Welcome');

    expect(JSON.parse(mockedFetch.mock.calls[0][1]?.body as string)).toEqual({
      model: 'gpt-4o-mini-tts',
      input: 'Welcome',
      voice: 'coral',
      instructions: 'Speak warmly and clearly.',
      response_format: 'wav',
      speed: 1.25,
    });
    expect(result.audio?.format).toBe('wav');
  });

  it('passes the configured retry limit to the shared retry helper', async () => {
    mockedFetch.mockResolvedValue(audioResponse());
    const provider = new OpenAiTtsProvider('gpt-4o-mini-tts', {
      config: { apiKey: 'test-key', maxRetries: 2 },
    });

    await provider.callApi('Retry temporary rate limits');

    expect(mockedFetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/audio/speech',
      expect.any(Object),
      expect.any(Number),
      2,
    );
  });

  it('lets lowercase custom headers replace the default speech headers', async () => {
    mockedFetch.mockResolvedValue(audioResponse());
    const provider = new OpenAiTtsProvider('tts-1', {
      config: {
        apiKey: 'default-key',
        headers: { authorization: 'Bearer gateway-key', 'content-type': 'application/json' },
      },
    });

    await provider.callApi('Use the gateway credentials');

    const headers = new Headers(mockedFetch.mock.calls[0][1]?.headers);
    expect(headers.get('authorization')).toBe('Bearer gateway-key');
    expect(headers.get('content-type')).toBe('application/json');
  });

  it('forwards passthrough speech options', async () => {
    mockedFetch.mockResolvedValue(audioResponse());
    const provider = new OpenAiTtsProvider('gpt-4o-mini-tts', {
      config: { apiKey: 'test-key', passthrough: { custom_gateway_option: 'must-arrive' } } as any,
    });

    await provider.callApi('Forward this option');

    expect(JSON.parse(mockedFetch.mock.calls[0][1]?.body as string)).toMatchObject({
      custom_gateway_option: 'must-arrive',
    });
  });

  it('wraps PCM returned from a passthrough response_format override as playable WAV', async () => {
    mockedFetch.mockResolvedValue(audioResponse(new Uint8Array([1, 0, 2, 0])));
    const provider = new OpenAiTtsProvider('gpt-4o-mini-tts', {
      config: { apiKey: 'test-key', passthrough: { response_format: 'pcm' } } as any,
    });

    const result = await provider.callApi('Return PCM through passthrough');

    expect(result.audio?.format).toBe('wav');
    expect(
      Buffer.from(result.audio?.data ?? '', 'base64')
        .subarray(0, 4)
        .toString(),
    ).toBe('RIFF');
  });

  it('does not create speech for an already-aborted eval', async () => {
    const controller = new AbortController();
    controller.abort();
    const provider = new OpenAiTtsProvider('gpt-4o-mini-tts', {
      config: { apiKey: 'test-key' },
    });

    await expect(
      provider.callApi('Cancelled speech', undefined, { abortSignal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('normalizes a pre-aborted custom speech reason to AbortError', async () => {
    const controller = new AbortController();
    controller.abort(new Error('caller cancelled before dispatch'));
    const provider = new OpenAiTtsProvider('gpt-4o-mini-tts', { config: { apiKey: 'test-key' } });

    await expect(
      provider.callApi('Cancelled speech', undefined, { abortSignal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError', message: 'caller cancelled before dispatch' });
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('forwards the eval abort signal to speech requests', async () => {
    const controller = new AbortController();
    mockedFetch.mockResolvedValue(audioResponse());
    const provider = new OpenAiTtsProvider('gpt-4o-mini-tts', {
      config: { apiKey: 'test-key' },
    });

    await provider.callApi('Cancellable speech', undefined, { abortSignal: controller.signal });

    expect(mockedFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: controller.signal }),
      expect.any(Number),
      undefined,
    );
  });

  it('preserves rate-limit metadata so the scheduler honors Retry-After', async () => {
    mockedFetch.mockRejectedValue(
      new HttpRateLimitError({
        status: 429,
        statusText: 'Too Many Requests',
        code: 'rate_limit_exceeded',
        retryAfterMs: 120000,
        headers: { 'retry-after': '120' },
      }),
    );
    const provider = new OpenAiTtsProvider('tts-1', { config: { apiKey: 'test-key' } });

    const result = await provider.callApi('Retry later');

    expect(result.error).toContain('Rate limit exceeded');
    expect(result.metadata).toEqual({
      rateLimitKind: 'rate_limit',
      http: {
        status: 429,
        statusText: 'Too Many Requests',
        headers: { 'retry-after': '120' },
      },
    });
  });

  it('passes an uploaded custom voice ID through to the speech API', async () => {
    mockedFetch.mockResolvedValue(audioResponse());
    const provider = new OpenAiTtsProvider('gpt-4o-mini-tts', {
      config: { apiKey: 'test-key', voice: { id: 'voice_123' } },
    });

    await provider.callApi('Welcome');

    expect(JSON.parse(mockedFetch.mock.calls[0][1]?.body as string)).toMatchObject({
      voice: { id: 'voice_123' },
    });
  });

  it('forwards the current custom-voice language and format controls', async () => {
    mockedFetch.mockResolvedValue(audioResponse());
    const provider = new OpenAiTtsProvider('gpt-4o-mini-tts', {
      config: {
        apiKey: 'test-key',
        voice: { id: 'voice_123' },
        language: 'fr',
        format: 'wav',
      },
    });

    const result = await provider.callApi('Bienvenue');

    expect(JSON.parse(mockedFetch.mock.calls[0][1]?.body as string)).toEqual({
      model: 'gpt-4o-mini-tts',
      input: 'Bienvenue',
      voice: { id: 'voice_123' },
      language: 'fr',
      format: 'wav',
    });
    expect(result.audio?.format).toBe('wav');
  });

  it('wraps raw PCM16 speech in WAV so the results UI can play it', async () => {
    mockedFetch.mockResolvedValue(audioResponse(new Uint8Array([1, 0, 2, 0, 3, 0, 4, 0])));
    const provider = new OpenAiTtsProvider('gpt-4o-mini-tts', {
      config: { apiKey: 'test-key', response_format: 'pcm' },
    });

    const result = await provider.callApi('Playable PCM');
    const wav = Buffer.from(result.audio?.data ?? '', 'base64');

    expect(result.audio?.format).toBe('wav');
    expect(wav.subarray(0, 4).toString()).toBe('RIFF');
    expect(wav.subarray(8, 12).toString()).toBe('WAVE');
    expect(wav.readUInt32LE(24)).toBe(24_000);
    expect(wav.subarray(44)).toEqual(Buffer.from([1, 0, 2, 0, 3, 0, 4, 0]));
  });

  it.each([
    ['tts-1', 15],
    ['tts-1-1106', 15],
    ['tts-1-hd', 30],
    ['tts-1-hd-1106', 30],
  ])('reports the documented per-character cost for %s', async (model, dollarsPerMillion) => {
    mockedFetch.mockResolvedValue(audioResponse());
    const prompt = 'a'.repeat(1000);
    const provider = new OpenAiTtsProvider(model, { config: { apiKey: 'test-key' } });

    const result = await provider.callApi(prompt);

    expect(result.cost).toBeCloseTo((1000 * dollarsPerMillion) / 1e6, 10);
  });

  it('does not invent a GPT-4o mini TTS cost when the binary speech response has no usage', async () => {
    mockedFetch.mockResolvedValue(audioResponse());
    const provider = new OpenAiTtsProvider('gpt-4o-mini-tts', { config: { apiKey: 'test-key' } });

    const result = await provider.callApi('Hello');

    expect(result.cost).toBeUndefined();
  });

  it('counts Unicode code points for the speech character limit and legacy billing', async () => {
    mockedFetch.mockResolvedValue(audioResponse());
    const prompt = '😀'.repeat(2049);
    const provider = new OpenAiTtsProvider('tts-1', { config: { apiKey: 'test-key' } });

    const result = await provider.callApi(prompt);

    expect(result.error).toBeUndefined();
    expect(result.output).toBe('Generated 2049 characters of speech');
    expect(result.cost).toBeCloseTo((2049 * 15) / 1e6, 10);
    expect(mockedFetch).toHaveBeenCalledOnce();
  });

  it('caches successful speech responses and does not double-bill a cache hit', async () => {
    const values = new Map<string, string>();
    const cache = {
      get: vi.fn(async (key: string) => values.get(key)),
      set: vi.fn(async (key: string, value: string) => values.set(key, value)),
    };
    mockedIsCacheEnabled.mockReturnValue(true);
    mockedGetCache.mockReturnValue(cache as any);
    mockedFetch.mockResolvedValue(audioResponse());
    const provider = new OpenAiTtsProvider('tts-1', { config: { apiKey: 'test-key' } });

    const first = await provider.callApi('Cache this speech');
    const second = await provider.callApi('Cache this speech');
    const busted = await provider.callApi('Cache this speech', { bustCache: true } as any);

    expect(first.cached).toBe(false);
    expect(first.cost).toBeGreaterThan(0);
    expect(second).toMatchObject({ cached: true, cost: 0, audio: first.audio });
    expect(busted.cached).toBe(false);
    expect(mockedFetch).toHaveBeenCalledTimes(2);
    expect(cache.set).toHaveBeenCalledTimes(2);
  });

  it('keeps custom-header tenants isolated without using secret auth headers in the cache key', async () => {
    const values = new Map<string, string>();
    const cache = {
      get: vi.fn(async (key: string) => values.get(key)),
      set: vi.fn(async (key: string, value: string) => values.set(key, value)),
    };
    mockedIsCacheEnabled.mockReturnValue(true);
    mockedGetCache.mockReturnValue(cache as any);
    mockedFetch.mockImplementation(async (_url, options) => {
      const tenant = (options?.headers as Record<string, string>)['X-Tenant-Id'];
      return audioResponse(new TextEncoder().encode(`audio-for-${tenant}`));
    });

    const firstTenant = new OpenAiTtsProvider('tts-1', {
      config: {
        apiKey: 'test-key',
        headers: { 'X-Tenant-Id': 'tenant-a', Authorization: 'Bearer secret-a' },
      },
    });
    const secondTenant = new OpenAiTtsProvider('tts-1', {
      config: {
        apiKey: 'test-key',
        headers: { 'X-Tenant-Id': 'tenant-b', Authorization: 'Bearer secret-b' },
      },
    });
    const rotatedSecret = new OpenAiTtsProvider('tts-1', {
      config: {
        apiKey: 'test-key',
        headers: { 'X-Tenant-Id': 'tenant-a', Authorization: 'Bearer secret-c' },
      },
    });

    const first = await firstTenant.callApi('same input');
    const second = await secondTenant.callApi('same input');
    const rotated = await rotatedSecret.callApi('same input');

    expect(Buffer.from(first.audio?.data ?? '', 'base64').toString()).toBe('audio-for-tenant-a');
    expect(Buffer.from(second.audio?.data ?? '', 'base64').toString()).toBe('audio-for-tenant-b');
    expect(second.cached).toBe(false);
    expect(rotated.cached).toBe(false);
    expect(mockedFetch).toHaveBeenCalledTimes(3);
  });

  it('isolates speech cached with different per-prompt gateway credentials in one tenant', async () => {
    const values = new Map<string, string>();
    const cache = {
      get: vi.fn(async (key: string) => values.get(key)),
      set: vi.fn(async (key: string, value: string) => values.set(key, value)),
    };
    mockedIsCacheEnabled.mockReturnValue(true);
    mockedGetCache.mockReturnValue(cache as any);
    mockedFetch.mockImplementation(async (_url, options) => {
      const authorization = new Headers(options?.headers).get('authorization');
      return audioResponse(new TextEncoder().encode(`audio-for-${authorization}`));
    });
    const provider = new OpenAiTtsProvider('tts-1', {
      config: { apiBaseUrl: 'https://gateway.example/v1', headers: { 'X-Tenant-Id': 'tenant-a' } },
    });
    const context = (authorization: string) =>
      ({ prompt: { config: { headers: { authorization, 'X-Tenant-Id': 'tenant-a' } } } }) as any;

    const [first, second] = await Promise.all([
      provider.callApi('same input', context('Bearer user-a')),
      provider.callApi('same input', context('Bearer user-b')),
    ]);

    expect(Buffer.from(first.audio?.data ?? '', 'base64').toString()).toBe(
      'audio-for-Bearer user-a',
    );
    expect(Buffer.from(second.audio?.data ?? '', 'base64').toString()).toBe(
      'audio-for-Bearer user-b',
    );
    expect(mockedFetch).toHaveBeenCalledTimes(2);
    expect(cache.set.mock.calls[0]?.[0]).not.toBe(cache.set.mock.calls[1]?.[0]);
  });

  it('does not persist speech containing an embedded credential-bearing URL', async () => {
    const cache = { get: vi.fn(), set: vi.fn() };
    mockedIsCacheEnabled.mockReturnValue(true);
    mockedGetCache.mockReturnValue(cache as any);
    mockedFetch.mockResolvedValue(audioResponse());
    const provider = new OpenAiTtsProvider('tts-1', { config: { apiKey: 'test-key' } });

    await provider.callApi('Read this link: https://files.example/report?access_token=tenant-a');
    await provider.callApi('Read this link: https://files.example/report?access_token=tenant-a');

    expect(mockedFetch).toHaveBeenCalledTimes(2);
    expect(cache.get).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('coalesces concurrent identical speech requests into one paid call', async () => {
    const values = new Map<string, string>();
    const cache = {
      get: vi.fn(async (key: string) => values.get(key)),
      set: vi.fn(async (key: string, value: string) => values.set(key, value)),
    };
    mockedIsCacheEnabled.mockReturnValue(true);
    mockedGetCache.mockReturnValue(cache as any);
    mockedFetch.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return audioResponse();
    });
    const provider = new OpenAiTtsProvider('tts-1', { config: { apiKey: 'test-key' } });

    const results = await Promise.all([
      provider.callApi('same input'),
      provider.callApi('same input'),
      provider.callApi('same input'),
    ]);

    expect(mockedFetch).toHaveBeenCalledOnce();
    expect(results.filter((result) => result.cached === false)).toHaveLength(1);
    expect(results.filter((result) => result.cached === true)).toHaveLength(2);
    expect(results.filter((result) => result.cost === 0)).toHaveLength(2);
  });

  it('does not coalesce independently cancellable speech requests', async () => {
    mockedIsCacheEnabled.mockReturnValue(true);
    mockedGetCache.mockReturnValue({ get: vi.fn(), set: vi.fn() } as any);
    mockedFetch.mockImplementation(async (_url, options) => {
      return await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => resolve(audioResponse()), 20);
        options?.signal?.addEventListener('abort', () => {
          clearTimeout(timeout);
          reject(new DOMException('The operation was aborted.', 'AbortError'));
        });
      });
    });
    const provider = new OpenAiTtsProvider('tts-1', { config: { apiKey: 'test-key' } });
    const first = new AbortController();
    const second = new AbortController();

    const resultsPromise = Promise.allSettled([
      provider.callApi('same input', undefined, { abortSignal: first.signal }),
      provider.callApi('same input', undefined, { abortSignal: second.signal }),
    ]);
    setTimeout(() => first.abort(), 5);
    const results = await resultsPromise;

    expect(mockedFetch).toHaveBeenCalledTimes(2);
    expect(results[0]).toMatchObject({ status: 'rejected', reason: { name: 'AbortError' } });
    expect(results[1]).toMatchObject({ status: 'fulfilled', value: { cached: false } });
    expect(second.signal.aborted).toBe(false);
  });

  it('normalizes a custom abort reason while reading the speech response body', async () => {
    let notifyRead: (() => void) | undefined;
    const reading = new Promise<void>((resolve) => {
      notifyRead = resolve;
    });
    mockedFetch.mockImplementation(
      async (_url, options) =>
        ({
          ok: true,
          status: 200,
          statusText: 'OK',
          arrayBuffer: () =>
            new Promise<ArrayBuffer>((_resolve, reject) => {
              notifyRead?.();
              options?.signal?.addEventListener('abort', () => reject(options.signal?.reason));
            }),
        }) as Response,
    );
    const controller = new AbortController();
    const pending = new OpenAiTtsProvider('tts-1', { config: { apiKey: 'test-key' } }).callApi(
      'Cancel while reading audio',
      undefined,
      { abortSignal: controller.signal },
    );
    await reading;
    controller.abort(new Error('caller cancelled speech body'));

    await expect(pending).rejects.toMatchObject({
      name: 'AbortError',
      message: 'caller cancelled speech body',
    });
  });

  it('does not coalesce concurrent speech requests across repeat cache namespaces', async () => {
    mockedIsCacheEnabled.mockReturnValue(true);
    mockedGetCache.mockReturnValue({ get: vi.fn(), set: vi.fn() } as any);
    let namespaceIndex = 0;
    mockedGetScopedCacheKey.mockImplementation(
      (cacheKey) => `${namespaceIndex++ === 0 ? 'repeat:0' : 'repeat:1'}:${cacheKey}`,
    );
    mockedFetch.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return audioResponse();
    });
    const provider = new OpenAiTtsProvider('tts-1', { config: { apiKey: 'test-key' } });

    const results = await Promise.all([
      provider.callApi('same input'),
      provider.callApi('same input'),
    ]);

    expect(mockedFetch).toHaveBeenCalledTimes(2);
    expect(results.every((result) => result.cached === false)).toBe(true);
  });

  it('does not share tenant-scoped custom voices without a non-secret tenant discriminator', async () => {
    const values = new Map<string, string>();
    const cache = {
      get: vi.fn(async (key: string) => values.get(key)),
      set: vi.fn(async (key: string, value: string) => values.set(key, value)),
    };
    mockedIsCacheEnabled.mockReturnValue(true);
    mockedGetCache.mockReturnValue(cache as any);
    mockedFetch.mockImplementation(async (_url, options) => {
      const authorization = (options?.headers as Record<string, string>).Authorization;
      return audioResponse(new TextEncoder().encode(`audio-for-${authorization}`));
    });

    const firstTenant = new OpenAiTtsProvider('tts-1', {
      config: {
        apiKey: 'tenant-a',
        voice: { id: 'voice-private' },
        headers: { 'X-Tenant-Id': '' },
      },
    });
    const secondTenant = new OpenAiTtsProvider('tts-1', {
      config: {
        apiKey: 'tenant-b',
        voice: { id: 'voice-private' },
        headers: { 'X-Tenant-Id': '' },
      },
    });

    const first = await firstTenant.callApi('same input');
    const second = await secondTenant.callApi('same input');

    expect(Buffer.from(first.audio?.data ?? '', 'base64').toString()).toBe(
      'audio-for-Bearer tenant-a',
    );
    expect(Buffer.from(second.audio?.data ?? '', 'base64').toString()).toBe(
      'audio-for-Bearer tenant-b',
    );
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(false);
    expect(mockedFetch).toHaveBeenCalledTimes(2);
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('does not share passthrough custom voices without a non-secret tenant discriminator', async () => {
    const values = new Map<string, string>();
    const cache = {
      get: vi.fn(async (key: string) => values.get(key)),
      set: vi.fn(async (key: string, value: string) => values.set(key, value)),
    };
    mockedIsCacheEnabled.mockReturnValue(true);
    mockedGetCache.mockReturnValue(cache as any);
    mockedFetch.mockImplementation(async (_url, options) => {
      const authorization = (options?.headers as Record<string, string>).Authorization;
      return audioResponse(new TextEncoder().encode(`audio-for-${authorization}`));
    });

    const first = await new OpenAiTtsProvider('gpt-4o-mini-tts', {
      config: { apiKey: 'tenant-a', passthrough: { voice: { id: 'voice-private' } } } as any,
    }).callApi('same input');
    const second = await new OpenAiTtsProvider('gpt-4o-mini-tts', {
      config: { apiKey: 'tenant-b', passthrough: { voice: { id: 'voice-private' } } } as any,
    }).callApi('same input');

    expect(Buffer.from(first.audio?.data ?? '', 'base64').toString()).toBe(
      'audio-for-Bearer tenant-a',
    );
    expect(Buffer.from(second.audio?.data ?? '', 'base64').toString()).toBe(
      'audio-for-Bearer tenant-b',
    );
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(false);
    expect(mockedFetch).toHaveBeenCalledTimes(2);
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('uses passthrough model and input overrides for validation, character reporting, and billing', async () => {
    mockedFetch.mockResolvedValue(audioResponse());
    const modelOverride = await new OpenAiTtsProvider('gpt-4o-mini-tts', {
      config: { apiKey: 'test-key', passthrough: { model: 'tts-1-hd' } } as any,
    }).callApi('hello');
    const inputOverride = await new OpenAiTtsProvider('tts-1', {
      config: { apiKey: 'test-key', passthrough: { input: 'x'.repeat(100) } } as any,
    }).callApi('hi');
    const oversized = await new OpenAiTtsProvider('tts-1', {
      config: { apiKey: 'test-key', passthrough: { input: 'x'.repeat(4097) } } as any,
    }).callApi('short prompt');

    expect(modelOverride).toMatchObject({
      output: 'Generated 5 characters of speech',
      cost: 0.00015,
    });
    expect(inputOverride).toMatchObject({
      output: 'Generated 100 characters of speech',
      cost: 0.0015,
    });
    expect(oversized.error).toBe('Speech input exceeds 4096 characters.');
    expect(mockedFetch).toHaveBeenCalledTimes(2);
  });

  it('does not share authenticated custom speech endpoints without a tenant discriminator', async () => {
    const values = new Map<string, string>();
    const cache = {
      get: vi.fn(async (key: string) => values.get(key)),
      set: vi.fn(async (key: string, value: string) => values.set(key, value)),
    };
    mockedIsCacheEnabled.mockReturnValue(true);
    mockedGetCache.mockReturnValue(cache as any);
    mockedFetch.mockImplementation(async (_url, options) => {
      const authorization = (options?.headers as Record<string, string>).Authorization;
      return audioResponse(new TextEncoder().encode(`audio-for-${authorization}`));
    });

    const firstTenant = new OpenAiTtsProvider('tts-1', {
      config: { apiKey: 'tenant-a', apiBaseUrl: 'https://gateway.example/v1' },
    });
    const secondTenant = new OpenAiTtsProvider('tts-1', {
      config: { apiKey: 'tenant-b', apiBaseUrl: 'https://gateway.example/v1' },
    });

    const first = await firstTenant.callApi('same input');
    const second = await secondTenant.callApi('same input');

    expect(Buffer.from(first.audio?.data ?? '', 'base64').toString()).toBe(
      'audio-for-Bearer tenant-a',
    );
    expect(Buffer.from(second.audio?.data ?? '', 'base64').toString()).toBe(
      'audio-for-Bearer tenant-b',
    );
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(false);
    expect(mockedFetch).toHaveBeenCalledTimes(2);
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('does not share query-authenticated custom speech endpoints without a tenant discriminator', async () => {
    const restoreEnv = mockProcessEnv({ OPENAI_API_KEY: '' });
    const values = new Map<string, string>();
    const cache = {
      get: vi.fn(async (key: string) => values.get(key)),
      set: vi.fn(async (key: string, value: string) => values.set(key, value)),
    };
    mockedIsCacheEnabled.mockReturnValue(true);
    mockedGetCache.mockReturnValue(cache as any);
    mockedFetch.mockImplementation(async (url) => {
      const token = new URL(String(url)).searchParams.get('api_key');
      return audioResponse(new TextEncoder().encode(`audio-for-${token}`));
    });

    try {
      const first = await new OpenAiTtsProvider('tts-1', {
        config: {
          apiKeyRequired: false,
          apiBaseUrl: 'https://gateway.example/v1?api_key=tenant-a-secret&path=',
        },
      }).callApi('same input');
      const second = await new OpenAiTtsProvider('tts-1', {
        config: {
          apiKeyRequired: false,
          apiBaseUrl: 'https://gateway.example/v1?api_key=tenant-b-secret&path=',
        },
      }).callApi('same input');

      expect(Buffer.from(first.audio?.data ?? '', 'base64').toString()).toBe(
        'audio-for-tenant-a-secret',
      );
      expect(Buffer.from(second.audio?.data ?? '', 'base64').toString()).toBe(
        'audio-for-tenant-b-secret',
      );
      expect(first.cached).toBe(false);
      expect(second.cached).toBe(false);
      expect(mockedFetch).toHaveBeenCalledTimes(2);
      expect(cache.set).not.toHaveBeenCalled();
    } finally {
      restoreEnv();
    }
  });

  it('does not persist speech prompts containing embedded credentials', async () => {
    const cache = { get: vi.fn(), set: vi.fn() };
    mockedIsCacheEnabled.mockReturnValue(true);
    mockedGetCache.mockReturnValue(cache as any);
    mockedFetch.mockResolvedValue(audioResponse());
    const provider = new OpenAiTtsProvider('tts-1', { config: { apiKey: 'test-key' } });

    const prompt = 'Read this API key aloud: sk-proj-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    await provider.callApi(prompt);
    await provider.callApi(prompt);

    expect(mockedFetch).toHaveBeenCalledTimes(2);
    expect(cache.get).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('does not persist speech requests when a gateway credential is embedded in the URL path', async () => {
    const cache = { get: vi.fn(), set: vi.fn() };
    mockedIsCacheEnabled.mockReturnValue(true);
    mockedGetCache.mockReturnValue(cache as any);
    mockedFetch.mockResolvedValue(audioResponse());
    const provider = new OpenAiTtsProvider('tts-1', {
      config: {
        apiKeyRequired: false,
        apiBaseUrl: 'https://gateway.example/v1/sk-proj-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        headers: { 'X-Tenant-Id': 'tenant-a' },
      },
    });

    await provider.callApi('same input');
    await provider.callApi('same input');

    expect(mockedFetch).toHaveBeenCalledTimes(2);
    expect(cache.get).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('canonicalizes case-insensitive speech headers for the persistent cache key', async () => {
    const values = new Map<string, string>();
    const cache = {
      get: vi.fn(async (key: string) => values.get(key)),
      set: vi.fn(async (key: string, value: string) => values.set(key, value)),
    };
    mockedIsCacheEnabled.mockReturnValue(true);
    mockedGetCache.mockReturnValue(cache as any);
    mockedFetch.mockResolvedValue(audioResponse());

    const first = await new OpenAiTtsProvider('tts-1', {
      config: { apiKey: 'test-key', headers: { 'X-Tenant-Id': 'tenant-a' } },
    }).callApi('same input');
    const second = await new OpenAiTtsProvider('tts-1', {
      config: { apiKey: 'test-key', headers: { 'x-tenant-id': 'tenant-a' } },
    }).callApi('same input');

    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  it('canonicalizes nested passthrough objects for the persistent cache key', async () => {
    const values = new Map<string, string>();
    const cache = {
      get: vi.fn(async (key: string) => values.get(key)),
      set: vi.fn(async (key: string, value: string) => values.set(key, value)),
    };
    mockedIsCacheEnabled.mockReturnValue(true);
    mockedGetCache.mockReturnValue(cache as any);
    mockedFetch.mockResolvedValue(audioResponse());

    const first = await new OpenAiTtsProvider('tts-1', {
      config: { apiKey: 'test-key', passthrough: { vendor: { alpha: 1, beta: 2 } } },
    }).callApi('same input');
    const second = await new OpenAiTtsProvider('tts-1', {
      config: { apiKey: 'test-key', passthrough: { vendor: { beta: 2, alpha: 1 } } },
    }).callApi('same input');

    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(mockedFetch).toHaveBeenCalledTimes(1);
  });

  it('does not persist secret-valued speech tenant headers', async () => {
    const cache = { get: vi.fn(), set: vi.fn() };
    mockedIsCacheEnabled.mockReturnValue(true);
    mockedGetCache.mockReturnValue(cache as any);
    mockedFetch.mockResolvedValue(audioResponse());
    const provider = new OpenAiTtsProvider('tts-1', {
      config: {
        apiKey: 'test-key',
        headers: { 'X-Tenant-Id': 'sk-proj-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
      },
    });

    await provider.callApi('same input');

    expect(cache.get).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  const invalidCases: Array<
    [string, { model?: string; input?: string; config?: Record<string, unknown> }, string]
  > = [
    ['an overlong input', { input: 'a'.repeat(4097) }, '4096 characters'],
    ['an invalid format', { config: { response_format: 'ogg' } }, 'response_format'],
    ['an invalid custom-voice format', { config: { format: 'ogg' } }, 'format'],
    ['a speed below range', { config: { speed: 0.2 } }, '0.25 and 4'],
    ['a speed above range', { config: { speed: 4.1 } }, '0.25 and 4'],
    ['a non-finite speed', { config: { speed: Number.NaN } }, '0.25 and 4'],
    [
      'legacy instructions',
      { model: 'tts-1', config: { instructions: 'Be cheerful.' } },
      'instructions are only supported',
    ],
  ];

  it.each(
    invalidCases,
  )('rejects %s before calling the API', async (_label, testCase, expectedError) => {
    const provider = new OpenAiTtsProvider(testCase.model ?? 'gpt-4o-mini-tts', {
      config: { apiKey: 'test-key', ...testCase.config } as any,
    });

    const result = await provider.callApi(testCase.input ?? 'Hello');

    expect(result.error).toContain(expectedError);
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('returns an actionable API error without attempting to parse binary audio', async () => {
    mockedFetch.mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      text: async () => JSON.stringify({ error: { message: 'Unsupported voice' } }),
    } as Response);
    const provider = new OpenAiTtsProvider('gpt-4o-mini-tts', { config: { apiKey: 'test-key' } });

    await expect(provider.callApi('Hello')).resolves.toMatchObject({
      error: 'API error 400: Unsupported voice',
    });
  });

  it('requires an OpenAI API key', async () => {
    const restoreEnv = mockProcessEnv({ OPENAI_API_KEY: undefined });
    try {
      const provider = new OpenAiTtsProvider('gpt-4o-mini-tts');
      await expect(provider.callApi('Hello')).rejects.toThrow('OPENAI_API_KEY');
    } finally {
      restoreEnv();
    }
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('allows unauthenticated speech endpoints when apiKeyRequired is false', async () => {
    const restoreEnv = mockProcessEnv({ OPENAI_API_KEY: undefined });
    mockedFetch.mockResolvedValue(audioResponse());
    try {
      const provider = new OpenAiTtsProvider('tts-1', {
        config: { apiBaseUrl: 'https://gateway.example/v1', apiKeyRequired: false },
      });

      await expect(provider.callApi('Hello')).resolves.toMatchObject({
        audio: { format: 'mp3' },
      });
    } finally {
      restoreEnv();
    }

    expect(mockedFetch).toHaveBeenCalledWith(
      'https://gateway.example/v1/audio/speech',
      expect.objectContaining({
        headers: expect.not.objectContaining({ Authorization: expect.anything() }),
      }),
      expect.any(Number),
      undefined,
    );
  });

  it('allows header-authenticated speech gateways without an OpenAI API key', async () => {
    const restoreEnv = mockProcessEnv({ OPENAI_API_KEY: undefined });
    mockedFetch.mockResolvedValue(audioResponse());
    try {
      const provider = new OpenAiTtsProvider('tts-1', {
        config: {
          apiBaseUrl: 'https://gateway.example/v1',
          headers: { authorization: 'Bearer gateway-token', 'X-Tenant-Id': 'tenant-a' },
        },
      });

      await expect(provider.callApi('Hello')).resolves.toMatchObject({ audio: { format: 'mp3' } });
    } finally {
      restoreEnv();
    }

    expect(new Headers(mockedFetch.mock.calls[0][1]?.headers).get('authorization')).toBe(
      'Bearer gateway-token',
    );
  });
});
