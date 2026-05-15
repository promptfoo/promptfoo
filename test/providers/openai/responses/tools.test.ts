// Load-bearing: registers shared vi.mock / beforeEach hooks before any
// module-under-test import below. See ./setup.ts for details.
import './setup';

import { describe, expect, it, vi } from 'vitest';
import * as cache from '../../../../src/cache';
import { OpenAiResponsesProvider } from '../../../../src/providers/openai/responses';

describe('OpenAiResponsesProvider tool handling', () => {
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

    vi.mocked(cache.fetchWithCache).mockResolvedValue({
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

    vi.mocked(cache.fetchWithCache).mockResolvedValue({
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
      undefined,
    );
  });

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
    vi.mocked(cache.fetchWithCache).mockResolvedValue({
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
    vi.mocked(cache.fetchWithCache).mockResolvedValue({
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
    vi.mocked(cache.fetchWithCache).mockResolvedValue({
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

  it('should include observable web and file search fees in responses cost', async () => {
    vi.mocked(cache.fetchWithCache).mockResolvedValue({
      data: {
        id: 'resp_cost123',
        status: 'completed',
        model: 'gpt-5-mini',
        output: [
          {
            type: 'web_search_call',
            action: { type: 'search', query: 'pricing' },
            status: 'completed',
          },
          {
            type: 'file_search_call',
            status: 'completed',
          },
        ],
        usage: {
          input_tokens: 1_000,
          output_tokens: 100,
          total_tokens: 1_100,
        },
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const provider = new OpenAiResponsesProvider('gpt-5-mini', {
      config: {
        apiKey: 'test-key',
        tools: [{ type: 'web_search_preview' }],
      },
    });

    const result = await provider.callApi('Search my files');

    expect(result.cost).toBeCloseTo((1_000 * 0.25 + 100 * 2) / 1e6 + 0.0125, 10);
  });

  it('should price observable web search fees from effective passthrough tools', async () => {
    vi.mocked(cache.fetchWithCache).mockResolvedValue({
      data: {
        id: 'resp_cost456',
        status: 'completed',
        model: 'gpt-4o',
        output: [
          {
            type: 'web_search_call',
            action: { type: 'search', query: 'pricing' },
            status: 'completed',
          },
        ],
        usage: {
          input_tokens: 0,
          output_tokens: 0,
          total_tokens: 0,
        },
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const provider = new OpenAiResponsesProvider('gpt-4o', {
      config: {
        apiKey: 'test-key',
        tools: [{ type: 'web_search_preview' }],
        passthrough: { tools: [{ type: 'web_search' }] },
      },
    });

    const result = await provider.callApi('Search the web');

    expect(result.cost).toBeCloseTo(0.01, 10);
  });

  it('should price from the tier returned by OpenAI rather than the requested tier', async () => {
    vi.mocked(cache.fetchWithCache).mockResolvedValue({
      data: {
        id: 'resp_priority123',
        status: 'completed',
        model: 'gpt-5-mini',
        service_tier: 'priority',
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Done' }],
          },
        ],
        usage: {
          input_tokens: 1_000,
          output_tokens: 100,
          total_tokens: 1_100,
        },
      },
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const provider = new OpenAiResponsesProvider('gpt-5-mini', {
      config: {
        apiKey: 'test-key',
        service_tier: 'flex',
      },
    });

    const result = await provider.callApi('Do the thing');

    expect(result.cost).toBeCloseTo((1_000 * 0.45 + 100 * 3.6) / 1e6, 10);
  });

  it('should not invent code-interpreter session fees from response output alone', async () => {
    const mockApiResponse = {
      id: 'resp_ci123',
      status: 'completed',
      model: 'gpt-5-mini',
      output: [
        {
          type: 'code_interpreter_call',
          container_id: 'cntr_a',
          status: 'completed',
        },
      ],
      usage: {
        input_tokens: 1_000,
        output_tokens: 100,
        total_tokens: 1_100,
      },
    };
    vi.mocked(cache.fetchWithCache).mockResolvedValue({
      data: mockApiResponse,
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    const provider = new OpenAiResponsesProvider('gpt-5-mini', {
      config: {
        apiKey: 'test-key',
        tools: [
          { type: 'code_interpreter', container: { type: 'auto', memory_limit: '4g' } } as any,
        ],
      },
    });

    const result = await provider.callApi('Use python');

    expect(result.cost).toBeCloseTo((1_000 * 0.25 + 100 * 2) / 1e6, 10);
  });
});
