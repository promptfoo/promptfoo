import * as fs from 'fs';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as cache from '../../../src/cache';
import { AIStudioChatProvider } from '../../../src/providers/google/ai.studio';
import * as util from '../../../src/providers/google/util';
import { getNunjucksEngineForFilePath } from '../../../src/util/file';
import * as templates from '../../../src/util/templates';

vi.mock('../../../src/cache', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    fetchWithCache: vi.fn(),
  };
});

vi.mock('../../../src/providers/google/util', async () => ({
  ...(await vi.importActual('../../../src/providers/google/util')),
  maybeCoerceToGeminiFormat: vi.fn(),
  createAuthCacheDiscriminator: vi.fn().mockReturnValue(''),
}));

vi.mock('../../../src/util/templates', async (importOriginal) => {
  return {
    ...(await importOriginal()),

    getNunjucksEngine: vi.fn(() => ({
      renderString: vi.fn((str) => str),
    })),
  };
});

// Hoisted mocks for file loading functions
const mockMaybeLoadToolsFromExternalFile = vi.hoisted(() => vi.fn((input) => input));
const mockMaybeLoadFromExternalFile = vi.hoisted(() => vi.fn((input) => input));

vi.mock('../../../src/util/file', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    getNunjucksEngineForFilePath: vi.fn(),
    maybeLoadToolsFromExternalFile: mockMaybeLoadToolsFromExternalFile,
    maybeLoadFromExternalFile: mockMaybeLoadFromExternalFile,
  };
});

// Also mock the barrel file since the provider imports from util/index
vi.mock('../../../src/util/index', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    maybeLoadToolsFromExternalFile: mockMaybeLoadToolsFromExternalFile,
  };
});

vi.mock('glob', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    globSync: vi.fn().mockReturnValue([]),
  };
});

vi.mock('fs', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    statSync: vi.fn(),
  };
});

