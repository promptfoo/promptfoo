import { fetchWithCache } from '../../../src/cache';
import { OpenAiImageProvider } from '../../../src/providers/openai/image';

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

    it('should handle gpt-image-1 model which always returns b64_json', async () => {
      const provider = new OpenAiImageProvider('gpt-image-1', {
        config: { apiKey: 'test-key' },
      });
      
      // Mock the response with b64_json (which is what gpt-image-1 always returns)
      jest.mocked(fetchWithCache).mockResolvedValue({
        ...mockBase64Response,
        data: {
          created: 1234567890,
          data: [{ b64_json: 'base64EncodedImageData' }]
        }
      });

      const result = await provider.callApi('test prompt');

      // Should return formatted JSON with truncated base64 data
      expect(result).toEqual({
        output: expect.stringContaining('"type": "image"'),
        cached: false,
        format: 'formatted_json',
        cost: expect.any(Number),
      });
      
      // Verify the JSON structure
      const parsedOutput = JSON.parse(result.output);
      expect(parsedOutput).toHaveProperty('type', 'image');
      expect(parsedOutput).toHaveProperty('prompt', 'test prompt');
      expect(parsedOutput).toHaveProperty('data', 'base64EncodedImageData...');
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

    it('should validate size for GPT Image', async () => {
      const provider = new OpenAiImageProvider('gpt-image-1', {
        config: { apiKey: 'test-key', size: '512x512' },
      });

      const result = await provider.callApi('test prompt');

      expect(result).toHaveProperty('error');
      expect(result.error).toContain('Invalid size "512x512" for GPT Image');
    });

    it('should validate quality for GPT Image', async () => {
      const provider = new OpenAiImageProvider('gpt-image-1', {
        config: { 
          apiKey: 'test-key', 
          quality: 'invalid-quality' as any 
        },
      });

      const result = await provider.callApi('test prompt');

      expect(result).toHaveProperty('error');
      expect(result.error).toContain('Invalid quality "invalid-quality" for GPT Image');
    });

    it('should accept valid quality values for GPT Image', async () => {
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
    it('should reject unsupported operations', async () => {
      const provider = new OpenAiImageProvider('dall-e-3', {
        config: {
          apiKey: 'test-key',
          operation: 'variation',
        },
      });

      const result = await provider.callApi('test prompt');

      expect(result).toHaveProperty('error');
      expect(result.error).toContain(
        "Only 'generation' and 'edit' operations are currently supported. 'variation' operations are not implemented.",
      );
    });

    it('should reject edit operation for DALL-E 3', async () => {
      const provider = new OpenAiImageProvider('dall-e-3', {
        config: {
          apiKey: 'test-key',
          operation: 'edit',
        },
      });

      const result = await provider.callApi('test prompt');

      expect(result).toHaveProperty('error');
      expect(result.error).toContain("The 'edit' operation is not supported for DALL-E 3.");
    });

    it('should support edit operation for GPT Image', async () => {
      const provider = new OpenAiImageProvider('gpt-image-1', {
        config: {
          apiKey: 'test-key',
          operation: 'edit',
        },
      });

      await provider.callApi('test prompt');

      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.stringContaining('/images/edits'),
        expect.any(Object),
        expect.any(Number),
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

    it('should handle GPT Image specific options', async () => {
      const provider = new OpenAiImageProvider('gpt-image-1', {
        config: {
          apiKey: 'test-key',
          quality: 'high',
          background: 'transparent',
          output_format: 'webp',
          output_compression: 75,
          moderation: 'low',
        },
      });

      await provider.callApi('test prompt');

      // Check all the gpt-image-1 specific parameters are included in the request
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
          body: expect.stringContaining('"output_format":"webp"'),
        }),
        expect.any(Number),
      );

      expect(fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"output_compression":75'),
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

    it('should properly calculate costs for GPT Image with different qualities', async () => {
      // Test low quality
      let provider = new OpenAiImageProvider('gpt-image-1', {
        config: { apiKey: 'test-key', quality: 'low', size: '1024x1024' },
      });

      let result = await provider.callApi('test prompt');
      expect(result.cost).toBeCloseTo(0.002 * 272, 4); // Low quality 1024x1024 cost

      // Test medium quality
      provider = new OpenAiImageProvider('gpt-image-1', {
        config: { apiKey: 'test-key', quality: 'medium', size: '1024x1536' },
      });

      result = await provider.callApi('test prompt');
      expect(result.cost).toBeCloseTo(0.002 * 1584, 4); // Medium quality 1024x1536 cost

      // Test high quality
      provider = new OpenAiImageProvider('gpt-image-1', {
        config: { apiKey: 'test-key', quality: 'high', size: '1536x1024' },
      });

      result = await provider.callApi('test prompt');
      expect(result.cost).toBeCloseTo(0.002 * 6208, 4); // High quality 1536x1024 cost

      // Test auto quality (should default to medium for cost calculation)
      provider = new OpenAiImageProvider('gpt-image-1', {
        config: { apiKey: 'test-key', quality: 'auto', size: '1024x1024' },
      });

      result = await provider.callApi('test prompt');
      expect(result.cost).toBeCloseTo(0.002 * 1056, 4); // Medium quality 1024x1024 cost
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

    it('should not include response_format for GPT Image model', async () => {
      const provider = new OpenAiImageProvider('gpt-image-1', {
        config: {
          apiKey: 'test-key',
          quality: 'high',
          background: 'transparent',
          output_format: 'webp',
        },
      });

      await provider.callApi('test prompt');

      // Verify response_format is NOT included in the request
      const requestBody = JSON.parse(
        (jest.mocked(fetchWithCache).mock.calls[0][1] as RequestInit).body as string
      );
      expect(requestBody).not.toHaveProperty('response_format');
      
      // Verify other parameters are included correctly
      expect(requestBody).toHaveProperty('quality', 'high');
      expect(requestBody).toHaveProperty('background', 'transparent');
      expect(requestBody).toHaveProperty('output_format', 'webp');
    });
  });
});
