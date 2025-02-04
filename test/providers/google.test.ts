import * as cache from '../../src/cache';
import { GoogleChatProvider } from '../../src/providers/google';
import * as vertexUtil from '../../src/providers/vertexUtil';

jest.mock('../../src/cache', () => ({
  fetchWithCache: jest.fn(),
}));

jest.mock('../../src/providers/vertexUtil', () => ({
  maybeCoerceToGeminiFormat: jest.fn(),
}));

describe('GoogleChatProvider', () => {
  let provider: GoogleChatProvider;

  beforeEach(() => {
    provider = new GoogleChatProvider('gemini-pro', {
      config: {
        temperature: 0.7,
        maxOutputTokens: 100,
        topP: 0.9,
        topK: 40,
      },
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor and configuration', () => {
    it('should handle API key from different sources', () => {
      // From config
      const providerWithConfigKey = new GoogleChatProvider('gemini-pro', {
        config: { apiKey: 'config-key' },
      });
      expect(providerWithConfigKey.getApiKey()).toBe('config-key');

      // From env override
      const providerWithEnvOverride = new GoogleChatProvider('gemini-pro', {
        env: { GOOGLE_API_KEY: 'env-key' },
      });
      expect(providerWithEnvOverride.getApiKey()).toBe('env-key');
    });

    it('should handle API host from different sources', () => {
      // From config
      const providerWithConfigHost = new GoogleChatProvider('gemini-pro', {
        config: { apiHost: 'custom.host.com' },
      });
      expect(providerWithConfigHost.getApiHost()).toBe('custom.host.com');

      // From env override
      const providerWithEnvOverride = new GoogleChatProvider('gemini-pro', {
        env: { GOOGLE_API_HOST: 'env.host.com' },
      });
      expect(providerWithEnvOverride.getApiHost()).toBe('env.host.com');
    });

    it('should handle custom provider ID', () => {
      const customId = 'custom-google-provider';
      const providerWithCustomId = new GoogleChatProvider('gemini-pro', {
        id: customId,
      });
      expect(providerWithCustomId.id()).toBe(customId);
    });

    it('should handle default configuration', () => {
      const defaultProvider = new GoogleChatProvider('gemini-pro');
      expect(defaultProvider.getApiHost()).toBe('generativelanguage.googleapis.com');
      expect(defaultProvider.id()).toBe('google:gemini-pro');
    });

    it('should handle configuration with safety settings', () => {
      const providerWithSafety = new GoogleChatProvider('gemini-pro', {
        config: {
          safetySettings: [
            { category: 'HARM_CATEGORY_HARASSMENT', probability: 'BLOCK_MEDIUM_AND_ABOVE' },
          ],
        },
      });
      expect(providerWithSafety).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should throw error when API key is not set', async () => {
      provider = new GoogleChatProvider('gemini-pro', {});
      await expect(provider.callApi('test')).rejects.toThrow('Google API key is not set');
    });

    it('should handle empty candidate responses', async () => {
      const provider = new GoogleChatProvider('gemini-pro', {
        config: {
          apiKey: 'test-key',
        },
      });

      // Mock maybeCoerceToGeminiFormat
      jest.mocked(vertexUtil.maybeCoerceToGeminiFormat).mockReturnValueOnce({
        contents: [{ role: 'user', parts: [{ text: 'test prompt' }] }],
        coerced: false,
        systemInstruction: undefined,
      });

      // Mock fetchWithCache to return empty candidates
      jest.mocked(cache.fetchWithCache).mockResolvedValueOnce({
        data: {
          candidates: [],
        },
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      const response = await provider.callGemini('test prompt');
      expect(response.error).toContain('API did not return any candidate responses');
    });

    it('should handle malformed API responses', async () => {
      const provider = new GoogleChatProvider('gemini-pro', {
        config: {
          apiKey: 'test-key',
        },
      });

      // Mock maybeCoerceToGeminiFormat
      jest.mocked(vertexUtil.maybeCoerceToGeminiFormat).mockReturnValueOnce({
        contents: [{ role: 'user', parts: [{ text: 'test prompt' }] }],
        coerced: false,
        systemInstruction: undefined,
      });

      // Mock fetchWithCache to return malformed response
      jest.mocked(cache.fetchWithCache).mockResolvedValueOnce({
        data: {
          candidates: [
            {
              content: {
                parts: null, // This will cause the map function to throw
              },
            },
          ],
        },
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      await expect(provider.callGemini('test prompt')).rejects.toThrow(
        "Cannot read properties of null (reading 'map')",
      );
    });
  });

  describe('non-Gemini models', () => {
    beforeEach(() => {
      provider = new GoogleChatProvider('palm2', {
        config: {
          temperature: 0.7,
          maxOutputTokens: 100,
        },
      });
    });

    it('should handle errors for non-Gemini models', async () => {
      const provider = new GoogleChatProvider('palm2', {
        config: {
          apiKey: 'test-key',
        },
      });

      // Mock fetchWithCache to return error response
      jest.mocked(cache.fetchWithCache).mockResolvedValueOnce({
        data: {
          error: {
            message: 'Model not found',
          },
        },
        cached: false,
        status: 404,
        statusText: 'Not Found',
        headers: {},
      });

      const response = await provider.callApi('test prompt');
      expect(response.error).toContain('Model not found');
    });

    it('should call the correct API endpoint for non-Gemini models', async () => {
      const provider = new GoogleChatProvider('palm2', {
        config: {
          apiKey: 'test-key',
        },
      });

      await provider.callApi('test prompt');

      expect(cache.fetchWithCache).toHaveBeenCalledWith(
        expect.stringContaining('v1beta3/models/palm2:generateMessage'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.any(Object),
          body: expect.any(String),
        }),
        expect.any(Number),
        'json',
        false,
      );
    });
  });

  describe('callGemini', () => {
    it('should call the Gemini API and return the response with token usage', async () => {
      const mockResponse = {
        data: {
          candidates: [{ content: { parts: [{ text: 'response text' }] } }],
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 5,
            totalTokenCount: 15,
          },
        },
        cached: false,
      };

      jest.mocked(cache.fetchWithCache).mockResolvedValue(mockResponse as any);
      jest.mocked(vertexUtil.maybeCoerceToGeminiFormat).mockReturnValue({
        contents: [{ role: 'user', parts: [{ text: 'test prompt' }] }],
        coerced: false,
        systemInstruction: undefined,
      });

      const response = await provider.callGemini('test prompt');

      expect(response).toEqual({
        output: 'response text',
        tokenUsage: {
          prompt: 10,
          completion: 5,
          total: 15,
          numRequests: 1,
        },
        raw: mockResponse.data,
        cached: false,
      });

      expect(cache.fetchWithCache).toHaveBeenCalledWith(
        expect.stringContaining('v1beta/models/gemini-pro:generateContent'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining(
            '"contents":[{"role":"user","parts":[{"text":"test prompt"}]}]',
          ),
        }),
        expect.any(Number),
        'json',
        false,
      );
    });

    it('should handle cached responses correctly', async () => {
      const mockResponse = {
        data: {
          candidates: [{ content: { parts: [{ text: 'cached response' }] } }],
          usageMetadata: {
            totalTokenCount: 15,
          },
        },
        cached: true,
      };

      jest.mocked(cache.fetchWithCache).mockResolvedValue(mockResponse as any);
      jest.mocked(vertexUtil.maybeCoerceToGeminiFormat).mockReturnValue({
        contents: [{ role: 'user', parts: [{ text: 'test prompt' }] }],
        coerced: false,
        systemInstruction: undefined,
      });

      const response = await provider.callGemini('test prompt');

      expect(response).toEqual({
        output: 'cached response',
        tokenUsage: {
          cached: 15,
          total: 15,
          numRequests: 0,
        },
        raw: mockResponse.data,
        cached: true,
      });
    });

    it('should use v1alpha API for thinking model', async () => {
      provider = new GoogleChatProvider('gemini-2.0-flash-thinking-exp');
      const mockResponse = {
        data: {
          candidates: [{ content: { parts: [{ text: 'thinking response' }] } }],
        },
        cached: false,
      };

      jest.mocked(cache.fetchWithCache).mockResolvedValue(mockResponse as any);
      jest.mocked(vertexUtil.maybeCoerceToGeminiFormat).mockReturnValue({
        contents: [{ role: 'user', parts: [{ text: 'test prompt' }] }],
        coerced: false,
        systemInstruction: undefined,
      });

      await provider.callGemini('test prompt');

      expect(cache.fetchWithCache).toHaveBeenCalledWith(
        expect.stringContaining('v1alpha/models/gemini-2.0-flash-thinking-exp:generateContent'),
        expect.any(Object),
        expect.any(Number),
        'json',
        false,
      );
    });

    it('should handle system messages correctly', async () => {
      const mockResponse = {
        data: {
          candidates: [{ content: { parts: [{ text: 'response text' }] } }],
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 5,
            totalTokenCount: 15,
          },
        },
        cached: false,
      };

      jest.mocked(cache.fetchWithCache).mockResolvedValue(mockResponse as any);
      jest.mocked(vertexUtil.maybeCoerceToGeminiFormat).mockReturnValue({
        contents: [
          { role: 'system' as any, parts: [{ text: 'system instruction' }] },
          { role: 'user', parts: [{ text: 'user message' }] },
        ],
        coerced: false,
        systemInstruction: undefined,
      } as any);

      const response = await provider.callGemini('test prompt');

      expect(response).toEqual({
        output: 'response text',
        tokenUsage: {
          prompt: 10,
          completion: 5,
          total: 15,
          numRequests: 1,
        },
        raw: mockResponse.data,
        cached: false,
      });

      expect(cache.fetchWithCache).toHaveBeenCalledWith(
        expect.stringContaining('v1beta/models/gemini-pro:generateContent'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: expect.stringContaining(
            '"contents":[{"role":"system","parts":[{"text":"system instruction"}]},{"role":"user","parts":[{"text":"user message"}]}]',
          ),
        }),
        expect.any(Number),
        'json',
        false,
      );
    });

    it('should handle API call errors', async () => {
      const provider = new GoogleChatProvider('gemini-pro', {
        config: {
          apiKey: 'test-key',
        },
      });

      // Mock maybeCoerceToGeminiFormat
      jest.mocked(vertexUtil.maybeCoerceToGeminiFormat).mockReturnValueOnce({
        contents: [{ role: 'user', parts: [{ text: 'test prompt' }] }],
        coerced: false,
        systemInstruction: undefined,
      });

      // Mock fetchWithCache to return error
      jest.mocked(cache.fetchWithCache).mockRejectedValueOnce(new Error('API call failed'));

      const response = await provider.callGemini('test prompt');
      expect(response.error).toContain('API call failed');
    });

    it('should handle response schema', async () => {
      provider = new GoogleChatProvider('gemini-pro', {
        config: {
          responseSchema: '{"type":"object","properties":{"name":{"type":"string"}}}',
        },
      });

      const mockResponse = {
        data: {
          candidates: [{ content: { parts: [{ text: '{"name":"John"}' }] } }],
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 5,
            totalTokenCount: 15,
          },
        },
        cached: false,
      };

      jest.mocked(cache.fetchWithCache).mockResolvedValue(mockResponse as any);
      jest.mocked(vertexUtil.maybeCoerceToGeminiFormat).mockReturnValue({
        contents: [{ role: 'user', parts: [{ text: 'test prompt' }] }],
        coerced: false,
        systemInstruction: undefined,
      });

      const response = await provider.callGemini('test prompt');

      expect(response.tokenUsage).toEqual({
        prompt: 10,
        completion: 5,
        total: 15,
        numRequests: 1,
      });

      expect(cache.fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringMatching(/response_schema.*response_mime_type/),
        }),
        expect.any(Number),
        'json',
        false,
      );
    });

    it('should handle safety ratings', async () => {
      const mockResponse = {
        data: {
          candidates: [
            {
              content: { parts: [{ text: 'response text' }] },
              safetyRatings: [{ category: 'HARM_CATEGORY', probability: 'HIGH' }],
            },
          ],
          promptFeedback: {
            safetyRatings: [{ category: 'HARM_CATEGORY', probability: 'NEGLIGIBLE' }],
          },
        },
        cached: false,
      };

      jest.mocked(cache.fetchWithCache).mockResolvedValue(mockResponse as any);
      jest.mocked(vertexUtil.maybeCoerceToGeminiFormat).mockReturnValue({
        contents: [{ role: 'user', parts: [{ text: 'test prompt' }] }],
        coerced: false,
        systemInstruction: undefined,
      });

      const response = await provider.callGemini('test prompt');

      expect(response.guardrails).toEqual({
        flaggedInput: false,
        flaggedOutput: true,
        flagged: true,
      });
    });

    it('should handle structured output with response schema', async () => {
      provider = new GoogleChatProvider('gemini-pro', {
        config: {
          generationConfig: {
            response_mime_type: 'application/json',
            response_schema: '{"type":"object","properties":{"name":{"type":"string"}}}',
          },
        },
      });

      const mockResponse = {
        data: {
          candidates: [
            {
              content: {
                parts: [{ text: '{"name":"John"}' }],
                role: 'model',
              },
              finishReason: 'STOP',
            },
          ],
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 5,
            totalTokenCount: 15,
          },
        },
        cached: false,
      };

      jest.mocked(cache.fetchWithCache).mockResolvedValue(mockResponse as any);
      jest.mocked(vertexUtil.maybeCoerceToGeminiFormat).mockReturnValue({
        contents: [{ role: 'user', parts: [{ text: 'test prompt' }] }],
        coerced: false,
        systemInstruction: undefined,
      });

      const response = await provider.callGemini('test prompt');

      expect(response.tokenUsage).toEqual({
        prompt: 10,
        completion: 5,
        total: 15,
        numRequests: 1,
      });

      expect(cache.fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"response_mime_type":"application/json"'),
        }),
        expect.any(Number),
        'json',
        false,
      );
    });

    it('should handle multipart messages', async () => {
      const mockResponse = {
        data: {
          candidates: [{ content: { parts: [{ text: 'multipart response' }] } }],
        },
        cached: false,
      };

      jest.mocked(cache.fetchWithCache).mockResolvedValue(mockResponse as any);
      jest.mocked(vertexUtil.maybeCoerceToGeminiFormat).mockReturnValue({
        contents: [
          {
            role: 'user',
            parts: [{ text: 'First part' }, { text: 'Second part' }],
          },
        ],
        coerced: false,
        systemInstruction: undefined,
      });

      const response = await provider.callGemini('First part\nSecond part');

      expect(response.output).toBe('multipart response');
      expect(cache.fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringMatching(/parts.*First part.*Second part/),
        }),
        expect.any(Number),
        'json',
        false,
      );
    });

    it('should handle additional configuration options', async () => {
      provider = new GoogleChatProvider('gemini-pro', {
        config: {
          generationConfig: {
            temperature: 0.9,
            topP: 0.95,
            topK: 50,
            maxOutputTokens: 200,
            stopSequences: ['END'],
          },
        },
      });

      const mockResponse = {
        data: {
          candidates: [{ content: { parts: [{ text: 'response text' }] } }],
        },
        cached: false,
      };

      jest.mocked(cache.fetchWithCache).mockResolvedValue(mockResponse as any);
      jest.mocked(vertexUtil.maybeCoerceToGeminiFormat).mockReturnValue({
        contents: [{ role: 'user', parts: [{ text: 'test prompt' }] }],
        coerced: false,
        systemInstruction: undefined,
      });

      await provider.callGemini('test prompt');

      expect(cache.fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining(
            '"generationConfig":{"temperature":0.9,"topP":0.95,"topK":50,"maxOutputTokens":200,"stopSequences":["END"]}',
          ),
        }),
        expect.any(Number),
        'json',
        false,
      );
    });

    it('should handle API version selection', async () => {
      const v1alphaProvider = new GoogleChatProvider('gemini-2.0-flash-thinking-exp');
      const v1betaProvider = new GoogleChatProvider('gemini-pro');

      const mockResponse = {
        data: {
          candidates: [{ content: { parts: [{ text: 'response' }] } }],
        },
        cached: false,
      };

      jest.mocked(cache.fetchWithCache).mockResolvedValue(mockResponse as any);
      jest.mocked(vertexUtil.maybeCoerceToGeminiFormat).mockReturnValue({
        contents: [{ role: 'user', parts: [{ text: 'test prompt' }] }],
        coerced: false,
        systemInstruction: undefined,
      });

      await v1alphaProvider.callGemini('test prompt');
      await v1betaProvider.callGemini('test prompt');

      expect(cache.fetchWithCache).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('v1alpha'),
        expect.any(Object),
        expect.any(Number),
        'json',
        false,
      );

      expect(cache.fetchWithCache).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('v1beta'),
        expect.any(Object),
        expect.any(Number),
        'json',
        false,
      );
    });
  });
});
