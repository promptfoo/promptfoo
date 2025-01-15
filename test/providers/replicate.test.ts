import { getCache, isCacheEnabled } from '../../src/cache';
import { ReplicateProvider, ReplicateModerationProvider } from '../../src/providers/replicate';

jest.mock('../../src/cache');
jest.mock('../../src/logger');
jest.mock('replicate');

describe('ReplicateProvider', () => {
  let provider: ReplicateProvider;
  const mockCache = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    reset: jest.fn(),
    wrap: jest.fn(),
    store: {} as any,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (jest.mocked(getCache).mockResolvedValue as any)(mockCache);
    jest.mocked(isCacheEnabled).mockReturnValue(true);

    provider = new ReplicateProvider('test-model', {
      config: {
        apiKey: 'test-key',
      },
    });
  });

  it('should initialize with correct config', () => {
    expect(provider.modelName).toBe('test-model');
    expect(provider.apiKey).toBe('test-key');
  });

  it('should throw error if API key is not set', async () => {
    provider = new ReplicateProvider('test-model');
    await expect(provider.callApi('test prompt')).rejects.toThrow('Replicate API key is not set');
  });

  it('should use cache when enabled', async () => {
    const cachedResponse = { output: 'cached response', tokenUsage: {} };
    mockCache.get.mockResolvedValue(JSON.stringify(cachedResponse));

    const result = await provider.callApi('test prompt');
    expect(result).toEqual(cachedResponse);
    expect(mockCache.get).toHaveBeenCalledWith(expect.stringContaining('test-model'));
  });
});

describe('ReplicateModerationProvider', () => {
  let provider: ReplicateModerationProvider;
  const mockCache = {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    reset: jest.fn(),
    wrap: jest.fn(),
    store: {} as any,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (jest.mocked(getCache).mockResolvedValue as any)(mockCache);
    jest.mocked(isCacheEnabled).mockReturnValue(true);

    provider = new ReplicateModerationProvider('test-model', {
      config: {
        apiKey: 'test-key',
      },
    });
  });

  it('should initialize with correct config', () => {
    expect(provider.modelName).toBe('test-model');
    expect(provider.apiKey).toBe('test-key');
  });
});

// Skipping ReplicateImageProvider tests due to complexity of mocking image generation
