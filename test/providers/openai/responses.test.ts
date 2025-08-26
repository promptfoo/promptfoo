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
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o3-pro');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-4o');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o3-mini');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-4.1');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-4.1-2025-04-14');
    // GPT-5 models
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5-chat-latest');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5-nano');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5-mini');
    // GPT-4.5 models deprecated as of 2025-07-14, removed from API
  });

  it('should support the latest o-series reasoning models', () => {
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o3');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o3-2025-04-16');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o4-mini');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o4-mini-2025-04-16');
  });

  it('should support gpt-4.1 and its variants', () => {
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-4.1');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-4.1-2025-04-14');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-4.1-mini');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain(
      'gpt-4.1-mini-2025-04-14',
    );
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-4.1-nano');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain(
      'gpt-4.1-nano-2025-04-14',
    );
  });

  it('should support gpt-5 and its variants', () => {
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5-chat-latest');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5-nano');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-5-mini');
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
      'json',
      undefined,
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
      'json',
      undefined,
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
      'json',
      undefined,
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
      'json',
      undefined,
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
      'json',
      undefined,
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
      'json',
      undefined,
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
      'json',
      undefined,
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
      'json',
      undefined,
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

    it('should handle external file loading for response_format correctly', () => {
      // Test that the provider can be configured with external file syntax
      // This verifies the type handling for external file references
      expect(() => {
        new OpenAiResponsesProvider('gpt-4o', {
          config: {
            apiKey: 'test-key',
            response_format: 'file://./response_format.json' as any,
          },
        });
      }).not.toThrow();
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

    it('should accept external file reference syntax for response_format', () => {
      // Test that the provider can be instantiated with external file syntax
      // without throwing type errors (using type assertion as needed)
      expect(() => {
        new OpenAiResponsesProvider('gpt-4o', {
          config: {
            apiKey: 'test-key',
            response_format: 'file://./schema.json' as any,
          },
        });
      }).not.toThrow();

      expect(() => {
        new OpenAiResponsesProvider('gpt-4o', {
          config: {
            apiKey: 'test-key',
            response_format: 'file://relative/path/schema.json' as any,
          },
        });
      }).not.toThrow();

      expect(() => {
        new OpenAiResponsesProvider('gpt-4o', {
          config: {
            apiKey: 'test-key',
            response_format: 'file:///absolute/path/schema.json' as any,
          },
        });
      }).not.toThrow();
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

  it('should configure o3 model correctly with reasoning parameters', async () => {
    const mockApiResponse = {
      id: 'resp_abc123',
      status: 'completed',
      model: 'o3',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: 'Response from o3 model',
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

    const provider = new OpenAiResponsesProvider('o3', {
      config: {
        apiKey: 'test-key',
        reasoning_effort: 'high',
        max_output_tokens: 2000,
      },
    });

    await provider.callApi('Test prompt');

    const mockCall = jest.mocked(cache.fetchWithCache).mock.calls[0];
    const reqOptions = mockCall[1] as { body: string };
    const body = JSON.parse(reqOptions.body);

    expect(body.model).toBe('o3');
    expect(body.reasoning).toEqual({ effort: 'high' });
    expect(body.max_output_tokens).toBe(2000);
    expect(body.temperature).toBeUndefined(); // o3 model should not have temperature
  });

  it('should configure o3-pro model correctly with reasoning parameters', async () => {
    const mockApiResponse = {
      id: 'resp_abc123',
      status: 'completed',
      model: 'o3-pro',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: 'Response from o3-pro model',
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

    const provider = new OpenAiResponsesProvider('o3-pro', {
      config: {
        apiKey: 'test-key',
        reasoning_effort: 'high',
        max_output_tokens: 2000,
      },
    });

    await provider.callApi('Test prompt');

    const mockCall = jest.mocked(cache.fetchWithCache).mock.calls[0];
    const reqOptions = mockCall[1] as { body: string };
    const body = JSON.parse(reqOptions.body);

    expect(body.model).toBe('o3-pro');
    expect(body.reasoning).toEqual({ effort: 'high' });
    expect(body.max_output_tokens).toBe(2000);
    expect(body.temperature).toBeUndefined(); // o3-pro model should not have temperature
  });

  it('should configure o4-mini model correctly with reasoning parameters', async () => {
    const mockApiResponse = {
      id: 'resp_abc123',
      status: 'completed',
      model: 'o4-mini',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: 'Response from o4-mini model',
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

    const provider = new OpenAiResponsesProvider('o4-mini', {
      config: {
        apiKey: 'test-key',
        reasoning_effort: 'medium',
        max_output_tokens: 1000,
      },
    });

    await provider.callApi('Test prompt');

    const mockCall = jest.mocked(cache.fetchWithCache).mock.calls[0];
    const reqOptions = mockCall[1] as { body: string };
    const body = JSON.parse(reqOptions.body);

    expect(body.model).toBe('o4-mini');
    expect(body.reasoning).toEqual({ effort: 'medium' });
    expect(body.max_output_tokens).toBe(1000);
    expect(body.temperature).toBeUndefined(); // o4-mini model should not have temperature
  });

  it('should configure codex-mini-latest model correctly with reasoning parameters', async () => {
    const mockApiResponse = {
      id: 'resp_abc123',
      status: 'completed',
      model: 'codex-mini-latest',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: 'Response from codex-mini-latest model',
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

    const provider = new OpenAiResponsesProvider('codex-mini-latest', {
      config: {
        apiKey: 'test-key',
        reasoning_effort: 'medium',
        max_output_tokens: 1000,
      },
    });

    await provider.callApi('Test prompt');

    const mockCall = jest.mocked(cache.fetchWithCache).mock.calls[0];
    const reqOptions = mockCall[1] as { body: string };
    const body = JSON.parse(reqOptions.body);

    expect(body.model).toBe('codex-mini-latest');
    expect(body.reasoning).toEqual({ effort: 'medium' });
    expect(body.max_output_tokens).toBe(1000);
    expect(body.temperature).toBeUndefined(); // codex-mini-latest model should not have temperature
  });

  describe('MCP (Model Context Protocol) support', () => {
    it('should include MCP tools in request body correctly', async () => {
      const mockApiResponse = {
        id: 'resp_abc123',
        status: 'completed',
        model: 'gpt-4.1',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'Response with MCP tools',
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

      const provider = new OpenAiResponsesProvider('gpt-4.1', {
        config: {
          apiKey: 'test-key',
          tools: [
            {
              type: 'mcp',
              server_label: 'deepwiki',
              server_url: 'https://mcp.deepwiki.com/mcp',
              require_approval: 'never',
              allowed_tools: ['ask_question'],
            },
          ],
        },
      });

      await provider.callApi('Test prompt');

      const mockCall = jest.mocked(cache.fetchWithCache).mock.calls[0];
      const reqOptions = mockCall[1] as { body: string };
      const body = JSON.parse(reqOptions.body);

      expect(body.tools).toBeDefined();
      expect(body.tools).toHaveLength(1);
      expect(body.tools[0]).toEqual({
        type: 'mcp',
        server_label: 'deepwiki',
        server_url: 'https://mcp.deepwiki.com/mcp',
        require_approval: 'never',
        allowed_tools: ['ask_question'],
      });
    });

    it('should handle MCP tools with authentication headers', async () => {
      const mockApiResponse = {
        id: 'resp_abc123',
        status: 'completed',
        model: 'gpt-4.1',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'Response with authenticated MCP tools',
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

      const provider = new OpenAiResponsesProvider('gpt-4.1', {
        config: {
          apiKey: 'test-key',
          tools: [
            {
              type: 'mcp',
              server_label: 'stripe',
              server_url: 'https://mcp.stripe.com',
              headers: {
                Authorization: 'Bearer sk-test_123',
              },
              require_approval: 'never',
            },
          ],
        },
      });

      await provider.callApi('Test prompt');

      const mockCall = jest.mocked(cache.fetchWithCache).mock.calls[0];
      const reqOptions = mockCall[1] as { body: string };
      const body = JSON.parse(reqOptions.body);

      expect(body.tools[0].headers).toEqual({
        Authorization: 'Bearer sk-test_123',
      });
    });

    it('should handle MCP list tools response correctly', async () => {
      const mockApiResponse = {
        id: 'resp_abc123',
        status: 'completed',
        model: 'gpt-4.1',
        output: [
          {
            type: 'mcp_list_tools',
            id: 'mcpl_123',
            server_label: 'deepwiki',
            tools: [
              {
                name: 'ask_question',
                input_schema: {
                  type: 'object',
                  properties: {
                    question: { type: 'string' },
                    repoName: { type: 'string' },
                  },
                  required: ['question', 'repoName'],
                },
              },
            ],
          },
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'I can help you search repositories.',
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

      const provider = new OpenAiResponsesProvider('gpt-4.1', {
        config: {
          apiKey: 'test-key',
          tools: [
            {
              type: 'mcp',
              server_label: 'deepwiki',
              server_url: 'https://mcp.deepwiki.com/mcp',
              require_approval: 'never',
            },
          ],
        },
      });

      const result = await provider.callApi('Test prompt');

      expect(result.output).toContain('MCP Tools from deepwiki');
      expect(result.output).toContain('ask_question');
      expect(result.output).toContain('I can help you search repositories.');
    });

    it('should handle MCP tool call response correctly', async () => {
      const mockApiResponse = {
        id: 'resp_abc123',
        status: 'completed',
        model: 'gpt-4.1',
        output: [
          {
            type: 'mcp_call',
            id: 'mcp_456',
            server_label: 'deepwiki',
            name: 'ask_question',
            arguments:
              '{"question":"What is MCP?","repoName":"modelcontextprotocol/modelcontextprotocol"}',
            output:
              'MCP (Model Context Protocol) is an open protocol that standardizes how applications provide tools and context to LLMs.',
            error: null,
          },
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'Based on the search results, MCP is a protocol for LLM integration.',
              },
            ],
          },
        ],
        usage: { input_tokens: 25, output_tokens: 20, total_tokens: 45 },
      };

      jest.mocked(cache.fetchWithCache).mockResolvedValue({
        data: mockApiResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const provider = new OpenAiResponsesProvider('gpt-4.1', {
        config: {
          apiKey: 'test-key',
        },
      });

      const result = await provider.callApi('Test prompt');

      expect(result.output).toContain('MCP Tool Result (ask_question)');
      expect(result.output).toContain('MCP (Model Context Protocol) is an open protocol');
      expect(result.output).toContain(
        'Based on the search results, MCP is a protocol for LLM integration.',
      );
    });

    it('should handle MCP tool call error correctly', async () => {
      const mockApiResponse = {
        id: 'resp_abc123',
        status: 'completed',
        model: 'gpt-4.1',
        output: [
          {
            type: 'mcp_call',
            id: 'mcp_456',
            server_label: 'deepwiki',
            name: 'ask_question',
            arguments: '{"question":"Invalid query"}',
            output: null,
            error: 'Repository not found',
          },
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'I encountered an error while searching.',
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

      const provider = new OpenAiResponsesProvider('gpt-4.1', {
        config: {
          apiKey: 'test-key',
        },
      });

      const result = await provider.callApi('Test prompt');

      expect(result.output).toContain('MCP Tool Error (ask_question)');
      expect(result.output).toContain('Repository not found');
      expect(result.output).toContain('I encountered an error while searching.');
    });

    it('should handle MCP approval request correctly', async () => {
      const mockApiResponse = {
        id: 'resp_abc123',
        status: 'completed',
        model: 'gpt-4.1',
        output: [
          {
            type: 'mcp_approval_request',
            id: 'mcpr_789',
            server_label: 'deepwiki',
            name: 'ask_question',
            arguments: '{"question":"What is the latest version?","repoName":"facebook/react"}',
          },
        ],
        usage: { input_tokens: 20, output_tokens: 5, total_tokens: 25 },
      };

      jest.mocked(cache.fetchWithCache).mockResolvedValue({
        data: mockApiResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const provider = new OpenAiResponsesProvider('gpt-4.1', {
        config: {
          apiKey: 'test-key',
          tools: [
            {
              type: 'mcp',
              server_label: 'deepwiki',
              server_url: 'https://mcp.deepwiki.com/mcp',
              // require_approval defaults to requiring approval
            },
          ],
        },
      });

      const result = await provider.callApi('Test prompt');

      expect(result.output).toContain('MCP Approval Required for deepwiki.ask_question');
      expect(result.output).toContain('facebook/react');
    });

    it('should handle mixed MCP and regular tools correctly', async () => {
      const mockApiResponse = {
        id: 'resp_abc123',
        status: 'completed',
        model: 'gpt-4.1',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'I have access to both MCP and regular tools.',
              },
            ],
          },
        ],
        usage: { input_tokens: 30, output_tokens: 15, total_tokens: 45 },
      };

      jest.mocked(cache.fetchWithCache).mockResolvedValue({
        data: mockApiResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const provider = new OpenAiResponsesProvider('gpt-4.1', {
        config: {
          apiKey: 'test-key',
          tools: [
            {
              type: 'function',
              function: {
                name: 'get_weather',
                description: 'Get weather information',
                parameters: {
                  type: 'object',
                  properties: {
                    location: { type: 'string' },
                  },
                  required: ['location'],
                },
              },
            },
            {
              type: 'mcp',
              server_label: 'deepwiki',
              server_url: 'https://mcp.deepwiki.com/mcp',
              require_approval: 'never',
            },
          ],
        },
      });

      await provider.callApi('Test prompt');

      const mockCall = jest.mocked(cache.fetchWithCache).mock.calls[0];
      const reqOptions = mockCall[1] as { body: string };
      const body = JSON.parse(reqOptions.body);

      expect(body.tools).toHaveLength(2);
      expect(body.tools[0].type).toBe('function');
      expect(body.tools[0].function.name).toBe('get_weather');
      expect(body.tools[1].type).toBe('mcp');
      expect(body.tools[1].server_label).toBe('deepwiki');
    });

    it('should handle MCP tool configuration with selective approval correctly', async () => {
      const mockApiResponse = {
        id: 'resp_abc123',
        status: 'completed',
        model: 'gpt-4.1',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'Response with selective approval MCP tools',
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

      const provider = new OpenAiResponsesProvider('gpt-4.1', {
        config: {
          apiKey: 'test-key',
          tools: [
            {
              type: 'mcp',
              server_label: 'deepwiki',
              server_url: 'https://mcp.deepwiki.com/mcp',
              require_approval: {
                never: {
                  tool_names: ['ask_question', 'read_wiki_structure'],
                },
              },
              allowed_tools: ['ask_question', 'read_wiki_structure', 'search_repo'],
            },
          ],
        },
      });

      await provider.callApi('Test prompt');

      const mockCall = jest.mocked(cache.fetchWithCache).mock.calls[0];
      const reqOptions = mockCall[1] as { body: string };
      const body = JSON.parse(reqOptions.body);

      expect(body.tools).toBeDefined();
      expect(body.tools).toHaveLength(1);
      expect(body.tools[0]).toEqual({
        type: 'mcp',
        server_label: 'deepwiki',
        server_url: 'https://mcp.deepwiki.com/mcp',
        require_approval: {
          never: {
            tool_names: ['ask_question', 'read_wiki_structure'],
          },
        },
        allowed_tools: ['ask_question', 'read_wiki_structure', 'search_repo'],
      });
    });
  });

  describe('Enhanced OpenAI tools assertion with MCP support', () => {
    it('should validate MCP tool success correctly', async () => {
      const mockApiResponse = {
        id: 'resp_abc123',
        status: 'completed',
        model: 'gpt-4.1',
        output: [
          {
            type: 'mcp_call',
            id: 'mcp_456',
            server_label: 'deepwiki',
            name: 'ask_question',
            arguments: '{"question":"What is MCP?"}',
            output: 'MCP is a protocol for LLM integration.',
            error: null,
          },
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'Based on the search results, MCP is a protocol for LLM integration.',
              },
            ],
          },
        ],
        usage: { input_tokens: 25, output_tokens: 20, total_tokens: 45 },
      };

      jest.mocked(cache.fetchWithCache).mockResolvedValue({
        data: mockApiResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const provider = new OpenAiResponsesProvider('gpt-4.1', {
        config: {
          apiKey: 'test-key',
          tools: [
            {
              type: 'mcp',
              server_label: 'deepwiki',
              server_url: 'https://mcp.deepwiki.com/mcp',
              require_approval: 'never',
            },
          ],
        },
      });

      const result = await provider.callApi('Test prompt');

      // The output should contain MCP Tool Result
      expect(result.output).toContain('MCP Tool Result (ask_question)');

      // Test the enhanced assertion
      const { handleIsValidOpenAiToolsCall } = await import('../../../src/assertions/openai');
      const assertionResult = handleIsValidOpenAiToolsCall({
        assertion: { type: 'is-valid-openai-tools-call' },
        output: result.output,
        provider,
        test: { vars: {} },
      } as any);

      expect(assertionResult.pass).toBe(true);
      expect(assertionResult.reason).toContain('MCP tool call succeeded for ask_question');
    });

    it('should validate MCP tool error correctly', async () => {
      const mockApiResponse = {
        id: 'resp_abc123',
        status: 'completed',
        model: 'gpt-4.1',
        output: [
          {
            type: 'mcp_call',
            id: 'mcp_456',
            server_label: 'deepwiki',
            name: 'ask_question',
            arguments: '{"question":"Invalid query"}',
            output: null,
            error: 'Repository not found',
          },
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'I encountered an error while searching.',
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

      const provider = new OpenAiResponsesProvider('gpt-4.1', {
        config: {
          apiKey: 'test-key',
        },
      });

      const result = await provider.callApi('Test prompt');

      // The output should contain MCP Tool Error
      expect(result.output).toContain('MCP Tool Error (ask_question)');

      // Test the enhanced assertion
      const { handleIsValidOpenAiToolsCall } = await import('../../../src/assertions/openai');
      const assertionResult = handleIsValidOpenAiToolsCall({
        assertion: { type: 'is-valid-openai-tools-call' },
        output: result.output,
        provider,
        test: { vars: {} },
      } as any);

      expect(assertionResult.pass).toBe(false);
      expect(assertionResult.reason).toContain(
        'MCP tool call failed for ask_question: Repository not found',
      );
    });
  });

  it('should include all expected model names', () => {
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-4o');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-4o-2024-08-06');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-4o-2024-11-20');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('gpt-4o-2024-05-13');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o1');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o1-2024-12-17');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o1-preview');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o1-preview-2024-09-12');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o1-mini');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o1-mini-2024-09-12');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o1-pro');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o1-pro-2025-03-19');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o3-pro');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o3-pro-2025-06-10');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o3');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o3-2025-04-16');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o4-mini');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o4-mini-2025-04-16');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o3-mini');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o3-mini-2025-01-31');
    // GPT-4.5 models deprecated as of 2025-07-14, removed from API
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('codex-mini-latest');
    // Deep research models
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o3-deep-research');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain(
      'o3-deep-research-2025-06-26',
    );
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain('o4-mini-deep-research');
    expect(OpenAiResponsesProvider.OPENAI_RESPONSES_MODEL_NAMES).toContain(
      'o4-mini-deep-research-2025-06-26',
    );
  });

  describe('deep research model validation', () => {
    beforeAll(() => {
      jest.mocked(cache.fetchWithCache).mockImplementation(
        () =>
          ({
            get: jest.fn(),
            set: jest.fn(),
          }) as any,
      );
    });

    it('should require web_search_preview tool for deep research models', async () => {
      const provider = new OpenAiResponsesProvider('o3-deep-research', {
        config: {
          apiKey: 'test-key',
          tools: [{ type: 'code_interpreter' } as any], // Missing web_search_preview
        },
      });

      const result = await provider.callApi('Test prompt');
      expect(result.error).toContain('requires the web_search_preview tool');
      expect(result.error).toContain('o3-deep-research');
    });

    it('should accept deep research models with web_search_preview tool', async () => {
      const mockData = {
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Research complete' }],
          },
        ],
        usage: { input_tokens: 100, output_tokens: 200 },
      };

      (cache.fetchWithCache as jest.Mock).mockResolvedValueOnce({
        data: mockData,
        status: 200,
        statusText: 'OK',
        cached: false,
      });

      const provider = new OpenAiResponsesProvider('o4-mini-deep-research', {
        config: {
          apiKey: 'test-key',
          tools: [{ type: 'web_search_preview' } as any],
        },
      });

      const result = await provider.callApi('Test prompt');
      expect(result.error).toBeUndefined();
      expect(result.output).toBe('Research complete');
    });

    it('should require MCP tools to have require_approval: never for deep research', async () => {
      const provider = new OpenAiResponsesProvider('o3-deep-research', {
        config: {
          apiKey: 'test-key',
          tools: [
            { type: 'web_search_preview' } as any,
            {
              type: 'mcp',
              server_label: 'test_server',
              server_url: 'http://test.com',
              require_approval: 'auto' as any, // Should be 'never'
            },
          ],
        },
      });

      const result = await provider.callApi('Test prompt');
      expect(result.error).toContain("requires MCP tools to have require_approval: 'never'");
    });

    it('should use longer timeout for deep research models', async () => {
      const mockData = {
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Research complete' }],
          },
        ],
        usage: { input_tokens: 100, output_tokens: 200 },
      };

      (cache.fetchWithCache as jest.Mock).mockResolvedValueOnce({
        data: mockData,
        status: 200,
        statusText: 'OK',
        cached: false,
      });

      const provider = new OpenAiResponsesProvider('o3-deep-research', {
        config: {
          apiKey: 'test-key',
          tools: [{ type: 'web_search_preview' } as any],
        },
      });

      await provider.callApi('Test prompt');

      // Check that fetchWithCache was called with 10-minute timeout
      expect(cache.fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        600000, // 10 minutes
        'json',
        undefined,
      );
    });

    it('should handle reasoning items with empty summary correctly', async () => {
      const mockData = {
        output: [
          {
            type: 'reasoning',
            summary: [], // Empty array (edge case)
          },
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'Final answer',
              },
            ],
          },
        ],
        usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
      };

      jest.mocked(cache.fetchWithCache).mockResolvedValue({
        data: mockData,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const provider = new OpenAiResponsesProvider('o3-deep-research', {
        config: {
          apiKey: 'test-key',
          tools: [{ type: 'web_search_preview' } as any],
        },
      });

      const result = await provider.callApi('Test prompt');

      // Should only include the valid reasoning summary and final answer
      expect(result.error).toBeUndefined();
      expect(result.output).toBe('Final answer');
      expect(result.output).not.toContain('Reasoning: []');
    });
  });

  it('should handle reasoning items with summary correctly', async () => {
    const mockData = {
      output: [
        {
          type: 'reasoning',
          summary: [{ type: 'summary_text', text: 'Valid reasoning summary' }],
        },
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Final answer' }],
        },
      ],
      usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
    };

    jest.mocked(cache.fetchWithCache).mockResolvedValue({
      data: mockData,
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
    expect(result.error).toBeUndefined();
    expect(result.output).toBe('Reasoning: Valid reasoning summary\nFinal answer');
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

    it('should handle external file loading for response_format correctly', () => {
      // Test that the provider can be configured with external file syntax
      // This verifies the type handling for external file references
      expect(() => {
        new OpenAiResponsesProvider('gpt-4o', {
          config: {
            apiKey: 'test-key',
            response_format: 'file://./response_format.json' as any,
          },
        });
      }).not.toThrow();
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

    it('should accept external file reference syntax for response_format', () => {
      // Test that the provider can be instantiated with external file syntax
      // without throwing type errors (using type assertion as needed)
      expect(() => {
        new OpenAiResponsesProvider('gpt-4o', {
          config: {
            apiKey: 'test-key',
            response_format: 'file://./schema.json' as any,
          },
        });
      }).not.toThrow();

      expect(() => {
        new OpenAiResponsesProvider('gpt-4o', {
          config: {
            apiKey: 'test-key',
            response_format: 'file://relative/path/schema.json' as any,
          },
        });
      }).not.toThrow();

      expect(() => {
        new OpenAiResponsesProvider('gpt-4o', {
          config: {
            apiKey: 'test-key',
            response_format: 'file:///absolute/path/schema.json' as any,
          },
        });
      }).not.toThrow();
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

  it('should configure o3 model correctly with reasoning parameters', async () => {
    const mockApiResponse = {
      id: 'resp_abc123',
      status: 'completed',
      model: 'o3',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: 'Response from o3 model',
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

    const provider = new OpenAiResponsesProvider('o3', {
      config: {
        apiKey: 'test-key',
        reasoning_effort: 'high',
        max_output_tokens: 2000,
      },
    });

    await provider.callApi('Test prompt');

    const mockCall = jest.mocked(cache.fetchWithCache).mock.calls[0];
    const reqOptions = mockCall[1] as { body: string };
    const body = JSON.parse(reqOptions.body);

    expect(body.model).toBe('o3');
    expect(body.reasoning).toEqual({ effort: 'high' });
    expect(body.max_output_tokens).toBe(2000);
    expect(body.temperature).toBeUndefined(); // o3 model should not have temperature
  });

  it('should configure o3-pro model correctly with reasoning parameters', async () => {
    const mockApiResponse = {
      id: 'resp_abc123',
      status: 'completed',
      model: 'o3-pro',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: 'Response from o3-pro model',
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

    const provider = new OpenAiResponsesProvider('o3-pro', {
      config: {
        apiKey: 'test-key',
        reasoning_effort: 'high',
        max_output_tokens: 2000,
      },
    });

    await provider.callApi('Test prompt');

    const mockCall = jest.mocked(cache.fetchWithCache).mock.calls[0];
    const reqOptions = mockCall[1] as { body: string };
    const body = JSON.parse(reqOptions.body);

    expect(body.model).toBe('o3-pro');
    expect(body.reasoning).toEqual({ effort: 'high' });
    expect(body.max_output_tokens).toBe(2000);
    expect(body.temperature).toBeUndefined(); // o3-pro model should not have temperature
  });

  it('should configure o4-mini model correctly with reasoning parameters', async () => {
    const mockApiResponse = {
      id: 'resp_abc123',
      status: 'completed',
      model: 'o4-mini',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: 'Response from o4-mini model',
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

    const provider = new OpenAiResponsesProvider('o4-mini', {
      config: {
        apiKey: 'test-key',
        reasoning_effort: 'medium',
        max_output_tokens: 1000,
      },
    });

    await provider.callApi('Test prompt');

    const mockCall = jest.mocked(cache.fetchWithCache).mock.calls[0];
    const reqOptions = mockCall[1] as { body: string };
    const body = JSON.parse(reqOptions.body);

    expect(body.model).toBe('o4-mini');
    expect(body.reasoning).toEqual({ effort: 'medium' });
    expect(body.max_output_tokens).toBe(1000);
    expect(body.temperature).toBeUndefined(); // o4-mini model should not have temperature
  });

  it('should configure codex-mini-latest model correctly with reasoning parameters', async () => {
    const mockApiResponse = {
      id: 'resp_abc123',
      status: 'completed',
      model: 'codex-mini-latest',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: 'Response from codex-mini-latest model',
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

    const provider = new OpenAiResponsesProvider('codex-mini-latest', {
      config: {
        apiKey: 'test-key',
        reasoning_effort: 'medium',
        max_output_tokens: 1000,
      },
    });

    await provider.callApi('Test prompt');

    const mockCall = jest.mocked(cache.fetchWithCache).mock.calls[0];
    const reqOptions = mockCall[1] as { body: string };
    const body = JSON.parse(reqOptions.body);

    expect(body.model).toBe('codex-mini-latest');
    expect(body.reasoning).toEqual({ effort: 'medium' });
    expect(body.max_output_tokens).toBe(1000);
    expect(body.temperature).toBeUndefined(); // codex-mini-latest model should not have temperature
  });

  describe('MCP (Model Context Protocol) support', () => {
    it('should include MCP tools in request body correctly', async () => {
      const mockApiResponse = {
        id: 'resp_abc123',
        status: 'completed',
        model: 'gpt-4.1',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'Response with MCP tools',
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

      const provider = new OpenAiResponsesProvider('gpt-4.1', {
        config: {
          apiKey: 'test-key',
          tools: [
            {
              type: 'mcp',
              server_label: 'deepwiki',
              server_url: 'https://mcp.deepwiki.com/mcp',
              require_approval: 'never',
              allowed_tools: ['ask_question'],
            },
          ],
        },
      });

      await provider.callApi('Test prompt');

      const mockCall = jest.mocked(cache.fetchWithCache).mock.calls[0];
      const reqOptions = mockCall[1] as { body: string };
      const body = JSON.parse(reqOptions.body);

      expect(body.tools).toBeDefined();
      expect(body.tools).toHaveLength(1);
      expect(body.tools[0]).toEqual({
        type: 'mcp',
        server_label: 'deepwiki',
        server_url: 'https://mcp.deepwiki.com/mcp',
        require_approval: 'never',
        allowed_tools: ['ask_question'],
      });
    });

    it('should handle MCP tools with authentication headers', async () => {
      const mockApiResponse = {
        id: 'resp_abc123',
        status: 'completed',
        model: 'gpt-4.1',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'Response with authenticated MCP tools',
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

      const provider = new OpenAiResponsesProvider('gpt-4.1', {
        config: {
          apiKey: 'test-key',
          tools: [
            {
              type: 'mcp',
              server_label: 'stripe',
              server_url: 'https://mcp.stripe.com',
              headers: {
                Authorization: 'Bearer sk-test_123',
              },
              require_approval: 'never',
            },
          ],
        },
      });

      await provider.callApi('Test prompt');

      const mockCall = jest.mocked(cache.fetchWithCache).mock.calls[0];
      const reqOptions = mockCall[1] as { body: string };
      const body = JSON.parse(reqOptions.body);

      expect(body.tools[0].headers).toEqual({
        Authorization: 'Bearer sk-test_123',
      });
    });

    it('should handle MCP list tools response correctly', async () => {
      const mockApiResponse = {
        id: 'resp_abc123',
        status: 'completed',
        model: 'gpt-4.1',
        output: [
          {
            type: 'mcp_list_tools',
            id: 'mcpl_123',
            server_label: 'deepwiki',
            tools: [
              {
                name: 'ask_question',
                input_schema: {
                  type: 'object',
                  properties: {
                    question: { type: 'string' },
                    repoName: { type: 'string' },
                  },
                  required: ['question', 'repoName'],
                },
              },
            ],
          },
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'I can help you search repositories.',
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

      const provider = new OpenAiResponsesProvider('gpt-4.1', {
        config: {
          apiKey: 'test-key',
          tools: [
            {
              type: 'mcp',
              server_label: 'deepwiki',
              server_url: 'https://mcp.deepwiki.com/mcp',
              require_approval: 'never',
            },
          ],
        },
      });

      const result = await provider.callApi('Test prompt');

      expect(result.output).toContain('MCP Tools from deepwiki');
      expect(result.output).toContain('ask_question');
      expect(result.output).toContain('I can help you search repositories.');
    });

    it('should handle MCP tool call response correctly', async () => {
      const mockApiResponse = {
        id: 'resp_abc123',
        status: 'completed',
        model: 'gpt-4.1',
        output: [
          {
            type: 'mcp_call',
            id: 'mcp_456',
            server_label: 'deepwiki',
            name: 'ask_question',
            arguments:
              '{"question":"What is MCP?","repoName":"modelcontextprotocol/modelcontextprotocol"}',
            output:
              'MCP (Model Context Protocol) is an open protocol that standardizes how applications provide tools and context to LLMs.',
            error: null,
          },
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'Based on the search results, MCP is a protocol for LLM integration.',
              },
            ],
          },
        ],
        usage: { input_tokens: 25, output_tokens: 20, total_tokens: 45 },
      };

      jest.mocked(cache.fetchWithCache).mockResolvedValue({
        data: mockApiResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const provider = new OpenAiResponsesProvider('gpt-4.1', {
        config: {
          apiKey: 'test-key',
        },
      });

      const result = await provider.callApi('Test prompt');

      expect(result.output).toContain('MCP Tool Result (ask_question)');
      expect(result.output).toContain('MCP (Model Context Protocol) is an open protocol');
      expect(result.output).toContain(
        'Based on the search results, MCP is a protocol for LLM integration.',
      );
    });

    it('should handle MCP tool call error correctly', async () => {
      const mockApiResponse = {
        id: 'resp_abc123',
        status: 'completed',
        model: 'gpt-4.1',
        output: [
          {
            type: 'mcp_call',
            id: 'mcp_456',
            server_label: 'deepwiki',
            name: 'ask_question',
            arguments: '{"question":"Invalid query"}',
            output: null,
            error: 'Repository not found',
          },
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'I encountered an error while searching.',
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

      const provider = new OpenAiResponsesProvider('gpt-4.1', {
        config: {
          apiKey: 'test-key',
        },
      });

      const result = await provider.callApi('Test prompt');

      expect(result.output).toContain('MCP Tool Error (ask_question)');
      expect(result.output).toContain('Repository not found');
      expect(result.output).toContain('I encountered an error while searching.');
    });

    it('should handle MCP approval request correctly', async () => {
      const mockApiResponse = {
        id: 'resp_abc123',
        status: 'completed',
        model: 'gpt-4.1',
        output: [
          {
            type: 'mcp_approval_request',
            id: 'mcpr_789',
            server_label: 'deepwiki',
            name: 'ask_question',
            arguments: '{"question":"What is the latest version?","repoName":"facebook/react"}',
          },
        ],
        usage: { input_tokens: 20, output_tokens: 5, total_tokens: 25 },
      };

      jest.mocked(cache.fetchWithCache).mockResolvedValue({
        data: mockApiResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const provider = new OpenAiResponsesProvider('gpt-4.1', {
        config: {
          apiKey: 'test-key',
          tools: [
            {
              type: 'mcp',
              server_label: 'deepwiki',
              server_url: 'https://mcp.deepwiki.com/mcp',
              // require_approval defaults to requiring approval
            },
          ],
        },
      });

      const result = await provider.callApi('Test prompt');

      expect(result.output).toContain('MCP Approval Required for deepwiki.ask_question');
      expect(result.output).toContain('facebook/react');
    });

    it('should handle mixed MCP and regular tools correctly', async () => {
      const mockApiResponse = {
        id: 'resp_abc123',
        status: 'completed',
        model: 'gpt-4.1',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'I have access to both MCP and regular tools.',
              },
            ],
          },
        ],
        usage: { input_tokens: 30, output_tokens: 15, total_tokens: 45 },
      };

      jest.mocked(cache.fetchWithCache).mockResolvedValue({
        data: mockApiResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const provider = new OpenAiResponsesProvider('gpt-4.1', {
        config: {
          apiKey: 'test-key',
          tools: [
            {
              type: 'function',
              function: {
                name: 'get_weather',
                description: 'Get weather information',
                parameters: {
                  type: 'object',
                  properties: {
                    location: { type: 'string' },
                  },
                  required: ['location'],
                },
              },
            },
            {
              type: 'mcp',
              server_label: 'deepwiki',
              server_url: 'https://mcp.deepwiki.com/mcp',
              require_approval: 'never',
            },
          ],
        },
      });

      await provider.callApi('Test prompt');

      const mockCall = jest.mocked(cache.fetchWithCache).mock.calls[0];
      const reqOptions = mockCall[1] as { body: string };
      const body = JSON.parse(reqOptions.body);

      expect(body.tools).toHaveLength(2);
      expect(body.tools[0].type).toBe('function');
      expect(body.tools[0].function.name).toBe('get_weather');
      expect(body.tools[1].type).toBe('mcp');
      expect(body.tools[1].server_label).toBe('deepwiki');
    });

    it('should handle MCP tool configuration with selective approval correctly', async () => {
      const mockApiResponse = {
        id: 'resp_abc123',
        status: 'completed',
        model: 'gpt-4.1',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'Response with selective approval MCP tools',
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

      const provider = new OpenAiResponsesProvider('gpt-4.1', {
        config: {
          apiKey: 'test-key',
          tools: [
            {
              type: 'mcp',
              server_label: 'deepwiki',
              server_url: 'https://mcp.deepwiki.com/mcp',
              require_approval: {
                never: {
                  tool_names: ['ask_question', 'read_wiki_structure'],
                },
              },
              allowed_tools: ['ask_question', 'read_wiki_structure', 'search_repo'],
            },
          ],
        },
      });

      await provider.callApi('Test prompt');

      const mockCall = jest.mocked(cache.fetchWithCache).mock.calls[0];
      const reqOptions = mockCall[1] as { body: string };
      const body = JSON.parse(reqOptions.body);

      expect(body.tools).toBeDefined();
      expect(body.tools).toHaveLength(1);
      expect(body.tools[0]).toEqual({
        type: 'mcp',
        server_label: 'deepwiki',
        server_url: 'https://mcp.deepwiki.com/mcp',
        require_approval: {
          never: {
            tool_names: ['ask_question', 'read_wiki_structure'],
          },
        },
        allowed_tools: ['ask_question', 'read_wiki_structure', 'search_repo'],
      });
    });
  });

  describe('Enhanced OpenAI tools assertion with MCP support', () => {
    it('should validate MCP tool success correctly', async () => {
      const mockApiResponse = {
        id: 'resp_abc123',
        status: 'completed',
        model: 'gpt-4.1',
        output: [
          {
            type: 'mcp_call',
            id: 'mcp_456',
            server_label: 'deepwiki',
            name: 'ask_question',
            arguments: '{"question":"What is MCP?"}',
            output: 'MCP is a protocol for LLM integration.',
            error: null,
          },
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'Based on the search results, MCP is a protocol for LLM integration.',
              },
            ],
          },
        ],
        usage: { input_tokens: 25, output_tokens: 20, total_tokens: 45 },
      };

      jest.mocked(cache.fetchWithCache).mockResolvedValue({
        data: mockApiResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const provider = new OpenAiResponsesProvider('gpt-4.1', {
        config: {
          apiKey: 'test-key',
          tools: [
            {
              type: 'mcp',
              server_label: 'deepwiki',
              server_url: 'https://mcp.deepwiki.com/mcp',
              require_approval: 'never',
            },
          ],
        },
      });

      const result = await provider.callApi('Test prompt');

      // The output should contain MCP Tool Result
      expect(result.output).toContain('MCP Tool Result (ask_question)');

      // Test the enhanced assertion
      const { handleIsValidOpenAiToolsCall } = await import('../../../src/assertions/openai');
      const assertionResult = handleIsValidOpenAiToolsCall({
        assertion: { type: 'is-valid-openai-tools-call' },
        output: result.output,
        provider,
        test: { vars: {} },
      } as any);

      expect(assertionResult.pass).toBe(true);
      expect(assertionResult.reason).toContain('MCP tool call succeeded for ask_question');
    });

    it('should validate MCP tool error correctly', async () => {
      const mockApiResponse = {
        id: 'resp_abc123',
        status: 'completed',
        model: 'gpt-4.1',
        output: [
          {
            type: 'mcp_call',
            id: 'mcp_456',
            server_label: 'deepwiki',
            name: 'ask_question',
            arguments: '{"question":"Invalid query"}',
            output: null,
            error: 'Repository not found',
          },
          {
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'output_text',
                text: 'I encountered an error while searching.',
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

      const provider = new OpenAiResponsesProvider('gpt-4.1', {
        config: {
          apiKey: 'test-key',
        },
      });

      const result = await provider.callApi('Test prompt');

      // The output should contain MCP Tool Error
      expect(result.output).toContain('MCP Tool Error (ask_question)');

      // Test the enhanced assertion
      const { handleIsValidOpenAiToolsCall } = await import('../../../src/assertions/openai');
      const assertionResult = handleIsValidOpenAiToolsCall({
        assertion: { type: 'is-valid-openai-tools-call' },
        output: result.output,
        provider,
        test: { vars: {} },
      } as any);

      expect(assertionResult.pass).toBe(false);
      expect(assertionResult.reason).toContain(
        'MCP tool call failed for ask_question: Repository not found',
      );
    });
  });

  describe('Function Tool Callbacks', () => {
    it('should execute function callbacks and return the result', async () => {
      const mockApiResponse = {
        id: 'resp_abc123',
        status: 'completed',
        model: 'gpt-4o',
        output: [
          {
            type: 'function_call',
            name: 'addNumbers',
            id: 'call_123',
            arguments: '{"a": 5, "b": 6}',
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

      const provider = new OpenAiResponsesProvider('gpt-4o', {
        config: {
          apiKey: 'test-key',
          functionToolCallbacks: {
            addNumbers: async (args: string) => {
              const { a, b } = JSON.parse(args);
              return JSON.stringify(a + b);
            },
          },
        },
      });

      const result = await provider.callApi('Add 5 and 6');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('11');
    });

    it('should skip status:completed messages from function calls', async () => {
      const mockApiResponse = {
        id: 'resp_abc123',
        status: 'completed',
        model: 'gpt-4o',
        output: [
          {
            type: 'function_call',
            name: 'addNumbers',
            id: 'call_123',
            arguments: '{"a": 5, "b": 6}',
          },
          {
            type: 'function_call',
            status: 'completed',
            name: 'addNumbers',
            arguments: '{}',
            call_id: 'call_123',
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

      const provider = new OpenAiResponsesProvider('gpt-4o', {
        config: {
          apiKey: 'test-key',
          functionToolCallbacks: {
            addNumbers: async (args: string) => {
              const { a, b } = JSON.parse(args);
              return JSON.stringify(a + b);
            },
          },
        },
      });

      const result = await provider.callApi('Add 5 and 6');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('11');
    });

    it('should fall back to raw function call when callback fails', async () => {
      const mockApiResponse = {
        id: 'resp_abc123',
        status: 'completed',
        model: 'gpt-4o',
        output: [
          {
            type: 'function_call',
            name: 'addNumbers',
            id: 'call_123',
            arguments: 'invalid json',
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

      const provider = new OpenAiResponsesProvider('gpt-4o', {
        config: {
          apiKey: 'test-key',
          functionToolCallbacks: {
            addNumbers: async (args: string) => {
              const { a, b } = JSON.parse(args); // This will throw
              return JSON.stringify(a + b);
            },
          },
        },
      });

      const result = await provider.callApi('Add numbers with invalid JSON');

      expect(result.error).toBeUndefined();
      const parsedOutput = JSON.parse(result.output);
      expect(parsedOutput.type).toBe('function_call');
      expect(parsedOutput.name).toBe('addNumbers');
      expect(parsedOutput.arguments).toBe('invalid json');
    });

    it('should handle function callbacks in assistant message content', async () => {
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
                type: 'function_call',
                name: 'multiplyNumbers',
                arguments: '{"a": 3, "b": 4}',
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

      const provider = new OpenAiResponsesProvider('gpt-4o', {
        config: {
          apiKey: 'test-key',
          functionToolCallbacks: {
            multiplyNumbers: async (args: string) => {
              const { a, b } = JSON.parse(args);
              return JSON.stringify(a * b);
            },
          },
        },
      });

      const result = await provider.callApi('Multiply 3 and 4');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('12');
    });
  });
});
