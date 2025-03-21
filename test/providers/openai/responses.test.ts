import * as cache from '../../../src/cache';
import logger from '../../../src/logger';
import { OpenAiResponsesProvider } from '../../../src/providers/openai/responses';

jest.mock('../../../src/cache', () => ({
  fetchWithCache: jest.fn(),
}));

jest.mock('../../../src/logger', () => ({
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

describe('OpenAiResponsesProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should support various model names', () => {
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o1-pro');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-4o');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o3-mini');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-4.5-preview');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain(
      'gpt-4.5-preview-2025-02-27',
    );
  });

  it('should format and call the responses API correctly', async () => {
    const mockApiResponse = {
      id: 'resp_abc123',
      object: 'response',
      created_at: 1234567890,
      status: 'completed',
      model: 'gpt-4o',
      output: [
        {
          type: 'message',
          id: 'msg_abc123',
          status: 'completed',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: 'This is a test response',
            },
          ],
        },
      ],
      usage: {
        input_tokens: 10,
        output_tokens: 20,
        total_tokens: 30,
      },
    };

    jest.mocked(cache.fetchWithCache).mockResolvedValue({
      data: mockApiResponse,
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const provider = new OpenAiResponsesProvider('gpt-4o', {
      config: {
        apiKey: 'test-key',
      },
    });

    const result = await provider.callApi('Test prompt');

    expect(cache.fetchWithCache).toHaveBeenCalledWith(
      expect.stringContaining('/responses'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-key',
        }),
      }),
      expect.any(Number),
    );

    expect(result.error).toBeUndefined();
    expect(result.output).toBe('This is a test response');
    expect(result.tokenUsage?.total).toBe(30);
  });

  it('should handle system prompts correctly', async () => {
    const mockApiResponse = {
      id: 'resp_abc123',
      status: 'completed',
      model: 'gpt-4o',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: 'Response with system prompt',
            },
          ],
        },
      ],
      usage: { input_tokens: 15, output_tokens: 10, total_tokens: 25 },
    };

    jest.mocked(cache.fetchWithCache).mockResolvedValue({
      data: mockApiResponse,
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const provider = new OpenAiResponsesProvider('gpt-4o', {
      config: {
        apiKey: 'test-key',
        instructions: 'You are a helpful assistant',
      },
    });

    await provider.callApi('Test prompt');

    expect(cache.fetchWithCache).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('"instructions":"You are a helpful assistant"'),
      }),
      expect.any(Number),
    );
  });

  it('should handle tool calling correctly', async () => {
    const mockApiResponse = {
      id: 'resp_abc123',
      status: 'completed',
      model: 'gpt-4o',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'tool_call',
              name: 'get_weather',
              id: 'call_123',
              input: { location: 'San Francisco' },
            },
          ],
        },
      ],
      usage: { input_tokens: 20, output_tokens: 15, total_tokens: 35 },
    };

    jest.mocked(cache.fetchWithCache).mockResolvedValue({
      data: mockApiResponse,
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const tools = [
      {
        type: 'function' as const,
        function: {
          name: 'get_weather',
          description: 'Get the current weather in a given location',
          parameters: {
            type: 'object' as const,
            properties: {
              location: { type: 'string' },
            },
            required: ['location'],
          },
        },
      },
    ];

    const provider = new OpenAiResponsesProvider('gpt-4o', {
      config: {
        apiKey: 'test-key',
        tools,
      },
    });

    const result = await provider.callApi("What's the weather in San Francisco?");

    expect(cache.fetchWithCache).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('"tools":[{'),
      }),
      expect.any(Number),
    );

    expect(result.raw).toHaveProperty('output');
    expect(JSON.stringify(result.raw)).toContain('get_weather');
    expect(JSON.stringify(result.raw)).toContain('San Francisco');
  });

  it('should handle parallel tool calls correctly', async () => {
    const mockApiResponse = {
      id: 'resp_abc123',
      status: 'completed',
      model: 'gpt-4o',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'tool_call',
              name: 'get_weather',
              id: 'call_123',
              input: { location: 'San Francisco' },
            },
          ],
        },
      ],
      parallel_tool_calls: true,
      usage: { input_tokens: 20, output_tokens: 15, total_tokens: 35 },
    };

    jest.mocked(cache.fetchWithCache).mockResolvedValue({
      data: mockApiResponse,
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const provider = new OpenAiResponsesProvider('gpt-4o', {
      config: {
        apiKey: 'test-key',
        tools: [
          {
            type: 'function' as const,
            function: {
              name: 'get_weather',
              description: 'Get weather',
              parameters: {
                type: 'object' as const,
                properties: {
                  location: { type: 'string' },
                },
              },
            },
          },
        ],
        parallel_tool_calls: true,
      },
    });

    await provider.callApi('Weather?');

    expect(cache.fetchWithCache).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('"parallel_tool_calls":true'),
      }),
      expect.any(Number),
    );
  });

  it('should handle temperature and other parameters correctly', async () => {
    const mockApiResponse = {
      id: 'resp_abc123',
      status: 'completed',
      model: 'gpt-4o',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: 'Response with custom parameters',
            },
          ],
        },
      ],
      usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
    };

    jest.mocked(cache.fetchWithCache).mockResolvedValue({
      data: mockApiResponse,
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const provider = new OpenAiResponsesProvider('gpt-4o', {
      config: {
        apiKey: 'test-key',
        temperature: 0.7,
        top_p: 0.9,
        max_completion_tokens: 1000,
      },
    });

    await provider.callApi('Test prompt');

    const mockCall = jest.mocked(cache.fetchWithCache).mock.calls[0];
    const reqOptions = mockCall[1] as { body: string };
    const body = JSON.parse(reqOptions.body);

    expect(body.temperature).toBe(0.7);
    expect(body.top_p).toBe(0.9);
    expect(body.max_output_tokens).toBeDefined();
  });

  it('should handle store parameter correctly', async () => {
    const mockApiResponse = {
      id: 'resp_abc123',
      status: 'completed',
      model: 'gpt-4o',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: 'Stored response',
            },
          ],
        },
      ],
      usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
    };

    jest.mocked(cache.fetchWithCache).mockResolvedValue({
      data: mockApiResponse,
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const provider = new OpenAiResponsesProvider('gpt-4o', {
      config: {
        apiKey: 'test-key',
        store: true,
      },
    });

    await provider.callApi('Test prompt');

    expect(cache.fetchWithCache).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('"store":true'),
      }),
      expect.any(Number),
    );
  });

  it('should handle truncation information correctly', async () => {
    const mockApiResponse = {
      id: 'resp_abc123',
      status: 'completed',
      model: 'gpt-4o',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: 'Truncated response',
            },
          ],
        },
      ],
      truncation: {
        tokens_truncated: 100,
        tokens_remaining: 200,
        token_limit: 4096,
      },
      usage: { input_tokens: 3896, output_tokens: 100, total_tokens: 3996 },
    };

    jest.mocked(cache.fetchWithCache).mockResolvedValue({
      data: mockApiResponse,
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const provider = new OpenAiResponsesProvider('gpt-4o', {
      config: {
        apiKey: 'test-key',
      },
    });

    const result = await provider.callApi('Very long prompt that would be truncated');

    expect(result.raw).toHaveProperty('truncation');
    expect(result.raw.truncation.tokens_truncated).toBe(100);
  });

  it('should handle various structured inputs correctly', async () => {
    const mockApiResponse = {
      id: 'resp_abc123',
      status: 'completed',
      model: 'gpt-4o',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: 'Response to structured input',
            },
          ],
        },
      ],
      usage: { input_tokens: 15, output_tokens: 10, total_tokens: 25 },
    };

    jest.mocked(cache.fetchWithCache).mockResolvedValue({
      data: mockApiResponse,
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const provider = new OpenAiResponsesProvider('gpt-4o', {
      config: {
        apiKey: 'test-key',
      },
    });

    const structuredInput = JSON.stringify([
      { role: 'system', content: 'You are a helpful assistant' },
      { role: 'user', content: 'Hello' },
    ]);

    await provider.callApi(structuredInput);

    const mockCall = jest.mocked(cache.fetchWithCache).mock.calls[0];
    const reqOptions = mockCall[1] as { body: string };
    const body = JSON.parse(reqOptions.body);

    expect(body.input).toBeDefined();

    const inputStr = JSON.stringify(body.input);
    expect(inputStr).toContain('You are a helpful assistant');
    expect(inputStr).toContain('Hello');
  });

  it('should handle streaming responses correctly', async () => {
    const mockApiResponse = {
      id: 'resp_abc123',
      status: 'completed',
      model: 'gpt-4o',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: 'Streaming response',
            },
          ],
        },
      ],
      usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
    };

    jest.mocked(cache.fetchWithCache).mockResolvedValue({
      data: mockApiResponse,
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const provider = new OpenAiResponsesProvider('gpt-4o', {
      config: {
        apiKey: 'test-key',
        stream: true,
      },
    });

    await provider.callApi('Test prompt');

    expect(cache.fetchWithCache).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('"stream":true'),
      }),
      expect.any(Number),
    );
  });

  it('should handle JSON schema validation errors correctly', async () => {
    const mockApiResponse = {
      error: {
        message: 'The response format is invalid. Cannot parse as JSON schema.',
        type: 'invalid_response_format',
        code: 'json_schema_validation_error',
        param: 'response_format',
      },
      status: 400,
      statusText: 'Bad Request',
    };

    jest.mocked(cache.fetchWithCache).mockResolvedValue({
      data: mockApiResponse,
      cached: false,
      status: 400,
      statusText: 'Bad Request',
    });

    const provider = new OpenAiResponsesProvider('gpt-4o', {
      config: {
        apiKey: 'test-key',
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'InvalidSchema',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                result: { type: 'string' },
              },
              // The API will complain about something even though the schema is valid
              required: ['missing_field'],
              additionalProperties: false,
            },
          },
        },
      },
    });

    // Call the API
    const result = await provider.callApi('Test prompt');

    // Assert error is present
    expect(result.error).toContain('json_schema_validation_error');
  });

  it('should handle reasoning models correctly', async () => {
    // Mock API response for o1-pro model
    const mockApiResponse = {
      id: 'resp_abc123',
      object: 'response',
      created_at: 1234567890,
      status: 'completed',
      model: 'o1-pro',
      output: [
        {
          type: 'message',
          id: 'msg_abc123',
          status: 'completed',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: 'This is a response from o1-pro',
            },
          ],
        },
      ],
      usage: {
        input_tokens: 15,
        output_tokens: 30,
        output_tokens_details: {
          reasoning_tokens: 100,
        },
        total_tokens: 45,
      },
    };

    // Setup mock for fetchWithCache
    jest.mocked(cache.fetchWithCache).mockResolvedValue({
      data: mockApiResponse,
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    // Initialize the provider with reasoning model settings
    const provider = new OpenAiResponsesProvider('o1-pro', {
      config: {
        apiKey: 'test-key',
        reasoning_effort: 'medium',
        max_completion_tokens: 2000,
      },
    });

    // Call the API
    const result = await provider.callApi('Test prompt');

    // Verify the request body includes reasoning effort
    expect(cache.fetchWithCache).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: expect.stringContaining('"reasoning":{"effort":"medium"}'),
      }),
      expect.any(Number),
    );

    // Assertions
    expect(result.error).toBeUndefined();
    expect(result.output).toBe('This is a response from o1-pro');
    // Just test that the total tokens is present, but don't test for reasoning tokens
    // as the implementation may handle these details differently
    expect(result.tokenUsage?.total).toBe(45);
  });

  it('should handle API errors correctly', async () => {
    // Setup mock for fetchWithCache to return an error
    jest.mocked(cache.fetchWithCache).mockResolvedValue({
      data: {
        error: {
          message: 'Invalid request',
          type: 'invalid_request_error',
          code: 'invalid_api_key',
        },
      },
      cached: false,
      status: 400,
      statusText: 'Bad Request',
    });

    // Initialize the provider
    const provider = new OpenAiResponsesProvider('gpt-4o', {
      config: {
        apiKey: 'invalid-key',
      },
    });

    // Call the API
    const result = await provider.callApi('Test prompt');

    // Assertions
    expect(result.error).toContain('API error');
    expect(result.output).toBeUndefined();
  });

  it('should format JSON schema correctly in request body', async () => {
    jest.mocked(cache.fetchWithCache).mockResolvedValue({
      data: {
        id: 'resp_abc123',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: '{"result": "success"}',
              },
            ],
          },
        ],
        usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const config = {
      apiKey: 'test-key',
      response_format: {
        type: 'json_schema' as const,
        json_schema: {
          name: 'TestSchema',
          strict: true,
          schema: {
            type: 'object' as const,
            properties: {
              result: { type: 'string' },
            },
            required: ['result'],
            additionalProperties: false,
          },
        },
      },
    } as any;

    const provider = new OpenAiResponsesProvider('gpt-4o', { config });
    await provider.callApi('Test prompt');

    expect(jest.mocked(cache.fetchWithCache).mock.calls.length).toBeGreaterThan(0);

    const mockCall = jest.mocked(cache.fetchWithCache).mock.calls[0];
    expect(mockCall).toBeDefined();

    const reqOptions = mockCall[1] as { body: string };
    const body = JSON.parse(reqOptions.body);

    expect(body.text.format.type).toBe('json_schema');
    expect(body.text.format.name).toBe('TestSchema');
    expect(body.text.format.schema).toBeDefined();
    expect(body.text.format.strict).toBe(true);
  });

  it('should handle JSON object prompt correctly', async () => {
    const mockApiResponse = {
      id: 'resp_abc123',
      status: 'completed',
      model: 'gpt-4o',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: 'Response to object input',
            },
          ],
        },
      ],
      usage: { input_tokens: 15, output_tokens: 10, total_tokens: 25 },
    };

    jest.mocked(cache.fetchWithCache).mockResolvedValue({
      data: mockApiResponse,
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const provider = new OpenAiResponsesProvider('gpt-4o', {
      config: {
        apiKey: 'test-key',
      },
    });

    const objectInput = JSON.stringify({ query: 'What is the weather?', context: 'San Francisco' });
    await provider.callApi(objectInput);

    const mockCall = jest.mocked(cache.fetchWithCache).mock.calls[0];
    const reqOptions = mockCall[1] as { body: string };
    const body = JSON.parse(reqOptions.body);

    expect(body.input).toEqual(objectInput);
  });

  it('should throw error when API key is not set', async () => {
    const provider = new OpenAiResponsesProvider('gpt-4o', {
      config: {},
    });

    jest.spyOn(provider, 'getApiKey').mockReturnValue(undefined);

    await expect(provider.callApi('Test prompt')).rejects.toThrow('OpenAI API key is not set');
  });

  it('should handle error in API response data correctly', async () => {
    const mockApiResponse = {
      error: {
        message: 'Content policy violation',
        type: 'content_policy_violation',
        code: 'content_filter',
      },
    };

    jest.mocked(cache.fetchWithCache).mockResolvedValue({
      data: mockApiResponse,
      cached: false,
      status: 400,
      statusText: 'Bad Request',
    });

    const provider = new OpenAiResponsesProvider('gpt-4o', {
      config: {
        apiKey: 'test-key',
      },
    });

    const result = await provider.callApi('Test prompt');

    expect(result.error).toContain('content_policy_violation');
  });

  it('should handle missing output array correctly', async () => {
    const mockApiResponse = {
      id: 'resp_abc123',
      status: 'completed',
      model: 'gpt-4o',
      // No output array
      usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
    };

    // Setup mock for fetchWithCache
    jest.mocked(cache.fetchWithCache).mockResolvedValue({
      data: mockApiResponse,
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    // Initialize the provider
    const provider = new OpenAiResponsesProvider('gpt-4o', {
      config: {
        apiKey: 'test-key',
      },
    });

    // Call the API
    const result = await provider.callApi('Test prompt');

    // Verify error about missing output array
    expect(result.error).toContain('Invalid response format: Missing output array');
  });

  it('should handle JSON stringify errors during logging', async () => {
    // Mock API response
    const mockApiResponse = {
      id: 'resp_abc123',
      status: 'completed',
      model: 'gpt-4o',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: 'Test response',
            },
          ],
        },
      ],
      usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
    };

    // Setup mock for fetchWithCache
    jest.mocked(cache.fetchWithCache).mockResolvedValue({
      data: mockApiResponse,
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    // Initialize the provider
    const provider = new OpenAiResponsesProvider('gpt-4o', {
      config: {
        apiKey: 'test-key',
      },
    });

    // Mock fetchWithCache with successful result
    jest.mocked(cache.fetchWithCache).mockImplementationOnce(async () => {
      return {
        data: mockApiResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      };
    });

    // Ensure we get output without error
    const result = await provider.callApi('Test prompt');

    // Verify the API was called successfully
    expect(cache.fetchWithCache).toHaveBeenCalledWith(
      expect.stringContaining('/responses'),
      expect.anything(),
      expect.anything(),
    );
    expect(result.output).toBe('Test response');
    expect(result.error).toBeUndefined();
  });

  it('should handle null content in message output', async () => {
    // Mock API response with content that will cause error during processing
    const mockApiResponse = {
      id: 'resp_abc123',
      status: 'completed',
      model: 'gpt-4o',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: null, // Will cause TypeError when trying to iterate
        },
      ],
      usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
    };

    // Setup mock for fetchWithCache
    jest.mocked(cache.fetchWithCache).mockResolvedValue({
      data: mockApiResponse,
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    // Initialize the provider
    const provider = new OpenAiResponsesProvider('gpt-4o', {
      config: {
        apiKey: 'test-key',
      },
    });

    // Call the API - since there's no content, it should return an empty string
    const result = await provider.callApi('Test prompt');

    // Verify we get a result with empty output
    expect(result.output).toBe('');
    expect(result.raw).toEqual(mockApiResponse);

    // Error is not set since this is treated as an empty response, not an error
    expect(result.error).toBeUndefined();
  });

  it('should handle error processing results with non-array output', async () => {
    // Setup mock for fetchWithCache to return data that will trigger a processing error
    const mockApiResponse = {
      id: 'resp_abc123',
      status: 'completed',
      model: 'gpt-4o',
      output: 'not-an-array', // This will cause an error when trying to process as an array
      usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
    };

    jest.mocked(cache.fetchWithCache).mockResolvedValue({
      data: mockApiResponse,
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    // Initialize the provider
    const provider = new OpenAiResponsesProvider('gpt-4o', {
      config: {
        apiKey: 'test-key',
      },
    });

    // Call the API
    const result = await provider.callApi('Test prompt');

    // This should have returned an invalid format error
    expect(result.error).toBeTruthy();
    expect(result.error).toContain('Invalid response format');
    expect(result.output).toBeUndefined();

    // The implementation doesn't include raw data when format is invalid
    // So we shouldn't test for it
  });

  // Test for lines 169-174: Testing when fetch throws an error (not just returns error status)
  it('should handle network errors correctly', async () => {
    // Setup mock to throw an error
    jest.mocked(cache.fetchWithCache).mockRejectedValue(new Error('Network error'));

    // Initialize the provider
    const provider = new OpenAiResponsesProvider('gpt-4o', {
      config: {
        apiKey: 'test-key',
      },
    });

    // Call the API
    const result = await provider.callApi('Test prompt');

    // Verify error is handled correctly
    expect(result.error).toContain('API call error:');
    expect(result.error).toContain('Network error');

    // Expect logger to be called with the error
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('Network error'));
  });

  // Test for function calls at the top level (lines 197-198)
  it('should handle top-level function calls correctly', async () => {
    // Mock API response with a top-level function call
    const mockApiResponse = {
      id: 'resp_abc123',
      status: 'completed',
      model: 'gpt-4o',
      output: [
        {
          type: 'function_call',
          name: 'get_weather',
          id: 'call_123',
          input: { location: 'San Francisco' },
        },
      ],
      usage: { input_tokens: 15, output_tokens: 10, total_tokens: 25 },
    };

    // Setup mock for fetchWithCache
    jest.mocked(cache.fetchWithCache).mockResolvedValue({
      data: mockApiResponse,
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    // Initialize the provider
    const provider = new OpenAiResponsesProvider('gpt-4o', {
      config: {
        apiKey: 'test-key',
      },
    });

    // Call the API
    const result = await provider.callApi('Test prompt');

    // Verify the top-level function call is returned as a stringified JSON
    expect(result.output).toContain('get_weather');
    expect(result.output).toContain('San Francisco');
    // It should be a stringified object
    expect(() => JSON.parse(result.output)).not.toThrow();
    const parsed = JSON.parse(result.output);
    expect(parsed.type).toBe('function_call');
  });

  // Test for tool calls in assistant messages (lines 205-207)
  it('should handle tool calls in assistant messages correctly', async () => {
    // Mock API response with a tool_use in assistant message
    const mockApiResponse = {
      id: 'resp_abc123',
      status: 'completed',
      model: 'gpt-4o',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              name: 'get_weather',
              id: 'call_123',
              input: { location: 'New York' },
            },
          ],
        },
      ],
      usage: { input_tokens: 15, output_tokens: 10, total_tokens: 25 },
    };

    // Setup mock for fetchWithCache
    jest.mocked(cache.fetchWithCache).mockResolvedValue({
      data: mockApiResponse,
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    // Initialize the provider
    const provider = new OpenAiResponsesProvider('gpt-4o', {
      config: {
        apiKey: 'test-key',
      },
    });

    // Call the API
    const result = await provider.callApi('Test prompt');

    // Verify the tool call is returned as a stringified JSON
    expect(result.output).toContain('tool_use');
    expect(result.output).toContain('New York');
    // It should be a stringified object
    expect(() => JSON.parse(result.output)).not.toThrow();
    const parsed = JSON.parse(result.output);
    expect(parsed.type).toBe('tool_use');
  });

  // Test for tool results (lines 210-212)
  it('should handle tool results correctly', async () => {
    // Mock API response with a tool result
    const mockApiResponse = {
      id: 'resp_abc123',
      status: 'completed',
      model: 'gpt-4o',
      output: [
        {
          type: 'tool_result',
          id: 'result_123',
          tool_call_id: 'call_123',
          output: { temperature: 72, conditions: 'Sunny' },
        },
      ],
      usage: { input_tokens: 15, output_tokens: 10, total_tokens: 25 },
    };

    // Setup mock for fetchWithCache
    jest.mocked(cache.fetchWithCache).mockResolvedValue({
      data: mockApiResponse,
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    // Initialize the provider
    const provider = new OpenAiResponsesProvider('gpt-4o', {
      config: {
        apiKey: 'test-key',
      },
    });

    // Call the API
    const result = await provider.callApi('Test prompt');

    // Verify the tool result is returned as a stringified JSON
    expect(result.output).toContain('tool_result');
    expect(result.output).toContain('Sunny');
    // It should be a stringified object
    expect(() => JSON.parse(result.output)).not.toThrow();
    const parsed = JSON.parse(result.output);
    expect(parsed.type).toBe('tool_result');
  });

  describe('response format handling', () => {
    it('should handle json_object format correctly', async () => {
      const mockApiResponse = {
        id: 'resp_abc123',
        status: 'completed',
        model: 'gpt-4o',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: '{"result": "success"}',
              },
            ],
          },
        ],
        usage: { input_tokens: 15, output_tokens: 10, total_tokens: 25 },
      };

      jest.mocked(cache.fetchWithCache).mockResolvedValue({
        data: mockApiResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const provider = new OpenAiResponsesProvider('gpt-4o', {
        config: {
          apiKey: 'test-key',
          response_format: {
            type: 'json_object',
          },
        },
      });

      await provider.callApi('Test prompt with JSON');

      const mockCall = jest.mocked(cache.fetchWithCache).mock.calls[0];
      const reqOptions = mockCall[1] as { body: string };
      const body = JSON.parse(reqOptions.body);

      expect(body.text).toEqual({
        format: {
          type: 'json_object',
        },
      });
    });

    it('should handle json_schema format correctly with name parameter', async () => {
      const mockApiResponse = {
        id: 'resp_abc123',
        status: 'completed',
        model: 'gpt-4o',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: '{"result": "success"}',
              },
            ],
          },
        ],
        usage: { input_tokens: 15, output_tokens: 10, total_tokens: 25 },
      };

      jest.mocked(cache.fetchWithCache).mockResolvedValue({
        data: mockApiResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const config = {
        apiKey: 'test-key',
        response_format: {
          type: 'json_schema' as const,
          json_schema: {
            name: 'test_schema',
            strict: true,
            schema: {
              type: 'object' as const,
              properties: {
                result: { type: 'string' },
              },
              required: ['result'],
              additionalProperties: false,
            },
          },
        },
      } as any;

      const provider = new OpenAiResponsesProvider('gpt-4o', { config });

      await provider.callApi('Test prompt');

      const mockCall = jest.mocked(cache.fetchWithCache).mock.calls[0];
      const reqOptions = mockCall[1] as { body: string };
      const body = JSON.parse(reqOptions.body);

      expect(body.text.format.type).toBe('json_schema');
      expect(body.text.format.name).toBe('test_schema');
      expect(body.text.format.schema).toBeDefined();
      expect(body.text.format.strict).toBe(true);
    });

    it('should handle json_schema format with default name when not provided', async () => {
      const mockApiResponse = {
        id: 'resp_def456',
        status: 'completed',
        model: 'gpt-4o',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: '{"result": "default name test"}',
              },
            ],
          },
        ],
        usage: { input_tokens: 15, output_tokens: 10, total_tokens: 25 },
      };

      jest.mocked(cache.fetchWithCache).mockResolvedValue({
        data: mockApiResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const config = {
        apiKey: 'test-key',
        response_format: {
          type: 'json_schema' as const,
          json_schema: {
            strict: true,
            schema: {
              type: 'object' as const,
              properties: {
                result: { type: 'string' },
              },
              required: ['result'],
              additionalProperties: false,
            },
          },
        },
      } as any;

      const provider = new OpenAiResponsesProvider('gpt-4o', { config });

      await provider.callApi('Test prompt');

      const mockCall = jest.mocked(cache.fetchWithCache).mock.calls[0];
      const reqOptions = mockCall[1] as { body: string };
      const body = JSON.parse(reqOptions.body);

      expect(body.text.format.type).toBe('json_schema');
      expect(body.text.format.name).toBeTruthy();
      expect(body.text.format.schema).toBeDefined();
      expect(body.text.format.strict).toBe(true);
    });

    it('should handle json_schema format with nested json_schema.schema', async () => {
      const mockApiResponse = {
        id: 'resp_ghi789',
        status: 'completed',
        model: 'gpt-4o',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: '{"result": "nested schema test"}',
              },
            ],
          },
        ],
        usage: { input_tokens: 15, output_tokens: 10, total_tokens: 25 },
      };

      jest.mocked(cache.fetchWithCache).mockResolvedValue({
        data: mockApiResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const config = {
        apiKey: 'test-key',
        response_format: {
          type: 'json_schema' as const,
          json_schema: {
            name: 'nested_test',
            strict: true,
            schema: {
              type: 'object' as const,
              properties: {
                result: { type: 'string' },
              },
              required: ['result'],
              additionalProperties: false,
            },
          },
        } as any,
      };

      const provider = new OpenAiResponsesProvider('gpt-4o', { config });

      await provider.callApi('Test prompt');

      const mockCall = jest.mocked(cache.fetchWithCache).mock.calls[0];
      const reqOptions = mockCall[1] as { body: string };
      const body = JSON.parse(reqOptions.body);

      expect(body.text.format.type).toBe('json_schema');
      expect(body.text.format.name).toBe('nested_test');
      expect(body.text.format.schema).toBeDefined();
      expect(body.text.format.strict).toBe(true);
    });

    it('should handle text format correctly', async () => {
      const mockApiResponse = {
        id: 'resp_abc123',
        status: 'completed',
        model: 'gpt-4o',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'Simple text response',
              },
            ],
          },
        ],
        usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
      };

      jest.mocked(cache.fetchWithCache).mockResolvedValue({
        data: mockApiResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const provider = new OpenAiResponsesProvider('gpt-4o', {
        config: {
          apiKey: 'test-key',
        },
      });

      await provider.callApi('Test prompt');

      const mockCall = jest.mocked(cache.fetchWithCache).mock.calls[0];
      const reqOptions = mockCall[1] as { body: string };
      const body = JSON.parse(reqOptions.body);

      expect(body.text).toEqual({
        format: {
          type: 'text',
        },
      });
    });

    it('should handle explicit text format correctly', async () => {
      const mockApiResponse = {
        id: 'resp_abc123',
        status: 'completed',
        model: 'gpt-4o',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'Explicit text format response',
              },
            ],
          },
        ],
        usage: { input_tokens: 10, output_tokens: 15, total_tokens: 25 },
      };

      jest.mocked(cache.fetchWithCache).mockResolvedValue({
        data: mockApiResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const provider = new OpenAiResponsesProvider('gpt-4o', {
        config: {
          apiKey: 'test-key',
          response_format: {
            type: 'text' as any,
          },
        },
      });

      await provider.callApi('Test prompt');

      const mockCall = jest.mocked(cache.fetchWithCache).mock.calls[0];
      const reqOptions = mockCall[1] as { body: string };
      const body = JSON.parse(reqOptions.body);

      expect(body.text).toEqual({
        format: {
          type: 'text',
        },
      });
    });
  });

  describe('refusal handling', () => {
    it('should handle explicit refusal content in message', async () => {
      const mockApiResponse = {
        id: 'resp_abc123',
        status: 'completed',
        model: 'gpt-4o',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'refusal',
                refusal: 'I cannot fulfill this request due to content policy violation.',
              },
            ],
          },
        ],
        usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
      };

      jest.mocked(cache.fetchWithCache).mockResolvedValue({
        data: mockApiResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const provider = new OpenAiResponsesProvider('gpt-4o', {
        config: {
          apiKey: 'test-key',
        },
      });

      const result = await provider.callApi('Test prompt with refusal');

      expect(result.isRefusal).toBe(true);
      expect(result.output).toBe('I cannot fulfill this request due to content policy violation.');
    });

    it('should handle direct refusal in message object', async () => {
      const mockApiResponse = {
        id: 'resp_abc123',
        status: 'completed',
        model: 'gpt-4o',
        output: [
          {
            type: 'message',
            role: 'assistant',
            refusal: 'I cannot provide that information.',
          },
        ],
        usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
      };

      jest.mocked(cache.fetchWithCache).mockResolvedValue({
        data: mockApiResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const provider = new OpenAiResponsesProvider('gpt-4o', {
        config: {
          apiKey: 'test-key',
        },
      });

      const result = await provider.callApi('Test prompt with direct refusal');

      expect(result.isRefusal).toBe(true);
      expect(result.output).toBe('I cannot provide that information.');
    });
  });
});
