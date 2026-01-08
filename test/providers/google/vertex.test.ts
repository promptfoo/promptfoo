import * as fs from 'fs';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import cliState from '../../../src/cliState';
import * as vertexUtil from '../../../src/providers/google/util';
import { VertexChatProvider } from '../../../src/providers/google/vertex';
import type { JSONClient } from 'google-auth-library/build/src/auth/googleauth';

// Hoisted mocks for cache
const mockCacheGet = vi.hoisted(() => vi.fn());
const mockCacheSet = vi.hoisted(() => vi.fn());
const mockIsCacheEnabled = vi.hoisted(() => vi.fn());

// Hoisted mock for importModule
const mockImportModule = vi.hoisted(() => vi.fn());

// Mock database
vi.mock('better-sqlite3', () => {
  return vi.fn().mockReturnValue({
    prepare: vi.fn(),
    transaction: vi.fn(),
    exec: vi.fn(),
    close: vi.fn(),
  });
});

vi.mock('../../../src/database', async (importOriginal) => {
  return {
    ...(await importOriginal()),

    getDb: vi.fn().mockReturnValue({
      prepare: vi.fn(),
      transaction: vi.fn(),
      exec: vi.fn(),
      close: vi.fn(),
    }),
  };
});

vi.mock('csv-stringify/sync', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    stringify: vi.fn().mockReturnValue('mocked,csv,output'),
  };
});

vi.mock('glob', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    globSync: vi.fn().mockReturnValue([]),

    hasMagic: (path: string) => {
      // Match the real hasMagic behavior: only detect patterns in forward-slash paths
      // This mimics glob's actual behavior where backslash paths return false
      return /[*?[\]{}]/.test(path) && !path.includes('\\');
    },
  };
});

vi.mock('fs', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    statSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});

vi.mock('../../../src/cache', async (importOriginal) => {
  return {
    ...(await importOriginal()),

    getCache: vi.fn().mockImplementation(() => ({
      get: mockCacheGet,
      set: mockCacheSet,
      wrap: vi.fn(),
      del: vi.fn(),
      reset: vi.fn(),
      store: {} as any,
    })),

    isCacheEnabled: mockIsCacheEnabled,
  };
});

vi.mock('../../../src/providers/google/util', async () => {
  const actual = await vi.importActual<typeof import('../../../src/providers/google/util')>(
    '../../../src/providers/google/util',
  );
  return {
    ...actual,
    getGoogleClient: vi.fn(),
    loadCredentials: vi.fn(),
    resolveProjectId: vi.fn(),
  };
});

// Mock GoogleAuthManager to prevent API key detection from environment
vi.mock('../../../src/providers/google/auth', async () => {
  const actual = await vi.importActual<typeof import('../../../src/providers/google/auth')>(
    '../../../src/providers/google/auth',
  );
  return {
    ...actual,
    GoogleAuthManager: {
      ...actual.GoogleAuthManager,
      // Return no API key by default so tests use OAuth mode
      getApiKey: vi.fn().mockReturnValue({ apiKey: undefined, source: 'none' }),
      determineVertexMode: vi.fn().mockReturnValue(true),
      validateAndWarn: vi.fn(),
      // Respect config.region when provided, otherwise default to us-central1
      resolveRegion: vi.fn().mockImplementation((config?: { region?: string }) => {
        return config?.region || 'us-central1';
      }),
      resolveProjectId: vi.fn().mockResolvedValue('test-project-id'),
    },
  };
});

vi.mock('../../../src/esm', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    importModule: mockImportModule,
  };
});

