import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchWithCache } from '../../../src/cache';
import { OpenAiImageProvider } from '../../../src/providers/openai/image';

vi.mock('../../../src/cache', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    fetchWithCache: vi.fn(),
  };
});
vi.mock('../../../src/logger', () => ({
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

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
    vi.resetAllMocks();
    vi.mocked(fetchWithCache).mockResolvedValue(mockFetchResponse);
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

      vi.mocked(fetchWithCache).mockResolvedValue({
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
        vi.mocked(fetchWithCache).mockImplementation(function () {
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

      vi.mocked(fetchWithCache).mockResolvedValueOnce({
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

      vi.mocked(fetchWithCache).mockResolvedValue(errorResponse);

      const result = await provider.callApi('test prompt');

      expect(result).toHaveProperty('error');
      expect(result.error).toContain('API error message');
    });

    it('should handle HTTP errors', async () => {
      const provider = new OpenAiImageProvider('dall-e-3', {
        config: { apiKey: 'test-key' },
      });

      vi.mocked(fetchWithCache).mockResolvedValue({
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

      vi.mocked(fetchWithCache).mockRejectedValue(new Error('Network error'));

      const result = await provider.callApi('test prompt');

      expect(result).toHaveProperty('error');
      expect(result.error).toContain('API call error: Error: Network error');
    });

    it('should handle missing image URL in response', async () => {
      const provider = new OpenAiImageProvider('dall-e-3', {
        config: { apiKey: 'test-key' },
      });

      vi.mocked(fetchWithCache).mockResolvedValue({
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

      vi.mocked(fetchWithCache).mockResolvedValueOnce({
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

      const mockDeleteFn = vi.fn();
      vi.mocked(fetchWithCache).mockResolvedValueOnce({
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

      vi.mocked(fetchWithCache).mockResolvedValue(mockBase64Response);

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

      vi.mocked(fetchWithCache).mockResolvedValue({
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

  describe('GPT Image 1 support', () => {
    const mockGptImage1Response = {
      data: {
        data: [{ b64_json: 'base64EncodedImageData' }],
        background: 'opaque',
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    };

    beforeEach(() => {
      vi.mocked(fetchWithCache).mockResolvedValue(mockGptImage1Response);
    });

    it('should not send response_format parameter for gpt-image-1', async () => {
      const provider = new OpenAiImageProvider('gpt-image-1', {
        config: { apiKey: 'test-key' },
      });

      await provider.callApi('test prompt');

      const callArgs = vi.mocked(fetchWithCache).mock.calls[0];
      const body = JSON.parse(callArgs[1]!.body as string);

      expect(body).not.toHaveProperty('response_format');
      expect(body.model).toBe('gpt-image-1');
    });

    it('should always treat gpt-image-1 response as b64_json', async () => {
      const provider = new OpenAiImageProvider('gpt-image-1', {
        config: { apiKey: 'test-key' },
      });

      const result = await provider.callApi('test prompt');

      expect(result).toEqual({
        output: JSON.stringify(mockGptImage1Response.data),
        cached: false,
        isBase64: true,
        format: 'json',
        cost: 0.011, // Default cost for gpt-image-1 low 1024x1024
      });
    });

    it('should handle gpt-image-1 quality parameter', async () => {
      const provider = new OpenAiImageProvider('gpt-image-1', {
        config: { apiKey: 'test-key', quality: 'high' },
      });

      await provider.callApi('test prompt');

      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"quality":"high"'),
        }),
        expect.any(Number),
      );
    });

    it('should handle gpt-image-1 background parameter', async () => {
      const provider = new OpenAiImageProvider('gpt-image-1', {
        config: { apiKey: 'test-key', background: 'transparent' },
      });

      await provider.callApi('test prompt');

      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"background":"transparent"'),
        }),
        expect.any(Number),
      );
    });

    it('should handle gpt-image-1 output_format parameter', async () => {
      const provider = new OpenAiImageProvider('gpt-image-1', {
        config: { apiKey: 'test-key', output_format: 'jpeg' },
      });

      await provider.callApi('test prompt');

      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"output_format":"jpeg"'),
        }),
        expect.any(Number),
      );
    });

    it('should handle gpt-image-1 output_compression parameter', async () => {
      const provider = new OpenAiImageProvider('gpt-image-1', {
        config: { apiKey: 'test-key', output_format: 'jpeg', output_compression: 80 },
      });

      await provider.callApi('test prompt');

      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"output_compression":80'),
        }),
        expect.any(Number),
      );
    });

    it('should handle gpt-image-1 moderation parameter', async () => {
      const provider = new OpenAiImageProvider('gpt-image-1', {
        config: { apiKey: 'test-key', moderation: 'low' },
      });

      await provider.callApi('test prompt');

      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"moderation":"low"'),
        }),
        expect.any(Number),
      );
    });

    it('should validate size for gpt-image-1', async () => {
      const provider = new OpenAiImageProvider('gpt-image-1', {
        config: { apiKey: 'test-key', size: '512x512' },
      });

      const result = await provider.callApi('test prompt');

      expect(result).toHaveProperty('error');
      expect(result.error).toContain('Invalid size "512x512" for GPT Image 1');
    });

    it('should allow auto size for gpt-image-1', async () => {
      const provider = new OpenAiImageProvider('gpt-image-1', {
        config: { apiKey: 'test-key', size: 'auto' },
      });

      await provider.callApi('test prompt');

      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"size":"auto"'),
        }),
        expect.any(Number),
      );
    });

    it('should calculate correct cost for gpt-image-1 with different quality levels', async () => {
      // Test high quality
      const providerHigh = new OpenAiImageProvider('gpt-image-1', {
        config: { apiKey: 'test-key', quality: 'high', size: '1024x1024' },
      });

      const resultHigh = await providerHigh.callApi('test prompt');
      expect(resultHigh.cost).toBe(0.167); // high_1024x1024

      // Test medium quality
      const providerMedium = new OpenAiImageProvider('gpt-image-1', {
        config: { apiKey: 'test-key', quality: 'medium', size: '1024x1536' },
      });

      const resultMedium = await providerMedium.callApi('test prompt');
      expect(resultMedium.cost).toBe(0.063); // medium_1024x1536
    });
  });

  describe('GPT Image 1 Mini support', () => {
    const mockGptImage1MiniResponse = {
      data: {
        data: [{ b64_json: 'base64EncodedImageData' }],
        background: 'opaque',
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    };

    beforeEach(() => {
      vi.mocked(fetchWithCache).mockResolvedValue(mockGptImage1MiniResponse);
    });

    it('should not send response_format parameter for gpt-image-1-mini', async () => {
      const provider = new OpenAiImageProvider('gpt-image-1-mini', {
        config: { apiKey: 'test-key' },
      });

      await provider.callApi('test prompt');

      const callArgs = vi.mocked(fetchWithCache).mock.calls[0];
      const body = JSON.parse(callArgs[1]!.body as string);

      expect(body).not.toHaveProperty('response_format');
      expect(body.model).toBe('gpt-image-1-mini');
    });

    it('should always treat gpt-image-1-mini response as b64_json', async () => {
      const provider = new OpenAiImageProvider('gpt-image-1-mini', {
        config: { apiKey: 'test-key' },
      });

      const result = await provider.callApi('test prompt');

      expect(result).toEqual({
        output: JSON.stringify(mockGptImage1MiniResponse.data),
        cached: false,
        isBase64: true,
        format: 'json',
        cost: 0.005, // Default cost for gpt-image-1-mini low 1024x1024
      });
    });

    it('should handle gpt-image-1-mini quality parameter', async () => {
      const provider = new OpenAiImageProvider('gpt-image-1-mini', {
        config: { apiKey: 'test-key', quality: 'high' },
      });

      await provider.callApi('test prompt');

      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"quality":"high"'),
        }),
        expect.any(Number),
      );
    });

    it('should handle gpt-image-1-mini background parameter', async () => {
      const provider = new OpenAiImageProvider('gpt-image-1-mini', {
        config: { apiKey: 'test-key', background: 'transparent' },
      });

      await provider.callApi('test prompt');

      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"background":"transparent"'),
        }),
        expect.any(Number),
      );
    });

    it('should validate size for gpt-image-1-mini', async () => {
      const provider = new OpenAiImageProvider('gpt-image-1-mini', {
        config: { apiKey: 'test-key', size: '512x512' },
      });

      const result = await provider.callApi('test prompt');

      expect(result).toHaveProperty('error');
      expect(result.error).toContain('Invalid size "512x512" for GPT Image 1 Mini');
    });

    it('should allow auto size for gpt-image-1-mini', async () => {
      const provider = new OpenAiImageProvider('gpt-image-1-mini', {
        config: { apiKey: 'test-key', size: 'auto' },
      });

      await provider.callApi('test prompt');

      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"size":"auto"'),
        }),
        expect.any(Number),
      );
    });

    it('should calculate correct cost for gpt-image-1-mini with different quality levels', async () => {
      // Test low quality - default
      const providerLow = new OpenAiImageProvider('gpt-image-1-mini', {
        config: { apiKey: 'test-key', quality: 'low', size: '1024x1024' },
      });

      const resultLow = await providerLow.callApi('test prompt');
      expect(resultLow.cost).toBe(0.005); // low_1024x1024

      // Test medium quality
      const providerMedium = new OpenAiImageProvider('gpt-image-1-mini', {
        config: { apiKey: 'test-key', quality: 'medium', size: '1024x1024' },
      });

      const resultMedium = await providerMedium.callApi('test prompt');
      expect(resultMedium.cost).toBe(0.011); // medium_1024x1024

      // Test high quality with different size
      const providerHigh = new OpenAiImageProvider('gpt-image-1-mini', {
        config: { apiKey: 'test-key', quality: 'high', size: '1024x1536' },
      });

      const resultHigh = await providerHigh.callApi('test prompt');
      expect(resultHigh.cost).toBe(0.052); // high_1024x1536
    });
  });

  describe('GPT Image 1.5 support', () => {
    const mockGptImage15Response = {
      data: {
        data: [{ b64_json: 'base64EncodedImageData' }],
        background: 'opaque',
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    };

    beforeEach(() => {
      vi.mocked(fetchWithCache).mockResolvedValue(mockGptImage15Response);
    });

    it('should not send response_format parameter for gpt-image-1.5', async () => {
      const provider = new OpenAiImageProvider('gpt-image-1.5', {
        config: { apiKey: 'test-key' },
      });

      await provider.callApi('test prompt');

      const callArgs = vi.mocked(fetchWithCache).mock.calls[0];
      const body = JSON.parse(callArgs[1]!.body as string);

      expect(body).not.toHaveProperty('response_format');
      expect(body.model).toBe('gpt-image-1.5');
    });

    it('should always treat gpt-image-1.5 response as b64_json', async () => {
      const provider = new OpenAiImageProvider('gpt-image-1.5', {
        config: { apiKey: 'test-key' },
      });

      const result = await provider.callApi('test prompt');

      expect(result).toEqual({
        output: JSON.stringify(mockGptImage15Response.data),
        cached: false,
        isBase64: true,
        format: 'json',
        cost: 0.064, // Default cost for gpt-image-1.5 low 1024x1024
      });
    });

    it('should handle gpt-image-1.5 quality parameter', async () => {
      const provider = new OpenAiImageProvider('gpt-image-1.5', {
        config: { apiKey: 'test-key', quality: 'high' },
      });

      await provider.callApi('test prompt');

      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"quality":"high"'),
        }),
        expect.any(Number),
      );
    });

    it('should handle gpt-image-1.5 background parameter', async () => {
      const provider = new OpenAiImageProvider('gpt-image-1.5', {
        config: { apiKey: 'test-key', background: 'transparent' },
      });

      await provider.callApi('test prompt');

      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"background":"transparent"'),
        }),
        expect.any(Number),
      );
    });

    it('should handle gpt-image-1.5 output_format parameter', async () => {
      const provider = new OpenAiImageProvider('gpt-image-1.5', {
        config: { apiKey: 'test-key', output_format: 'jpeg' },
      });

      await provider.callApi('test prompt');

      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"output_format":"jpeg"'),
        }),
        expect.any(Number),
      );
    });

    it('should handle gpt-image-1.5 output_compression parameter', async () => {
      const provider = new OpenAiImageProvider('gpt-image-1.5', {
        config: { apiKey: 'test-key', output_format: 'jpeg', output_compression: 80 },
      });

      await provider.callApi('test prompt');

      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"output_compression":80'),
        }),
        expect.any(Number),
      );
    });

    it('should handle gpt-image-1.5 moderation parameter', async () => {
      const provider = new OpenAiImageProvider('gpt-image-1.5', {
        config: { apiKey: 'test-key', moderation: 'low' },
      });

      await provider.callApi('test prompt');

      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"moderation":"low"'),
        }),
        expect.any(Number),
      );
    });

    it('should validate size for gpt-image-1.5', async () => {
      const provider = new OpenAiImageProvider('gpt-image-1.5', {
        config: { apiKey: 'test-key', size: '512x512' },
      });

      const result = await provider.callApi('test prompt');

      expect(result).toHaveProperty('error');
      expect(result.error).toContain('Invalid size "512x512" for GPT Image 1.5');
    });

    it('should allow auto size for gpt-image-1.5', async () => {
      const provider = new OpenAiImageProvider('gpt-image-1.5', {
        config: { apiKey: 'test-key', size: 'auto' },
      });

      await provider.callApi('test prompt');

      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"size":"auto"'),
        }),
        expect.any(Number),
      );
    });

    it('should calculate correct cost for gpt-image-1.5 with different quality levels', async () => {
      // Test low quality - default
      const providerLow = new OpenAiImageProvider('gpt-image-1.5', {
        config: { apiKey: 'test-key', quality: 'low', size: '1024x1024' },
      });

      const resultLow = await providerLow.callApi('test prompt');
      expect(resultLow.cost).toBe(0.064); // low_1024x1024

      // Test medium quality
      const providerMedium = new OpenAiImageProvider('gpt-image-1.5', {
        config: { apiKey: 'test-key', quality: 'medium', size: '1024x1024' },
      });

      const resultMedium = await providerMedium.callApi('test prompt');
      expect(resultMedium.cost).toBe(0.128); // medium_1024x1024

      // Test high quality with different size
      const providerHigh = new OpenAiImageProvider('gpt-image-1.5', {
        config: { apiKey: 'test-key', quality: 'high', size: '1024x1536' },
      });

      const resultHigh = await providerHigh.callApi('test prompt');
      expect(resultHigh.cost).toBe(0.288); // high_1024x1536
    });

    it('should support dated model variant gpt-image-1.5-2025-12-16', async () => {
      const provider = new OpenAiImageProvider('gpt-image-1.5-2025-12-16', {
        config: { apiKey: 'test-key', quality: 'medium', size: '1024x1024' },
      });

      await provider.callApi('test prompt');

      const callArgs = vi.mocked(fetchWithCache).mock.calls[0];
      const body = JSON.parse(callArgs[1]!.body as string);

      // Should use the dated model name
      expect(body.model).toBe('gpt-image-1.5-2025-12-16');
      // Should not include response_format (GPT Image models use output_format instead)
      expect(body).not.toHaveProperty('response_format');
      // Should include quality
      expect(body.quality).toBe('medium');
    });

    it('should calculate correct cost for dated variant gpt-image-1.5-2025-12-16', async () => {
      const provider = new OpenAiImageProvider('gpt-image-1.5-2025-12-16', {
        config: { apiKey: 'test-key', quality: 'high', size: '1024x1024' },
      });

      const result = await provider.callApi('test prompt');
      expect(result.cost).toBe(0.192); // high_1024x1024 for GPT Image 1.5
    });
  });
});
