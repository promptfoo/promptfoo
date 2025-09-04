import { disableCache, enableCache, fetchWithCache } from '../../src/cache';
import {
  DefaultModerationProvider,
  ReplicateImageProvider,
  ReplicateModerationProvider,
  ReplicateProvider,
} from '../../src/providers/replicate';

jest.mock('../../src/cache');

const mockedFetchWithCache = jest.mocked(fetchWithCache);

describe('ReplicateProvider', () => {
  const mockApiKey = 'test-api-key';

  beforeEach(() => {
    jest.resetAllMocks();
    disableCache();
  });

  afterEach(() => {
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
});

describe('ReplicateModerationProvider', () => {
  const mockApiKey = 'test-api-key';

  beforeEach(() => {
    jest.resetAllMocks();
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
    jest.resetAllMocks();
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
});
