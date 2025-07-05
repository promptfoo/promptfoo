import * as fs from 'fs';
import type { JSONClient } from 'google-auth-library/build/src/auth/googleauth';
import path from 'path';
import { getCache, isCacheEnabled } from '../../../src/cache';
import cliState from '../../../src/cliState';
import { importModule } from '../../../src/esm';
import * as vertexUtil from '../../../src/providers/google/util';
import { VertexChatProvider } from '../../../src/providers/google/vertex';

// Mock database
jest.mock('better-sqlite3', () => {
  return jest.fn().mockReturnValue({
    prepare: jest.fn(),
    transaction: jest.fn(),
    exec: jest.fn(),
    close: jest.fn(),
  });
});

jest.mock('../../../src/database', () => ({
  getDb: jest.fn().mockReturnValue({
    prepare: jest.fn(),
    transaction: jest.fn(),
    exec: jest.fn(),
    close: jest.fn(),
  }),
}));

jest.mock('csv-stringify/sync', () => ({
  stringify: jest.fn().mockReturnValue('mocked,csv,output'),
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

jest.mock('../../../src/cache', () => ({
  getCache: jest.fn().mockReturnValue({
    get: jest.fn(),
    set: jest.fn(),
    wrap: jest.fn(),
    del: jest.fn(),
    reset: jest.fn(),
    store: {} as any,
  }),
  isCacheEnabled: jest.fn(),
}));

jest.mock('../../../src/providers/google/util', () => ({
  ...jest.requireActual('../../../src/providers/google/util'),
  getGoogleClient: jest.fn(),
}));

jest.mock('../../../src/providers/google/util');
jest.mock('../../../src/esm', () => ({
  importModule: jest.fn(),
}));

const mockImportModule = jest.mocked(importModule);

describe('VertexChatProvider.callGeminiApi', () => {
  let provider: VertexChatProvider;

  beforeEach(() => {
    provider = new VertexChatProvider('gemini-pro', {
      config: {
        context: 'test-context',
        examples: [{ input: 'example input', output: 'example output' }],
        stopSequences: ['\n'],
        temperature: 0.7,
        maxOutputTokens: 100,
        topP: 0.9,
        topK: 40,
      },
    });
    jest.mocked(getCache).mockReturnValue({
      get: jest.fn(),
      set: jest.fn(),
      wrap: jest.fn(),
      del: jest.fn(),
      reset: jest.fn(),
      store: {} as any,
    });

    jest.mocked(isCacheEnabled).mockReturnValue(true);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should call the Gemini API and return the response', async () => {
    const mockResponse = {
      data: [
        {
          candidates: [{ content: { parts: [{ text: 'response text' }] } }],
          usageMetadata: {
            totalTokenCount: 10,
            promptTokenCount: 5,
            candidatesTokenCount: 5,
          },
        },
      ],
    };

    const mockRequest = jest.fn().mockResolvedValue(mockResponse);

    jest.spyOn(vertexUtil, 'getGoogleClient').mockResolvedValue({
      client: {
        request: mockRequest,
      } as unknown as JSONClient,
      projectId: 'test-project-id',
    });

    const response = await provider.callGeminiApi('test prompt');

    expect(response).toEqual({
      cached: false,
      output: 'response text',
      tokenUsage: {
        total: 10,
        prompt: 5,
        completion: 5,
      },
      metadata: {},
    });

    expect(vertexUtil.getGoogleClient).toHaveBeenCalledWith();
    expect(mockRequest).toHaveBeenCalledWith({
      url: expect.any(String),
      method: 'POST',
      data: expect.objectContaining({
        contents: [{ parts: [{ text: 'test prompt' }], role: 'user' }],
      }),
      timeout: expect.any(Number),
    });
  });

  it('should return cached response if available', async () => {
    const mockCachedResponse = {
      cached: true,
      output: 'cached response text',
      tokenUsage: {
        total: 10,
        prompt: 5,
        completion: 5,
      },
    };

    jest.mocked(getCache().get).mockResolvedValue(JSON.stringify(mockCachedResponse));

    const response = await provider.callGeminiApi('test prompt');

    expect(response).toEqual({
      ...mockCachedResponse,
      tokenUsage: {
        ...mockCachedResponse.tokenUsage,
        cached: mockCachedResponse.tokenUsage.total,
      },
    });
  });

  it('should handle API call errors', async () => {
    const mockError = new Error('something went wrong');
    jest.spyOn(vertexUtil, 'getGoogleClient').mockResolvedValue({
      client: {
        request: jest.fn().mockRejectedValue(mockError),
      } as unknown as JSONClient,
      projectId: 'test-project-id',
    });

    const response = await provider.callGeminiApi('test prompt');

    expect(response).toEqual({
      error: `API call error: Error: something went wrong`,
    });
  });

  it('should handle API response errors', async () => {
    const mockResponse = {
      data: [
        {
          error: {
            code: 400,
            message: 'Bad Request',
          },
        },
      ],
    };

    jest.spyOn(vertexUtil, 'getGoogleClient').mockResolvedValue({
      client: {
        request: jest.fn().mockResolvedValue(mockResponse),
      } as unknown as JSONClient,
      projectId: 'test-project-id',
    });

    const response = await provider.callGeminiApi('test prompt');

    expect(response).toEqual({
      error: 'Error 400: Bad Request',
    });
  });

  it('should handle function calling configuration', async () => {
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

    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(tools));

    provider = new VertexChatProvider('gemini-pro', {
      config: {
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
      data: [
        {
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
      ],
    };

    const mockRequest = jest.fn().mockResolvedValue(mockResponse);

    jest.spyOn(vertexUtil, 'getGoogleClient').mockResolvedValue({
      client: {
        request: mockRequest,
      } as unknown as JSONClient,
      projectId: 'test-project-id',
    });

    const response = await provider.callGeminiApi('What is the weather in San Francisco?');

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
      tokenUsage: {
        total: 15,
        prompt: 8,
        completion: 7,
      },
      metadata: {},
    });

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          toolConfig: {
            functionCallingConfig: {
              mode: 'AUTO',
              allowedFunctionNames: ['get_weather'],
            },
          },
          tools,
        }),
      }),
    );
  });

  it('should load tools from external file and render variables', async () => {
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

    provider = new VertexChatProvider('gemini-pro', {
      config: {
        tools: 'file://tools.json' as any,
      },
    });

    const mockResponse = {
      data: [
        {
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
      ],
    };

    const mockRequest = jest.fn().mockResolvedValue(mockResponse);

    jest.spyOn(vertexUtil, 'getGoogleClient').mockResolvedValue({
      client: {
        request: mockRequest,
      } as unknown as JSONClient,
      projectId: 'test-project-id',
    });

    const response = await provider.callGeminiApi('test prompt', {
      vars: { location: 'San Francisco' },
      prompt: { raw: 'test prompt', label: 'test' },
    });

    expect(response).toEqual({
      cached: false,
      output: 'response with tools',
      tokenUsage: {
        total: 10,
        prompt: 5,
        completion: 5,
      },
      metadata: {},
    });

    expect(fs.existsSync).toHaveBeenCalledWith(expect.stringContaining('tools.json'));
    expect(fs.readFileSync).toHaveBeenCalledWith(expect.stringContaining('tools.json'), 'utf8');
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tools: mockExternalTools,
        }),
      }),
    );
  });

  it('should use model name in cache key', async () => {
    const mockResponse = {
      data: [
        {
          candidates: [
            {
              content: {
                parts: [{ text: 'response text' }],
              },
            },
          ],
          usageMetadata: {
            totalTokenCount: 10,
            promptTokenCount: 5,
            candidatesTokenCount: 5,
          },
        },
      ],
    };

    const mockRequest = jest.fn().mockResolvedValue(mockResponse);
    const mockCacheSet = jest.fn();

    jest.mocked(getCache).mockReturnValue({
      get: jest.fn(),
      set: mockCacheSet,
      wrap: jest.fn(),
      del: jest.fn(),
      reset: jest.fn(),
      store: {} as any,
    });

    jest.spyOn(vertexUtil, 'getGoogleClient').mockResolvedValue({
      client: {
        request: mockRequest,
      } as unknown as JSONClient,
      projectId: 'test-project-id',
    });

    provider = new VertexChatProvider('gemini-2.0-flash-001');
    await provider.callGeminiApi('test prompt');

    expect(mockCacheSet).toHaveBeenCalledWith(
      expect.stringContaining('vertex:gemini-2.0-flash-001:'),
      expect.any(String),
    );
  });

  it('should handle function tool callbacks correctly', async () => {
    const mockCachedResponse = {
      cached: true,
      output: JSON.stringify({
        functionCall: {
          name: 'get_weather',
          args: '{"location":"New York"}',
        },
      }),
      tokenUsage: {
        total: 15,
        prompt: 10,
        completion: 5,
      },
    };

    const mockGetCache = jest
      .mocked(getCache().get)
      .mockResolvedValue(JSON.stringify(mockCachedResponse));

    const mockWeatherFunction = jest.fn().mockResolvedValue('Sunny, 25°C');

    const provider = new VertexChatProvider('gemini', {
      config: {
        tools: [
          {
            functionDeclarations: [
              {
                name: 'get_weather',
                description: 'Get the weather for a location',
                parameters: {
                  type: 'OBJECT',
                  properties: {
                    location: { type: 'STRING' },
                  },
                  required: ['location'],
                },
              },
            ],
          },
        ],
        functionToolCallbacks: {
          get_weather: mockWeatherFunction,
        },
      },
    });
    const result = await provider.callApi(
      JSON.stringify([{ role: 'user', content: "What's the weather in New York?" }]),
    );

    expect(mockGetCache).toHaveBeenCalledTimes(1);
    expect(mockWeatherFunction).toHaveBeenCalledWith('{"location":"New York"}');
    expect(result.output).toBe('Sunny, 25°C');
    expect(result.tokenUsage).toEqual({ total: 15, prompt: 10, completion: 5, cached: 15 });
  });

  it('should handle errors in function tool callbacks', async () => {
    const mockCachedResponse = {
      cached: true,
      output: JSON.stringify({
        functionCall: {
          name: 'errorFunction',
          args: '{}',
        },
      }),
      tokenUsage: {
        total: 5,
        prompt: 2,
        completion: 3,
      },
    };

    jest.mocked(getCache().get).mockResolvedValue(JSON.stringify(mockCachedResponse));

    const provider = new VertexChatProvider('gemini', {
      config: {
        tools: [
          {
            functionDeclarations: [
              {
                name: 'errorFunction',
                description: 'A function that always throws an error',
                parameters: {
                  type: 'OBJECT',
                  properties: {},
                },
              },
            ],
          },
        ],
        functionToolCallbacks: {
          errorFunction: () => {
            throw new Error('Test error');
          },
        },
      },
    });

    const result = await provider.callApi('Call the error function');

    expect(result.output).toBe('{"functionCall":{"name":"errorFunction","args":"{}"}}');
    expect(result.tokenUsage).toEqual({ total: 5, prompt: 2, completion: 3, cached: 5 });
  });

  describe('External Function Callbacks', () => {
    beforeEach(() => {
      // Set cliState basePath for external function loading
      cliState.basePath = '/test/base/path';
    });

    afterEach(() => {
      jest.clearAllMocks();
      cliState.basePath = undefined;
    });

    it('should load and execute external function callbacks from file', async () => {
      const mockCachedResponse = {
        cached: true,
        output: JSON.stringify({
          functionCall: {
            name: 'external_function',
            args: '{"param":"test_value"}',
          },
        }),
        tokenUsage: {
          total: 15,
          prompt: 10,
          completion: 5,
        },
      };

      jest.mocked(getCache().get).mockResolvedValue(JSON.stringify(mockCachedResponse));

      // Mock importModule to return our test function
      const mockExternalFunction = jest.fn().mockResolvedValue('External function result');
      mockImportModule.mockResolvedValue(mockExternalFunction);

      const provider = new VertexChatProvider('gemini', {
        config: {
          tools: [
            {
              functionDeclarations: [
                {
                  name: 'external_function',
                  description: 'An external function',
                  parameters: {
                    type: 'OBJECT',
                    properties: { param: { type: 'STRING' } },
                    required: ['param'],
                  },
                },
              ],
            },
          ],
          functionToolCallbacks: {
            external_function: 'file://test/callbacks.js:testFunction',
          },
        },
      });

      const result = await provider.callApi('Call external function');

      expect(mockImportModule).toHaveBeenCalledWith(
        path.resolve('/test/base/path', 'test/callbacks.js'),
        'testFunction',
      );
      expect(mockExternalFunction).toHaveBeenCalledWith('{"param":"test_value"}');
      expect(result.output).toBe('External function result');
      expect(result.tokenUsage).toEqual({ total: 15, prompt: 10, completion: 5, cached: 15 });
    });

    it('should cache external functions and not reload them on subsequent calls', async () => {
      const mockCachedResponse = {
        cached: true,
        output: JSON.stringify({
          functionCall: {
            name: 'cached_function',
            args: '{"value":123}',
          },
        }),
        tokenUsage: {
          total: 12,
          prompt: 8,
          completion: 4,
        },
      };

      jest.mocked(getCache().get).mockResolvedValue(JSON.stringify(mockCachedResponse));

      const mockCachedFunction = jest.fn().mockResolvedValue('Cached result');
      mockImportModule.mockResolvedValue(mockCachedFunction);

      const provider = new VertexChatProvider('gemini', {
        config: {
          tools: [
            {
              functionDeclarations: [
                {
                  name: 'cached_function',
                  description: 'A cached function',
                  parameters: {
                    type: 'OBJECT',
                    properties: { value: { type: 'NUMBER' } },
                    required: ['value'],
                  },
                },
              ],
            },
          ],
          functionToolCallbacks: {
            cached_function: 'file://callbacks/cache-test.js:cachedFunction',
          },
        },
      });

      // First call - should load the function
      const result1 = await provider.callApi('First call');
      expect(mockImportModule).toHaveBeenCalledTimes(1);
      expect(mockCachedFunction).toHaveBeenCalledWith('{"value":123}');
      expect(result1.output).toBe('Cached result');

      // Second call - should use cached function, not reload
      const result2 = await provider.callApi('Second call');
      expect(mockImportModule).toHaveBeenCalledTimes(1); // Still only 1 call
      expect(mockCachedFunction).toHaveBeenCalledTimes(2);
      expect(result2.output).toBe('Cached result');
    });

    it('should handle errors in external function loading gracefully', async () => {
      const mockCachedResponse = {
        cached: true,
        output: JSON.stringify({
          functionCall: {
            name: 'error_function',
            args: '{"test":"data"}',
          },
        }),
        tokenUsage: {
          total: 10,
          prompt: 6,
          completion: 4,
        },
      };

      jest.mocked(getCache().get).mockResolvedValue(JSON.stringify(mockCachedResponse));

      // Mock import module to throw an error
      mockImportModule.mockRejectedValue(new Error('Module not found'));

      const provider = new VertexChatProvider('gemini', {
        config: {
          tools: [
            {
              functionDeclarations: [
                {
                  name: 'error_function',
                  description: 'A function that errors during loading',
                  parameters: {
                    type: 'OBJECT',
                    properties: { test: { type: 'STRING' } },
                  },
                },
              ],
            },
          ],
          functionToolCallbacks: {
            error_function: 'file://nonexistent/module.js:errorFunction',
          },
        },
      });

      const result = await provider.callApi('Call error function');

      expect(mockImportModule).toHaveBeenCalledWith(
        path.resolve('/test/base/path', 'nonexistent/module.js'),
        'errorFunction',
      );
      // Should fall back to original function call object when loading fails
      expect(result.output).toBe(
        '{"functionCall":{"name":"error_function","args":"{\\"test\\":\\"data\\"}"}}',
      );
    });

    it('should handle mixed inline and external function callbacks', async () => {
      const mockCachedResponse = {
        cached: true,
        output: JSON.stringify({
          functionCall: {
            name: 'external_function',
            args: '{"external":"test"}',
          },
        }),
        tokenUsage: {
          total: 20,
          prompt: 12,
          completion: 8,
        },
      };

      jest.mocked(getCache().get).mockResolvedValue(JSON.stringify(mockCachedResponse));

      const mockInlineFunction = jest.fn().mockResolvedValue('Inline result');
      const mockExternalFunction = jest.fn().mockResolvedValue('External result');
      mockImportModule.mockResolvedValue(mockExternalFunction);

      const provider = new VertexChatProvider('gemini', {
        config: {
          tools: [
            {
              functionDeclarations: [
                {
                  name: 'inline_function',
                  description: 'An inline function',
                  parameters: {
                    type: 'OBJECT',
                    properties: { inline: { type: 'STRING' } },
                  },
                },
                {
                  name: 'external_function',
                  description: 'An external function',
                  parameters: {
                    type: 'OBJECT',
                    properties: { external: { type: 'STRING' } },
                  },
                },
              ],
            },
          ],
          functionToolCallbacks: {
            inline_function: mockInlineFunction,
            external_function: 'file://mixed/callbacks.js:externalFunc',
          },
        },
      });

      const result = await provider.callApi('Test mixed callbacks');

      expect(mockImportModule).toHaveBeenCalledWith(
        path.resolve('/test/base/path', 'mixed/callbacks.js'),
        'externalFunc',
      );
      expect(mockExternalFunction).toHaveBeenCalledWith('{"external":"test"}');
      expect(result.output).toBe('External result');
    });
  });
});

