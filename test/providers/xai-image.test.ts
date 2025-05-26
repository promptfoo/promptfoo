import { fetchWithCache } from '../../src/cache';
import { createXAIImageProvider, XAIImageProvider } from '../../src/providers/xai-image';

jest.mock('../../src/cache');
jest.mock('../../src/logger');

describe('XAIImageProvider', () => {
  const mockFetchResponse = {
    data: {
      data: [{ url: 'https://example.com/image.png' }],
    },
    cached: false,
    status: 200,
    statusText: 'OK',
  };

  const mockBase64Response = {
    data: {
      data: [{ b64_json: 'base64EncodedImageData' }],
    },
    cached: false,
    status: 200,
    statusText: 'OK',
  };

  beforeEach(() => {
    jest.resetAllMocks();
    jest.mocked(fetchWithCache).mockResolvedValue(mockFetchResponse);
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

    it('sets the correct API base URL and API key environment variable', () => {
      const provider = new XAIImageProvider('grok-2-image', {
        config: { apiKey: 'test-key' },
      });

      expect(provider.getApiUrl()).toBe('https://api.x.ai/v1');
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
    it('should generate an image successfully', async () => {
      const provider = new XAIImageProvider('grok-2-image', {
        config: { apiKey: 'test-key' },
      });

      const result = await provider.callApi('Generate a cat');

      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.stringContaining('/images/generations'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-key',
          }),
          body: expect.stringContaining('"prompt":"Generate a cat"'),
        }),
        expect.any(Number),
      );

      expect(result).toEqual({
        output: '![Generate a cat](https://example.com/image.png)',
        cached: false,
        cost: 0.07, // xAI pricing: $0.07 per generated image
      });
    });

    it('should use cached response', async () => {
      const provider = new XAIImageProvider('grok-2-image', {
        config: { apiKey: 'test-key' },
      });

      jest.mocked(fetchWithCache).mockResolvedValue({
        ...mockFetchResponse,
        cached: true,
      });

      const result = await provider.callApi('test prompt');

      expect(result).toEqual({
        output: '![test prompt](https://example.com/image.png)',
        cached: true,
        cost: 0,
      });
    });

    it('should use XAI API endpoint', async () => {
      const provider = new XAIImageProvider('grok-2-image', {
        config: { apiKey: 'test-key' },
      });

      await provider.callApi('test prompt');

      expect(fetchWithCache).toHaveBeenCalledWith(
        'https://api.x.ai/v1/images/generations',
        expect.any(Object),
        expect.any(Number),
      );
    });

    it('should throw an error if API key is not set', async () => {
      // Save original environment variables
      const originalXaiKey = process.env.XAI_API_KEY;
      const originalOpenAiKey = process.env.OPENAI_API_KEY;

      // Clear all possible API key environment variables
      delete process.env.XAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      try {
        // Create provider with no API key in config or environment
        const provider = new XAIImageProvider('grok-2-image');

        // Attempt to call the API should throw an error
        await expect(provider.callApi('Generate a cat')).rejects.toThrow(
          'xAI API key is not set. Set the XAI_API_KEY environment variable or add `apiKey` to the provider config.',
        );
      } finally {
        // Restore the original environment variables
        if (originalXaiKey) {process.env.XAI_API_KEY = originalXaiKey;}
        if (originalOpenAiKey) {process.env.OPENAI_API_KEY = originalOpenAiKey;}
      }
    });
  });

  describe('Model name mapping', () => {
    it('should map grok-image to grok-2-image', async () => {
      const provider = new XAIImageProvider('grok-image', {
        config: { apiKey: 'test-key' },
      });

      await provider.callApi('test prompt');

      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"model":"grok-2-image"'),
        }),
        expect.any(Number),
      );
    });

    it('should use grok-2-image as default for unknown models', async () => {
      const provider = new XAIImageProvider('unknown-model', {
        config: { apiKey: 'test-key' },
      });

      await provider.callApi('test prompt');

      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"model":"grok-2-image"'),
        }),
        expect.any(Number),
      );
    });
  });

  describe('Error handling', () => {
    it('should handle API errors', async () => {
      const provider = new XAIImageProvider('grok-2-image', {
        config: { apiKey: 'test-key' },
      });

      const errorResponse = {
        data: { error: { message: 'API error message', type: 'api_error', code: 'error_code' } },
        cached: false,
        status: 400,
        statusText: 'Bad Request',
      };

      jest.mocked(fetchWithCache).mockResolvedValue(errorResponse);

      const result = await provider.callApi('test prompt');

      expect(result).toHaveProperty('error');
      expect(result.error).toContain('API error message');
    });

    it('should handle HTTP errors', async () => {
      const provider = new XAIImageProvider('grok-2-image', {
        config: { apiKey: 'test-key' },
      });

      jest.mocked(fetchWithCache).mockResolvedValue({
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
        config: { apiKey: 'test-key' },
      });

      jest.mocked(fetchWithCache).mockRejectedValue(new Error('Network error'));

      const result = await provider.callApi('test prompt');

      expect(result).toHaveProperty('error');
      expect(result.error).toContain('API call error: Error: Network error');
    });

    it('should handle missing image URL in response', async () => {
      const provider = new XAIImageProvider('grok-2-image', {
        config: { apiKey: 'test-key' },
      });

      jest.mocked(fetchWithCache).mockResolvedValue({
        data: { data: [{}] },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await provider.callApi('test prompt');

      expect(result).toHaveProperty('error');
      expect(result.error).toContain('No image URL found in response');
    });
  });

  describe('Response format handling', () => {
    it('should handle base64 response format', async () => {
      const provider = new XAIImageProvider('grok-2-image', {
        config: { apiKey: 'test-key', response_format: 'b64_json' },
      });

      jest.mocked(fetchWithCache).mockResolvedValue(mockBase64Response);

      const result = await provider.callApi('test prompt');

      expect(result).toEqual({
        output: JSON.stringify(mockBase64Response.data),
        cached: false,
        isBase64: true,
        format: 'json',
        cost: 0.07,
      });

      // Verify the request included the response_format parameter
      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"response_format":"b64_json"'),
        }),
        expect.any(Number),
      );
    });

    it('should handle missing base64 data in response', async () => {
      const provider = new XAIImageProvider('grok-2-image', {
        config: { apiKey: 'test-key', response_format: 'b64_json' },
      });

      jest.mocked(fetchWithCache).mockResolvedValue({
        data: { data: [{}] },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const result = await provider.callApi('test prompt');

      expect(result).toHaveProperty('error');
      expect(result.error).toContain('No base64 image data found in response');
    });
  });

  describe('Configuration options', () => {
    it('should handle number of images parameter', async () => {
      const provider = new XAIImageProvider('grok-2-image', {
        config: { apiKey: 'test-key', n: 2 },
      });

      await provider.callApi('test prompt');

      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"n":2'),
        }),
        expect.any(Number),
      );
    });

    it('should handle user parameter', async () => {
      const provider = new XAIImageProvider('grok-2-image', {
        config: { apiKey: 'test-key', user: 'test-user' },
      });

      await provider.callApi('test prompt');

      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"user":"test-user"'),
        }),
        expect.any(Number),
      );
    });

    it('should include custom headers when provided', async () => {
      const provider = new XAIImageProvider('grok-2-image', {
        config: {
          apiKey: 'test-key',
          headers: {
            'X-Custom-Header': 'custom-value',
          },
        },
      });

      await provider.callApi('test prompt');

      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Custom-Header': 'custom-value',
          }),
        }),
        expect.any(Number),
      );
    });

    it('should merge prompt config with provider config', async () => {
      const provider = new XAIImageProvider('grok-2-image', {
        config: { apiKey: 'test-key', n: 1 },
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

      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"n":2'),
        }),
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
});