describe('VertexChatProvider.callGeminiApi', () => {
  let provider: VertexChatProvider;

  beforeEach(() => {
    // Reset cache mocks to default state (no cached response)
    mockCacheGet.mockReset();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockReset();
    mockImportModule.mockReset();

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

    mockIsCacheEnabled.mockReturnValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
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

    const mockRequest = vi.fn().mockResolvedValue(mockResponse);

    vi.spyOn(vertexUtil, 'getGoogleClient').mockResolvedValue({
      client: {
        request: mockRequest,
      } as unknown as JSONClient,
      projectId: 'test-project-id',
    });

    vi.spyOn(vertexUtil, 'loadCredentials').mockImplementation(function (creds) {
      if (typeof creds === 'object') {
        return JSON.stringify(creds);
      }
      return creds;
    });
    vi.spyOn(vertexUtil, 'resolveProjectId').mockResolvedValue('test-project-id');

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

    expect(vertexUtil.getGoogleClient).toHaveBeenCalledWith({ credentials: undefined });
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

    mockCacheGet.mockResolvedValue(JSON.stringify(mockCachedResponse));

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
    vi.spyOn(vertexUtil, 'getGoogleClient').mockResolvedValue({
      client: {
        request: vi.fn().mockRejectedValue(mockError),
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

    vi.spyOn(vertexUtil, 'getGoogleClient').mockResolvedValue({
      client: {
        request: vi.fn().mockResolvedValue(mockResponse),
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

    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(tools));

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

    const mockRequest = vi.fn().mockResolvedValue(mockResponse);

    vi.spyOn(vertexUtil, 'getGoogleClient').mockResolvedValue({
      client: {
        request: mockRequest,
      } as unknown as JSONClient,
      projectId: 'test-project-id',
    });

    vi.spyOn(vertexUtil, 'loadCredentials').mockImplementation(function (creds) {
      if (typeof creds === 'object') {
        return JSON.stringify(creds);
      }
      return creds;
    });
    vi.spyOn(vertexUtil, 'resolveProjectId').mockResolvedValue('test-project-id');

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

    // Mock file system operations (existsSync no longer called due to TOCTOU fix)
    vi.spyOn(fs, 'readFileSync').mockReturnValue(JSON.stringify(mockExternalTools));

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

    const mockRequest = vi.fn().mockResolvedValue(mockResponse);

    vi.spyOn(vertexUtil, 'getGoogleClient').mockResolvedValue({
      client: {
        request: mockRequest,
      } as unknown as JSONClient,
      projectId: 'test-project-id',
    });

    vi.spyOn(vertexUtil, 'loadCredentials').mockImplementation(function (creds) {
      if (typeof creds === 'object') {
        return JSON.stringify(creds);
      }
      return creds;
    });
    vi.spyOn(vertexUtil, 'resolveProjectId').mockResolvedValue('test-project-id');

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

    // Note: existsSync no longer called - we use try/catch on readFileSync instead (TOCTOU fix)
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

    const mockRequest = vi.fn().mockResolvedValue(mockResponse);

    vi.spyOn(vertexUtil, 'getGoogleClient').mockResolvedValue({
      client: {
        request: mockRequest,
      } as unknown as JSONClient,
      projectId: 'test-project-id',
    });

    vi.spyOn(vertexUtil, 'loadCredentials').mockImplementation(function (creds) {
      if (typeof creds === 'object') {
        return JSON.stringify(creds);
      }
      return creds;
    });
    vi.spyOn(vertexUtil, 'resolveProjectId').mockResolvedValue('test-project-id');

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

    mockCacheGet.mockResolvedValue(JSON.stringify(mockCachedResponse));

    const mockWeatherFunction = vi.fn().mockResolvedValue('Sunny, 25°C');

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

    expect(mockCacheGet).toHaveBeenCalledTimes(1);
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

    mockCacheGet.mockResolvedValue(JSON.stringify(mockCachedResponse));

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
      vi.clearAllMocks();
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

      mockCacheGet.mockResolvedValue(JSON.stringify(mockCachedResponse));

      // Mock importModule to return our test function
      const mockExternalFunction = vi.fn().mockResolvedValue('External function result');
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

      mockCacheGet.mockResolvedValue(JSON.stringify(mockCachedResponse));

      const mockCachedFunction = vi.fn().mockResolvedValue('Cached result');
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

      mockCacheGet.mockResolvedValue(JSON.stringify(mockCachedResponse));

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

      mockCacheGet.mockResolvedValue(JSON.stringify(mockCachedResponse));

      const mockInlineFunction = vi.fn().mockResolvedValue('Inline result');
      const mockExternalFunction = vi.fn().mockResolvedValue('External result');
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

  describe('thinking token tracking', () => {
    it('should track thinking tokens when present in response', async () => {
      const provider = new VertexChatProvider('gemini-2.5-flash', {
        config: {
          generationConfig: {
            thinkingConfig: {
              thinkingBudget: 1024,
            },
          },
        },
      });

      const mockResponse = {
        data: [
          {
            candidates: [{ content: { parts: [{ text: 'response with thinking' }] } }],
            usageMetadata: {
              promptTokenCount: 10,
              candidatesTokenCount: 20,
              totalTokenCount: 30,
              thoughtsTokenCount: 50, // Thinking tokens
            },
          },
        ],
      };

      const mockRequest = vi.fn().mockResolvedValue(mockResponse);

      vi.spyOn(vertexUtil, 'getGoogleClient').mockResolvedValue({
        client: {
          request: mockRequest,
        } as unknown as JSONClient,
        projectId: 'test-project-id',
      });

      const response = await provider.callGeminiApi('test prompt');

      expect(response.tokenUsage).toEqual({
        prompt: 10,
        completion: 20,
        total: 30,
        completionDetails: {
          reasoning: 50,
          acceptedPrediction: 0,
          rejectedPrediction: 0,
        },
      });
    });

    it('should handle response without thinking tokens', async () => {
      const provider = new VertexChatProvider('gemini-2.5-flash');

      const mockResponse = {
        data: [
          {
            candidates: [{ content: { parts: [{ text: 'response without thinking' }] } }],
            usageMetadata: {
              promptTokenCount: 10,
              candidatesTokenCount: 20,
              totalTokenCount: 30,
              // No thoughtsTokenCount field
            },
          },
        ],
      };

      const mockRequest = vi.fn().mockResolvedValue(mockResponse);

      vi.spyOn(vertexUtil, 'getGoogleClient').mockResolvedValue({
        client: {
          request: mockRequest,
        } as unknown as JSONClient,
        projectId: 'test-project-id',
      });

      const response = await provider.callGeminiApi('test prompt');

      expect(response.tokenUsage).toEqual({
        prompt: 10,
        completion: 20,
        total: 30,
        // No completionDetails field when thoughtsTokenCount is absent
      });
    });

    it('should track thinking tokens with zero value', async () => {
      const provider = new VertexChatProvider('gemini-2.5-flash', {
        config: {
          generationConfig: {
            thinkingConfig: {
              thinkingBudget: 1024,
            },
          },
        },
      });

      const mockResponse = {
        data: [
          {
            candidates: [{ content: { parts: [{ text: 'response with zero thinking' }] } }],
            usageMetadata: {
              promptTokenCount: 10,
              candidatesTokenCount: 20,
              totalTokenCount: 30,
              thoughtsTokenCount: 0, // Zero thinking tokens
            },
          },
        ],
      };

      const mockRequest = vi.fn().mockResolvedValue(mockResponse);

      vi.spyOn(vertexUtil, 'getGoogleClient').mockResolvedValue({
        client: {
          request: mockRequest,
        } as unknown as JSONClient,
        projectId: 'test-project-id',
      });

      const response = await provider.callGeminiApi('test prompt');

      expect(response.tokenUsage).toEqual({
        prompt: 10,
        completion: 20,
        total: 30,
        completionDetails: {
          reasoning: 0,
          acceptedPrediction: 0,
          rejectedPrediction: 0,
        },
      });
    });

    it('should track thinking tokens in cached responses', async () => {
      const provider = new VertexChatProvider('gemini-2.5-flash', {
        config: {
          generationConfig: {
            thinkingConfig: {
              thinkingBudget: 1024,
            },
          },
        },
      });

      const mockCachedResponse = {
        output: 'cached response with thinking',
        tokenUsage: {
          total: 80,
          prompt: 10,
          completion: 20,
          thoughtsTokenCount: 50, // This would be stored in the cached response
        },
        cached: true,
      };

      // Mock the cache to return a response that includes thinking tokens
      mockCacheGet.mockResolvedValue(JSON.stringify(mockCachedResponse));

      const response = await provider.callGeminiApi('test prompt');

      // The cached response should preserve the thinking tokens
      // but due to how the caching logic works, it transforms the response
      expect(response.cached).toBe(true);
      expect(response.output).toBe('cached response with thinking');
      // Note: The current implementation doesn't preserve completionDetails in cached responses
      // This is a limitation that could be addressed in a future fix
    });
  });

  describe('Model Armor integration', () => {
    it('should include model_armor_config in request when configured', async () => {
      const provider = new VertexChatProvider('gemini-pro', {
        config: {
          modelArmor: {
            promptTemplate: 'projects/my-project/locations/us-central1/templates/basic-safety',
            responseTemplate: 'projects/my-project/locations/us-central1/templates/basic-safety',
          },
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

      const mockRequest = vi.fn().mockResolvedValue(mockResponse);

      vi.spyOn(vertexUtil, 'getGoogleClient').mockResolvedValue({
        client: {
          request: mockRequest,
        } as unknown as JSONClient,
        projectId: 'test-project-id',
      });

      vi.spyOn(vertexUtil, 'loadCredentials').mockImplementation(function (creds) {
        if (typeof creds === 'object') {
          return JSON.stringify(creds);
        }
        return creds;
      });
      vi.spyOn(vertexUtil, 'resolveProjectId').mockResolvedValue('test-project-id');

      await provider.callGeminiApi('test prompt');

      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            model_armor_config: {
              prompt_template_name:
                'projects/my-project/locations/us-central1/templates/basic-safety',
              response_template_name:
                'projects/my-project/locations/us-central1/templates/basic-safety',
            },
          }),
        }),
      );
    });

    it('should include only promptTemplate when responseTemplate is not configured', async () => {
      const provider = new VertexChatProvider('gemini-pro', {
        config: {
          modelArmor: {
            promptTemplate: 'projects/my-project/locations/us-central1/templates/prompt-only',
          },
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

      const mockRequest = vi.fn().mockResolvedValue(mockResponse);

      vi.spyOn(vertexUtil, 'getGoogleClient').mockResolvedValue({
        client: {
          request: mockRequest,
        } as unknown as JSONClient,
        projectId: 'test-project-id',
      });

      vi.spyOn(vertexUtil, 'loadCredentials').mockImplementation(function (creds) {
        if (typeof creds === 'object') {
          return JSON.stringify(creds);
        }
        return creds;
      });
      vi.spyOn(vertexUtil, 'resolveProjectId').mockResolvedValue('test-project-id');

      await provider.callGeminiApi('test prompt');

      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            model_armor_config: {
              prompt_template_name:
                'projects/my-project/locations/us-central1/templates/prompt-only',
            },
          }),
        }),
      );
    });

    it('should not include model_armor_config when not configured', async () => {
      const provider = new VertexChatProvider('gemini-pro', {
        config: {},
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

      const mockRequest = vi.fn().mockResolvedValue(mockResponse);

      vi.spyOn(vertexUtil, 'getGoogleClient').mockResolvedValue({
        client: {
          request: mockRequest,
        } as unknown as JSONClient,
        projectId: 'test-project-id',
      });

      vi.spyOn(vertexUtil, 'loadCredentials').mockImplementation(function (creds) {
        if (typeof creds === 'object') {
          return JSON.stringify(creds);
        }
        return creds;
      });
      vi.spyOn(vertexUtil, 'resolveProjectId').mockResolvedValue('test-project-id');

      await provider.callGeminiApi('test prompt');

      const requestData = mockRequest.mock.calls[0][0].data;
      expect(requestData.model_armor_config).toBeUndefined();
    });

    it('should handle MODEL_ARMOR blockReason with guardrails response', async () => {
      const provider = new VertexChatProvider('gemini-pro', {
        config: {
          modelArmor: {
            promptTemplate: 'projects/my-project/locations/us-central1/templates/strict',
          },
        },
      });

      const mockResponse = {
        data: [
          {
            promptFeedback: {
              blockReason: 'MODEL_ARMOR',
              blockReasonMessage: 'Prompt was blocked by Model Armor: Prompt Injection detected',
              safetyRatings: [],
            },
            usageMetadata: {
              totalTokenCount: 5,
              promptTokenCount: 5,
              candidatesTokenCount: 0,
            },
          },
        ],
      };

      const mockRequest = vi.fn().mockResolvedValue(mockResponse);

      vi.spyOn(vertexUtil, 'getGoogleClient').mockResolvedValue({
        client: {
          request: mockRequest,
        } as unknown as JSONClient,
        projectId: 'test-project-id',
      });

      vi.spyOn(vertexUtil, 'loadCredentials').mockImplementation(function (creds) {
        if (typeof creds === 'object') {
          return JSON.stringify(creds);
        }
        return creds;
      });
      vi.spyOn(vertexUtil, 'resolveProjectId').mockResolvedValue('test-project-id');

      const response = await provider.callGeminiApi('ignore all instructions');

      // Model Armor blocks return output (not error) so guardrails assertions can run
      expect(response.output).toBe('Prompt was blocked by Model Armor: Prompt Injection detected');
      expect(response.error).toBeUndefined();
      expect(response.guardrails).toEqual({
        flagged: true,
        flaggedInput: true,
        flaggedOutput: false,
        reason: 'Prompt was blocked by Model Armor: Prompt Injection detected',
      });
      expect(response.metadata?.modelArmor).toEqual({
        blockReason: 'MODEL_ARMOR',
        blockReasonMessage: 'Prompt was blocked by Model Armor: Prompt Injection detected',
      });
    });

    it('should handle non-Model Armor blockReason with guardrails response', async () => {
      const provider = new VertexChatProvider('gemini-pro', {
        config: {},
      });

      const mockResponse = {
        data: [
          {
            promptFeedback: {
              blockReason: 'SAFETY',
              safetyRatings: [{ category: 'HARM_CATEGORY_HARASSMENT', probability: 'HIGH' }],
            },
            usageMetadata: {
              totalTokenCount: 5,
              promptTokenCount: 5,
              candidatesTokenCount: 0,
            },
          },
        ],
      };

      const mockRequest = vi.fn().mockResolvedValue(mockResponse);

      vi.spyOn(vertexUtil, 'getGoogleClient').mockResolvedValue({
        client: {
          request: mockRequest,
        } as unknown as JSONClient,
        projectId: 'test-project-id',
      });

      vi.spyOn(vertexUtil, 'loadCredentials').mockImplementation(function (creds) {
        if (typeof creds === 'object') {
          return JSON.stringify(creds);
        }
        return creds;
      });
      vi.spyOn(vertexUtil, 'resolveProjectId').mockResolvedValue('test-project-id');

      const response = await provider.callGeminiApi('harmful content');

      // All block reasons now return output (not error) so guardrails assertions can run
      expect(response.output).toContain('Content was blocked due to safety settings: SAFETY');
      expect(response.error).toBeUndefined();
      expect(response.guardrails).toEqual({
        flagged: true,
        flaggedInput: true,
        flaggedOutput: false,
        reason: expect.stringContaining('Content was blocked due to safety settings: SAFETY'),
      });
      expect(response.metadata?.modelArmor).toBeUndefined();
    });

    it('should not include model_armor_config when modelArmor is empty object', async () => {
      const provider = new VertexChatProvider('gemini-pro', {
        config: {
          modelArmor: {},
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

      const mockRequest = vi.fn().mockResolvedValue(mockResponse);

      vi.spyOn(vertexUtil, 'getGoogleClient').mockResolvedValue({
        client: {
          request: mockRequest,
        } as unknown as JSONClient,
        projectId: 'test-project-id',
      });

      vi.spyOn(vertexUtil, 'loadCredentials').mockImplementation(function (creds) {
        if (typeof creds === 'object') {
          return JSON.stringify(creds);
        }
        return creds;
      });
      vi.spyOn(vertexUtil, 'resolveProjectId').mockResolvedValue('test-project-id');

      await provider.callGeminiApi('test prompt');

      const requestData = mockRequest.mock.calls[0][0].data;
      expect(requestData.model_armor_config).toBeUndefined();
    });

    // TODO: This default message is user-facing and can be adjusted for clarity without
    // breaking behavior semantics (e.g., "Content was blocked by Model Armor policy").
    it('should use default message when blockReasonMessage is not provided', async () => {
      const provider = new VertexChatProvider('gemini-pro', {
        config: {},
      });

      const mockResponse = {
        data: [
          {
            promptFeedback: {
              blockReason: 'MODEL_ARMOR',
              // No blockReasonMessage
              safetyRatings: [],
            },
            usageMetadata: {
              totalTokenCount: 5,
              promptTokenCount: 5,
              candidatesTokenCount: 0,
            },
          },
        ],
      };

      const mockRequest = vi.fn().mockResolvedValue(mockResponse);

      vi.spyOn(vertexUtil, 'getGoogleClient').mockResolvedValue({
        client: {
          request: mockRequest,
        } as unknown as JSONClient,
        projectId: 'test-project-id',
      });

      vi.spyOn(vertexUtil, 'loadCredentials').mockImplementation(function (creds) {
        if (typeof creds === 'object') {
          return JSON.stringify(creds);
        }
        return creds;
      });
      vi.spyOn(vertexUtil, 'resolveProjectId').mockResolvedValue('test-project-id');

      const response = await provider.callGeminiApi('test prompt');

      // Block reasons return output (not error) so guardrails assertions can run
      expect(response.output).toBe('Content was blocked due to Model Armor: MODEL_ARMOR');
      expect(response.error).toBeUndefined();
      expect(response.guardrails?.reason).toBe(
        'Content was blocked due to Model Armor: MODEL_ARMOR',
      );
    });

    it('should handle SAFETY finishReason with guardrails response', async () => {
      const provider = new VertexChatProvider('gemini-pro', {
        config: {},
      });

      const mockResponse = {
        data: [
          {
            candidates: [
              {
                content: { parts: [{ text: 'partial response' }] },
                finishReason: 'SAFETY',
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

      const mockRequest = vi.fn().mockResolvedValue(mockResponse);

      vi.spyOn(vertexUtil, 'getGoogleClient').mockResolvedValue({
        client: {
          request: mockRequest,
        } as unknown as JSONClient,
        projectId: 'test-project-id',
      });

      vi.spyOn(vertexUtil, 'loadCredentials').mockImplementation(function (creds) {
        if (typeof creds === 'object') {
          return JSON.stringify(creds);
        }
        return creds;
      });
      vi.spyOn(vertexUtil, 'resolveProjectId').mockResolvedValue('test-project-id');

      const response = await provider.callGeminiApi('test prompt');

      expect(response.error).toBe(
        'Content was blocked due to safety settings with finish reason: SAFETY.',
      );
      expect(response.guardrails).toEqual({
        flagged: true,
        flaggedInput: false,
        flaggedOutput: true,
        reason: 'Content was blocked due to safety settings with finish reason: SAFETY.',
      });
    });

    it.each([
      'PROHIBITED_CONTENT',
      'RECITATION',
      'BLOCKLIST',
      'SPII',
      'IMAGE_SAFETY',
    ])('should handle %s finishReason with guardrails response', async (finishReason) => {
      const provider = new VertexChatProvider('gemini-pro', {
        config: {},
      });

      const mockResponse = {
        data: [
          {
            candidates: [
              {
                content: { parts: [{ text: 'partial response' }] },
                finishReason,
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

      const mockRequest = vi.fn().mockResolvedValue(mockResponse);

      vi.spyOn(vertexUtil, 'getGoogleClient').mockResolvedValue({
        client: {
          request: mockRequest,
        } as unknown as JSONClient,
        projectId: 'test-project-id',
      });

      vi.spyOn(vertexUtil, 'loadCredentials').mockImplementation(function (creds) {
        if (typeof creds === 'object') {
          return JSON.stringify(creds);
        }
        return creds;
      });
      vi.spyOn(vertexUtil, 'resolveProjectId').mockResolvedValue('test-project-id');

      const response = await provider.callGeminiApi('test prompt');

      expect(response.error).toBe(
        `Content was blocked due to safety settings with finish reason: ${finishReason}.`,
      );
      expect(response.guardrails).toEqual({
        flagged: true,
        flaggedInput: false,
        flaggedOutput: true,
        reason: `Content was blocked due to safety settings with finish reason: ${finishReason}.`,
      });
    });

    it('should handle MAX_TOKENS finishReason with truncated output', async () => {
      const provider = new VertexChatProvider('gemini-pro', {
        config: {},
      });

      const longOutput = 'A'.repeat(600);
      const mockResponse = {
        data: [
          {
            candidates: [
              {
                content: { parts: [{ text: longOutput }] },
                finishReason: 'MAX_TOKENS',
              },
            ],
            usageMetadata: {
              totalTokenCount: 1100,
              promptTokenCount: 100,
              candidatesTokenCount: 1000,
            },
          },
        ],
      };

      const mockRequest = vi.fn().mockResolvedValue(mockResponse);

      vi.spyOn(vertexUtil, 'getGoogleClient').mockResolvedValue({
        client: {
          request: mockRequest,
        } as unknown as JSONClient,
        projectId: 'test-project-id',
      });

      vi.spyOn(vertexUtil, 'loadCredentials').mockImplementation(function (creds) {
        if (typeof creds === 'object') {
          return JSON.stringify(creds);
        }
        return creds;
      });
      vi.spyOn(vertexUtil, 'resolveProjectId').mockResolvedValue('test-project-id');

      const response = await provider.callGeminiApi('test prompt');

      expect(response.error).toBeUndefined();
      expect(response.output).toBe(longOutput);
      expect(response.tokenUsage).toEqual({
        total: 1100,
        prompt: 100,
        completion: 1000,
      });
    });

    it('should handle MAX_TOKENS finishReason with short output (no truncation)', async () => {
      const provider = new VertexChatProvider('gemini-pro', {
        config: {},
      });

      const shortOutput = 'Short response';
      const mockResponse = {
        data: [
          {
            candidates: [
              {
                content: { parts: [{ text: shortOutput }] },
                finishReason: 'MAX_TOKENS',
              },
            ],
            usageMetadata: {
              totalTokenCount: 110,
              promptTokenCount: 100,
              candidatesTokenCount: 10,
            },
          },
        ],
      };

      const mockRequest = vi.fn().mockResolvedValue(mockResponse);

      vi.spyOn(vertexUtil, 'getGoogleClient').mockResolvedValue({
        client: {
          request: mockRequest,
        } as unknown as JSONClient,
        projectId: 'test-project-id',
      });

      vi.spyOn(vertexUtil, 'loadCredentials').mockImplementation(function (creds) {
        if (typeof creds === 'object') {
          return JSON.stringify(creds);
        }
        return creds;
      });
      vi.spyOn(vertexUtil, 'resolveProjectId').mockResolvedValue('test-project-id');

      const response = await provider.callGeminiApi('test prompt');

      expect(response.error).toBeUndefined();
      expect(response.output).toBe(shortOutput);
      expect(response.tokenUsage).toEqual({
        total: 110,
        prompt: 100,
        completion: 10,
      });
    });
  });
});

describe('VertexChatProvider.callLlamaApi', () => {
  let provider: VertexChatProvider;

  beforeEach(() => {
    // Reset cache mocks to default state
    mockCacheGet.mockReset();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockReset();

    mockIsCacheEnabled.mockReturnValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
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

    const mockRequest = vi.fn().mockResolvedValue(mockResponse);

    vi.spyOn(vertexUtil, 'getGoogleClient').mockResolvedValue({
      client: {
        request: mockRequest,
      } as unknown as JSONClient,
      projectId: 'test-project-id',
    });

    vi.spyOn(vertexUtil, 'loadCredentials').mockImplementation(function (creds) {
      if (typeof creds === 'object') {
        return JSON.stringify(creds);
      }
      return creds;
    });
    vi.spyOn(vertexUtil, 'resolveProjectId').mockResolvedValue('test-project-id');

    const response = await provider.callLlamaApi('test prompt');

    // Should return successful response
    expect(response).toEqual({
      cached: false,
      output: 'Llama response content',
      tokenUsage: {
        total: 35,
        prompt: 15,
        completion: 20,
        numRequests: 1,
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

    const mockRequest = vi.fn().mockResolvedValue(mockResponse);

    vi.spyOn(vertexUtil, 'getGoogleClient').mockResolvedValue({
      client: {
        request: mockRequest,
      } as unknown as JSONClient,
      projectId: 'test-project-id',
    });

    vi.spyOn(vertexUtil, 'loadCredentials').mockImplementation(function (creds) {
      if (typeof creds === 'object') {
        return JSON.stringify(creds);
      }
      return creds;
    });
    vi.spyOn(vertexUtil, 'resolveProjectId').mockResolvedValue('test-project-id');

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

    vi.spyOn(vertexUtil, 'getGoogleClient').mockResolvedValue({
      client: {
        request: vi.fn().mockRejectedValue(mockError),
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
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
    vi.spyOn(fs, 'readFileSync').mockReturnValue(mockSystemInstruction);

    provider = new VertexChatProvider('gemini-2.5-flash', {
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

    const mockRequest = vi.fn().mockResolvedValue(mockResponse);

    vi.spyOn(vertexUtil, 'getGoogleClient').mockResolvedValue({
      client: {
        request: mockRequest,
      } as unknown as JSONClient,
      projectId: 'test-project-id',
    });

    vi.spyOn(vertexUtil, 'loadCredentials').mockImplementation(function (creds) {
      if (typeof creds === 'object') {
        return JSON.stringify(creds);
      }
      return creds;
    });
    vi.spyOn(vertexUtil, 'resolveProjectId').mockResolvedValue('test-project-id');

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
    // Reset cache mocks to default state
    mockCacheGet.mockReset();
    mockCacheGet.mockResolvedValue(null);
    mockCacheSet.mockReset();

    mockIsCacheEnabled.mockReturnValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should accept anthropicVersion parameter', async () => {
    provider = new VertexChatProvider('claude-3-5-sonnet-v2@20241022', {
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
        model: 'claude-3-5-sonnet-v2@20241022',
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

    const mockRequest = vi.fn().mockResolvedValue(mockResponse);

    vi.spyOn(vertexUtil, 'getGoogleClient').mockResolvedValue({
      client: {
        request: mockRequest,
      } as unknown as JSONClient,
      projectId: 'test-project-id',
    });

    vi.spyOn(vertexUtil, 'loadCredentials').mockImplementation(function (creds) {
      if (typeof creds === 'object') {
        return JSON.stringify(creds);
      }
      return creds;
    });
    vi.spyOn(vertexUtil, 'resolveProjectId').mockResolvedValue('test-project-id');

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
    provider = new VertexChatProvider('claude-3-5-sonnet-v2@20241022', {
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
        model: 'claude-3-5-sonnet-v2@20241022',
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

    const mockRequest = vi.fn().mockResolvedValue(mockResponse);

    vi.spyOn(vertexUtil, 'getGoogleClient').mockResolvedValue({
      client: {
        request: mockRequest,
      } as unknown as JSONClient,
      projectId: 'test-project-id',
    });

    vi.spyOn(vertexUtil, 'loadCredentials').mockImplementation(function (creds) {
      if (typeof creds === 'object') {
        return JSON.stringify(creds);
      }
      return creds;
    });
    vi.spyOn(vertexUtil, 'resolveProjectId').mockResolvedValue('test-project-id');

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
    provider = new VertexChatProvider('claude-3-5-sonnet-v2@20241022', {
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
        model: 'claude-3-5-sonnet-v2@20241022',
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

    const mockRequest = vi.fn().mockResolvedValue(mockResponse);

    vi.spyOn(vertexUtil, 'getGoogleClient').mockResolvedValue({
      client: {
        request: mockRequest,
      } as unknown as JSONClient,
      projectId: 'test-project-id',
    });

    vi.spyOn(vertexUtil, 'loadCredentials').mockImplementation(function (creds) {
      if (typeof creds === 'object') {
        return JSON.stringify(creds);
      }
      return creds;
    });
    vi.spyOn(vertexUtil, 'resolveProjectId').mockResolvedValue('test-project-id');

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

  describe('responseSchema handling', () => {
    let provider: VertexChatProvider;

    beforeEach(() => {
      vi.clearAllMocks();

      // Mock fs for schema file loading
      vi.mocked(fs.existsSync).mockImplementation(function (filePath) {
        const pathStr = filePath.toString();
        return (
          pathStr.includes('simple.json') ||
          pathStr.includes('complex.json') ||
          pathStr.includes('template-vars.json') ||
          pathStr.includes('invalid.json')
        );
      });

      vi.mocked(fs.readFileSync).mockImplementation(function (filePath) {
        const pathStr = filePath.toString();
        if (pathStr.includes('simple.json')) {
          return JSON.stringify({
            type: 'object',
            properties: { tweet: { type: 'string', description: 'The tweet content' } },
            required: ['tweet'],
          });
        }
        if (pathStr.includes('complex.json')) {
          return JSON.stringify({
            type: 'object',
            properties: {
              user: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  email: { type: 'string', format: 'email' },
                },
                required: ['name', 'email'],
              },
            },
            required: ['user'],
          });
        }
        if (pathStr.includes('template-vars.json')) {
          return JSON.stringify({
            type: 'object',
            properties: {
              '{{fieldName}}': { type: 'string', description: '{{fieldDescription}}' },
            },
            required: ['{{fieldName}}'],
          });
        }
        if (pathStr.includes('invalid.json')) {
          return '{ "type": "object", "properties": { "name": { "type": "string" }, }, }';
        }
        throw new Error(`File not found: ${pathStr}`);
      });
    });

    it('should handle responseSchema with JSON string', async () => {
      provider = new VertexChatProvider('gemini-2.5-flash', {
        config: {
          responseSchema: JSON.stringify({
            type: 'object',
            properties: { tweet: { type: 'string' } },
            required: ['tweet'],
          }),
        },
      });

      const mockResponse = {
        data: [
          {
            candidates: [{ content: { parts: [{ text: '{"tweet": "Hello world"}' }] } }],
            usageMetadata: {
              promptTokenCount: 10,
              candidatesTokenCount: 20,
              totalTokenCount: 30,
            },
          },
        ],
      };

      const mockRequest = vi.fn().mockResolvedValue(mockResponse);

      vi.spyOn(vertexUtil, 'getGoogleClient').mockResolvedValue({
        client: {
          request: mockRequest,
        } as unknown as JSONClient,
        projectId: 'test-project-id',
      });

      await provider.callGeminiApi('Write a tweet about AI');

      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            generationConfig: expect.objectContaining({
              response_schema: {
                type: 'object',
                properties: { tweet: { type: 'string' } },
                required: ['tweet'],
              },
              response_mime_type: 'application/json',
            }),
          }),
        }),
      );
    });

    it('should handle responseSchema with file:// protocol', async () => {
      provider = new VertexChatProvider('gemini-2.5-flash', {
        config: {
          responseSchema: 'file://test/simple.json',
        },
      });

      const mockResponse = {
        data: [
          {
            candidates: [{ content: { parts: [{ text: '{"tweet": "Hello from file"}' }] } }],
            usageMetadata: {
              promptTokenCount: 15,
              candidatesTokenCount: 25,
              totalTokenCount: 40,
            },
          },
        ],
      };

      const mockRequest = vi.fn().mockResolvedValue(mockResponse);

      vi.spyOn(vertexUtil, 'getGoogleClient').mockResolvedValue({
        client: {
          request: mockRequest,
        } as unknown as JSONClient,
        projectId: 'test-project-id',
      });

      await provider.callGeminiApi('Write a tweet');

      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            generationConfig: expect.objectContaining({
              response_schema: {
                type: 'object',
                properties: { tweet: { type: 'string', description: 'The tweet content' } },
                required: ['tweet'],
              },
              response_mime_type: 'application/json',
            }),
          }),
        }),
      );
    });

    it('should handle responseSchema with variable substitution in schema content', async () => {
      const contextVars = {
        greetingDescription: 'A personalized greeting message',
      };

      provider = new VertexChatProvider('gemini-2.5-flash', {
        config: {
          responseSchema: 'file://test/variable-content.json',
        },
      });

      const mockResponse = {
        data: [
          {
            candidates: [
              { content: { parts: [{ text: '{"greeting": "Hello", "name": "John"}' }] } },
            ],
            usageMetadata: {
              promptTokenCount: 12,
              candidatesTokenCount: 18,
              totalTokenCount: 30,
            },
          },
        ],
      };

      const mockRequest = vi.fn().mockResolvedValue(mockResponse);

      vi.spyOn(vertexUtil, 'getGoogleClient').mockResolvedValue({
        client: {
          request: mockRequest,
        } as unknown as JSONClient,
        projectId: 'test-project-id',
      });

      vi.mocked(fs.existsSync).mockImplementation(function (filePath) {
        const pathStr = filePath.toString();
        return (
          pathStr.includes('variable-content.json') ||
          pathStr.includes('simple.json') ||
          pathStr.includes('complex.json')
        );
      });

      vi.mocked(fs.readFileSync).mockImplementation(function (filePath) {
        const pathStr = filePath.toString();
        if (pathStr.includes('variable-content.json')) {
          return JSON.stringify({
            type: 'object',
            properties: {
              greeting: {
                type: 'string',
                description: '{{greetingDescription}}',
              },
              name: {
                type: 'string',
                description: "The person's name",
              },
            },
            required: ['greeting', 'name'],
          });
        }
        return '{}';
      });

      await provider.callGeminiApi('Generate a message', {
        vars: contextVars,
        prompt: { raw: 'Generate a message', display: 'Generate a message', label: 'test' },
      });

      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            generationConfig: expect.objectContaining({
              response_schema: {
                type: 'object',
                properties: {
                  greeting: { type: 'string', description: 'A personalized greeting message' },
                  name: { type: 'string', description: "The person's name" },
                },
                required: ['greeting', 'name'],
              },
              response_mime_type: 'application/json',
            }),
          }),
        }),
      );
    });

    it('should throw error when both responseSchema and generationConfig.response_schema are provided', async () => {
      provider = new VertexChatProvider('gemini-2.5-flash', {
        config: {
          responseSchema: '{"type": "object"}',
          generationConfig: {
            response_schema: '{"type": "string"}',
          },
        },
      });

      vi.spyOn(vertexUtil, 'getGoogleClient').mockResolvedValue({
        client: {
          request: vi.fn(),
        } as unknown as JSONClient,
        projectId: 'test-project-id',
      });

      await expect(provider.callGeminiApi('test')).rejects.toThrow(
        '`responseSchema` provided but `generationConfig.response_schema` already set.',
      );
    });

    it('should handle complex nested schemas from files', async () => {
      provider = new VertexChatProvider('gemini-2.5-flash', {
        config: {
          responseSchema: 'file://test/complex.json',
        },
      });

      const mockResponse = {
        data: [
          {
            candidates: [
              {
                content: {
                  parts: [{ text: '{"user": {"name": "John", "email": "john@example.com"}}' }],
                },
              },
            ],
            usageMetadata: {
              promptTokenCount: 20,
              candidatesTokenCount: 30,
              totalTokenCount: 50,
            },
          },
        ],
      };

      const mockRequest = vi.fn().mockResolvedValue(mockResponse);

      vi.spyOn(vertexUtil, 'getGoogleClient').mockResolvedValue({
        client: {
          request: mockRequest,
        } as unknown as JSONClient,
        projectId: 'test-project-id',
      });

      const response = await provider.callGeminiApi('Create user data');

      expect(response.output).toBe('{"user": {"name": "John", "email": "john@example.com"}}');
      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            generationConfig: expect.objectContaining({
              response_schema: expect.objectContaining({
                type: 'object',
                properties: expect.objectContaining({
                  user: expect.objectContaining({
                    type: 'object',
                    properties: expect.objectContaining({
                      name: { type: 'string' },
                      email: { type: 'string', format: 'email' },
                    }),
                    required: ['name', 'email'],
                  }),
                }),
                required: ['user'],
              }),
              response_mime_type: 'application/json',
            }),
          }),
        }),
      );
    });

    it('should handle errors when schema file does not exist', async () => {
      provider = new VertexChatProvider('gemini-2.5-flash', {
        config: {
          responseSchema: 'file://test/nonexistent.json',
        },
      });

      vi.spyOn(vertexUtil, 'getGoogleClient').mockResolvedValue({
        client: {
          request: vi.fn(),
        } as unknown as JSONClient,
        projectId: 'test-project-id',
      });

      vi.mocked(fs.existsSync).mockImplementation(function (filePath) {
        return !filePath.toString().includes('nonexistent.json');
      });

      vi.mocked(fs.readFileSync).mockImplementation(function (filePath) {
        throw new Error(`File not found: ${filePath}`);
      });

      await expect(provider.callGeminiApi('test')).rejects.toThrow();
    });

    it('should preserve existing generationConfig properties when adding responseSchema', async () => {
      provider = new VertexChatProvider('gemini-2.5-flash', {
        config: {
          temperature: 0.7,
          maxOutputTokens: 1000,
          generationConfig: {
            topP: 0.9,
            topK: 10,
          },
          responseSchema: '{"type": "object", "properties": {"result": {"type": "string"}}}',
        },
      });

      const mockResponse = {
        data: [
          {
            candidates: [{ content: { parts: [{ text: '{"result": "success"}' }] } }],
            usageMetadata: {
              promptTokenCount: 10,
              candidatesTokenCount: 15,
              totalTokenCount: 25,
            },
          },
        ],
      };

      const mockRequest = vi.fn().mockResolvedValue(mockResponse);

      vi.spyOn(vertexUtil, 'getGoogleClient').mockResolvedValue({
        client: {
          request: mockRequest,
        } as unknown as JSONClient,
        projectId: 'test-project-id',
      });

      await provider.callGeminiApi('test');

      expect(mockRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            generationConfig: expect.objectContaining({
              temperature: 0.7,
              maxOutputTokens: 1000,
              topP: 0.9,
              topK: 10,
              response_schema: {
                type: 'object',
                properties: { result: { type: 'string' } },
              },
              response_mime_type: 'application/json',
            }),
          }),
        }),
      );
    });
  });

  describe('getApiHost', () => {
    it('should return global endpoint without region prefix for region: global', () => {
      const provider = new VertexChatProvider('gemini-pro', { config: { region: 'global' } });
      expect(provider.getApiHost()).toBe('aiplatform.googleapis.com');
    });

    it('should return regional endpoint for non-global regions', () => {
      const provider = new VertexChatProvider('gemini-pro', { config: { region: 'us-central1' } });
      expect(provider.getApiHost()).toBe('us-central1-aiplatform.googleapis.com');
    });

    it('should use custom apiHost over default', () => {
      const provider = new VertexChatProvider('gemini-pro', {
        config: { region: 'global', apiHost: 'custom.example.com' },
      });
      expect(provider.getApiHost()).toBe('custom.example.com');
    });

    it('should use VERTEX_API_HOST from env override', () => {
      const provider = new VertexChatProvider('gemini-pro', {
        config: { region: 'global' },
        env: { VERTEX_API_HOST: 'env.example.com' },
      });
      expect(provider.getApiHost()).toBe('env.example.com');
    });

    it('should prioritize configApiHost over env override', () => {
      const provider = new VertexChatProvider('gemini-pro', {
        config: { region: 'global', apiHost: 'config.example.com' },
        env: { VERTEX_API_HOST: 'env.example.com' },
      });
      expect(provider.getApiHost()).toBe('config.example.com');
    });
  });
});