describe('AIStudioChatProvider', () => {
  let provider: AIStudioChatProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(templates.getNunjucksEngine).mockImplementation(function () {
      return {
        renderString: vi.fn((str) => str),
      } as any;
    });
    vi.mocked(fs.existsSync).mockReset();
    vi.mocked(fs.readFileSync).mockReset();
    vi.mocked(fs.writeFileSync).mockReset();
    vi.mocked(fs.statSync).mockReset();
    vi.mocked(getNunjucksEngineForFilePath).mockImplementation(function () {
      return {
        renderString: vi.fn((str) => str),
      } as any;
    });

    provider = new AIStudioChatProvider('gemini-pro', {
      config: {
        temperature: 0.7,
        maxOutputTokens: 100,
        topP: 0.9,
        topK: 40,
      },
    });
  });

  describe('constructor and configuration', () => {
    it('should handle API key from different sources and render with Nunjucks', () => {
      const mockRenderString = vi.fn((str) => (str ? `rendered-${str}` : str));
      vi.mocked(templates.getNunjucksEngine).mockImplementation(function () {
        return {
          renderString: mockRenderString,
        } as any;
      });

      // From config
      const providerWithConfigKey = new AIStudioChatProvider('gemini-pro', {
        config: { apiKey: 'config-key' },
      });
      expect(providerWithConfigKey.getApiKey()).toBe('rendered-config-key');
      expect(mockRenderString).toHaveBeenCalledWith('config-key', {});

      // From env override
      const providerWithEnvOverride = new AIStudioChatProvider('gemini-pro', {
        env: { GOOGLE_API_KEY: 'env-key' },
      });
      expect(providerWithEnvOverride.getApiKey()).toBe('rendered-env-key');
      expect(mockRenderString).toHaveBeenCalledWith('env-key', {});

      // No API key
      delete process.env.GEMINI_API_KEY;
      delete process.env.GOOGLE_API_KEY;
      delete process.env.PALM_API_KEY;
      const providerWithNoKey = new AIStudioChatProvider('gemini-pro');
      expect(providerWithNoKey.getApiKey()).toBeUndefined();
    });

    it('should resolve API endpoint correctly', () => {
      // Test that getApiEndpoint returns correct URL with model and action
      const provider = new AIStudioChatProvider('gemini-pro', {
        config: { apiKey: 'test-key' },
      });

      // Check endpoint format (v1beta for standard models)
      const endpoint = provider.getApiEndpoint('generateContent');
      expect(endpoint).toContain('/v1beta/models/gemini-pro:generateContent');
      expect(endpoint).toContain('generativelanguage.googleapis.com');
    });

    it('should use custom apiHost in endpoint', () => {
      const provider = new AIStudioChatProvider('gemini-pro', {
        config: {
          apiKey: 'test-key',
          apiHost: 'custom.host.com',
        },
      });

      const endpoint = provider.getApiEndpoint('generateContent');
      expect(endpoint).toContain('custom.host.com');
    });

    it('should use apiBaseUrl when apiHost is not set', () => {
      const provider = new AIStudioChatProvider('gemini-pro', {
        config: {
          apiKey: 'test-key',
          apiBaseUrl: 'https://base.url.com',
        },
      });

      const endpoint = provider.getApiEndpoint('generateContent');
      expect(endpoint).toContain('base.url.com');
    });

    it('should prioritize apiHost over apiBaseUrl', () => {
      const provider = new AIStudioChatProvider('gemini-pro', {
        config: {
          apiKey: 'test-key',
          apiHost: 'host.googleapis.com',
          apiBaseUrl: 'https://base.googleapis.com',
        },
      });
      const endpoint = provider.getApiEndpoint('generateContent');
      expect(endpoint).toContain('host.googleapis.com');
      expect(endpoint).not.toContain('base.googleapis.com');
    });

    it('should handle custom provider ID', () => {
      const customId = 'custom-google-provider';
      const providerWithCustomId = new AIStudioChatProvider('gemini-pro', {
        id: customId,
      });
      expect(providerWithCustomId.id()).toBe(customId);
    });

    it('should handle configuration with safety settings', () => {
      const providerWithSafety = new AIStudioChatProvider('gemini-pro', {
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
      delete process.env.GEMINI_API_KEY;
      delete process.env.GOOGLE_API_KEY;
      delete process.env.PALM_API_KEY;
      provider = new AIStudioChatProvider('gemini-pro', {});
      await expect(provider.callApi('test')).rejects.toThrow(
        'Google API key is not set. Set the GOOGLE_API_KEY or GEMINI_API_KEY environment variable or add `apiKey` to the provider config.',
      );
    });

    it('should handle empty candidate responses', async () => {
      const provider = new AIStudioChatProvider('gemini-pro', {
        config: {
          apiKey: 'test-key',
        },
      });

      vi.mocked(util.maybeCoerceToGeminiFormat).mockImplementationOnce(function () {
        return {
          contents: [{ role: 'user', parts: [{ text: 'test prompt' }] }],
          coerced: false,
          systemInstruction: undefined,
        };
      });

      vi.mocked(cache.fetchWithCache).mockResolvedValueOnce({
        data: {
          candidates: [],
        },
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      const response = await provider.callGemini('test prompt');
      expect(response.error).toContain('No candidates returned in API response');
      expect(response.error).toContain('Got response:');
    });

    it('should handle malformed API responses', async () => {
      const provider = new AIStudioChatProvider('gemini-pro', {
        config: {
          apiKey: 'test-key',
        },
      });

      vi.mocked(util.maybeCoerceToGeminiFormat).mockImplementationOnce(function () {
        return {
          contents: [{ role: 'user', parts: [{ text: 'test prompt' }] }],
          coerced: false,
          systemInstruction: undefined,
        };
      });

      const mockResponse = {
        candidates: [
          {
            content: {
              parts: null,
            },
          },
        ],
      };

      vi.mocked(cache.fetchWithCache).mockResolvedValueOnce({
        data: mockResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      const response = await provider.callGemini('test prompt');

      expect(response).toEqual({
        error: 'Error: No output found in response: {"content":{"parts":null}}',
      });
    });

    it('should handle responses blocked with promptFeedback', async () => {
      const provider = new AIStudioChatProvider('gemini-pro', {
        config: {
          apiKey: 'test-key',
        },
      });

      vi.mocked(util.maybeCoerceToGeminiFormat).mockImplementationOnce(function () {
        return {
          contents: [{ role: 'user', parts: [{ text: 'test prompt' }] }],
          coerced: false,
          systemInstruction: undefined,
        };
      });

      vi.mocked(cache.fetchWithCache).mockResolvedValueOnce({
        data: {
          candidates: [],
          promptFeedback: {
            blockReason: 'PROHIBITED_CONTENT',
            safetyRatings: [
              { category: 'HARM_CATEGORY_HATE_SPEECH', probability: 'HIGH' },
              { category: 'HARM_CATEGORY_HARASSMENT', probability: 'NEGLIGIBLE' },
            ],
          },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      const response = await provider.callGemini('test prompt');
      expect(response.error).toContain('Response blocked: PROHIBITED_CONTENT');
      expect(response.error).toContain('HARM_CATEGORY_HATE_SPEECH: HIGH');
      // NEGLIGIBLE should be filtered out from the safety ratings summary
      expect(response.error).toMatch(/Safety ratings: HARM_CATEGORY_HATE_SPEECH: HIGH\)/);
      expect(response.error).not.toMatch(/Safety ratings:.*HARM_CATEGORY_HARASSMENT.*HIGH/); // Only check it's not in the summary with HIGH
    });

    it('should handle candidates blocked with finish reason', async () => {
      const provider = new AIStudioChatProvider('gemini-pro', {
        config: {
          apiKey: 'test-key',
        },
      });

      vi.mocked(util.maybeCoerceToGeminiFormat).mockImplementationOnce(function () {
        return {
          contents: [{ role: 'user', parts: [{ text: 'test prompt' }] }],
          coerced: false,
          systemInstruction: undefined,
        };
      });

      vi.mocked(cache.fetchWithCache).mockResolvedValueOnce({
        data: {
          candidates: [
            {
              content: { parts: [{ text: '' }] },
              finishReason: 'RECITATION',
              safetyRatings: [
                {
                  category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
                  probability: 'MEDIUM',
                  blocked: false,
                },
              ],
            },
          ],
        },
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: {},
      });

      const response = await provider.callGemini('test prompt');
      expect(response.error).toContain('Response was blocked with finish reason: RECITATION');
      expect(response.error).toContain("too similar to content from the model's training data");
      expect(response.error).toContain('HARM_CATEGORY_DANGEROUS_CONTENT: MEDIUM');
    });
  });

  describe('non-Gemini models', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      vi.mocked(templates.getNunjucksEngine).mockImplementation(function () {
        return {
          renderString: vi.fn((str) => str),
        } as any;
      });
      vi.mocked(fs.existsSync).mockReset();
      vi.mocked(fs.readFileSync).mockReset();
      vi.mocked(fs.writeFileSync).mockReset();
      vi.mocked(fs.statSync).mockReset();
      vi.mocked(getNunjucksEngineForFilePath).mockImplementation(function () {
        return {
          renderString: vi.fn((str) => str),
        } as any;
      });
      provider = new AIStudioChatProvider('palm2', {
        config: {
          temperature: 0.7,
          maxOutputTokens: 100,
        },
      });
    });

    it('should handle errors for non-Gemini models', async () => {
      const provider = new AIStudioChatProvider('palm2', {
        config: {
          apiKey: 'test-key',
        },
      });

      vi.mocked(cache.fetchWithCache).mockResolvedValueOnce({
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
      const provider = new AIStudioChatProvider('palm2', {
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
        undefined,
      );
    });
  });

  describe('callGemini', () => {
    beforeEach(() => {
      provider = new AIStudioChatProvider('gemini-pro', {
        config: {
          apiKey: 'test-key',
          temperature: 0.7,
          maxOutputTokens: 100,
          topP: 0.9,
          topK: 40,
        },
      });
    });

    it('should pass API key in x-goog-api-key header instead of URL query param', async () => {
      const mockResponse = {
        data: {
          candidates: [{ content: { parts: [{ text: 'response text' }] } }],
          usageMetadata: { totalTokenCount: 15 },
        },
        cached: false,
      };

      vi.mocked(cache.fetchWithCache).mockResolvedValue(mockResponse as any);
      vi.mocked(util.maybeCoerceToGeminiFormat).mockImplementation(function () {
        return {
          contents: [{ role: 'user', parts: [{ text: 'test prompt' }] }],
          coerced: false,
          systemInstruction: undefined,
        };
      });

      await provider.callGemini('test prompt');

      // Verify API key is NOT in URL
      const calledUrl = vi.mocked(cache.fetchWithCache).mock.calls[0][0] as string;
      expect(calledUrl).not.toContain('?key=');
      expect(calledUrl).not.toContain('&key=');

      // Verify API key IS in headers
      const calledOptions = vi.mocked(cache.fetchWithCache).mock.calls[0][1] as any;
      expect(calledOptions.headers['x-goog-api-key']).toBe('test-key');
    });

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

      vi.mocked(cache.fetchWithCache).mockResolvedValue(mockResponse as any);
      vi.mocked(util.maybeCoerceToGeminiFormat).mockImplementation(function () {
        return {
          contents: [{ role: 'user', parts: [{ text: 'test prompt' }] }],
          coerced: false,
          systemInstruction: undefined,
        };
      });

      const response = await provider.callGemini('test prompt');

      // gemini-pro: input=0.5/1M, output=1.5/1M -> (10*0.5 + 5*1.5)/1M = 12.5/1M
      expect(response.cost).toBeCloseTo(0.0000125, 10);
      expect(response).toMatchObject({
        output: 'response text',
        tokenUsage: {
          prompt: 10,
          completion: 5,
          total: 15,
          numRequests: 1,
        },
        raw: mockResponse.data,
        cached: false,
        metadata: {},
      });

      expect(cache.fetchWithCache).toHaveBeenCalledWith(
        expect.stringContaining('v1beta/models/gemini-pro:generateContent'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining(
            '"contents":[{"parts":[{"text":"test prompt"}],"role":"user"}]',
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

      vi.mocked(cache.fetchWithCache).mockResolvedValue(mockResponse as any);
      vi.mocked(util.maybeCoerceToGeminiFormat).mockImplementation(function () {
        return {
          contents: [{ role: 'user', parts: [{ text: 'test prompt' }] }],
          coerced: false,
          systemInstruction: undefined,
        };
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
        metadata: {},
      });
    });

    it('should use v1alpha API for thinking model', async () => {
      provider = new AIStudioChatProvider('gemini-2.0-flash-thinking-exp', {
        config: { apiKey: 'test-key' },
      });
      const mockResponse = {
        data: {
          candidates: [{ content: { parts: [{ text: 'thinking response' }] } }],
        },
        cached: false,
      };

      vi.mocked(cache.fetchWithCache).mockResolvedValue(mockResponse as any);
      vi.mocked(util.maybeCoerceToGeminiFormat).mockImplementation(function () {
        return {
          contents: [{ role: 'user', parts: [{ text: 'test prompt' }] }],
          coerced: false,
          systemInstruction: undefined,
        };
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

    it('should handle API call errors', async () => {
      const provider = new AIStudioChatProvider('gemini-pro', {
        config: {
          apiKey: 'test-key',
        },
      });

      vi.mocked(util.maybeCoerceToGeminiFormat).mockImplementationOnce(function () {
        return {
          contents: [{ role: 'user', parts: [{ text: 'test prompt' }] }],
          coerced: false,
          systemInstruction: undefined,
        };
      });

      vi.mocked(cache.fetchWithCache).mockRejectedValueOnce(new Error('API call failed'));

      const response = await provider.callGemini('test prompt');
      expect(response.error).toContain('API call failed');
    });

    it('should handle response schema', async () => {
      provider = new AIStudioChatProvider('gemini-pro', {
        config: {
          apiKey: 'test-key',
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

      vi.mocked(cache.fetchWithCache).mockResolvedValue(mockResponse as any);
      vi.mocked(util.maybeCoerceToGeminiFormat).mockImplementation(function () {
        return {
          contents: [{ role: 'user', parts: [{ text: 'test prompt' }] }],
          coerced: false,
          systemInstruction: undefined,
        };
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

      vi.mocked(cache.fetchWithCache).mockResolvedValue(mockResponse as any);
      vi.mocked(util.maybeCoerceToGeminiFormat).mockImplementation(function () {
        return {
          contents: [{ role: 'user', parts: [{ text: 'test prompt' }] }],
          coerced: false,
          systemInstruction: undefined,
        };
      });

      const response = await provider.callGemini('test prompt');

      expect(response.guardrails).toEqual({
        flaggedInput: false,
        flaggedOutput: true,
        flagged: true,
      });
    });

    it('should handle structured output with response schema', async () => {
      provider = new AIStudioChatProvider('gemini-pro', {
        config: {
          apiKey: 'test-key',
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

      vi.mocked(cache.fetchWithCache).mockResolvedValue(mockResponse as any);
      vi.mocked(util.maybeCoerceToGeminiFormat).mockImplementation(function () {
        return {
          contents: [{ role: 'user', parts: [{ text: 'test prompt' }] }],
          coerced: false,
          systemInstruction: undefined,
        };
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

      vi.mocked(cache.fetchWithCache).mockResolvedValue(mockResponse as any);
      vi.mocked(util.maybeCoerceToGeminiFormat).mockImplementation(function () {
        return {
          contents: [
            {
              role: 'user',
              parts: [{ text: 'First part' }, { text: 'Second part' }],
            },
          ],
          coerced: false,
          systemInstruction: undefined,
        };
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
      provider = new AIStudioChatProvider('gemini-pro', {
        config: {
          apiKey: 'test-key',
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

      vi.mocked(cache.fetchWithCache).mockResolvedValue(mockResponse as any);
      vi.mocked(util.maybeCoerceToGeminiFormat).mockImplementation(function () {
        return {
          contents: [{ role: 'user', parts: [{ text: 'test prompt' }] }],
          coerced: false,
          systemInstruction: undefined,
        };
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
      const v1alphaProvider = new AIStudioChatProvider('gemini-2.0-flash-thinking-exp', {
        config: { apiKey: 'test-key' },
      });
      const v1betaProvider = new AIStudioChatProvider('gemini-pro', {
        config: { apiKey: 'test-key' },
      });

      const mockResponse = {
        data: {
          candidates: [{ content: { parts: [{ text: 'response' }] } }],
        },
        cached: false,
      };

      vi.mocked(cache.fetchWithCache).mockResolvedValue(mockResponse as any);
      vi.mocked(util.maybeCoerceToGeminiFormat).mockImplementation(function () {
        return {
          contents: [{ role: 'user', parts: [{ text: 'test prompt' }] }],
          coerced: false,
          systemInstruction: undefined,
        };
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

    it('should allow explicit apiVersion override', async () => {
      // Test that config.apiVersion takes precedence over auto-detection
      const providerWithOverride = new AIStudioChatProvider('gemini-pro', {
        config: {
          apiKey: 'test-key',
          apiVersion: 'v1', // Override default v1beta
        },
      });

      const mockResponse = {
        data: {
          candidates: [{ content: { parts: [{ text: 'response' }] } }],
        },
        cached: false,
      };

      vi.mocked(cache.fetchWithCache).mockResolvedValue(mockResponse as any);
      vi.mocked(util.maybeCoerceToGeminiFormat).mockImplementation(function () {
        return {
          contents: [{ role: 'user', parts: [{ text: 'test prompt' }] }],
          coerced: false,
          systemInstruction: undefined,
        };
      });

      await providerWithOverride.callGemini('test prompt');

      // Should use v1 instead of auto-detected v1beta
      expect(cache.fetchWithCache).toHaveBeenCalledWith(
        expect.stringContaining('/v1/models/gemini-pro:generateContent'),
        expect.any(Object),
        expect.any(Number),
        'json',
        false,
      );
      // Ensure it's not using the auto-detected version
      expect(cache.fetchWithCache).not.toHaveBeenCalledWith(
        expect.stringContaining('v1beta'),
        expect.any(Object),
        expect.any(Number),
        expect.any(String),
        expect.any(Boolean),
      );
    });

    it('should handle function calling configuration', async () => {
      vi.mocked(templates.getNunjucksEngine).mockImplementation(function () {
        return {
          renderString: vi.fn((str) => `rendered-${str}`),
        } as any;
      });
      const tools = [
        {
          functionDeclarations: [
            {
              name: 'get_weather',
              description: 'Get weather information',
              parameters: {
                type: 'OBJECT' as const,
                properties: {
                  location: {
                    type: 'STRING' as const,
                    description: 'City name',
                  },
                },
                required: ['location'],
              },
            },
          ],
        },
      ];

      provider = new AIStudioChatProvider('gemini-pro', {
        config: {
          apiKey: 'test-key',
          toolConfig: {
            functionCallingConfig: {
              mode: 'AUTO',
              allowedFunctionNames: ['get_weather'],
            },
          },
          tools,
        },
      });

      const mockResponse = {
        data: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    functionCall: {
                      name: 'get_weather',
                      args: { location: 'San Francisco' },
                    },
                  },
                ],
              },
            },
          ],
          usageMetadata: {
            totalTokenCount: 15,
            promptTokenCount: 8,
            candidatesTokenCount: 7,
          },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: {},
      };

      vi.mocked(util.maybeCoerceToGeminiFormat).mockImplementationOnce(function () {
        return {
          contents: [{ role: 'user', parts: [{ text: 'What is the weather in San Francisco?' }] }],
          coerced: false,
          systemInstruction: undefined,
        };
      });

      vi.mocked(cache.fetchWithCache).mockResolvedValueOnce(mockResponse);

      const response = await provider.callGemini('What is the weather in San Francisco?');

      // gemini-pro: input=0.5/1M, output=1.5/1M -> (8*0.5 + 7*1.5)/1M = 14.5/1M
      expect(response.cost).toBeCloseTo(0.0000145, 10);
      expect(response).toMatchObject({
        cached: false,
        output: [
          {
            functionCall: {
              name: 'get_weather',
              args: { location: 'San Francisco' },
            },
          },
        ],
        raw: mockResponse.data,
        tokenUsage: {
          numRequests: 1,
          total: 15,
          prompt: 8,
          completion: 7,
        },
        metadata: {},
      });

      expect(cache.fetchWithCache).toHaveBeenCalledWith(
        'https://rendered-generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
        {
          body: '{"contents":[{"parts":[{"text":"What is the weather in San Francisco?"}],"role":"user"}],"generationConfig":{},"toolConfig":{"functionCallingConfig":{"mode":"AUTO","allowedFunctionNames":["get_weather"]}},"tools":[{"functionDeclarations":[{"name":"get_weather","description":"Get weather information","parameters":{"type":"OBJECT","properties":{"location":{"type":"STRING","description":"City name"}},"required":["location"]}}]}]}',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': 'rendered-test-key' },
          method: 'POST',
        },
        300000,
        'json',
        false,
      );
    });

    it('should load tools from external file and render variables', async () => {
      const mockRenderString = vi.fn((str, _vars) => {
        if (str.startsWith('file://')) {
          return str;
        }
        return `rendered-${str}`;
      });
      vi.mocked(templates.getNunjucksEngine).mockImplementation(function () {
        return {
          renderString: mockRenderString,
        } as any;
      });

      const mockExternalTools = [
        {
          functionDeclarations: [
            {
              name: 'get_weather',
              description: 'Get weather in San Francisco',
              parameters: {
                type: 'OBJECT' as const,
                properties: {
                  location: { type: 'STRING' as const },
                },
              },
            },
          ],
        },
      ];

      // Mock maybeLoadToolsFromExternalFile to return tools for file:// paths
      mockMaybeLoadToolsFromExternalFile.mockImplementation((input) => {
        if (typeof input === 'string' && input === 'file://tools.json') {
          return mockExternalTools;
        }
        return input;
      });

      provider = new AIStudioChatProvider('gemini-pro', {
        config: {
          apiKey: 'test-key',
          tools: 'file://tools.json' as any,
        },
      });

      const mockResponse = {
        data: {
          candidates: [
            {
              content: {
                parts: [{ text: 'response with tools' }],
              },
            },
          ],
          usageMetadata: {
            totalTokenCount: 10,
            promptTokenCount: 5,
            candidatesTokenCount: 5,
          },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: {},
      };

      vi.mocked(util.maybeCoerceToGeminiFormat).mockImplementationOnce(function () {
        return {
          contents: [{ role: 'user', parts: [{ text: 'What is the weather in San Francisco?' }] }],
          coerced: false,
          systemInstruction: undefined,
        };
      });

      vi.mocked(cache.fetchWithCache).mockResolvedValueOnce(mockResponse);

      const response = await provider.callGemini('What is the weather in San Francisco?', {
        vars: { location: 'San Francisco' },
        prompt: { raw: 'test prompt', label: 'test' },
      });

      // gemini-pro: input=0.5/1M, output=1.5/1M -> (5*0.5 + 5*1.5)/1M = 10/1M
      expect(response.cost).toBeCloseTo(0.00001, 10);
      expect(response).toMatchObject({
        cached: false,
        output: 'response with tools',
        raw: mockResponse.data,
        tokenUsage: {
          numRequests: 1,
          total: 10,
          prompt: 5,
          completion: 5,
        },
        metadata: {},
      });

      // Verify maybeLoadToolsFromExternalFile was called with the tools file path
      expect(mockMaybeLoadToolsFromExternalFile).toHaveBeenCalledWith('file://tools.json', {
        location: 'San Francisco',
      });
      expect(cache.fetchWithCache).toHaveBeenCalledWith(
        'https://rendered-generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
        {
          body: '{"contents":[{"parts":[{"text":"What is the weather in San Francisco?"}],"role":"user"}],"generationConfig":{},"tools":[{"functionDeclarations":[{"name":"get_weather","description":"Get weather in San Francisco","parameters":{"type":"OBJECT","properties":{"location":{"type":"STRING"}}}}]}]}',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': 'rendered-test-key' },
          method: 'POST',
        },
        300000,
        'json',
        false,
      );
    });

    it('should handle Google Search as a tool', async () => {
      // Reset the Nunjucks mock to return the non-rendered value for these tests
      vi.mocked(templates.getNunjucksEngine).mockImplementation(function () {
        return {
          renderString: vi.fn((str) => str),
        } as any;
      });

      provider = new AIStudioChatProvider('gemini-2.0-flash', {
        config: {
          apiKey: 'test-key',
          tools: [
            {
              googleSearch: {},
            },
          ],
        },
      });

      const mockResponse = {
        data: {
          candidates: [
            {
              content: {
                parts: [{ text: 'response with search results' }],
                role: 'model',
              },
              groundingMetadata: {
                searchEntryPoint: {
                  renderedContent: '<rendered search suggestion HTML>',
                },
                groundingChunks: [
                  {
                    web: {
                      uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/test',
                      title: 'test.com',
                    },
                  },
                ],
                webSearchQueries: ['test query'],
              },
            },
          ],
          usageMetadata: {
            totalTokenCount: 15,
            promptTokenCount: 8,
            candidatesTokenCount: 7,
          },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: {},
      };

      vi.mocked(util.maybeCoerceToGeminiFormat).mockImplementationOnce(function () {
        return {
          contents: [
            { role: 'user', parts: [{ text: 'What is the current Google stock price?' }] },
          ],
          coerced: false,
          systemInstruction: undefined,
        };
      });

      vi.mocked(cache.fetchWithCache).mockResolvedValueOnce(mockResponse);

      const response = await provider.callGemini('What is the current Google stock price?');

      // gemini-2.0-flash: input=0.1/1M, output=0.4/1M -> (8*0.1 + 7*0.4)/1M = 3.6/1M
      expect(response.cost).toBeCloseTo(0.0000036, 10);
      expect(response).toMatchObject({
        cached: false,
        output: 'response with search results',
        raw: mockResponse.data,
        tokenUsage: {
          numRequests: 1,
          total: 15,
          prompt: 8,
          completion: 7,
        },
        metadata: {
          groundingMetadata: mockResponse.data.candidates[0].groundingMetadata,
        },
      });

      expect(cache.fetchWithCache).toHaveBeenCalledWith(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
        {
          body: expect.stringContaining('"googleSearch":{}'),
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': 'test-key' },
          method: 'POST',
        },
        300000,
        'json',
        false,
      );
    });

    it('should handle Google Search retrieval for Gemini 1.5 models', async () => {
      // Reset the Nunjucks mock to return the non-rendered value for these tests
      vi.mocked(templates.getNunjucksEngine).mockImplementation(function () {
        return {
          renderString: vi.fn((str) => str),
        } as any;
      });

      provider = new AIStudioChatProvider('gemini-2.5-flash', {
        config: {
          apiKey: 'test-key',
          tools: [
            {
              googleSearchRetrieval: {
                dynamicRetrievalConfig: {
                  mode: 'MODE_DYNAMIC',
                  dynamicThreshold: 0.3,
                },
              },
            },
          ],
        },
      });

      const mockResponse = {
        data: {
          candidates: [
            {
              content: {
                parts: [{ text: 'response with search retrieval' }],
                role: 'model',
              },
              groundingMetadata: {
                searchEntryPoint: {
                  renderedContent: '<rendered search suggestion HTML>',
                },
                groundingChunks: [
                  {
                    web: {
                      uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/test-retrieval',
                      title: 'retrieval.com',
                    },
                  },
                ],
                webSearchQueries: ['retrieval query'],
              },
            },
          ],
          usageMetadata: {
            totalTokenCount: 15,
            promptTokenCount: 8,
            candidatesTokenCount: 7,
          },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: {},
      };

      vi.mocked(util.maybeCoerceToGeminiFormat).mockImplementationOnce(function () {
        return {
          contents: [
            { role: 'user', parts: [{ text: 'What is the current Google stock price?' }] },
          ],
          coerced: false,
          systemInstruction: undefined,
        };
      });

      vi.mocked(cache.fetchWithCache).mockResolvedValueOnce(mockResponse);

      const response = await provider.callGemini('What is the current Google stock price?');

      // gemini-2.5-flash: input=0.3/1M, output=2.5/1M -> (8*0.3 + 7*2.5)/1M = 19.9/1M
      expect(response.cost).toBeCloseTo(0.0000199, 10);
      expect(response).toMatchObject({
        cached: false,
        output: 'response with search retrieval',
        raw: mockResponse.data,
        tokenUsage: {
          numRequests: 1,
          total: 15,
          prompt: 8,
          completion: 7,
        },
        metadata: {
          groundingMetadata: mockResponse.data.candidates[0].groundingMetadata,
        },
      });

      expect(cache.fetchWithCache).toHaveBeenCalledWith(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
        {
          body: expect.stringContaining(
            '"googleSearchRetrieval":{"dynamicRetrievalConfig":{"mode":"MODE_DYNAMIC","dynamicThreshold":0.3}}',
          ),
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': 'test-key' },
          method: 'POST',
        },
        300000,
        'json',
        false,
      );
    });

    it('should handle object-based tools format', async () => {
      // Reset the Nunjucks mock to return the non-rendered value for these tests
      vi.mocked(templates.getNunjucksEngine).mockImplementation(function () {
        return {
          renderString: vi.fn((str) => str),
        } as any;
      });

      provider = new AIStudioChatProvider('gemini-2.0-flash', {
        config: {
          apiKey: 'test-key',
          tools: [{ googleSearch: {} }],
        },
      });

      const mockResponse = {
        data: {
          candidates: [
            {
              content: {
                parts: [{ text: 'response with search results' }],
                role: 'model',
              },
              groundingMetadata: {
                webSearchQueries: ['test query'],
              },
            },
          ],
          usageMetadata: {
            totalTokenCount: 20,
            promptTokenCount: 8,
            candidatesTokenCount: 12,
          },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
        headers: {},
      };

      vi.mocked(util.maybeCoerceToGeminiFormat).mockImplementationOnce(function () {
        return {
          contents: [{ role: 'user', parts: [{ text: 'What is the latest news?' }] }],
          coerced: false,
          systemInstruction: undefined,
        };
      });

      vi.mocked(cache.fetchWithCache).mockResolvedValueOnce(mockResponse);

      const response = await provider.callGemini('What is the latest news?');

      // gemini-2.0-flash: input=0.1/1M, output=0.4/1M -> (8*0.1 + 12*0.4)/1M = 5.6/1M
      expect(response.cost).toBeCloseTo(0.0000056, 10);
      expect(response).toMatchObject({
        cached: false,
        output: 'response with search results',
        raw: mockResponse.data,
        tokenUsage: {
          numRequests: 1,
          total: 20,
          prompt: 8,
          completion: 12,
        },
        metadata: {
          groundingMetadata: mockResponse.data.candidates[0].groundingMetadata,
        },
      });

      expect(cache.fetchWithCache).toHaveBeenCalledWith(
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',
        {
          body: expect.stringContaining('"googleSearch":{}'),
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': 'test-key' },
          method: 'POST',
        },
        300000,
        'json',
        false,
      );
    });

    it('should pass custom headers to the Gemini API', async () => {
      provider = new AIStudioChatProvider('gemini-pro', {
        config: {
          apiKey: 'test-key',
          headers: {
            'X-Custom-Header1': 'custom-value1',
            'X-Custom-Header2': 'custom-value2',
            'X-Custom-Header3': 'custom-value3',
          },
        },
      });

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

      vi.mocked(cache.fetchWithCache).mockResolvedValue(mockResponse as any);
      vi.mocked(util.maybeCoerceToGeminiFormat).mockImplementation(function () {
        return {
          contents: [{ role: 'user', parts: [{ text: 'test prompt' }] }],
          coerced: false,
          systemInstruction: undefined,
        };
      });

      await provider.callGemini('test prompt');

      expect(cache.fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Custom-Header1': 'custom-value1',
            'X-Custom-Header2': 'custom-value2',
            'X-Custom-Header3': 'custom-value3',
          }),
        }),
        expect.any(Number),
        'json',
        false,
      );
    });

    it('should load system instructions from file', async () => {
      const mockSystemInstruction = 'You are a helpful assistant from a file.';

      // Mock maybeLoadFromExternalFile to return file contents for file:// paths
      mockMaybeLoadFromExternalFile.mockImplementation((input) => {
        if (input === 'file://system-instruction.txt') {
          return mockSystemInstruction;
        }
        return input;
      });

      provider = new AIStudioChatProvider('gemini-pro', {
        config: {
          apiKey: 'test-key',
          systemInstruction: 'file://system-instruction.txt',
        },
      });

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

      vi.mocked(cache.fetchWithCache).mockResolvedValue(mockResponse as any);
      vi.mocked(util.maybeCoerceToGeminiFormat).mockImplementation(function () {
        return {
          contents: [{ role: 'user', parts: [{ text: 'test prompt' }] }],
          coerced: false,
          systemInstruction: undefined,
        };
      });

      await provider.callGemini('test prompt');

      expect(cache.fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining(
            `"system_instruction":{"parts":[{"text":"${mockSystemInstruction}"}]}`,
          ),
        }),
        expect.any(Number),
        'json',
        false,
      );

      // Verify maybeLoadFromExternalFile was called with the file path
      expect(mockMaybeLoadFromExternalFile).toHaveBeenCalledWith('file://system-instruction.txt');
    });

    describe('thinking token tracking', () => {
      it('should track thinking tokens when present in response', async () => {
        const provider = new AIStudioChatProvider('gemini-2.5-flash', {
          config: {
            apiKey: 'test-key',
            generationConfig: {
              thinkingConfig: {
                thinkingBudget: 1024,
              },
            },
          },
        });

        const mockResponse = {
          data: {
            candidates: [{ content: { parts: [{ text: 'response with thinking' }] } }],
            usageMetadata: {
              promptTokenCount: 10,
              candidatesTokenCount: 20,
              totalTokenCount: 30,
              thoughtsTokenCount: 50, // Thinking tokens
            },
          },
          cached: false,
        };

        vi.mocked(cache.fetchWithCache).mockResolvedValue(mockResponse as any);
        vi.mocked(util.maybeCoerceToGeminiFormat).mockImplementation(function () {
          return {
            contents: [{ role: 'user', parts: [{ text: 'test prompt' }] }],
            coerced: false,
            systemInstruction: undefined,
          };
        });

        const response = await provider.callGemini('test prompt');

        expect(response.tokenUsage).toEqual({
          prompt: 10,
          completion: 20,
          total: 30,
          numRequests: 1,
          completionDetails: {
            reasoning: 50,
            acceptedPrediction: 0,
            rejectedPrediction: 0,
          },
        });
      });

      it('should handle response without thinking tokens', async () => {
        const provider = new AIStudioChatProvider('gemini-2.5-flash', {
          config: {
            apiKey: 'test-key',
          },
        });

        const mockResponse = {
          data: {
            candidates: [{ content: { parts: [{ text: 'response without thinking' }] } }],
            usageMetadata: {
              promptTokenCount: 10,
              candidatesTokenCount: 20,
              totalTokenCount: 30,
              // No thoughtsTokenCount field
            },
          },
          cached: false,
        };

        vi.mocked(cache.fetchWithCache).mockResolvedValue(mockResponse as any);
        vi.mocked(util.maybeCoerceToGeminiFormat).mockImplementation(function () {
          return {
            contents: [{ role: 'user', parts: [{ text: 'test prompt' }] }],
            coerced: false,
            systemInstruction: undefined,
          };
        });

        const response = await provider.callGemini('test prompt');

        expect(response.tokenUsage).toEqual({
          prompt: 10,
          completion: 20,
          total: 30,
          numRequests: 1,
          // No completionDetails field when thoughtsTokenCount is absent
        });
      });

      it('should track thinking tokens with zero value', async () => {
        const provider = new AIStudioChatProvider('gemini-2.5-flash', {
          config: {
            apiKey: 'test-key',
            generationConfig: {
              thinkingConfig: {
                thinkingBudget: 1024,
              },
            },
          },
        });

        const mockResponse = {
          data: {
            candidates: [{ content: { parts: [{ text: 'response with zero thinking' }] } }],
            usageMetadata: {
              promptTokenCount: 10,
              candidatesTokenCount: 20,
              totalTokenCount: 30,
              thoughtsTokenCount: 0, // Zero thinking tokens
            },
          },
          cached: false,
        };

        vi.mocked(cache.fetchWithCache).mockResolvedValue(mockResponse as any);
        vi.mocked(util.maybeCoerceToGeminiFormat).mockImplementation(function () {
          return {
            contents: [{ role: 'user', parts: [{ text: 'test prompt' }] }],
            coerced: false,
            systemInstruction: undefined,
          };
        });

        const response = await provider.callGemini('test prompt');

        expect(response.tokenUsage).toEqual({
          prompt: 10,
          completion: 20,
          total: 30,
          numRequests: 1,
          completionDetails: {
            reasoning: 0,
            acceptedPrediction: 0,
            rejectedPrediction: 0,
          },
        });
      });

      it('should track thinking tokens in cached responses', async () => {
        const provider = new AIStudioChatProvider('gemini-2.5-flash', {
          config: {
            apiKey: 'test-key',
            generationConfig: {
              thinkingConfig: {
                thinkingBudget: 1024,
              },
            },
          },
        });

        const mockResponse = {
          data: {
            candidates: [{ content: { parts: [{ text: 'cached response with thinking' }] } }],
            usageMetadata: {
              promptTokenCount: 10,
              candidatesTokenCount: 20,
              totalTokenCount: 80,
              thoughtsTokenCount: 50, // Thinking tokens in cached response
            },
          },
          cached: true,
        };

        vi.mocked(cache.fetchWithCache).mockResolvedValue(mockResponse as any);
        vi.mocked(util.maybeCoerceToGeminiFormat).mockImplementation(function () {
          return {
            contents: [{ role: 'user', parts: [{ text: 'test prompt' }] }],
            coerced: false,
            systemInstruction: undefined,
          };
        });

        const response = await provider.callGemini('test prompt');

        expect(response.tokenUsage).toEqual({
          cached: 80,
          total: 80,
          numRequests: 0,
          completionDetails: {
            reasoning: 50,
            acceptedPrediction: 0,
            rejectedPrediction: 0,
          },
        });
      });
    });

    describe('thinking token cost calculation', () => {
      it('should include thinking tokens in cost calculation', async () => {
        const provider = new AIStudioChatProvider('gemini-2.5-flash', {
          config: {
            apiKey: 'test-key',
          },
        });

        const mockResponse = {
          data: {
            candidates: [{ content: { parts: [{ text: 'response with thinking' }] } }],
            usageMetadata: {
              promptTokenCount: 10,
              candidatesTokenCount: 5,
              totalTokenCount: 315,
              thoughtsTokenCount: 300,
            },
          },
          cached: false,
        };

        vi.mocked(cache.fetchWithCache).mockResolvedValue(mockResponse as any);
        vi.mocked(util.maybeCoerceToGeminiFormat).mockImplementation(function () {
          return {
            contents: [{ role: 'user', parts: [{ text: 'test prompt' }] }],
            coerced: false,
            systemInstruction: undefined,
          };
        });

        const response = await provider.callGemini('test prompt');

        // gemini-2.5-flash: input=0.3/1e6, output=2.5/1e6
        // completionForCost = candidatesTokenCount + thoughtsTokenCount = 5 + 300 = 305
        // cost = 0.3e-6 * 10 + 2.5e-6 * 305 = 0.000003 + 0.0007625 = 0.0007655
        expect(response.cost).toBeCloseTo(0.0007655, 10);
      });

      it('should not include thinking tokens in cost when response is cached', async () => {
        const provider = new AIStudioChatProvider('gemini-2.5-flash', {
          config: {
            apiKey: 'test-key',
          },
        });

        const mockResponse = {
          data: {
            candidates: [{ content: { parts: [{ text: 'cached response' }] } }],
            usageMetadata: {
              promptTokenCount: 10,
              candidatesTokenCount: 5,
              totalTokenCount: 315,
              thoughtsTokenCount: 300,
            },
          },
          cached: true,
        };

        vi.mocked(cache.fetchWithCache).mockResolvedValue(mockResponse as any);
        vi.mocked(util.maybeCoerceToGeminiFormat).mockImplementation(function () {
          return {
            contents: [{ role: 'user', parts: [{ text: 'test prompt' }] }],
            coerced: false,
            systemInstruction: undefined,
          };
        });

        const response = await provider.callGemini('test prompt');

        expect(response.cost).toBeUndefined();
      });

      it('should calculate cost correctly when thoughtsTokenCount is absent', async () => {
        const provider = new AIStudioChatProvider('gemini-2.5-flash', {
          config: {
            apiKey: 'test-key',
          },
        });

        const mockResponse = {
          data: {
            candidates: [{ content: { parts: [{ text: 'response' }] } }],
            usageMetadata: {
              promptTokenCount: 10,
              candidatesTokenCount: 5,
              totalTokenCount: 15,
              // No thoughtsTokenCount field
            },
          },
          cached: false,
        };

        vi.mocked(cache.fetchWithCache).mockResolvedValue(mockResponse as any);
        vi.mocked(util.maybeCoerceToGeminiFormat).mockImplementation(function () {
          return {
            contents: [{ role: 'user', parts: [{ text: 'test prompt' }] }],
            coerced: false,
            systemInstruction: undefined,
          };
        });

        const response = await provider.callGemini('test prompt');

        // gemini-2.5-flash: input=0.3/1e6, output=2.5/1e6
        // completionForCost = 5 + 0 = 5 (thoughtsTokenCount defaults to 0)
        // cost = 0.3e-6 * 10 + 2.5e-6 * 5 = 0.000003 + 0.0000125 = 0.0000155
        expect(response.cost).toBeCloseTo(0.0000155, 10);
      });
    });
  });
});
