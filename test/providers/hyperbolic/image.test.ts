import { fetchWithCache } from '../../../src/cache';
import {
  createHyperbolicImageProvider,
  formatHyperbolicImageOutput,
  HyperbolicImageProvider,
} from '../../../src/providers/hyperbolic/image';

jest.mock('../../../src/cache');

describe('HyperbolicImageProvider', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      const provider = new HyperbolicImageProvider('test-model');
      expect(provider.modelName).toBe('test-model');
      expect(provider.config).toEqual({});
    });

    it('should initialize with config options', () => {
      const config = { apiKey: 'test-key' };
      const provider = new HyperbolicImageProvider('test-model', { config });
      expect(provider.config).toEqual(config);
    });
  });

  describe('getApiKey', () => {
    it('should return config apiKey if set', () => {
      const provider = new HyperbolicImageProvider('test', {
        config: { apiKey: 'test-key' },
      });
      expect(provider.getApiKey()).toBe('test-key');
    });

    it('should return env apiKey if set', () => {
      const provider = new HyperbolicImageProvider('test', {
        env: { HYPERBOLIC_API_KEY: 'env-key' },
      });
      expect(provider.getApiKey()).toBe('env-key');
    });
  });

  describe('formatHyperbolicImageOutput', () => {
    it('should format b64_json output', () => {
      const result = formatHyperbolicImageOutput('test-data', 'test prompt', 'b64_json');
      expect(JSON.parse(result)).toEqual({
        data: [{ b64_json: 'test-data' }],
      });
    });

    it('should format JPEG data URL', () => {
      const result = formatHyperbolicImageOutput('/9j/test', 'test prompt');
      expect(result).toBe('data:image/jpeg;base64,/9j/test');
    });

    it('should format PNG data URL', () => {
      const result = formatHyperbolicImageOutput('iVBORw0KGgo', 'test prompt');
      expect(result).toBe('data:image/png;base64,iVBORw0KGgo');
    });

    it('should format WebP data URL', () => {
      const result = formatHyperbolicImageOutput('UklGR', 'test prompt');
      expect(result).toBe('data:image/webp;base64,UklGR');
    });
  });

  describe('callApi', () => {
    it('should throw error if no API key', async () => {
      // Ensure no API key is set in environment
      delete process.env.HYPERBOLIC_API_KEY;
      const provider = new HyperbolicImageProvider('test');
      await expect(provider.callApi('test prompt')).rejects.toThrow(
        'Hyperbolic API key is not set',
      );
    });

    it('should handle successful API call', async () => {
      const mockResponse = {
        data: {
          images: [
            {
              image: 'test-image-data',
            },
          ],
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      };

      jest.mocked(fetchWithCache).mockResolvedValue(mockResponse);

      const provider = new HyperbolicImageProvider('test', {
        config: { apiKey: 'test-key' },
      });

      const result = await provider.callApi('test prompt');

      expect(result).toEqual({
        output: 'data:image/jpeg;base64,test-image-data',
        cached: false,
        cost: 0.01,
      });
    });

    it('should handle API errors', async () => {
      jest.mocked(fetchWithCache).mockResolvedValue({
        data: { error: 'API error' },
        cached: false,
        status: 400,
        statusText: 'Bad Request',
      });

      const provider = new HyperbolicImageProvider('test', {
        config: { apiKey: 'test-key' },
      });

      const result = await provider.callApi('test prompt');
      expect(result.error).toBe('API error: 400 Bad Request\n{"error":"API error"}');
    });

    it('should handle empty images array', async () => {
      jest.mocked(fetchWithCache).mockResolvedValue({
        data: { images: [] },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const provider = new HyperbolicImageProvider('test', {
        config: { apiKey: 'test-key' },
      });

      const result = await provider.callApi('test prompt');
      expect(result.error).toBe('No images returned from API');
    });

    it('should handle network errors', async () => {
      jest.mocked(fetchWithCache).mockRejectedValue(new Error('Network error'));

      const provider = new HyperbolicImageProvider('test', {
        config: { apiKey: 'test-key' },
      });

      const result = await provider.callApi('test prompt');
      expect(result.error).toBe('API call error: Error: Network error');
    });
  });

  describe('createHyperbolicImageProvider', () => {
    it('should create provider with default model', () => {
      const provider = createHyperbolicImageProvider('hyperbolic:image');
      expect(provider.id()).toBe('hyperbolic:image:SDXL1.0-base');
    });

    it('should create provider with specified model', () => {
      const provider = createHyperbolicImageProvider('hyperbolic:image:test-model');
      expect(provider.id()).toBe('hyperbolic:image:test-model');
    });

    it('should create provider with config', () => {
      const config = { apiKey: 'test-key' };
      const provider = createHyperbolicImageProvider('hyperbolic:image', { config });
      expect((provider as HyperbolicImageProvider).config).toEqual(config);
    });
  });
});
