import { fetchWithCache } from '../../../src/cache';
import {
  HyperbolicAudioProvider,
  createHyperbolicAudioProvider,
} from '../../../src/providers/hyperbolic/audio';

jest.mock('../../../src/cache');

describe('HyperbolicAudioProvider', () => {
  beforeEach(() => {
    jest.resetAllMocks();
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
