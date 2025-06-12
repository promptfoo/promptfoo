import * as fs from 'fs';
import * as cache from '../../../src/cache';
import { AIStudioChatProvider } from '../../../src/providers/google/ai.studio';
import * as util from '../../../src/providers/google/util';
import { getNunjucksEngineForFilePath } from '../../../src/util/file';
import * as templates from '../../../src/util/templates';

jest.mock('../../../src/cache', () => ({
  fetchWithCache: jest.fn(),
}));

jest.mock('../../../src/providers/google/util', () => ({
  ...jest.requireActual('../../../src/providers/google/util'),
  maybeCoerceToGeminiFormat: jest.fn(),
}));

jest.mock('../../../src/util/templates', () => ({
  getNunjucksEngine: jest.fn(() => ({
    renderString: jest.fn((str) => str),
  })),
}));

jest.mock('../../../src/util/file', () => ({
  getNunjucksEngineForFilePath: jest.fn(),
  maybeLoadFromExternalFile: jest.fn((input) => {
    if (typeof input === 'string' && input.startsWith('file://')) {
      // Simulate loading from file
      const fs = require('fs');
      const path = require('path');
      const filePath = path.resolve(input.slice('file://'.length));

      if (fs.existsSync(filePath)) {
        const contents = fs.readFileSync(filePath, 'utf8');
        if (filePath.endsWith('.json')) {
          return JSON.parse(contents);
        }
        return contents;
      }
      throw new Error(`File does not exist: ${filePath}`);
    }
    return input;
  }),
}));

jest.mock('glob', () => ({
  globSync: jest.fn().mockReturnValue([]),
}));

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  statSync: jest.fn(),
}));

