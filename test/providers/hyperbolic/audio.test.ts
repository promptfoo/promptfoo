import { fetchWithCache } from '../../../src/cache';
import {
  createHyperbolicAudioProvider,
  HyperbolicAudioProvider,
} from '../../../src/providers/hyperbolic/audio';
import { isAssetStorageEnabled } from '../../../src/assets';
import { getMetricsAssetStore } from '../../../src/assets/store';

jest.mock('../../../src/cache');
jest.mock('../../../src/assets');
jest.mock('../../../src/assets/store');
jest.mock('../../../src/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

describe('HyperbolicAudioProvider', () => {
  const mockIsAssetStorageEnabled = isAssetStorageEnabled as jest.MockedFunction<
    typeof isAssetStorageEnabled
  >;
  const mockGetMetricsAssetStore = getMetricsAssetStore as jest.MockedFunction<
    typeof getMetricsAssetStore
  >;

  beforeEach(() => {
    jest.resetAllMocks();
    mockIsAssetStorageEnabled.mockReturnValue(false);
  });

  it('should create provider with default model', () => {
    const provider = new HyperbolicAudioProvider('');
    expect(provider.modelName).toBe('Melo-TTS');
  });

  it('should create provider with specified model', () => {
    const provider = new HyperbolicAudioProvider('melo');
    expect(provider.modelName).toBe('melo');
  });

  it('should get API key from config', () => {
    const provider = new HyperbolicAudioProvider('melo', {
      config: { apiKey: 'test-key' },
    });
    expect(provider.getApiKey()).toBe('test-key');
  });

  it('should get API key from env', () => {
    const provider = new HyperbolicAudioProvider('melo', {
      env: { HYPERBOLIC_API_KEY: 'env-key' },
    });
    expect(provider.getApiKey()).toBe('env-key');
  });

  it('should get default API URL', () => {
    const provider = new HyperbolicAudioProvider('melo');
    expect(provider.getApiUrl()).toBe('https://api.hyperbolic.xyz/v1');
  });

  it('should get custom API URL from config', () => {
    const provider = new HyperbolicAudioProvider('melo', {
      config: { apiBaseUrl: 'https://custom.api.com' },
    });
    expect(provider.getApiUrl()).toBe('https://custom.api.com');
  });

  it('should generate correct provider ID', () => {
    const provider = new HyperbolicAudioProvider('melo');
    expect(provider.id()).toBe('hyperbolic:audio:melo');
  });

  it('should have correct string representation', () => {
    const provider = new HyperbolicAudioProvider('melo');
    expect(provider.toString()).toBe('[Hyperbolic Audio Provider melo]');
  });

  describe('callApi', () => {
    it('should throw error if API key is not set', async () => {
      // Ensure no API key is set in environment
      delete process.env.HYPERBOLIC_API_KEY;
      const provider = new HyperbolicAudioProvider('melo');
      await expect(provider.callApi('test')).rejects.toThrow('Hyperbolic API key is not set');
    });

    it('should handle successful API call', async () => {
      const mockResponse = {
        data: { audio: 'base64audio' },
        cached: false,
        status: 200,
        statusText: 'OK',
      };

      jest.mocked(fetchWithCache).mockResolvedValue(mockResponse);

      const provider = new HyperbolicAudioProvider('melo', {
        config: { apiKey: 'test-key' },
      });

      const result = await provider.callApi('test text');

      expect(result).toEqual({
        output: 'base64audio',
        cached: false,
        cost: 0.001 * (9 / 1000), // 9 chars in 'test text'
        isBase64: true,
        audio: {
          data: 'base64audio',
          format: 'wav',
        },
      });
    });

    it('should handle API errors', async () => {
      const mockResponse = {
        data: { error: 'API Error' },
        cached: false,
        status: 400,
        statusText: 'Bad Request',
      };

      jest.mocked(fetchWithCache).mockResolvedValue(mockResponse);

      const provider = new HyperbolicAudioProvider('melo', {
        config: { apiKey: 'test-key' },
      });

      const result = await provider.callApi('test');
      expect(result.error).toBe('API error: 400 Bad Request\n{"error":"API Error"}');
    });

    it('should handle missing audio data', async () => {
      const mockResponse = {
        data: {},
        cached: false,
        status: 200,
        statusText: 'OK',
      };

      jest.mocked(fetchWithCache).mockResolvedValue(mockResponse);

      const provider = new HyperbolicAudioProvider('melo', {
        config: { apiKey: 'test-key' },
      });

      const result = await provider.callApi('test');
      expect(result.error).toBe('No audio data returned from API');
    });

    it('should handle cached responses', async () => {
      const mockResponse = {
        data: { audio: 'base64audio' },
        cached: true,
        status: 200,
        statusText: 'OK',
      };

      jest.mocked(fetchWithCache).mockResolvedValue(mockResponse);

      const provider = new HyperbolicAudioProvider('melo', {
        config: { apiKey: 'test-key' },
      });

      const result = await provider.callApi('test text');
      expect(result.cached).toBe(true);
      expect(result.cost).toBe(0); // Cost should be 0 for cached responses
    });

    it('should save audio to asset storage when enabled', async () => {
      // Enable asset storage
      mockIsAssetStorageEnabled.mockReturnValue(true);

      // Mock asset store
      const mockAssetStore = {
        save: jest.fn().mockResolvedValue({
          id: 'asset-123',
          type: 'audio',
          mimeType: 'audio/wav',
          size: 1000,
          hash: 'testhash',
          createdAt: new Date().toISOString(),
        }),
      };
      mockGetMetricsAssetStore.mockReturnValue(mockAssetStore as any);

      // Mock API response
      const audioBase64 = Buffer.from('test audio data').toString('base64');
      jest.mocked(fetchWithCache).mockResolvedValue({
        data: { audio: audioBase64 },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const provider = new HyperbolicAudioProvider('melo', {
        config: { apiKey: 'test-key' },
      });

      const result = await provider.callApi('test text', {
        vars: {
          __evalId: 'eval-123',
          __resultId: 'result-456',
        },
      });

      expect(mockAssetStore.save).toHaveBeenCalledWith(
        Buffer.from(audioBase64, 'base64'),
        'audio',
        'audio/wav',
        'eval-123',
        'result-456',
      );

      expect(result).toEqual({
        output: '[Audio](asset://eval-123/result-456/asset-123)',
        cached: false,
        cost: expect.any(Number),
        metadata: {
          asset: expect.objectContaining({
            id: 'asset-123',
            type: 'audio',
            mimeType: 'audio/wav',
          }),
        },
      });
    });

    it('should fall back to base64 when asset storage fails', async () => {
      // Enable asset storage
      mockIsAssetStorageEnabled.mockReturnValue(true);

      // Mock asset store that fails
      const mockAssetStore = {
        save: jest.fn().mockRejectedValue(new Error('Storage failed')),
      };
      mockGetMetricsAssetStore.mockReturnValue(mockAssetStore as any);

      // Mock API response
      const audioBase64 = Buffer.from('test audio data').toString('base64');
      jest.mocked(fetchWithCache).mockResolvedValue({
        data: { audio: audioBase64 },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const provider = new HyperbolicAudioProvider('melo', {
        config: { apiKey: 'test-key' },
      });

      const result = await provider.callApi('test text', {
        vars: {
          __evalId: 'eval-123',
          __resultId: 'result-456',
        },
      });

      expect(result).toEqual({
        output: audioBase64,
        cached: false,
        cost: expect.any(Number),
        isBase64: true,
        audio: {
          data: audioBase64,
          format: 'wav',
        },
      });
    });
  });

  describe('createHyperbolicAudioProvider', () => {
    it('should create provider with default model', () => {
      const provider = createHyperbolicAudioProvider('hyperbolic:audio');
      expect((provider as HyperbolicAudioProvider).modelName).toBe('Melo-TTS');
    });

    it('should create provider with specified model', () => {
      const provider = createHyperbolicAudioProvider('hyperbolic:audio:melo');
      expect((provider as HyperbolicAudioProvider).modelName).toBe('melo');
    });

    it('should create provider with config', () => {
      const provider = createHyperbolicAudioProvider('hyperbolic:audio', {
        config: { apiKey: 'test-key' },
      });
      expect((provider as HyperbolicAudioProvider).getApiKey()).toBe('test-key');
    });
  });
});