describe('VertexChatProvider.callLlamaApi', () => {
  let provider: VertexChatProvider;

  beforeEach(() => {
    jest.mocked(getCache).mockReturnValue({
      get: jest.fn(),
      set: jest.fn(),
      wrap: jest.fn(),
      del: jest.fn(),
      reset: jest.fn(),
      store: {} as any,
    });

    jest.mocked(isCacheEnabled).mockReturnValue(true);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should enforce us-central1 region for Llama models', async () => {
    // Create provider with non-us-central1 region
    provider = new VertexChatProvider('llama-3.3-70b-instruct-maas', {
      config: { region: 'europe-west1' },
    });

    const response = await provider.callLlamaApi('test prompt');

    // Should return error about region
    expect(response).toEqual({
      error:
        "Llama models are only available in the us-central1 region. Current region: europe-west1. Please set region: 'us-central1' in your configuration.",
    });
  });

  it('should validate llama_guard_settings is a valid object', async () => {
    provider = new VertexChatProvider('llama-3.3-70b-instruct-maas', {
      config: {
        region: 'us-central1',
        llamaConfig: {
          safetySettings: {
            // @ts-ignore - intentionally passing invalid type for test
            llama_guard_settings: 'not-an-object',
          },
        },
      },
    });

    const response = await provider.callLlamaApi('test prompt');

    // Should return error about invalid llama_guard_settings
    expect(response).toEqual({
      error: 'Invalid llama_guard_settings: must be an object, received string',
    });
  });

  it('should successfully call Llama API with valid configuration', async () => {
    provider = new VertexChatProvider('llama-3.3-70b-instruct-maas', {
      config: {
        region: 'us-central1',
        temperature: 0.7,
        maxOutputTokens: 250,
        llamaConfig: {
          safetySettings: {
            enabled: true,
            llama_guard_settings: { custom_setting: 'value' },
          },
        },
      },
    });

    const mockResponse = {
      data: {
        choices: [
          {
            message: {
              content: 'Llama response content',
            },
          },
        ],
        usage: {
          total_tokens: 35,
          prompt_tokens: 15,
          completion_tokens: 20,
        },
      },
    };

    const mockRequest = jest.fn().mockResolvedValue(mockResponse);

    jest.spyOn(vertexUtil, 'getGoogleClient').mockResolvedValue({
      client: {
        request: mockRequest,
      } as unknown as JSONClient,
      projectId: 'test-project-id',
    });

    const response = await provider.callLlamaApi('test prompt');

    // Should return successful response
    expect(response).toEqual({
      cached: false,
      output: 'Llama response content',
      tokenUsage: {
        total: 35,
        prompt: 15,
        completion: 20,
      },
    });

    // Verify API request
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringContaining(
          'us-central1-aiplatform.googleapis.com/v1beta1/projects/test-project-id/locations/us-central1/endpoints/openapi/chat/completions',
        ),
        method: 'POST',
        data: expect.objectContaining({
          model: 'meta/llama-3.3-70b-instruct-maas',
          max_tokens: 250,
          temperature: 0.7,
          extra_body: {
            google: {
              model_safety_settings: {
                enabled: true,
                llama_guard_settings: { custom_setting: 'value' },
              },
            },
          },
        }),
      }),
    );
  });

  it('should default safety settings to enabled when not specified', async () => {
    provider = new VertexChatProvider('llama-3.3-70b-instruct-maas', {
      config: {
        region: 'us-central1',
      },
    });

    const mockResponse = {
      data: {
        choices: [
          {
            message: {
              content: 'Llama response with default safety',
            },
          },
        ],
        usage: {
          total_tokens: 30,
          prompt_tokens: 10,
          completion_tokens: 20,
        },
      },
    };

    const mockRequest = jest.fn().mockResolvedValue(mockResponse);

    jest.spyOn(vertexUtil, 'getGoogleClient').mockResolvedValue({
      client: {
        request: mockRequest,
      } as unknown as JSONClient,
      projectId: 'test-project-id',
    });

    await provider.callLlamaApi('test prompt');

    // Verify safety settings defaulted to enabled
    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          extra_body: {
            google: {
              model_safety_settings: {
                enabled: true,
                llama_guard_settings: {},
              },
            },
          },
        }),
      }),
    );
  });

  it('should handle API errors correctly', async () => {
    provider = new VertexChatProvider('llama-3.3-70b-instruct-maas', {
      config: {
        region: 'us-central1',
      },
    });

    const mockError = {
      response: {
        data: {
          error: {
            code: 400,
            message: 'Invalid request',
          },
        },
      },
    };

    jest.spyOn(vertexUtil, 'getGoogleClient').mockResolvedValue({
      client: {
        request: jest.fn().mockRejectedValue(mockError),
      } as unknown as JSONClient,
      projectId: 'test-project-id',
    });

    const response = await provider.callLlamaApi('test prompt');

    expect(response.error).toContain('API call error:');
    expect(response.error).toContain('Invalid request');
  });

  it('should load system instructions from file', async () => {
    const mockSystemInstruction = 'You are a helpful assistant from a file.';

    // Mock file system operations
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    jest.spyOn(fs, 'readFileSync').mockReturnValue(mockSystemInstruction);

    provider = new VertexChatProvider('gemini-1.5-flash', {
      config: {
        systemInstruction: 'file://system-instruction.txt',
      },
    });

    const mockResponse = {
      data: [
        {
          candidates: [{ content: { parts: [{ text: 'response text' }] } }],
          usageMetadata: {
            totalTokenCount: 10,
            promptTokenCount: 5,
            candidatesTokenCount: 5,
          },
        },
      ],
    };

    const mockRequest = jest.fn().mockResolvedValue(mockResponse);

    jest.spyOn(vertexUtil, 'getGoogleClient').mockResolvedValue({
      client: {
        request: mockRequest,
      } as unknown as JSONClient,
      projectId: 'test-project-id',
    });

    await provider.callGeminiApi('test prompt');

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          systemInstruction: {
            parts: [{ text: mockSystemInstruction }],
          },
        }),
      }),
    );

    // Verify file was read
    expect(fs.readFileSync).toHaveBeenCalledWith(
      expect.stringContaining('system-instruction.txt'),
      'utf8',
    );
  });
});

