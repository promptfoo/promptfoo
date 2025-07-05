import { getCache, isCacheEnabled } from '../../src/cache';
import { getEnvString } from '../../src/envars';
import { FalImageGenerationProvider } from '../../src/providers/fal';

// Mock the fal client
const mockSubscribe = jest.fn();
const mockConfig = jest.fn();

jest.mock('@fal-ai/client', () => ({
  fal: {
    subscribe: mockSubscribe,
    config: mockConfig,
  },
}));

jest.mock('../../src/cache', () => ({
  ...jest.requireActual('../../src/cache'),
  getCache: jest.fn(),
  isCacheEnabled: jest.fn(),
}));

jest.mock('../../src/envars', () => ({
  getEnvString: jest.fn(),
  getEnvInt: jest.fn().mockReturnValue(300000),
  getEnvBool: jest.fn().mockReturnValue(true),
  getEnvFloat: jest.fn(),
}));

describe('Fal Provider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(isCacheEnabled).mockReturnValue(false);
    jest.mocked(getCache).mockReturnValue({
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn(),
      wrap: jest.fn(),
      del: jest.fn(),
      reset: jest.fn(),
      store: {
        get: jest.fn(),
        set: jest.fn(),
      },
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('FalImageGenerationProvider', () => {
    let provider: FalImageGenerationProvider;

    beforeEach(() => {
      provider = new FalImageGenerationProvider('fal-ai/flux/schnell', {
        config: { apiKey: 'test-api-key' },
      });
    });

    describe('constructor and configuration', () => {
      it('should create provider with default options', () => {
        expect(provider).toEqual(
          expect.objectContaining({
            modelName: 'fal-ai/flux/schnell',
            modelType: 'image',
            apiKey: 'test-api-key',
          }),
        );
      });

      it('should create provider with custom configuration options', () => {
        const customProvider = new FalImageGenerationProvider('fal-ai/fast-sdxl', {
          config: {
            apiKey: 'custom-key',
            seed: 12345,
            num_inference_steps: 8,
            image_size: { width: 1024, height: 1024 },
          },
        });

        expect(customProvider).toEqual(
          expect.objectContaining({
            modelName: 'fal-ai/fast-sdxl',
            apiKey: 'custom-key',
            config: {
              apiKey: 'custom-key',
              seed: 12345,
              num_inference_steps: 8,
              image_size: { width: 1024, height: 1024 },
            },
          }),
        );
      });

      it('should use environment variable for API key when not provided in config', () => {
        jest.mocked(jest.mocked(getEnvString)).mockReturnValue('env-api-key');

        const envProvider = new FalImageGenerationProvider('fal-ai/flux/schnell');

        expect(envProvider.apiKey).toBe('env-api-key');
        expect(getEnvString).toHaveBeenCalledWith('FAL_KEY');
      });

      it('should use env override for API key', () => {
        const envProvider = new FalImageGenerationProvider('fal-ai/flux/schnell', {
          env: { FAL_KEY: 'override-key' },
        });

        expect(envProvider.apiKey).toBe('override-key');
      });
    });

    describe('provider identification', () => {
      it('should generate correct provider id', () => {
        expect(provider.id()).toBe('fal:image:fal-ai/flux/schnell');
      });

      it('should generate correct string representation', () => {
        expect(provider.toString()).toBe('[fal.ai Image Generation Provider fal-ai/flux/schnell]');
      });
    });

    describe('API key validation', () => {
      it('should throw error when API key is not set', async () => {
        jest.mocked(jest.mocked(getEnvString)).mockReturnValue(undefined as any);

        const noKeyProvider = new FalImageGenerationProvider('fal-ai/flux/schnell');

        await expect(noKeyProvider.callApi('test prompt')).rejects.toThrow(
          'fal.ai API key is not set. Set the FAL_KEY environment variable or or add `apiKey` to the provider config.',
        );
      });
    });

    describe('API calls and image generation', () => {
      const mockImageResponse = {
        data: {
          images: [{ url: 'https://example.com/image.png' }],
        },
        requestId: 'test-request-id',
      };

      const mockSingleImageResponse = {
        data: {
          image: { url: 'https://example.com/image.png' },
        },
        requestId: 'test-request-id',
      };

      it('should call fal API and return markdown image with images array response', async () => {
        mockSubscribe.mockResolvedValueOnce(mockImageResponse);

        const result = await provider.callApi('a cute cat');

        expect(mockConfig).toHaveBeenCalledWith({
          credentials: 'test-api-key',
        });
        expect(mockSubscribe).toHaveBeenCalledWith('fal-ai/flux/schnell', {
          input: {
            prompt: 'a cute cat',
          },
        });
        expect(result).toEqual({
          cached: false,
          output: '![a cute cat](https://example.com/image.png)',
        });
      });

      it('should call fal API and return markdown image with single image response', async () => {
        mockSubscribe.mockResolvedValueOnce(mockSingleImageResponse);

        const result = await provider.callApi('a beautiful landscape');

        expect(result).toEqual({
          cached: false,
          output: '![a beautiful landscape](https://example.com/image.png)',
        });
      });

      it('should merge provider config with prompt context config', async () => {
        const providerWithConfig = new FalImageGenerationProvider('fal-ai/flux/schnell', {
          config: {
            apiKey: 'test-api-key',
            seed: 12345,
            num_inference_steps: 8,
          },
        });

        mockSubscribe.mockResolvedValueOnce(mockImageResponse);

        await providerWithConfig.callApi('test prompt', {
          prompt: {
            raw: 'test prompt',
            label: 'test',
            config: {
              guidance_scale: 7.5,
            },
          },
          vars: {},
        });

        expect(mockSubscribe).toHaveBeenCalledWith('fal-ai/flux/schnell', {
          input: {
            prompt: 'test prompt',
            seed: 12345,
            num_inference_steps: 8,
            guidance_scale: 7.5,
          },
        });
      });
    });

    describe('runInference method', () => {
      it('should resolve image URL from images array', async () => {
        const mockResponse = {
          data: {
            images: [{ url: 'https://example.com/image.png' }],
          },
          requestId: 'test-request-id',
        };
        mockSubscribe.mockResolvedValueOnce(mockResponse);

        const result = await provider.runInference({
          prompt: 'a cute cat',
          seed: 12345,
        });

        expect(result).toBe('![a cute cat](https://example.com/image.png)');
      });

      it('should resolve image URL from single image object', async () => {
        const mockResponse = {
          data: {
            image: { url: 'https://example.com/image.png' },
          },
          requestId: 'test-request-id',
        };
        mockSubscribe.mockResolvedValueOnce(mockResponse);

        const result = await provider.runInference({
          prompt: 'a beautiful landscape',
          seed: 12345,
        });

        expect(result).toBe('![a beautiful landscape](https://example.com/image.png)');
      });
    });

    describe('prompt processing', () => {
      const mockResponse = {
        data: {
          images: [{ url: 'https://example.com/image.png' }],
        },
        requestId: 'test-request-id',
      };

      beforeEach(() => {
        mockSubscribe.mockResolvedValue(mockResponse);
      });

      it('should sanitize prompt in markdown output', async () => {
        const result = await provider.runInference({
          prompt: 'a [test] prompt\nwith newlines\rand brackets',
        });

        expect(result).toBe(
          '![a (test) prompt with newlines and brackets](https://example.com/image.png)',
        );
      });

      it('should ellipsize long prompts in markdown output', async () => {
        const longPrompt =
          'a very long prompt that exceeds the maximum length and should be ellipsized';

        const result = await provider.runInference({
          prompt: longPrompt,
        });

        expect(result).toBe(
          '![a very long prompt that exceeds the maximum len...](https://example.com/image.png)',
        );
      });
    });

    describe('caching behavior', () => {
      it('should use cached response when cache is enabled and available', async () => {
        jest.mocked(isCacheEnabled).mockReturnValue(true);
        const mockCachedResponse = JSON.stringify(
          '![cached prompt](https://cached.example.com/image.png)',
        );

        const mockCache = {
          get: jest.fn().mockResolvedValue(mockCachedResponse),
          set: jest.fn(),
          wrap: jest.fn(),
          del: jest.fn(),
          reset: jest.fn(),
          store: {
            get: jest.fn(),
            set: jest.fn(),
          },
        };
        jest.mocked(getCache).mockReturnValue(mockCache);

        const result = await provider.callApi('test prompt');

        expect(result).toEqual({
          cached: true,
          output: '![cached prompt](https://cached.example.com/image.png)',
        });
        expect(mockSubscribe).not.toHaveBeenCalled();
        expect(mockCache.get).toHaveBeenCalledWith(
          expect.stringContaining('fal:fal-ai/flux/schnell:'),
        );
      });

      it('should set cache when enabled and response is fresh', async () => {
        jest.mocked(isCacheEnabled).mockReturnValue(true);
        const mockCache = {
          get: jest.fn().mockResolvedValue(null),
          set: jest.fn(),
          wrap: jest.fn(),
          del: jest.fn(),
          reset: jest.fn(),
          store: {
            get: jest.fn(),
            set: jest.fn(),
          },
        };
        jest.mocked(getCache).mockReturnValue(mockCache);

        const mockResponse = {
          data: {
            images: [{ url: 'https://example.com/image.png' }],
          },
          requestId: 'test-request-id',
        };
        mockSubscribe.mockResolvedValueOnce(mockResponse);

        const result = await provider.callApi('test prompt');

        expect(result.cached).toBe(false);
        expect(mockSubscribe).toHaveBeenCalledWith('fal-ai/flux/schnell', {
          input: {
            prompt: 'test prompt',
          },
        });
        expect(mockCache.set).toHaveBeenCalledWith(
          expect.stringContaining('fal:fal-ai/flux/schnell:'),
          JSON.stringify('![test prompt](https://example.com/image.png)'),
        );
      });

      it('should handle cache set errors gracefully', async () => {
        jest.mocked(isCacheEnabled).mockReturnValue(true);
        const mockCache = {
          get: jest.fn().mockResolvedValue(null),
          set: jest.fn().mockRejectedValue(new Error('Cache error')),
          wrap: jest.fn(),
          del: jest.fn(),
          reset: jest.fn(),
          store: {
            get: jest.fn(),
            set: jest.fn(),
          },
        };
        jest.mocked(getCache).mockReturnValue(mockCache);

        const mockResponse = {
          data: {
            images: [{ url: 'https://example.com/image.png' }],
          },
          requestId: 'test-request-id',
        };
        mockSubscribe.mockResolvedValueOnce(mockResponse);

        const result = await provider.callApi('test prompt');

        expect(result).toEqual({
          cached: false,
          output: '![test prompt](https://example.com/image.png)',
        });
      });
    });

    describe('error handling', () => {
      it('should handle API errors', async () => {
        const mockError = new Error('API Error');
        mockSubscribe.mockRejectedValueOnce(mockError);

        await expect(provider.callApi('test prompt')).rejects.toThrow('API Error');
      });

      it('should throw error when image URL cannot be resolved', async () => {
        const mockResponse = {
          data: {
            // No images or image property
          },
          requestId: 'test-request-id',
        };
        mockSubscribe.mockResolvedValueOnce(mockResponse);

        await expect(
          provider.runInference({
            prompt: 'test prompt',
          }),
        ).rejects.toThrow('Failed to resolve image URL.');
      });
    });

    describe('client initialization', () => {
      it('should lazy load the fal client', async () => {
        jest.clearAllMocks();

        const newProvider = new FalImageGenerationProvider('fal-ai/flux/schnell', {
          config: { apiKey: 'test-api-key' },
        });

        const mockResponse = {
          data: {
            images: [{ url: 'https://example.com/image.png' }],
          },
          requestId: 'test-request-id',
        };
        mockSubscribe.mockResolvedValueOnce(mockResponse);

        await newProvider.callApi('test prompt');

        expect(mockSubscribe).toHaveBeenCalledWith('fal-ai/flux/schnell', {
          input: {
            prompt: 'test prompt',
          },
        });
        expect(mockConfig).toHaveBeenCalledWith({
          credentials: 'test-api-key',
        });
      });
    });
  });
});