describe('AIStudioChatProvider', () => {
  let provider: AIStudioChatProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(templates.getNunjucksEngine).mockReturnValue({
      renderString: jest.fn((str) => str),
    } as any);
    jest.mocked(fs.existsSync).mockReset();
    jest.mocked(fs.readFileSync).mockReset();
    jest.mocked(fs.writeFileSync).mockReset();
    jest.mocked(fs.statSync).mockReset();
    jest.mocked(getNunjucksEngineForFilePath).mockReturnValue({
      renderString: jest.fn((str) => str),
    } as any);

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
      const mockRenderString = jest.fn((str) => `rendered-${str}`);
      jest.mocked(templates.getNunjucksEngine).mockReturnValue({
        renderString: mockRenderString,
      } as any);

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
      const providerWithNoKey = new AIStudioChatProvider('gemini-pro');
      expect(providerWithNoKey.getApiKey()).toBeUndefined();
    });

    it('should resolve API URL from various sources and render with Nunjucks', () => {
      const mockRenderString = jest.fn((str) => `rendered-${str}`);
      jest.mocked(templates.getNunjucksEngine).mockReturnValue({
        renderString: mockRenderString,
      } as any);

      // From config.apiHost
      const providerWithConfigHost = new AIStudioChatProvider('gemini-pro', {
        config: { apiHost: 'custom.host.com' },
      });
      expect(providerWithConfigHost.getApiUrl()).toBe('https://rendered-custom.host.com');
      expect(mockRenderString).toHaveBeenCalledWith('custom.host.com', {});

      // From env override: GOOGLE_API_HOST
      const providerWithEnvOverride = new AIStudioChatProvider('gemini-pro', {
        env: { GOOGLE_API_HOST: 'env.host.com' },
      });
      expect(providerWithEnvOverride.getApiUrl()).toBe('https://rendered-env.host.com');
      expect(mockRenderString).toHaveBeenCalledWith('env.host.com', {});

      // From config.apiBaseUrl
      const providerWithBaseUrl = new AIStudioChatProvider('gemini-pro', {
        config: { apiBaseUrl: 'https://base.url.com' },
      });
      expect(providerWithBaseUrl.getApiUrl()).toBe('https://base.url.com');

      // From env.GOOGLE_API_BASE_URL
      const providerWithEnvBaseUrl = new AIStudioChatProvider('gemini-pro', {
        env: { GOOGLE_API_BASE_URL: 'https://env-base.url.com' },
      });
      expect(providerWithEnvBaseUrl.getApiUrl()).toBe('https://env-base.url.com');

      // Default URL fallback
      const providerWithDefault = new AIStudioChatProvider('gemini-pro');
      expect(providerWithDefault.getApiUrl()).toBe(
        'https://rendered-generativelanguage.googleapis.com',
      );
    });

    it('should prioritize apiHost over apiBaseUrl', () => {
      jest.mocked(templates.getNunjucksEngine).mockReturnValue({
        renderString: jest.fn((str) => `rendered-${str}`),
      } as any);
      const provider = new AIStudioChatProvider('gemini-pro', {
        config: {
          apiHost: 'host.googleapis.com',
          apiBaseUrl: 'https://base.googleapis.com',
        },
      });
      expect(provider.getApiUrl()).toBe('https://rendered-host.googleapis.com');
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
      provider = new AIStudioChatProvider('gemini-pro', {});
      await expect(provider.callApi('test')).rejects.toThrow('Google API key is not set');
    });

    it('should handle empty candidate responses', async () => {
      const provider = new AIStudioChatProvider('gemini-pro', {
        config: {
          apiKey: 'test-key',
        },
      });

      jest.mocked(util.maybeCoerceToGeminiFormat).mockReturnValueOnce({
        contents: [{ role: 'user', parts: [{ text: 'test prompt' }] }],
        coerced: false,
        systemInstruction: undefined,
      });

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
      expect(response.error).toContain('Error: Expected one candidate in API response.');
    });

    it('should handle malformed API responses', async () => {
      const provider = new AIStudioChatProvider('gemini-pro', {
        config: {
          apiKey: 'test-key',
        },
      });

      jest.mocked(util.maybeCoerceToGeminiFormat).mockReturnValueOnce({
        contents: [{ role: 'user', parts: [{ text: 'test prompt' }] }],
        coerced: false,
        systemInstruction: undefined,
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

      jest.mocked(cache.fetchWithCache).mockResolvedValueOnce({
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
  });

  describe('non-Gemini models', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      jest.mocked(templates.getNunjucksEngine).mockReturnValue({
        renderString: jest.fn((str) => str),
      } as any);
      jest.mocked(fs.existsSync).mockReset();
      jest.mocked(fs.readFileSync).mockReset();
      jest.mocked(fs.writeFileSync).mockReset();
      jest.mocked(fs.statSync).mockReset();
      jest.mocked(getNunjucksEngineForFilePath).mockReturnValue({
        renderString: jest.fn((str) => str),
      } as any);
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
      jest.mocked(util.maybeCoerceToGeminiFormat).mockReturnValue({
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

      jest.mocked(cache.fetchWithCache).mockResolvedValue(mockResponse as any);
      jest.mocked(util.maybeCoerceToGeminiFormat).mockReturnValue({
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
        metadata: {},
      });
    });

    it('should use v1alpha API for thinking model', async () => {
      provider = new AIStudioChatProvider('gemini-2.0-flash-thinking-exp');
      const mockResponse = {
        data: {
          candidates: [{ content: { parts: [{ text: 'thinking response' }] } }],
        },
        cached: false,
      };

      jest.mocked(cache.fetchWithCache).mockResolvedValue(mockResponse as any);
      jest.mocked(util.maybeCoerceToGeminiFormat).mockReturnValue({
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

    it('should handle API call errors', async () => {
      const provider = new AIStudioChatProvider('gemini-pro', {
        config: {
          apiKey: 'test-key',
        },
      });

      jest.mocked(util.maybeCoerceToGeminiFormat).mockReturnValueOnce({
        contents: [{ role: 'user', parts: [{ text: 'test prompt' }] }],
        coerced: false,
        systemInstruction: undefined,
      });

      jest.mocked(cache.fetchWithCache).mockRejectedValueOnce(new Error('API call failed'));

      const response = await provider.callGemini('test prompt');
      expect(response.error).toContain('API call failed');
    });

    it('should handle response schema', async () => {
      provider = new AIStudioChatProvider('gemini-pro', {
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
      jest.mocked(util.maybeCoerceToGeminiFormat).mockReturnValue({
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
      jest.mocked(util.maybeCoerceToGeminiFormat).mockReturnValue({
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
      provider = new AIStudioChatProvider('gemini-pro', {
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
      jest.mocked(util.maybeCoerceToGeminiFormat).mockReturnValue({
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
      jest.mocked(util.maybeCoerceToGeminiFormat).mockReturnValue({
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
      provider = new AIStudioChatProvider('gemini-pro', {
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
      jest.mocked(util.maybeCoerceToGeminiFormat).mockReturnValue({
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
      const v1alphaProvider = new AIStudioChatProvider('gemini-2.0-flash-thinking-exp');
      const v1betaProvider = new AIStudioChatProvider('gemini-pro');

      const mockResponse = {
        data: {
          candidates: [{ content: { parts: [{ text: 'response' }] } }],
        },
        cached: false,
      };

      jest.mocked(cache.fetchWithCache).mockResolvedValue(mockResponse as any);
      jest.mocked(util.maybeCoerceToGeminiFormat).mockReturnValue({
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

    it('should handle function calling configuration', async () => {
      jest.mocked(templates.getNunjucksEngine).mockReturnValue({
        renderString: jest.fn((str) => `rendered-${str}`),
      } as any);
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

      jest.mocked(util.maybeCoerceToGeminiFormat).mockReturnValueOnce({
        contents: [{ role: 'user', parts: [{ text: 'What is the weather in San Francisco?' }] }],
        coerced: false,
        systemInstruction: undefined,
      });

      jest.mocked(cache.fetchWithCache).mockResolvedValueOnce(mockResponse);

      const response = await provider.callGemini('What is the weather in San Francisco?');

      expect(response).toEqual({
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
        'https://rendered-generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=rendered-test-key',
        {
          body: '{"contents":[{"parts":[{"text":"What is the weather in San Francisco?"}],"role":"user"}],"generationConfig":{},"toolConfig":{"functionCallingConfig":{"mode":"AUTO","allowedFunctionNames":["get_weather"]}},"tools":[{"functionDeclarations":[{"name":"get_weather","description":"Get weather information","parameters":{"type":"OBJECT","properties":{"location":{"type":"STRING","description":"City name"}},"required":["location"]}}]}]}',
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
        300000,
        'json',
        false,
      );
    });

    it('should load tools from external file and render variables', async () => {
      const mockRenderString = jest.fn((str, vars) => {
        if (str.startsWith('file://')) {
          return str;
        }
        return `rendered-${str}`;
      });
      jest.mocked(templates.getNunjucksEngine).mockReturnValue({
        renderString: mockRenderString,
      } as any);

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

      // Mock file system operations
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(mockExternalTools));

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

      jest.mocked(util.maybeCoerceToGeminiFormat).mockReturnValueOnce({
        contents: [{ role: 'user', parts: [{ text: 'What is the weather in San Francisco?' }] }],
        coerced: false,
        systemInstruction: undefined,
      });

      jest.mocked(cache.fetchWithCache).mockResolvedValueOnce(mockResponse);

      const response = await provider.callGemini('What is the weather in San Francisco?', {
        vars: { location: 'San Francisco' },
        prompt: { raw: 'test prompt', label: 'test' },
      });

      expect(response).toEqual({
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

      expect(fs.existsSync).toHaveBeenCalledWith(expect.stringContaining('tools.json'));
      expect(fs.readFileSync).toHaveBeenCalledWith(expect.stringContaining('tools.json'), 'utf8');
      expect(cache.fetchWithCache).toHaveBeenCalledWith(
        'https://rendered-generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=rendered-test-key',
        {
          body: '{"contents":[{"parts":[{"text":"What is the weather in San Francisco?"}],"role":"user"}],"generationConfig":{},"tools":[{"functionDeclarations":[{"name":"get_weather","description":"Get weather in San Francisco","parameters":{"type":"OBJECT","properties":{"location":{"type":"STRING"}}}}]}]}',
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
        300000,
        'json',
        false,
      );
    });

    it('should handle Google Search as a tool', async () => {
      // Reset the Nunjucks mock to return the non-rendered value for these tests
      jest.mocked(templates.getNunjucksEngine).mockReturnValue({
        renderString: jest.fn((str) => str),
      } as any);

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

      jest.mocked(util.maybeCoerceToGeminiFormat).mockReturnValueOnce({
        contents: [{ role: 'user', parts: [{ text: 'What is the current Google stock price?' }] }],
        coerced: false,
        systemInstruction: undefined,
      });

      jest.mocked(cache.fetchWithCache).mockResolvedValueOnce(mockResponse);

      const response = await provider.callGemini('What is the current Google stock price?');

      expect(response).toEqual({
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
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=test-key',
        {
          body: expect.stringContaining('"googleSearch":{}'),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
        300000,
        'json',
        false,
      );
    });

    it('should handle Google Search retrieval for Gemini 1.5 models', async () => {
      // Reset the Nunjucks mock to return the non-rendered value for these tests
      jest.mocked(templates.getNunjucksEngine).mockReturnValue({
        renderString: jest.fn((str) => str),
      } as any);

      provider = new AIStudioChatProvider('gemini-1.5-flash', {
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

      jest.mocked(util.maybeCoerceToGeminiFormat).mockReturnValueOnce({
        contents: [{ role: 'user', parts: [{ text: 'What is the current Google stock price?' }] }],
        coerced: false,
        systemInstruction: undefined,
      });

      jest.mocked(cache.fetchWithCache).mockResolvedValueOnce(mockResponse);

      const response = await provider.callGemini('What is the current Google stock price?');

      expect(response).toEqual({
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
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=test-key',
        {
          body: expect.stringContaining(
            '"googleSearchRetrieval":{"dynamicRetrievalConfig":{"mode":"MODE_DYNAMIC","dynamicThreshold":0.3}}',
          ),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        },
        300000,
        'json',
        false,
      );
    });

    it('should handle object-based tools format', async () => {
      // Reset the Nunjucks mock to return the non-rendered value for these tests
      jest.mocked(templates.getNunjucksEngine).mockReturnValue({
        renderString: jest.fn((str) => str),
      } as any);

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

      jest.mocked(util.maybeCoerceToGeminiFormat).mockReturnValueOnce({
        contents: [{ role: 'user', parts: [{ text: 'What is the latest news?' }] }],
        coerced: false,
        systemInstruction: undefined,
      });

      jest.mocked(cache.fetchWithCache).mockResolvedValueOnce(mockResponse);

      const response = await provider.callGemini('What is the latest news?');

      expect(response).toEqual({
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
        'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=test-key',
        {
          body: expect.stringContaining('"googleSearch":{}'),
          headers: { 'Content-Type': 'application/json' },
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

      jest.mocked(cache.fetchWithCache).mockResolvedValue(mockResponse as any);
      jest.mocked(util.maybeCoerceToGeminiFormat).mockReturnValue({
        contents: [{ role: 'user', parts: [{ text: 'test prompt' }] }],
        coerced: false,
        systemInstruction: undefined,
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
  });
});