describe('VertexChatProvider.callClaudeApi parameter naming', () => {
  let provider: VertexChatProvider;

  beforeEach(() => {
    jest.mocked(getCache).mockReturnValue({
      get: jest.fn(),
      set: jest.fn(),
      wrap: jest.fn(),
      del: jest.fn(),
      reset: jest.fn(),
      store: {} as any,
    });

    jest.mocked(isCacheEnabled).mockReturnValue(true);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should accept anthropicVersion parameter', async () => {
    provider = new VertexChatProvider('claude-3-sonnet@20240229', {
      config: {
        anthropicVersion: 'vertex-2023-10-16',
        maxOutputTokens: 500,
      },
    });

    const mockResponse = {
      data: {
        id: 'test-id',
        type: 'message',
        role: 'assistant',
        model: 'claude-3-sonnet@20240229',
        content: [{ type: 'text', text: 'Response from Claude' }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: {
          input_tokens: 20,
          output_tokens: 30,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      },
    };

    const mockRequest = jest.fn().mockResolvedValue(mockResponse);

    jest.spyOn(vertexUtil, 'getGoogleClient').mockResolvedValue({
      client: {
        request: mockRequest,
      } as unknown as JSONClient,
      projectId: 'test-project-id',
    });

    await provider.callClaudeApi('test prompt');

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          anthropic_version: 'vertex-2023-10-16',
          max_tokens: 500,
        }),
      }),
    );
  });

  it('should accept anthropic_version parameter (alternative format)', async () => {
    provider = new VertexChatProvider('claude-3-sonnet@20240229', {
      config: {
        anthropic_version: 'vertex-2023-10-16-alt',
        max_tokens: 600,
      },
    });

    const mockResponse = {
      data: {
        id: 'test-id',
        type: 'message',
        role: 'assistant',
        model: 'claude-3-sonnet@20240229',
        content: [{ type: 'text', text: 'Response from Claude' }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: {
          input_tokens: 20,
          output_tokens: 30,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      },
    };

    const mockRequest = jest.fn().mockResolvedValue(mockResponse);

    jest.spyOn(vertexUtil, 'getGoogleClient').mockResolvedValue({
      client: {
        request: mockRequest,
      } as unknown as JSONClient,
      projectId: 'test-project-id',
    });

    await provider.callClaudeApi('test prompt');

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          anthropic_version: 'vertex-2023-10-16-alt',
          max_tokens: 600,
        }),
      }),
    );
  });

  it('should accept both max_tokens and maxOutputTokens parameters', async () => {
    provider = new VertexChatProvider('claude-3-sonnet@20240229', {
      config: {
        // When both are provided, max_tokens should take precedence
        max_tokens: 700,
        maxOutputTokens: 500,
        top_p: 0.95,
        top_k: 40,
      },
    });

    const mockResponse = {
      data: {
        id: 'test-id',
        type: 'message',
        role: 'assistant',
        model: 'claude-3-sonnet@20240229',
        content: [{ type: 'text', text: 'Response from Claude' }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: {
          input_tokens: 20,
          output_tokens: 30,
          cache_creation_input_tokens: 0,
          cache_read_input_tokens: 0,
        },
      },
    };

    const mockRequest = jest.fn().mockResolvedValue(mockResponse);

    jest.spyOn(vertexUtil, 'getGoogleClient').mockResolvedValue({
      client: {
        request: mockRequest,
      } as unknown as JSONClient,
      projectId: 'test-project-id',
    });

    await provider.callClaudeApi('test prompt');

    expect(mockRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          max_tokens: 700,
          top_p: 0.95,
          top_k: 40,
        }),
      }),
    );
  });
});
