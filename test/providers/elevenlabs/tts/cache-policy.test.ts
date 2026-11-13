import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { disableCache, enableCache, getCache, withCacheEnabled } from '../../../../src/cache';
import { ElevenLabsClient } from '../../../../src/providers/elevenlabs/client';
import { ElevenLabsTTSProvider } from '../../../../src/providers/elevenlabs/tts';

import type { ElevenLabsTTSConfig } from '../../../../src/providers/elevenlabs/tts/types';

vi.mock('../../../../src/providers/elevenlabs/client');
vi.mock('../../../../src/cache', async (importOriginal) => ({
  ...(await importOriginal()),
  getCache: vi.fn(),
}));

const entries = new Map<string, unknown>();
const cache = {
  get: vi.fn(async (key: string) => entries.get(key)),
  set: vi.fn(async (key: string, value: unknown, _ttl: number) => {
    entries.set(key, value);
  }),
};

function createProvider(config: Partial<ElevenLabsTTSConfig> = {}) {
  return new ElevenLabsTTSProvider('elevenlabs:tts', {
    config: { apiKey: 'fixture-key', ...config },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  entries.clear();
  enableCache();
  vi.mocked(getCache).mockReturnValue(cache as unknown as ReturnType<typeof getCache>);
  vi.mocked(ElevenLabsClient.prototype.post).mockResolvedValue(Buffer.from('fixture audio'));
});

afterEach(() => {
  enableCache();
  entries.clear();
  vi.resetAllMocks();
  vi.restoreAllMocks();
});

describe('ElevenLabs TTS cache policy', () => {
  it('reuses enabled responses with cached audio and token metadata', async () => {
    const provider = createProvider();
    const first = await provider.callApi('Hello');
    const second = await provider.callApi('Hello');

    expect(first.error).toBeUndefined();
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(second.audio).toEqual(first.audio);
    expect(second.tokenUsage).toMatchObject({ total: 5, cached: 5 });
    expect(ElevenLabsClient.prototype.post).toHaveBeenCalledOnce();
  });

  it('bypasses primed responses after global caching is disabled', async () => {
    const provider = createProvider();
    await provider.callApi('Hello');
    cache.get.mockClear();
    cache.set.mockClear();
    disableCache();

    const response = await provider.callApi('Hello');

    expect(response.cached).toBe(false);
    expect(ElevenLabsClient.prototype.post).toHaveBeenCalledTimes(2);
    expect(cache.get).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
  });

  it('does not populate responses while global caching is disabled', async () => {
    const provider = createProvider();
    disableCache();
    expect((await provider.callApi('Hello')).cached).toBe(false);
    expect(entries.size).toBe(0);
    enableCache();
    expect((await provider.callApi('Hello')).cached).toBe(false);
    expect((await provider.callApi('Hello')).cached).toBe(true);
    expect(ElevenLabsClient.prototype.post).toHaveBeenCalledTimes(2);
  });

  it('bypasses reads and writes within a disabled scope', async () => {
    const provider = createProvider();
    await provider.callApi('Hello');
    cache.get.mockClear();
    cache.set.mockClear();

    await withCacheEnabled(false, async () => {
      expect((await provider.callApi('Hello')).cached).toBe(false);
      expect((await provider.callApi('Fresh')).cached).toBe(false);
    });

    expect(cache.get).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
    expect((await provider.callApi('Hello')).cached).toBe(true);
    expect((await provider.callApi('Fresh')).cached).toBe(false);
  });

  it('keeps enabled and disabled overlapping scopes independent', async () => {
    const provider = createProvider();
    await provider.callApi('Hello');
    const [disabled, enabled] = await Promise.all([
      withCacheEnabled(false, () => provider.callApi('Hello')),
      withCacheEnabled(true, () => provider.callApi('Hello')),
    ]);
    expect(disabled.cached).toBe(false);
    expect(enabled.cached).toBe(true);
    expect(ElevenLabsClient.prototype.post).toHaveBeenCalledTimes(2);
  });

  it('allows an enabled scope to override global disable', async () => {
    const provider = createProvider();
    disableCache();
    await withCacheEnabled(true, async () => {
      expect((await provider.callApi('Hello')).cached).toBe(false);
      expect((await provider.callApi('Hello')).cached).toBe(true);
    });
    expect((await provider.callApi('Hello')).cached).toBe(false);
    expect(ElevenLabsClient.prototype.post).toHaveBeenCalledTimes(2);
  });

  it('preserves provider-local cache false inside an enabled scope', async () => {
    const provider = createProvider({ cache: false });
    await withCacheEnabled(true, async () => {
      expect((await provider.callApi('Hello')).cached).toBe(false);
      expect((await provider.callApi('Hello')).cached).toBe(false);
    });
    expect(cache.get).not.toHaveBeenCalled();
    expect(cache.set).not.toHaveBeenCalled();
    expect(ElevenLabsClient.prototype.post).toHaveBeenCalledTimes(2);
  });

  it('does not store a response when caching is disabled during the request', async () => {
    vi.mocked(ElevenLabsClient.prototype.post).mockImplementationOnce(async () => {
      disableCache();
      return Buffer.from('fixture audio');
    });
    expect((await createProvider().callApi('Hello')).error).toBeUndefined();
    expect(cache.get).toHaveBeenCalledOnce();
    expect(cache.set).not.toHaveBeenCalled();
    expect(entries.size).toBe(0);
  });

  it.each([
    [undefined, 3_600_000],
    [0, 3_600_000],
    [7, 7_000],
  ])('preserves TTL %s as %s milliseconds', async (cacheTTL, expectedTtl) => {
    await createProvider({ cacheTTL }).callApi('Hello');
    expect(cache.set).toHaveBeenCalledWith(expect.any(String), expect.any(Object), expectedTtl);
  });
});
