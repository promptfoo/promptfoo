import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  disableCache,
  enableCache,
  fetchWithCache,
  getCache,
  isCacheEnabled,
} from '../../src/cache';
import logger from '../../src/logger';
import {
  DefaultModerationProvider,
  ReplicateImageProvider,
  ReplicateModerationProvider,
  ReplicateProvider,
} from '../../src/providers/replicate';
import { createEmptyTokenUsage } from '../../src/util/tokenUsageUtils';
import { mockProcessEnv } from '../util/utils';

vi.mock('../../src/cache');
vi.mock('../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

const mockedFetchWithCache = vi.mocked(fetchWithCache);

describe('ReplicateProvider', () => {
  const mockApiKey = 'test-api-key';

  beforeEach(() => {
    vi.resetAllMocks();
    disableCache();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    enableCache();
  });

  it('should handle successful API calls', async () => {
    mockedFetchWithCache.mockResolvedValue({
      data: {
        id: 'test-id',
        status: 'succeeded',
        output: 'test response',
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const provider = new ReplicateProvider('test-model', {
      config: { apiKey: mockApiKey },
    });

    const result = await provider.callApi('test prompt');
    expect(result.output).toBe('test response');
    const requestBody = JSON.parse(
      (mockedFetchWithCache.mock.calls[0][1] as { body: string }).body,
    );
    expect(requestBody.input).not.toHaveProperty('apiKey');
    expect(mockedFetchWithCache).toHaveBeenCalledWith(
      'https://api.replicate.com/v1/models/test-model/predictions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Bearer ${mockApiKey}`,
          'Content-Type': 'application/json',
          Prefer: 'wait=60',
        }),
      }),
      expect.any(Number),
      'json',
    );
  });

  it('should preserve explicit zero-valued config instead of replacing it with env defaults', async () => {
    const originalTemperature = process.env.REPLICATE_TEMPERATURE;
    const originalSeed = process.env.REPLICATE_SEED;
    mockProcessEnv({ REPLICATE_TEMPERATURE: '0.9' });
    mockProcessEnv({ REPLICATE_SEED: '123' });

    mockedFetchWithCache.mockResolvedValue({
      data: {
        id: 'test-id',
        status: 'succeeded',
        output: 'test response',
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    try {
      const provider = new ReplicateProvider('test-model', {
        config: {
          apiKey: mockApiKey,
          temperature: 0,
          seed: 0,
        },
      });

      await provider.callApi('test prompt');

      const request = mockedFetchWithCache.mock.calls[0] as [string, { body: string }];
      const body = JSON.parse(request[1].body);

      expect(body.input.temperature).toBe(0);
      expect(body.input.seed).toBe(0);
    } finally {
      if (originalTemperature === undefined) {
        mockProcessEnv({ REPLICATE_TEMPERATURE: undefined });
      } else {
        mockProcessEnv({ REPLICATE_TEMPERATURE: originalTemperature });
      }

      if (originalSeed === undefined) {
        mockProcessEnv({ REPLICATE_SEED: undefined });
      } else {
        mockProcessEnv({ REPLICATE_SEED: originalSeed });
      }
    }
  });

  it('should handle API errors', async () => {
    mockedFetchWithCache.mockRejectedValue(new Error('API Error'));

    const provider = new ReplicateProvider('test-model', {
      config: { apiKey: mockApiKey },
    });

    const result = await provider.callApi('test prompt');
    expect(result.error).toBe('API call error: Error: API Error');
  });

  it('should handle prompt prefix and suffix', async () => {
    mockedFetchWithCache.mockResolvedValue({
      data: {
        id: 'test-id',
        status: 'succeeded',
        output: 'test response',
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const provider = new ReplicateProvider('test-model', {
      config: {
        apiKey: mockApiKey,
        prompt: {
          prefix: 'prefix_',
          suffix: '_suffix',
        },
      },
    });

    await provider.callApi('test');
    expect(mockedFetchWithCache).toHaveBeenCalledWith(
      'https://api.replicate.com/v1/models/test-model/predictions',
      expect.objectContaining({
        body: expect.stringContaining('"prompt":"prefix_test_suffix"'),
      }),
      expect.any(Number),
      'json',
    );
  });

  it('should poll for completion when prediction is still processing', async () => {
    // First call returns processing status
    mockedFetchWithCache.mockResolvedValueOnce({
      data: {
        id: 'test-id',
        status: 'processing',
        output: null,
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    // Second call (polling) returns completed
    mockedFetchWithCache.mockResolvedValueOnce({
      data: {
        id: 'test-id',
        status: 'succeeded',
        output: 'test response',
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const provider = new ReplicateProvider('test-model', {
      config: { apiKey: mockApiKey },
    });

    const result = await provider.callApi('test prompt');
    expect(result.output).toBe('test response');
    expect(mockedFetchWithCache).toHaveBeenCalledTimes(2);
  });

  it('should handle array outputs', async () => {
    mockedFetchWithCache.mockResolvedValue({
      data: {
        id: 'test-id',
        status: 'succeeded',
        output: ['Hello', ' ', 'World'],
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const provider = new ReplicateProvider('test-model', {
      config: { apiKey: mockApiKey },
    });

    const result = await provider.callApi('test prompt');
    expect(result.output).toBe('Hello World');
  });

  it('should handle failed predictions', async () => {
    mockedFetchWithCache.mockResolvedValue({
      data: {
        id: 'test-id',
        status: 'failed',
        error: 'Model error',
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const provider = new ReplicateProvider('test-model', {
      config: { apiKey: mockApiKey },
    });

    const result = await provider.callApi('test prompt');
    expect(result.error).toBe('API call error: Error: Model error');
  });

  it('should use versioned endpoint for models with version IDs', async () => {
    mockedFetchWithCache.mockResolvedValue({
      data: {
        id: 'test-id',
        status: 'succeeded',
        output: 'test response',
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const provider = new ReplicateProvider('test-model:version123', {
      config: { apiKey: mockApiKey },
    });

    await provider.callApi('test prompt');
    expect(mockedFetchWithCache).toHaveBeenCalledWith(
      'https://api.replicate.com/v1/predictions',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"version":"version123"'),
      }),
      expect.any(Number),
      'json',
    );
  });

  it('should set cached flag when returning cached response', async () => {
    const mockCachedResponse = {
      output: 'cached PFQA_REPLICATE_CACHED_OUTPUT_SECRET response',
      tokenUsage: { total: 100 },
    };

    const mockCache = {
      get: vi.fn().mockResolvedValue(JSON.stringify(mockCachedResponse)),
      set: vi.fn(),
    } as any;

    vi.mocked(isCacheEnabled).mockReturnValue(true);
    vi.mocked(getCache).mockResolvedValue(mockCache);

    const provider = new ReplicateProvider('test-model', {
      config: { apiKey: mockApiKey },
    });

    const result = await provider.callApi('test prompt');

    expect(result.cached).toBe(true);
    expect(result.output).toBe('cached PFQA_REPLICATE_CACHED_OUTPUT_SECRET response');
    expect(mockCache.get).toHaveBeenCalled();
    const debugLogs = vi.mocked(logger.debug).mock.calls.map((call) => JSON.stringify(call));
    expect(debugLogs.join('\n')).not.toContain('PFQA_REPLICATE_CACHED_OUTPUT_SECRET');
    expect(debugLogs.join('\n')).not.toContain('test prompt');
    // Verify fetchWithCache was not called because cache was used
    expect(mockedFetchWithCache).not.toHaveBeenCalled();
  });

  it('should cache successful string responses', async () => {
    mockedFetchWithCache.mockResolvedValue({
      data: {
        id: 'test-id',
        status: 'succeeded',
        output: 'test response',
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const mockCache = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn(),
    } as any;

    vi.mocked(isCacheEnabled).mockReturnValue(true);
    vi.mocked(getCache).mockResolvedValue(mockCache);

    const provider = new ReplicateProvider('test-model', {
      config: { apiKey: mockApiKey },
    });

    const prompt = 'PFQA_REPLICATE_PROMPT_SENTINEL';
    const result = await provider.callApi(prompt);

    expect(result.output).toBe('test response');
    expect(mockCache.set).toHaveBeenCalledTimes(1);
    const cacheKey = mockCache.set.mock.calls[0][0] as string;
    expect(cacheKey).toMatch(/^replicate:test-model:[a-f0-9]{64}:[a-f0-9]{64}$/);
    expect(cacheKey).not.toContain(prompt);
    expect(cacheKey).not.toContain(mockApiKey);
    expect(mockCache.get).toHaveBeenCalledWith(cacheKey);
    expect(mockCache.set).toHaveBeenCalledWith(cacheKey, expect.any(String));
    expect(JSON.parse(mockCache.set.mock.calls[0][1])).toEqual({
      output: 'test response',
      tokenUsage: createEmptyTokenUsage(),
    });
  });

  it('should not expose API key values in hashed cache keys', async () => {
    mockedFetchWithCache
      .mockResolvedValueOnce({
        data: {
          id: 'test-id-a',
          status: 'succeeded',
          output: 'tenant a response',
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      })
      .mockResolvedValueOnce({
        data: {
          id: 'test-id-b',
          status: 'succeeded',
          output: 'tenant b response',
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });
    const mockCache = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn(),
    } as any;
    vi.mocked(isCacheEnabled).mockReturnValue(true);
    vi.mocked(getCache).mockResolvedValue(mockCache);

    const providerA = new ReplicateProvider('test-model', {
      config: { apiKey: 'replicate-tenant-a-secret' },
    });
    const providerB = new ReplicateProvider('test-model', {
      config: { apiKey: 'replicate-tenant-b-secret' },
    });

    await providerA.callApi('Shared replicate prompt');
    await providerB.callApi('Shared replicate prompt');

    const cacheKeyA = mockCache.get.mock.calls[0][0] as string;
    const cacheKeyB = mockCache.get.mock.calls[1][0] as string;
    expect(cacheKeyA).toMatch(/^replicate:test-model:[a-f0-9]{64}:[a-f0-9]{64}$/);
    expect(cacheKeyB).toMatch(/^replicate:test-model:[a-f0-9]{64}:[a-f0-9]{64}$/);
    expect(cacheKeyA).not.toBe(cacheKeyB);
    expect(mockedFetchWithCache).toHaveBeenCalledTimes(2);
    for (const cacheKey of [cacheKeyA, cacheKeyB]) {
      expect(cacheKey).not.toContain('Shared replicate prompt');
      expect(cacheKey).not.toContain('replicate-tenant-a-secret');
      expect(cacheKey).not.toContain('replicate-tenant-b-secret');
    }
  });

  it('should use a stable cache namespace for the same API key', async () => {
    mockedFetchWithCache.mockResolvedValue({
      data: {
        id: 'test-id',
        status: 'succeeded',
        output: 'stable tenant response',
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });
    const mockCache = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn(),
    } as any;
    vi.mocked(isCacheEnabled).mockReturnValue(true);
    vi.mocked(getCache).mockResolvedValue(mockCache);

    const providerA = new ReplicateProvider('test-model', {
      config: { apiKey: 'replicate-stable-tenant-secret' },
    });
    const providerB = new ReplicateProvider('test-model', {
      config: { apiKey: 'replicate-stable-tenant-secret' },
    });

    await providerA.callApi('Shared replicate prompt');
    await providerB.callApi('Shared replicate prompt');

    const cacheKeyA = mockCache.get.mock.calls[0][0] as string;
    const cacheKeyB = mockCache.get.mock.calls[1][0] as string;
    expect(cacheKeyA).toBe(cacheKeyB);
    expect(cacheKeyA).toMatch(/^replicate:test-model:[a-f0-9]{64}:[a-f0-9]{64}$/);
    expect(cacheKeyA).not.toContain('replicate-stable-tenant-secret');
    expect(cacheKeyA).not.toContain('Shared replicate prompt');
  });

  it('should canonicalize config order when hashing cache keys', async () => {
    mockedFetchWithCache.mockResolvedValue({
      data: {
        id: 'test-id',
        status: 'succeeded',
        output: 'canonical config response',
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });
    const mockCache = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn(),
    } as any;
    vi.mocked(isCacheEnabled).mockReturnValue(true);
    vi.mocked(getCache).mockResolvedValue(mockCache);

    const providerA = new ReplicateProvider('test-model', {
      config: { apiKey: mockApiKey, temperature: 0.1, top_p: 0.9 },
    });
    const providerB = new ReplicateProvider('test-model', {
      config: { apiKey: mockApiKey, top_p: 0.9, temperature: 0.1 },
    });

    await providerA.callApi('Shared canonical prompt');
    await providerB.callApi('Shared canonical prompt');

    expect(mockCache.get.mock.calls[0][0]).toBe(mockCache.get.mock.calls[1][0]);
  });

  it('should separate cache keys for env-backed generation defaults', async () => {
    mockedFetchWithCache.mockResolvedValue({
      data: {
        id: 'test-id',
        status: 'succeeded',
        output: 'env default response',
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });
    const mockCache = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn(),
    } as any;
    vi.mocked(isCacheEnabled).mockReturnValue(true);
    vi.mocked(getCache).mockResolvedValue(mockCache);

    const provider = new ReplicateProvider('test-model', {
      config: { apiKey: mockApiKey },
    });

    vi.stubEnv('REPLICATE_TEMPERATURE', '0.1');
    await provider.callApi('Shared env prompt');
    vi.stubEnv('REPLICATE_TEMPERATURE', '0.9');
    await provider.callApi('Shared env prompt');

    const cacheKeyA = mockCache.get.mock.calls[0][0] as string;
    const cacheKeyB = mockCache.get.mock.calls[1][0] as string;
    expect(cacheKeyA).not.toBe(cacheKeyB);
    expect(cacheKeyA).not.toContain('Shared env prompt');
    expect(cacheKeyA).not.toContain(mockApiKey);
  });
});

describe('ReplicateModerationProvider', () => {
  const mockApiKey = 'test-api-key';

  beforeEach(() => {
    vi.resetAllMocks();
    disableCache();
  });

  afterEach(() => {
    enableCache();
  });

  it('should handle safe content correctly', async () => {
    mockedFetchWithCache.mockResolvedValue({
      data: {
        id: 'test-id',
        status: 'succeeded',
        output: 'safe\n',
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const provider = new ReplicateModerationProvider('test-model', {
      config: { apiKey: mockApiKey },
    });

    const result = await provider.callModerationApi('safe prompt', 'safe response');
    expect(result.flags).toEqual([]);
  });

  it('should handle unsafe content with categories', async () => {
    mockedFetchWithCache.mockResolvedValue({
      data: {
        id: 'test-id',
        status: 'succeeded',
        output: 'unsafe\nS1,S3',
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const provider = new ReplicateModerationProvider('test-model', {
      config: { apiKey: mockApiKey },
    });

    const result = await provider.callModerationApi('unsafe prompt', 'unsafe response');
    expect(result.flags).toHaveLength(2);
    expect(result.flags![0]).toEqual({
      code: 'S1',
      description: 'Violent Crimes',
      confidence: 1.0,
    });
    expect(result.flags![1]).toEqual({
      code: 'S3',
      description: 'Sex Crimes',
      confidence: 1.0,
    });
  });

  it('should handle LlamaGuard 3 categories (S1-S13)', async () => {
    const llamaGuard3Categories = [
      'S1',
      'S2',
      'S3',
      'S4',
      'S5',
      'S6',
      'S7',
      'S8',
      'S9',
      'S10',
      'S11',
      'S12',
      'S13',
    ];
    mockedFetchWithCache.mockResolvedValue({
      data: {
        id: 'test-id',
        status: 'succeeded',
        output: `unsafe\n${llamaGuard3Categories.join(',')}`,
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const provider = new ReplicateModerationProvider('test-model', {
      config: { apiKey: mockApiKey },
    });

    const result = await provider.callModerationApi('test prompt', 'test response');
    expect(result.flags).toHaveLength(13);

    result.flags!.forEach((flag, index) => {
      expect(flag.code).toBe(llamaGuard3Categories[index]);
      expect(flag.confidence).toBe(1.0);
    });
  });

  it('should handle all LlamaGuard categories (including S14 for LlamaGuard 4)', async () => {
    const allCategories = [
      'S1',
      'S2',
      'S3',
      'S4',
      'S5',
      'S6',
      'S7',
      'S8',
      'S9',
      'S10',
      'S11',
      'S12',
      'S13',
      'S14', // LlamaGuard 4 only
    ];
    mockedFetchWithCache.mockResolvedValue({
      data: {
        id: 'test-id',
        status: 'succeeded',
        output: `unsafe\n${allCategories.join(',')}`,
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const provider = new ReplicateModerationProvider('test-model', {
      config: { apiKey: mockApiKey },
    });

    const result = await provider.callModerationApi('test prompt', 'test response');
    expect(result.flags).toHaveLength(14); // All 14 categories including S14

    result.flags!.forEach((flag, index) => {
      expect(flag.code).toBe(allCategories[index]);
      expect(flag.confidence).toBe(1.0);
      // S14 should have its description
      if (flag.code === 'S14') {
        expect(flag.description).toBe('Code Interpreter Abuse');
      }
    });
  });

  it('should handle malformed responses', async () => {
    mockedFetchWithCache.mockResolvedValue({
      data: {
        id: 'test-id',
        status: 'succeeded',
        output: null,
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const provider = new ReplicateModerationProvider('test-model', {
      config: { apiKey: mockApiKey },
    });

    const result = await provider.callModerationApi('test prompt', 'test response');
    expect(result.error).toContain('Unsupported response from Replicate');
  });
});

describe('DefaultModerationProvider', () => {
  it('should be configured with LlamaGuard 4', () => {
    expect(DefaultModerationProvider.modelName).toBe('meta/llama-guard-4-12b');
    // LlamaGuard 4 is the default on Replicate
  });
});

describe('ReplicateImageProvider', () => {
  const mockApiKey = 'test-api-key';

  beforeEach(() => {
    vi.resetAllMocks();
    disableCache();
  });

  afterEach(() => {
    enableCache();
  });

  it('should handle successful image generation', async () => {
    mockedFetchWithCache.mockResolvedValue({
      data: {
        id: 'test-id',
        status: 'succeeded',
        output: ['https://example.com/image.png'],
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const provider = new ReplicateImageProvider('test-model', {
      config: { apiKey: mockApiKey },
    });

    const result = await provider.callApi('a beautiful sunset');
    expect(result.output).toBe('![a beautiful sunset](https://example.com/image.png)');
  });

  it('should handle custom width and height', async () => {
    mockedFetchWithCache.mockResolvedValue({
      data: {
        id: 'test-id',
        status: 'succeeded',
        output: ['https://example.com/image.png'],
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const provider = new ReplicateImageProvider('test-model', {
      config: {
        apiKey: mockApiKey,
        width: 1024,
        height: 1024,
      },
    });

    await provider.callApi('test prompt');
    expect(mockedFetchWithCache).toHaveBeenCalledWith(
      'https://api.replicate.com/v1/models/test-model/predictions',
      expect.objectContaining({
        body: expect.stringContaining('"width":1024'),
      }),
      expect.any(Number),
      'json',
    );
  });

  it('should handle failed image generation', async () => {
    mockedFetchWithCache.mockResolvedValue({
      data: {
        id: 'test-id',
        status: 'failed',
        error: 'Image generation failed',
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const provider = new ReplicateImageProvider('test-model', {
      config: { apiKey: mockApiKey },
    });

    const result = await provider.callApi('test prompt');
    expect(result.error).toBe('Image generation failed');
  });

  it('should ellipsize long prompts in markdown', async () => {
    mockedFetchWithCache.mockResolvedValue({
      data: {
        id: 'test-id',
        status: 'succeeded',
        output: ['https://example.com/image.png'],
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const provider = new ReplicateImageProvider('test-model', {
      config: { apiKey: mockApiKey },
    });

    const longPrompt = 'a'.repeat(100);
    const result = await provider.callApi(longPrompt);
    expect(result.output).toMatch(/!\[.*\.\.\.\]/);
  });

  it('should hash prompt and config values in image cache keys', async () => {
    mockedFetchWithCache.mockResolvedValue({
      data: {
        id: 'test-id',
        status: 'succeeded',
        output: ['https://example.com/image.png'],
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const mockCache = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn(),
    } as any;

    vi.mocked(isCacheEnabled).mockReturnValue(true);
    vi.mocked(getCache).mockReturnValue(mockCache);

    const provider = new ReplicateImageProvider('test-model', {
      config: {
        apiKey: mockApiKey,
        negative_prompt: 'PFQA_REPLICATE_IMAGE_CONFIG_SENTINEL',
      },
    });

    const prompt = 'PFQA_REPLICATE_IMAGE_PROMPT_SENTINEL';
    const result = await provider.callApi(prompt);

    expect(result.cached).toBe(false);
    const cacheKey = mockCache.set.mock.calls[0][0] as string;
    expect(cacheKey).toMatch(/^replicate:image:test-model:[a-f0-9]{64}:[a-f0-9]{64}$/);
    expect(cacheKey).not.toContain(prompt);
    expect(cacheKey).not.toContain('PFQA_REPLICATE_IMAGE_CONFIG_SENTINEL');
    expect(cacheKey).not.toContain(mockApiKey);
    expect(mockCache.get).toHaveBeenCalledWith(cacheKey);
  });

  it('should handle circular image context when hashing cache keys', async () => {
    mockedFetchWithCache.mockResolvedValue({
      data: {
        id: 'test-id',
        status: 'succeeded',
        output: ['https://example.com/image.png'],
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const mockCache = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn(),
    } as any;

    vi.mocked(isCacheEnabled).mockReturnValue(true);
    vi.mocked(getCache).mockReturnValue(mockCache);

    const provider = new ReplicateImageProvider('test-model', {
      config: { apiKey: mockApiKey },
    });
    const context: any = {
      vars: { apiKey: 'PFQA_REPLICATE_CONTEXT_API_KEY_SECRET' },
      filters: { uppercase: () => 'SECRET_FILTER_RESULT' },
      getCache: vi.fn(),
      logger: { debug: vi.fn(), secret: 'PFQA_REPLICATE_LOGGER_SECRET' },
    };
    context.self = context;
    context.originalProvider = provider;

    await expect(
      provider.callApi('PFQA_REPLICATE_CIRCULAR_CONTEXT_PROMPT', context),
    ).resolves.toEqual(expect.objectContaining({ cached: false }));

    const cacheKey = mockCache.set.mock.calls[0][0] as string;
    expect(cacheKey).toMatch(/^replicate:image:test-model:[a-f0-9]{64}:[a-f0-9]{64}$/);
    expect(cacheKey).not.toContain('PFQA_REPLICATE_CONTEXT_API_KEY_SECRET');
    expect(cacheKey).not.toContain('PFQA_REPLICATE_CIRCULAR_CONTEXT_PROMPT');
    expect(cacheKey).not.toContain('PFQA_REPLICATE_LOGGER_SECRET');
  });

  it('should ignore unused image context when computing cache keys', async () => {
    mockedFetchWithCache.mockResolvedValue({
      data: {
        id: 'test-id',
        status: 'succeeded',
        output: ['https://example.com/image.png'],
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const mockCache = {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn(),
    } as any;

    vi.mocked(isCacheEnabled).mockReturnValue(true);
    vi.mocked(getCache).mockReturnValue(mockCache);

    const provider = new ReplicateImageProvider('test-model', {
      config: { apiKey: mockApiKey },
    });

    await provider.callApi('PFQA_REPLICATE_IMAGE_CONTEXT_PROMPT', {
      vars: { tenant: 'PFQA_REPLICATE_IMAGE_CONTEXT_TENANT_A' },
    } as any);
    await provider.callApi('PFQA_REPLICATE_IMAGE_CONTEXT_PROMPT', {
      vars: { tenant: 'PFQA_REPLICATE_IMAGE_CONTEXT_TENANT_B' },
    } as any);

    const firstCacheKey = mockCache.get.mock.calls[0][0] as string;
    const secondCacheKey = mockCache.get.mock.calls[1][0] as string;
    expect(firstCacheKey).toBe(secondCacheKey);
    expect(firstCacheKey).not.toContain('PFQA_REPLICATE_IMAGE_CONTEXT_PROMPT');
    expect(firstCacheKey).not.toContain('PFQA_REPLICATE_IMAGE_CONTEXT_TENANT_A');
    expect(secondCacheKey).not.toContain('PFQA_REPLICATE_IMAGE_CONTEXT_TENANT_B');
  });
});
