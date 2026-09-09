import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../src/cache';
import { getEnvString } from '../../src/envars';
import { loadApiProvider } from '../../src/providers';
import { VoyageEmbeddingProvider } from '../../src/providers/voyage';

vi.mock('../../src/cache', () => ({
  fetchWithCache: vi.fn(),
}));

vi.mock('../../src/envars', async () => {
  const actual = await vi.importActual<typeof import('../../src/envars')>('../../src/envars');
  return {
    ...actual,
    getEnvString: vi.fn(),
  };
});

const mockedFetchWithCache = vi.mocked(fetchWithCache);
const mockedGetEnvString = vi.mocked(getEnvString);

describe('VoyageEmbeddingProvider', () => {
  beforeEach(() => {
    mockedGetEnvString.mockReset();
    mockedFetchWithCache.mockReset();
    mockedGetEnvString.mockReturnValue('');
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it.each([
    {
      name: 'explicit provider config',
      config: {
        apiKey: 'config-key',
        apiBaseUrl: 'https://config.example/v1',
        headers: { 'X-Request-Namespace': 'voyage-fixture' },
      },
      providerEnv: {
        VOYAGE_API_KEY: 'provider-key',
        VOYAGE_API_BASE_URL: 'https://provider.example/v1',
      },
      suiteEnv: { VOYAGE_API_KEY: 'suite-key', VOYAGE_API_BASE_URL: 'https://suite.example/v1' },
      expectedKey: 'config-key',
      expectedUrl: 'https://config.example/v1/embeddings',
    },
    {
      name: 'provider environment before suite environment',
      config: {},
      providerEnv: {
        VOYAGE_API_KEY: 'provider-key',
        VOYAGE_API_BASE_URL: 'https://provider.example/v1',
      },
      suiteEnv: { VOYAGE_API_KEY: 'suite-key', VOYAGE_API_BASE_URL: 'https://suite.example/v1' },
      expectedKey: 'provider-key',
      expectedUrl: 'https://provider.example/v1/embeddings',
    },
    {
      name: 'suite environment',
      config: {},
      providerEnv: {},
      suiteEnv: { VOYAGE_API_KEY: 'suite-key', VOYAGE_API_BASE_URL: 'https://suite.example/v1' },
      expectedKey: 'suite-key',
      expectedUrl: 'https://suite.example/v1/embeddings',
    },
  ])(
    'loads $name into the actual embedding request',
    async ({ config, providerEnv, suiteEnv, expectedKey, expectedUrl }) => {
      mockedFetchWithCache.mockResolvedValue({
        data: { data: [{ embedding: [0.1, 0.2] }], usage: { total_tokens: 2 } },
        cached: false,
        status: 200,
        statusText: 'OK',
      });
      const provider = await loadApiProvider('voyage:voyage-4-large', {
        options: { config, env: providerEnv },
        env: suiteEnv,
      });

      expect(provider).toBeInstanceOf(VoyageEmbeddingProvider);
      const result = await provider.callEmbeddingApi!('loaded fixture');

      expect(result.embedding).toEqual([0.1, 0.2]);
      expect(mockedFetchWithCache).toHaveBeenCalledTimes(1);
      expect(mockedFetchWithCache).toHaveBeenCalledWith(
        expectedUrl,
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${expectedKey}`,
            ...config.headers,
          },
          body: JSON.stringify({ input: ['loaded fixture'], model: 'voyage-4-large' }),
        }),
        expect.any(Number),
      );
    },
  );

  it('returns cached responses with the cached flag preserved', async () => {
    mockedFetchWithCache.mockResolvedValue({
      data: {
        data: [{ embedding: [0.1, 0.2, 0.3] }],
        usage: { total_tokens: 3 },
      },
      cached: true,
      status: 200,
      statusText: 'OK',
      latencyMs: 42,
    });

    const provider = new VoyageEmbeddingProvider('voyage-2', {}, { VOYAGE_API_KEY: 'test-key' });

    await expect(provider.callEmbeddingApi('hello')).resolves.toEqual({
      embedding: [0.1, 0.2, 0.3],
      cached: true,
      latencyMs: 42,
      tokenUsage: {
        total: 3,
        numRequests: 1,
      },
    });
  });

  it('throws when no Voyage API key is configured', async () => {
    const provider = new VoyageEmbeddingProvider('voyage-2');

    await expect(provider.callEmbeddingApi('hello')).rejects.toThrow(
      'Voyage API key must be set for similarity comparison',
    );
    expect(mockedFetchWithCache).not.toHaveBeenCalled();
  });

  it('throws a descriptive error for 4xx responses', async () => {
    mockedFetchWithCache.mockResolvedValue({
      data: { error: { message: 'Invalid model' } },
      cached: false,
      status: 400,
      statusText: 'Bad Request',
      latencyMs: 10,
    });

    const provider = new VoyageEmbeddingProvider('voyage-2', {}, { VOYAGE_API_KEY: 'test-key' });

    await expect(provider.callEmbeddingApi('hello')).rejects.toThrow(
      'Voyage API error: 400 Bad Request\nInvalid model',
    );
    expect(mockedFetchWithCache).toHaveBeenCalledTimes(1);
  });

  it('throws a descriptive error for 5xx responses', async () => {
    mockedFetchWithCache.mockResolvedValue({
      data: { error: { message: 'Internal server error' } },
      cached: false,
      status: 500,
      statusText: 'Internal Server Error',
      latencyMs: 10,
    });

    const provider = new VoyageEmbeddingProvider('voyage-2', {}, { VOYAGE_API_KEY: 'test-key' });

    await expect(provider.callEmbeddingApi('hello')).rejects.toThrow(
      'Voyage API error: 500 Internal Server Error\nInternal server error',
    );
    expect(mockedFetchWithCache).toHaveBeenCalledTimes(1);
  });

  it('throws a rate-limit-specific error for 429 responses', async () => {
    mockedFetchWithCache.mockResolvedValue({
      data: { error: { message: 'Too many requests' } },
      cached: false,
      status: 429,
      statusText: 'Too Many Requests',
      latencyMs: 10,
    });

    const provider = new VoyageEmbeddingProvider('voyage-2', {}, { VOYAGE_API_KEY: 'test-key' });

    await expect(provider.callEmbeddingApi('hello')).rejects.toThrow(
      'Voyage API rate limit exceeded: 429 Too Many Requests\nToo many requests',
    );
    expect(mockedFetchWithCache).toHaveBeenCalledTimes(1);
  });
});
