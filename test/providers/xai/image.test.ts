import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { callOpenAiImageApi } from '../../../src/providers/openai/image';
import { getRequestTimeoutMs } from '../../../src/providers/shared';
import { createXAIImageProvider, XAIImageProvider } from '../../../src/providers/xai/image';
import { mockProcessEnv } from '../../util/utils';

vi.mock('../../../src/logger');
vi.mock('../../../src/providers/openai/image', async () => {
  const actual = await vi.importActual('../../../src/providers/openai/image');
  return {
    ...actual,
    callOpenAiImageApi: vi.fn(),
  };
});

describe('XAI Image Provider', () => {
  const mockApiKey = 'test-api-key';
  const mockPrompt = 'test prompt';

  const mockSuccessResponse = {
    data: {
      created: 1234567890,
      data: [
        {
          url: 'https://example.com/image.jpg',
        },
      ],
    },
    cached: false,
    status: 200,
    statusText: 'OK',
  };

  const mockBase64Response = {
    data: {
      created: 1234567890,
      data: [{ b64_json: 'base64EncodedImageData' }],
    },
    cached: false,
    status: 200,
    statusText: 'OK',
  };

  const mockCachedResponse = {
    data: {
      created: 1234567890,
      data: [
        {
          url: 'https://example.com/image.jpg',
        },
      ],
    },
    cached: true,
    status: 200,
    statusText: 'OK',
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.clearAllMocks();
    vi.mocked(callOpenAiImageApi).mockResolvedValue(mockSuccessResponse);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Provider creation and configuration', () => {
    it('throws an error if no model name is provided', () => {
      expect(() => createXAIImageProvider('xai:image:')).toThrow('Model name is required');
    });

    it('creates an xAI image provider with specified model', () => {
      const provider = createXAIImageProvider('xai:image:grok-2-image');
      expect(provider).toBeInstanceOf(XAIImageProvider);
      expect(provider.id()).toBe('xai:image:grok-2-image');
    });

    it('supports the current Grok Imagine image model', () => {
      const provider = createXAIImageProvider('xai:image:grok-imagine-image');
      expect(provider).toBeInstanceOf(XAIImageProvider);
      expect(provider.id()).toBe('xai:image:grok-imagine-image');
    });

    it('supports current Grok Imagine image aliases and pro model', () => {
      // Both verified against xAI /v1/image-generation-models.
      expect(createXAIImageProvider('xai:image:grok-imagine-image-2026-03-02').id()).toBe(
        'xai:image:grok-imagine-image-2026-03-02',
      );
      expect(createXAIImageProvider('xai:image:grok-imagine-image-pro').id()).toBe(
        'xai:image:grok-imagine-image-pro',
      );
    });

    it('should create provider with correct defaults', () => {
      const provider = new XAIImageProvider('grok-2-image');
      expect(provider.config).toEqual({});
      expect(provider.modelName).toBe('grok-2-image');
    });

    it('should use correct API URL', () => {
      const provider = new XAIImageProvider('grok-2-image');
      expect(provider.getApiUrlDefault()).toBe('https://api.x.ai/v1');
    });

    it('uses a regional API URL when configured', () => {
      const provider = new XAIImageProvider('grok-imagine-image', {
        config: { region: 'eu-west-1' },
      });
      // The OpenAI base reads `apiBaseUrl` directly, so the regional URL must be
      // baked in at construction time — not just exposed via getApiUrlDefault().
      expect(provider.getApiUrl()).toBe('https://eu-west-1.api.x.ai/v1');
      expect(provider.getApiUrlDefault()).toBe('https://eu-west-1.api.x.ai/v1');
    });

    it('user-provided apiBaseUrl wins over region', () => {
      const provider = new XAIImageProvider('grok-imagine-image', {
        config: { region: 'eu-west-1', apiBaseUrl: 'https://my-proxy.example.com/v1' },
      });
      expect(provider.getApiUrl()).toBe('https://my-proxy.example.com/v1');
    });

    it('uses correct model mapping', () => {
      const provider = new XAIImageProvider('grok-image', {
        config: { apiKey: 'test-key' },
      });

      // The provider should map 'grok-image' to 'grok-2-image' internally
      expect(provider).toBeInstanceOf(XAIImageProvider);
    });
  });

  describe('Basic functionality', () => {
    it('uses Grok Imagine generation options and reported cost when present', async () => {
      vi.mocked(callOpenAiImageApi).mockResolvedValueOnce({
        ...mockSuccessResponse,
        data: {
          ...mockSuccessResponse.data,
          usage: { cost_in_usd_ticks: 200000000 },
        },
      });

      const provider = new XAIImageProvider('grok-imagine-image', {
        config: {
          apiKey: mockApiKey,
          aspect_ratio: '16:9',
          resolution: '2k',
        },
      });

      const result = await provider.callApi('Generate a cat');

      expect(callOpenAiImageApi).toHaveBeenCalledWith(
        'https://api.x.ai/v1/images/generations',
        {
          model: 'grok-imagine-image',
          prompt: 'Generate a cat',
          n: 1,
          response_format: 'url',
          aspect_ratio: '16:9',
          resolution: '2k',
        },
        {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${mockApiKey}`,
        },
        getRequestTimeoutMs(),
      );
      expect(result.cost).toBe(0.02);
    });

    it('uses the pro image model without falling back to the legacy model name', async () => {
      const provider = new XAIImageProvider('grok-imagine-image-pro', {
        config: { apiKey: mockApiKey },
      });

      const result = await provider.callApi('Generate a cat');

      expect(callOpenAiImageApi).toHaveBeenCalledWith(
        'https://api.x.ai/v1/images/generations',
        {
          model: 'grok-imagine-image-pro',
          prompt: 'Generate a cat',
          n: 1,
          response_format: 'url',
        },
        {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${mockApiKey}`,
        },
        getRequestTimeoutMs(),
      );
      expect(result.cost).toBe(0.07);
    });

    it('uses the edits endpoint when image inputs are provided', async () => {
      const provider = new XAIImageProvider('grok-imagine-image', {
        config: {
          apiKey: mockApiKey,
          image: { url: 'https://example.com/source.png' },
          mask: { url: 'https://example.com/mask.png' },
          quality: 'high',
        },
      });

      await provider.callApi('Render this as a pencil sketch');

      expect(callOpenAiImageApi).toHaveBeenCalledWith(
        'https://api.x.ai/v1/images/edits',
        {
          model: 'grok-imagine-image',
          prompt: 'Render this as a pencil sketch',
          n: 1,
          response_format: 'url',
          quality: 'high',
          image: { url: 'https://example.com/source.png' },
          mask: { url: 'https://example.com/mask.png' },
        },
        {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${mockApiKey}`,
        },
        getRequestTimeoutMs(),
      );
    });

    it('should generate an image successfully', async () => {
      const provider = new XAIImageProvider('grok-2-image', {
        config: { apiKey: mockApiKey },
      });

      const result = await provider.callApi('Generate a cat');

      expect(callOpenAiImageApi).toHaveBeenCalledWith(
        'https://api.x.ai/v1/images/generations',
        {
          model: 'grok-2-image',
          prompt: 'Generate a cat',
          n: 1,
          response_format: 'url',
        },
        {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${mockApiKey}`,
        },
        getRequestTimeoutMs(),
      );

      expect(result).toEqual({
        output: '![Generate a cat](https://example.com/image.jpg)',
        images: [{ data: 'https://example.com/image.jpg', mimeType: 'image/jpeg' }],
        cached: false,
        cost: 0.07, // xAI pricing: $0.07 per generated image
      });
    });

    it('should use cached response', async () => {
      const provider = new XAIImageProvider('grok-2-image', {
        config: { apiKey: mockApiKey },
      });

      vi.mocked(callOpenAiImageApi).mockResolvedValue(mockCachedResponse);

      const result = await provider.callApi('test prompt');

      expect(result).toEqual({
        output: '![test prompt](https://example.com/image.jpg)',
        images: [{ data: 'https://example.com/image.jpg', mimeType: 'image/jpeg' }],
        cached: true,
        cost: 0,
      });
    });

    it('should include all generated URL images in images array', async () => {
      const provider = new XAIImageProvider('grok-2-image', {
        config: { apiKey: mockApiKey, n: 2 },
      });

      vi.mocked(callOpenAiImageApi).mockResolvedValue({
        data: {
          data: [
            { url: 'https://example.com/image-1.jpg' },
            { url: 'https://example.com/image-2.jpg' },
          ],
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await provider.callApi('test prompt');

      expect(result).toEqual({
        output: '![test prompt](https://example.com/image-1.jpg)',
        images: [
          { data: 'https://example.com/image-1.jpg', mimeType: 'image/jpeg' },
          { data: 'https://example.com/image-2.jpg', mimeType: 'image/jpeg' },
        ],
        cached: false,
        cost: 0.14,
      });
    });

    it('should include latencyMs when available', async () => {
      const provider = new XAIImageProvider('grok-2-image', {
        config: { apiKey: mockApiKey },
      });

      vi.mocked(callOpenAiImageApi).mockResolvedValue({
        ...mockSuccessResponse,
        latencyMs: 321,
      });

      const result = await provider.callApi('test prompt');

      expect(result).toMatchObject({
        latencyMs: 321,
      });
    });

    it('should use XAI API endpoint', async () => {
      const provider = new XAIImageProvider('grok-2-image', {
        config: { apiKey: mockApiKey },
      });

      await provider.callApi('test prompt');

      expect(callOpenAiImageApi).toHaveBeenCalledWith(
        'https://api.x.ai/v1/images/generations',
        expect.any(Object),
        expect.any(Object),
        expect.any(Number),
      );
    });

    it('should throw an error if API key is not set', async () => {
      // Save original environment variables
      const originalXaiKey = process.env.XAI_API_KEY;
      const originalOpenAiKey = process.env.OPENAI_API_KEY;

      // Clear all possible API key environment variables
      mockProcessEnv({ XAI_API_KEY: undefined });
      mockProcessEnv({ OPENAI_API_KEY: undefined });

      try {
        // Create provider with no API key in config or environment
        const provider = new XAIImageProvider('grok-2-image');

        // Attempt to call the API should throw an error
        await expect(provider.callApi('Generate a cat')).rejects.toThrow(
          'xAI API key is not set. Set the XAI_API_KEY environment variable or add `apiKey` to the provider config.',
        );
      } finally {
        // Restore the original environment variables
        if (originalXaiKey) {
          mockProcessEnv({ XAI_API_KEY: originalXaiKey });
        }
        if (originalOpenAiKey) {
          mockProcessEnv({ OPENAI_API_KEY: originalOpenAiKey });
        }
      }
    });

    it('should calculate correct cost', async () => {
      const provider = new XAIImageProvider('grok-2-image', {
        config: { apiKey: mockApiKey },
      });

      const result = await provider.callApi(mockPrompt);
      expect(result.cost).toBe(0.07); // $0.07 per image
    });
  });

  describe('Model name mapping', () => {
    it('should map grok-image to grok-2-image', async () => {
      const provider = new XAIImageProvider('grok-image', {
        config: { apiKey: mockApiKey },
      });

      await provider.callApi('test prompt');

      expect(callOpenAiImageApi).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          model: 'grok-2-image',
        }),
        expect.any(Object),
        expect.any(Number),
      );
    });

    it('should use grok-2-image as default for unknown models', async () => {
      const provider = new XAIImageProvider('unknown-model', {
        config: { apiKey: mockApiKey },
      });

      await provider.callApi('test prompt');

      expect(callOpenAiImageApi).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          model: 'grok-2-image',
        }),
        expect.any(Object),
        expect.any(Number),
      );
    });
  });

  describe('Error handling', () => {
    it('should handle API errors', async () => {
      const provider = new XAIImageProvider('grok-2-image', {
        config: { apiKey: mockApiKey },
      });

      const errorResponse = {
        data: { error: { message: 'API error message', type: 'api_error', code: 'error_code' } },
        cached: false,
        status: 400,
        statusText: 'Bad Request',
      };

      vi.mocked(callOpenAiImageApi).mockResolvedValue(errorResponse);

      const result = await provider.callApi('test prompt');

      expect(result).toHaveProperty('error');
      expect(result.error).toContain('API error: 400 Bad Request');
    });

    it('should handle HTTP errors', async () => {
      const provider = new XAIImageProvider('grok-2-image', {
        config: { apiKey: mockApiKey },
      });

      vi.mocked(callOpenAiImageApi).mockResolvedValue({
        data: 'Error message',
        cached: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const result = await provider.callApi('test prompt');

      expect(result).toHaveProperty('error');
      expect(result.error).toContain('API error: 500 Internal Server Error');
    });

    it('should handle fetch errors', async () => {
      const provider = new XAIImageProvider('grok-2-image', {
        config: { apiKey: mockApiKey },
      });

      vi.mocked(callOpenAiImageApi).mockRejectedValue(new Error('Network error'));

      const result = await provider.callApi('test prompt');

      expect(result).toHaveProperty('error');
      expect(result.error).toContain('API call error: Error: Network error');
    });

    it('should handle missing image URL in response', async () => {
      const provider = new XAIImageProvider('grok-2-image', {
        config: { apiKey: mockApiKey },
      });

      vi.mocked(callOpenAiImageApi).mockResolvedValue({
        data: { data: [{}] },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await provider.callApi('test prompt');

      expect(result).toHaveProperty('error');
      expect(result.error).toContain('No image URL found in response');
    });

    it('should handle non-200 API responses', async () => {
      const provider = new XAIImageProvider('grok-2-image', {
        config: { apiKey: mockApiKey },
      });

      vi.mocked(callOpenAiImageApi).mockResolvedValue({
        data: { error: 'Invalid request' },
        cached: false,
        status: 400,
        statusText: 'Bad Request',
      });

      const result = await provider.callApi(mockPrompt);
      expect(result.error).toMatch(/API error: 400 Bad Request/);
    });
  });

  describe('Response format handling', () => {
    it('should handle base64 response format', async () => {
      const provider = new XAIImageProvider('grok-2-image', {
        config: { apiKey: mockApiKey, response_format: 'b64_json' },
      });

      vi.mocked(callOpenAiImageApi).mockResolvedValue(mockBase64Response);

      const result = await provider.callApi('test prompt');

      expect(result).toEqual({
        output: 'data:image/png;base64,base64EncodedImageData',
        images: [{ data: 'data:image/png;base64,base64EncodedImageData', mimeType: 'image/png' }],
        cached: false,
        isBase64: true,
        format: 'json',
        cost: 0.07,
      });

      // Verify the request included the response_format parameter
      expect(callOpenAiImageApi).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          response_format: 'b64_json',
        }),
        expect.any(Object),
        expect.any(Number),
      );
    });

    it('should handle missing base64 data in response', async () => {
      const provider = new XAIImageProvider('grok-2-image', {
        config: { apiKey: mockApiKey, response_format: 'b64_json' },
      });

      vi.mocked(callOpenAiImageApi).mockResolvedValue({
        data: { data: [{}] },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await provider.callApi('test prompt');

      expect(result).toHaveProperty('error');
      expect(result.error).toContain('No base64 image data found in response');
    });

    it('should handle custom response format', async () => {
      const provider = new XAIImageProvider('grok-2-image', {
        config: {
          apiKey: mockApiKey,
          response_format: 'b64_json',
        },
      });

      await provider.callApi(mockPrompt);

      expect(callOpenAiImageApi).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          response_format: 'b64_json',
        }),
        expect.any(Object),
        expect.any(Number),
      );
    });
  });

  describe('Configuration options', () => {
    it('should handle number of images parameter', async () => {
      const provider = new XAIImageProvider('grok-2-image', {
        config: { apiKey: mockApiKey, n: 2 },
      });

      await provider.callApi('test prompt');

      expect(callOpenAiImageApi).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          n: 2,
        }),
        expect.any(Object),
        expect.any(Number),
      );
    });

    it('should handle user parameter', async () => {
      const provider = new XAIImageProvider('grok-2-image', {
        config: { apiKey: mockApiKey, user: 'test-user' },
      });

      await provider.callApi('test prompt');

      expect(callOpenAiImageApi).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          user: 'test-user',
        }),
        expect.any(Object),
        expect.any(Number),
      );
    });

    it('should include custom headers when provided', async () => {
      const provider = new XAIImageProvider('grok-2-image', {
        config: {
          apiKey: mockApiKey,
          headers: {
            'X-Custom-Header': 'custom-value',
          },
        },
      });

      await provider.callApi('test prompt');

      expect(callOpenAiImageApi).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        expect.objectContaining({
          'X-Custom-Header': 'custom-value',
        }),
        expect.any(Number),
      );
    });

    it('should merge prompt config with provider config', async () => {
      const provider = new XAIImageProvider('grok-2-image', {
        config: { apiKey: mockApiKey, n: 1 },
      });

      const context = {
        prompt: {
          raw: 'test prompt',
          config: { n: 2 },
          label: 'test',
        },
        vars: {},
      };

      await provider.callApi('test prompt', context);

      expect(callOpenAiImageApi).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          n: 2,
        }),
        expect.any(Object),
        expect.any(Number),
      );
    });
  });

  describe('Provider methods', () => {
    it('generates correct id() for the provider', () => {
      const provider = new XAIImageProvider('grok-2-image');
      expect(provider.id()).toBe('xai:image:grok-2-image');
    });

    it('returns readable toString() description', () => {
      const provider = new XAIImageProvider('grok-2-image');
      expect(provider.toString()).toBe('[xAI Image Provider grok-2-image]');
    });

    it('returns correct default API URL', () => {
      const provider = new XAIImageProvider('grok-2-image');
      expect(provider.getApiUrlDefault()).toBe('https://api.x.ai/v1');
    });
  });

  describe('createXAIImageProvider factory function', () => {
    it('should create provider instance', () => {
      const provider = createXAIImageProvider('xai:image:grok-2-image');
      expect(provider).toBeInstanceOf(XAIImageProvider);
    });

    it('should throw error if model name missing', () => {
      expect(() => createXAIImageProvider('xai:image:')).toThrow('Model name is required');
    });

    it('should pass through options correctly', () => {
      const options = {
        config: { apiKey: 'test-key', n: 2 },
      };
      const provider = createXAIImageProvider('xai:image:grok-2-image', options);
      expect(provider.config).toEqual(options.config);
    });
  });

  describe('Cost calculation for images', () => {
    it('should calculate cost correctly for single image', async () => {
      const provider = new XAIImageProvider('grok-2-image', {
        config: { apiKey: mockApiKey },
      });

      const result = await provider.callApi('test prompt');
      expect(result.cost).toBe(0.07);
    });

    it('should not charge for cached responses', async () => {
      const provider = new XAIImageProvider('grok-2-image', {
        config: { apiKey: mockApiKey },
      });

      vi.mocked(callOpenAiImageApi).mockResolvedValue(mockCachedResponse);

      const result = await provider.callApi('test prompt');
      expect(result.cost).toBe(0);
      expect(result.cached).toBe(true);
    });

    it('should calculate cost for multiple images', async () => {
      const provider = new XAIImageProvider('grok-2-image', {
        config: { apiKey: mockApiKey, n: 3 },
      });

      const multiImageResponse = {
        data: {
          created: 1234567890,
          data: [
            { url: 'https://example.com/image1.jpg' },
            { url: 'https://example.com/image2.jpg' },
            { url: 'https://example.com/image3.jpg' },
          ],
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      };

      vi.mocked(callOpenAiImageApi).mockResolvedValue(multiImageResponse);

      const result = await provider.callApi('test prompt');
      expect(result.cost).toBeCloseTo(0.21, 2); // 3 images * $0.07
    });
  });
});
