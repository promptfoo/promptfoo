import type { JSONClient } from 'google-auth-library/build/src/auth/googleauth';
import { getCache, isCacheEnabled } from '../../src/cache';
import logger from '../../src/logger';
import { VertexChatProvider } from '../../src/providers/vertex';
import * as vertexUtil from '../../src/providers/vertexUtil';

jest.mock('../../src/cache', () => ({
  getCache: jest.fn().mockReturnValue({
    get: jest.fn(),
    set: jest.fn(),
  }),
  isCacheEnabled: jest.fn(),
}));

jest.mock('../../src/providers/vertexUtil', () => ({
  ...jest.requireActual('../../src/providers/vertexUtil'),
  getGoogleClient: jest.fn(),
}));

describe('VertexChatProvider.callGeminiApi', () => {
  let provider: VertexChatProvider;

  beforeEach(() => {
    provider = new VertexChatProvider('gemini-pro', {
      config: {
        context: 'test-context',
        examples: [{ input: 'example input', output: 'example output' }],
        stopSequence: ['\n'],
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
    });

    expect(vertexUtil.getGoogleClient).toHaveBeenCalledWith();
    expect(mockRequest).toHaveBeenCalledWith({
      url: expect.any(String),
      method: 'POST',
      data: expect.objectContaining({
        contents: [{ parts: { text: 'test prompt' }, role: 'user' }],
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
});

describe('maybeCoerceToGeminiFormat', () => {
  it('should return unmodified content if it matches GeminiFormat', () => {
    const input = [
      {
        role: 'user',
        parts: [{ text: 'Hello, Gemini!' }],
      },
    ];
    const result = vertexUtil.maybeCoerceToGeminiFormat(input);
    expect(result).toEqual({
      contents: input,
      coerced: false,
      systemInstruction: undefined,
    });
  });

  it('should coerce OpenAI chat format to GeminiFormat', () => {
    const input = [
      { role: 'user', content: 'Hello' },
      { role: 'user', content: ', ' },
      { role: 'user', content: 'Gemini!' },
    ];
    const expected = [
      {
        role: 'user',
        parts: [{ text: 'Hello' }],
      },
      {
        role: 'user',
        parts: [{ text: ', ' }],
      },
      {
        role: 'user',
        parts: [{ text: 'Gemini!' }],
      },
    ];
    const result = vertexUtil.maybeCoerceToGeminiFormat(input);
    expect(result).toEqual({
      contents: expected,
      coerced: true,
      systemInstruction: undefined,
    });
  });

  it('should coerce string input to GeminiFormat', () => {
    const input = 'Hello, Gemini!';
    const expected = [
      {
        parts: [{ text: 'Hello, Gemini!' }],
      },
    ];
    const result = vertexUtil.maybeCoerceToGeminiFormat(input);
    expect(result).toEqual({
      contents: expected,
      coerced: true,
      systemInstruction: undefined,
    });
  });

  it('should handle system messages and create systemInstruction', () => {
    const input = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Hello!' },
    ];
    const result = vertexUtil.maybeCoerceToGeminiFormat(input);
    expect(result).toEqual({
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Hello!' }],
        },
      ],
      coerced: true,
      systemInstruction: {
        parts: [{ text: 'You are a helpful assistant.' }],
      },
    });
  });

  it('should log a warning and return the input for unknown formats', () => {
    const loggerSpy = jest.spyOn(logger, 'warn');
    const input = { unknownFormat: 'test' };
    const result = vertexUtil.maybeCoerceToGeminiFormat(input);
    expect(result).toEqual({
      contents: input,
      coerced: false,
      systemInstruction: undefined,
    });
    expect(loggerSpy).toHaveBeenCalledWith(`Unknown format for Gemini: ${JSON.stringify(input)}`);
  });

  it('should handle OpenAI chat format with content as an array of objects', () => {
    const input = [
      {
        role: 'system',
        content: 'You are a helpful AI assistant.',
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'What is {{thing}}?',
          },
        ],
      },
    ];

    const result = vertexUtil.maybeCoerceToGeminiFormat(input);

    expect(result).toEqual({
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: 'What is {{thing}}?',
            },
          ],
        },
      ],
      coerced: true,
      systemInstruction: {
        parts: [{ text: 'You are a helpful AI assistant.' }],
      },
    });
  });

  it('should handle string content', () => {
    // This simulates the parsed YAML format
    const input = [
      {
        role: 'system',
        content: 'You are a helpful AI assistant.',
      },
      {
        role: 'user',
        content: 'What is {{thing}}?',
      },
    ];

    const result = vertexUtil.maybeCoerceToGeminiFormat(input);

    expect(result).toEqual({
      contents: [
        {
          role: 'user',
          parts: [{ text: 'What is {{thing}}?' }],
        },
      ],
      coerced: true,
      systemInstruction: {
        parts: [{ text: 'You are a helpful AI assistant.' }],
      },
    });
  });

  it('should handle mixed content types', () => {
    const input = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'First part' },
          'Second part as string',
          { type: 'image', url: 'https://example.com/image.jpg' },
        ],
      },
    ];

    const result = vertexUtil.maybeCoerceToGeminiFormat(input);

    expect(result).toEqual({
      contents: [
        {
          role: 'user',
          parts: [
            { text: 'First part' },
            { text: 'Second part as string' },
            { type: 'image', url: 'https://example.com/image.jpg' },
          ],
        },
      ],
      coerced: true,
      systemInstruction: undefined,
    });
  });

  it('should handle function tool callbacks correctly', async () => {
    const mockCachedResponse = {
      cached: false,
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
    expect(result.tokenUsage).toEqual({ total: 15, prompt: 10, completion: 5, cached: 15});
  });

  // it('should handle multiple function tool calls', async () => {
  //   const mockResponse = {
  //     data: {
  //       choices: [
  //         {
  //           message: {
  //             content: null,
  //             tool_calls: [
  //               {
  //                 function: {
  //                   name: 'addNumbers',
  //                   arguments: '{"a":5,"b":6}',
  //                 },
  //               },
  //               {
  //                 function: {
  //                   name: 'multiplyNumbers',
  //                   arguments: '{"x":2,"y":3}',
  //                 },
  //               },
  //             ],
  //           },
  //         },
  //       ],
  //       usage: { total_tokens: 15, prompt_tokens: 7, completion_tokens: 8 },
  //     },
  //     cached: false,
  //     status: 200,
  //     statusText: 'OK',
  //   };
  //   mockFetchWithCache.mockResolvedValue(mockResponse);

  //   const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
  //     config: {
  //       tools: [
  //         {
  //           type: 'function',
  //           function: {
  //             name: 'addNumbers',
  //             description: 'Add two numbers together',
  //             parameters: {
  //               type: 'object',
  //               properties: {
  //                 a: { type: 'number' },
  //                 b: { type: 'number' },
  //               },
  //               required: ['a', 'b'],
  //             },
  //           },
  //         },
  //         {
  //           type: 'function',
  //           function: {
  //             name: 'multiplyNumbers',
  //             description: 'Multiply two numbers',
  //             parameters: {
  //               type: 'object',
  //               properties: {
  //                 x: { type: 'number' },
  //                 y: { type: 'number' },
  //               },
  //               required: ['x', 'y'],
  //             },
  //           },
  //         },
  //       ],
  //       functionToolCallbacks: {
  //         addNumbers: (parametersJsonString) => {
  //           const { a, b } = JSON.parse(parametersJsonString);
  //           return Promise.resolve(JSON.stringify(a + b));
  //         },
  //         multiplyNumbers: (parametersJsonString) => {
  //           const { x, y } = JSON.parse(parametersJsonString);
  //           return Promise.resolve(JSON.stringify(x * y));
  //         },
  //       },
  //     },
  //   });

  //   const result = await provider.callApi('Add 5 and 6, then multiply 2 and 3');

  //   expect(mockFetchWithCache).toHaveBeenCalledTimes(1);
  //   expect(result.output).toBe('11\n6');
  //   expect(result.tokenUsage).toEqual({ total: 15, prompt: 7, completion: 8 });
  // });

  // it('should handle errors in function tool callbacks', async () => {
  //   const mockResponse = {
  //     data: {
  //       choices: [
  //         {
  //           message: {
  //             content: null,
  //             function_call: {
  //               name: 'errorFunction',
  //               arguments: '{}',
  //             },
  //           },
  //         },
  //       ],
  //       usage: { total_tokens: 5, prompt_tokens: 2, completion_tokens: 3 },
  //     },
  //     cached: false,
  //     status: 200,
  //     statusText: 'OK',
  //   };
  //   mockFetchWithCache.mockResolvedValue(mockResponse);

  //   const provider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
  //     config: {
  //       tools: [
  //         {
  //           type: 'function',
  //           function: {
  //             name: 'errorFunction',
  //             description: 'A function that always throws an error',
  //             parameters: {
  //               type: 'object',
  //               properties: {},
  //             },
  //           },
  //         },
  //       ],
  //       functionToolCallbacks: {
  //         errorFunction: () => {
  //           throw new Error('Test error');
  //         },
  //       },
  //     },
  //   });

  //   const result = await provider.callApi('Call the error function');

  //   expect(mockFetchWithCache).toHaveBeenCalledTimes(1);
  //   expect(result.output).toEqual({ arguments: '{}', name: 'errorFunction' });
  //   expect(result.tokenUsage).toEqual({ total: 5, prompt: 2, completion: 3 });
  // });
});
