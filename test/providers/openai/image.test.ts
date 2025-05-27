import { fetchWithCache } from '../../../src/cache';
import { OpenAiImageProvider, validateSizeForModel, calculateImageCost } from '../../../src/providers/openai/image';

jest.mock('../../../src/cache');
jest.mock('../../../src/logger');

describe('OpenAiImageProvider', () => {
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

  describe('Basic functionality', () => {
    it('should generate an image successfully', async () => {
      const provider = new OpenAiImageProvider('dall-e-3', {
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
        cost: 0.04, // Default cost for DALL-E 3 standard 1024x1024
      });
    });

    it('should use cached response', async () => {
      const provider = new OpenAiImageProvider('dall-e-3', {
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
        cost: 0, // Cost is 0 for cached responses
      });
    });

    it('should sanitize prompt text', async () => {
      const provider = new OpenAiImageProvider('dall-e-3', {
        config: { apiKey: 'test-key' },
      });

      const result = await provider.callApi('Test [prompt] with\nnewlines');

      expect(result.output).toBe('![Test (prompt) with newlines](https://example.com/image.png)');
    });

    it('should correctly use ID passed during construction', async () => {
      const provider = new OpenAiImageProvider('dall-e-3', {
        config: { apiKey: 'test-key' },
        id: 'custom-provider-id',
      });

      expect(provider.id()).toBe('custom-provider-id');
    });

    it('should throw an error if API key is not set', async () => {
      // Save original environment variable
      const originalEnv = process.env.OPENAI_API_KEY;
      // Clear the environment variable so we can test the error
      delete process.env.OPENAI_API_KEY;

      try {
        // Create provider with no API key in config or environment
        const provider = new OpenAiImageProvider('dall-e-3');

        // Mock fetchWithCache to prevent it from being called
        jest.mocked(fetchWithCache).mockImplementation(() => {
          throw new Error('fetchWithCache should not be called');
        });

        // Attempt to call the API should throw an error
        await expect(provider.callApi('Generate a cat')).rejects.toThrow(
          'OpenAI API key is not set. Set the OPENAI_API_KEY environment variable or add `apiKey` to the provider config.',
        );
      } finally {
        // Restore the original environment variable
        process.env.OPENAI_API_KEY = originalEnv;
      }
    });
  });

  describe('Error handling', () => {
    it('should handle missing API key', async () => {
      const provider = new OpenAiImageProvider('dall-e-3');

      jest.mocked(fetchWithCache).mockResolvedValueOnce({
        data: { error: { message: 'OpenAI API key is not set' } },
        cached: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      const result = await provider.callApi('test prompt');

      expect(result).toHaveProperty('error');
      expect(result.error).toContain('OpenAI API key is not set');
    });

    it('should handle API errors', async () => {
      const provider = new OpenAiImageProvider('dall-e-3', {
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
      const provider = new OpenAiImageProvider('dall-e-3', {
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
      const provider = new OpenAiImageProvider('dall-e-3', {
        config: { apiKey: 'test-key' },
      });

      jest.mocked(fetchWithCache).mockRejectedValue(new Error('Network error'));

      const result = await provider.callApi('test prompt');

      expect(result).toHaveProperty('error');
      expect(result.error).toContain('API call error: Error: Network error');
    });

    it('should handle missing image URL in response', async () => {
      const provider = new OpenAiImageProvider('dall-e-3', {
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

    it('should handle error with minimal details', async () => {
      const provider = new OpenAiImageProvider('dall-e-3', {
        config: { apiKey: 'test-key' },
      });

      jest.mocked(fetchWithCache).mockResolvedValueOnce({
        data: 'Just a simple error string',
        cached: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const result = await provider.callApi('test prompt');

      expect(result).toHaveProperty('error');
      expect(result.error).toContain('Internal Server Error');
    });

    it('should handle deleteFromCache when response parsing fails', async () => {
      const provider = new OpenAiImageProvider('dall-e-3', {
        config: { apiKey: 'test-key' },
      });

      const mockDeleteFn = jest.fn();
      jest.mocked(fetchWithCache).mockResolvedValueOnce({
        data: {
          // Invalid data structure that will cause parsing to fail
          deleteFromCache: mockDeleteFn,
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      await provider.callApi('test prompt');
      expect(mockDeleteFn).toHaveBeenCalledTimes(1);
    });
  });

  describe('Response format handling', () => {
    it('should handle base64 response format', async () => {
      const provider = new OpenAiImageProvider('dall-e-3', {
        config: { apiKey: 'test-key', response_format: 'b64_json' },
      });

      jest.mocked(fetchWithCache).mockResolvedValue(mockBase64Response);

      const result = await provider.callApi('test prompt');

      expect(result).toEqual({
        output: JSON.stringify(mockBase64Response.data),
        cached: false,
        isBase64: true,
        format: 'json',
        cost: 0.04, // Default cost for DALL-E 3 standard 1024x1024
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
      const provider = new OpenAiImageProvider('dall-e-3', {
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

  describe('Parameter validation', () => {
    it('should validate size for DALL-E 3', async () => {
      const provider = new OpenAiImageProvider('dall-e-3', {
        config: { apiKey: 'test-key', size: '512x512' },
      });

      const result = await provider.callApi('test prompt');

      expect(result).toHaveProperty('error');
      expect(result.error).toContain('Invalid size "512x512" for DALL-E 3');
    });

    it('should validate size for DALL-E 2', async () => {
      const provider = new OpenAiImageProvider('dall-e-2', {
        config: { apiKey: 'test-key', size: '1792x1024' },
      });

      const result = await provider.callApi('test prompt');

      expect(result).toHaveProperty('error');
      expect(result.error).toContain('Invalid size "1792x1024" for DALL-E 2');
    });

    it('should use correct size defaults based on model', async () => {
      const provider = new OpenAiImageProvider('dall-e-3', {
        config: { apiKey: 'test-key' },
      });

      await provider.callApi('test prompt');

      // Check that the default size for DALL-E 3 is correctly set
      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"size":"1024x1024"'),
        }),
        expect.any(Number),
      );
    });
  });

  describe('Operation handling', () => {
    it('should reject non-generation operations', async () => {
      const provider = new OpenAiImageProvider('dall-e-3', {
        config: {
          apiKey: 'test-key',
          operation: 'variation',
        },
      });

      const result = await provider.callApi('test prompt');

      expect(result).toHaveProperty('error');
      expect(result.error).toContain(
        "Only 'generation' operations are currently supported. 'variation' operations are not implemented.",
      );
    });
  });

  describe('Configuration options', () => {
    it('should handle DALL-E 3 specific options', async () => {
      const provider = new OpenAiImageProvider('dall-e-3', {
        config: {
          apiKey: 'test-key',
          quality: 'hd',
          style: 'vivid',
        },
      });

      await provider.callApi('test prompt');

      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"quality":"hd"'),
        }),
        expect.any(Number),
      );

      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"style":"vivid"'),
        }),
        expect.any(Number),
      );
    });

    it('should include organization ID in headers when provided', async () => {
      const provider = new OpenAiImageProvider('dall-e-3', {
        config: {
          apiKey: 'test-key',
          organization: 'test-org',
        },
      });

      await provider.callApi('test prompt');

      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'OpenAI-Organization': 'test-org',
          }),
        }),
        expect.any(Number),
      );
    });

    it('should include custom headers when provided', async () => {
      const provider = new OpenAiImageProvider('dall-e-3', {
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
      const provider = new OpenAiImageProvider('dall-e-3', {
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

    it('should use custom API URL when provided', async () => {
      const customApiUrl = 'https://custom-openai.example.com/v1';
      const provider = new OpenAiImageProvider('dall-e-3', {
        config: {
          apiKey: 'test-key',
        },
        env: {
          OPENAI_API_BASE_URL: customApiUrl,
        },
      });

      await provider.callApi('test prompt');

      expect(fetchWithCache).toHaveBeenCalledWith(
        `${customApiUrl}/images/generations`,
        expect.any(Object),
        expect.any(Number),
      );
    });
  });

  describe('GPT Image 1 model support', () => {
    it('should support gpt-image-1 model with new features', async () => {
      const provider = new OpenAiImageProvider('gpt-image-1', {
        config: {
          apiKey: 'test-key',
          size: '1024x1536',
          quality: 'high',
          background: 'transparent',
          format: 'png',
        },
      });

      await provider.callApi('test prompt');

      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"model":"gpt-image-1"'),
        }),
        expect.any(Number),
      );

      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"quality":"high"'),
        }),
        expect.any(Number),
      );

      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"background":"transparent"'),
        }),
        expect.any(Number),
      );

      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"format":"png"'),
        }),
        expect.any(Number),
      );
    });

    it('should validate sizes for gpt-image-1', () => {
      const validSizes = ['1024x1024', '1536x1024', '1024x1536', 'auto'];
      const invalidSizes = ['256x256', '512x512', '1792x1024'];

      validSizes.forEach(size => {
        const result = validateSizeForModel(size, 'gpt-image-1');
        expect(result.valid).toBe(true);
      });

      invalidSizes.forEach(size => {
        const result = validateSizeForModel(size, 'gpt-image-1');
        expect(result.valid).toBe(false);
        expect(result.message).toContain('Invalid size');
      });
    });

    it('should calculate costs correctly for gpt-image-1', () => {
      // Test different quality and size combinations
      const lowCost = calculateImageCost('gpt-image-1', '1024x1024', 'low', 1);
      const mediumCost = calculateImageCost('gpt-image-1', '1024x1024', 'medium', 1);
      const highCost = calculateImageCost('gpt-image-1', '1024x1024', 'high', 1);

      expect(lowCost).toBeCloseTo(272 * 2.5 / 1e6, 8); // 272 tokens * $2.50 per 1M tokens
      expect(mediumCost).toBeCloseTo(1056 * 2.5 / 1e6, 8); // 1056 tokens * $2.50 per 1M tokens
      expect(highCost).toBeCloseTo(4160 * 2.5 / 1e6, 8); // 4160 tokens * $2.50 per 1M tokens

      // Test larger size
      const largeCost = calculateImageCost('gpt-image-1', '1024x1536', 'high', 1);
      expect(largeCost).toBeCloseTo(6240 * 2.5 / 1e6, 8); // 6240 tokens * $2.50 per 1M tokens

      // Test multiple images
      const multipleCost = calculateImageCost('gpt-image-1', '1024x1024', 'medium', 3);
      expect(multipleCost).toBeCloseTo(1056 * 2.5 / 1e6 * 3, 8);
    });

    it('should handle auto quality setting', () => {
      const autoCost = calculateImageCost('gpt-image-1', '1024x1024', 'auto', 1);
      const mediumCost = calculateImageCost('gpt-image-1', '1024x1024', 'medium', 1);
      expect(autoCost).toBe(mediumCost); // auto should default to medium
    });

    it('should support additional gpt-image-1 options', async () => {
      const provider = new OpenAiImageProvider('gpt-image-1', {
        config: {
          apiKey: 'test-key',
          output_compression: 85,
          moderation: 'low',
        },
      });

      await provider.callApi('test prompt');

      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"output_compression":85'),
        }),
        expect.any(Number),
      );

      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"moderation":"low"'),
        }),
        expect.any(Number),
      );
    });

    it('should handle edit operation placeholder for gpt-image-1', async () => {
      const provider = new OpenAiImageProvider('gpt-image-1', {
        config: {
          apiKey: 'test-key',
          operation: 'edit',
        },
      });

      const result = await provider.callApi('test prompt');

      expect(result).toHaveProperty('error');
      expect(result.error).toContain('Edit operations for GPT Image 1 are not yet implemented');
    });
  });
});
