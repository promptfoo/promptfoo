// Load-bearing: registers shared vi.mock / beforeEach hooks before any
// module-under-test import below. See ./setup.ts for details.
import './setup';

import { describe, expect, it, vi } from 'vitest';
import * as cache from '../../../../src/cache';
import { OpenAiResponsesProvider } from '../../../../src/providers/openai/responses';
import { setOpenAiEnv } from './setup';

describe('OpenAiResponsesProvider request building', () => {
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

    vi.mocked(cache.fetchWithCache).mockResolvedValue({
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

    vi.mocked(cache.fetchWithCache).mockResolvedValue({
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

    vi.mocked(cache.fetchWithCache).mockResolvedValue({
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

    const mockCall = vi.mocked(cache.fetchWithCache).mock.calls[0];
    const reqOptions = mockCall[1] as { body: string };
    const body = JSON.parse(reqOptions.body);

    expect(body.temperature).toBe(0.7);
    expect(body.top_p).toBe(0.9);
    expect(body.max_output_tokens).toBeDefined();
  });

  it('should correctly send temperature: 0 in the request body', async () => {
    const mockApiResponse = {
      id: 'resp_abc123',
      status: 'completed',
      model: 'gpt-4o',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Response' }],
        },
      ],
      usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
    };

    vi.mocked(cache.fetchWithCache).mockResolvedValue({
      data: mockApiResponse,
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    // Test that temperature: 0 is correctly sent (not filtered out by falsy check)
    const provider = new OpenAiResponsesProvider('gpt-4o', {
      config: {
        apiKey: 'test-key',
        temperature: 0,
      },
    });

    await provider.callApi('Test prompt');

    const mockCall = vi.mocked(cache.fetchWithCache).mock.calls[0];
    const reqOptions = mockCall[1] as { body: string };
    const body = JSON.parse(reqOptions.body);

    // temperature: 0 should be present in the request body
    expect(body.temperature).toBe(0);
    expect('temperature' in body).toBe(true);
  });

  it('should omit default temperature and max_output_tokens when omitDefaults is true', async () => {
    const provider = new OpenAiResponsesProvider('gpt-4o', {
      config: {
        apiKey: 'test-key',
        omitDefaults: true,
      },
    });

    const { body } = await provider.getOpenAiBody('Test prompt');

    expect(body.temperature).toBeUndefined();
    expect('temperature' in body).toBe(false);
    expect(body.max_output_tokens).toBeUndefined();
    expect('max_output_tokens' in body).toBe(false);
  });

  it('should use env defaults with omitDefaults when OPENAI env vars are set', async () => {
    setOpenAiEnv({
      OPENAI_TEMPERATURE: '0.5',
      OPENAI_MAX_TOKENS: '2048',
    });

    const provider = new OpenAiResponsesProvider('gpt-4o', {
      config: {
        apiKey: 'test-key',
        omitDefaults: true,
      },
    });

    const { body } = await provider.getOpenAiBody('Test prompt');

    expect(body.temperature).toBe(0.5);
    expect(body.max_output_tokens).toBe(2048);
  });

  it('should correctly send max_output_tokens: 0 in the request body when explicitly set', async () => {
    const mockApiResponse = {
      id: 'resp_abc123',
      status: 'completed',
      model: 'gpt-4o',
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Response' }],
        },
      ],
      usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
    };

    vi.mocked(cache.fetchWithCache).mockResolvedValue({
      data: mockApiResponse,
      cached: false,
      status: 200,
      statusText: 'OK',
    });

    // Test that max_output_tokens: 0 is correctly sent (not filtered out by falsy check)
    // Note: While max_output_tokens: 0 is impractical, it should still be sent if explicitly configured
    const provider = new OpenAiResponsesProvider('gpt-4o', {
      config: {
        apiKey: 'test-key',
        max_output_tokens: 0,
      },
    });

    await provider.callApi('Test prompt');

    const mockCall = vi.mocked(cache.fetchWithCache).mock.calls[0];
    const reqOptions = mockCall[1] as { body: string };
    const body = JSON.parse(reqOptions.body);

    // max_output_tokens: 0 should be present in the request body
    expect(body.max_output_tokens).toBe(0);
    expect('max_output_tokens' in body).toBe(true);
  });

  it('should strip max_tokens from passthrough for the responses API', async () => {
    const provider = new OpenAiResponsesProvider('gpt-4o', {
      config: {
        apiKey: 'test-key',
        max_output_tokens: 512,
        passthrough: { max_tokens: 16000 },
      },
    });

    const { body } = await provider.getOpenAiBody('Test prompt');

    expect(body).not.toHaveProperty('max_tokens');
    expect(body.max_output_tokens).toBe(512);
  });

  it('should forward prompt caching and include options', async () => {
    const provider = new OpenAiResponsesProvider('gpt-4o', {
      config: {
        apiKey: 'test-key',
        prompt_cache_key: 'shared-prefix',
        prompt_cache_retention: '24h',
        include: ['web_search_call.results', 'reasoning.encrypted_content'],
      },
    });

    const { body } = await provider.getOpenAiBody('Test prompt');

    expect(body.prompt_cache_key).toBe('shared-prefix');
    expect(body.prompt_cache_retention).toBe('24h');
    expect(body.include).toEqual(['web_search_call.results', 'reasoning.encrypted_content']);
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

    vi.mocked(cache.fetchWithCache).mockResolvedValue({
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
      undefined,
    );
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

    vi.mocked(cache.fetchWithCache).mockResolvedValue({
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

    const mockCall = vi.mocked(cache.fetchWithCache).mock.calls[0];
    const reqOptions = mockCall[1] as { body: string };
    const body = JSON.parse(reqOptions.body);

    expect(body.input).toBeDefined();

    const inputStr = JSON.stringify(body.input);
    expect(inputStr).toContain('You are a helpful assistant');
    expect(inputStr).toContain('Hello');
  });

  it('should format JSON schema correctly in request body', async () => {
    vi.mocked(cache.fetchWithCache).mockResolvedValue({
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

    expect(vi.mocked(cache.fetchWithCache).mock.calls.length).toBeGreaterThan(0);

    const mockCall = vi.mocked(cache.fetchWithCache).mock.calls[0];
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

    vi.mocked(cache.fetchWithCache).mockResolvedValue({
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

    const mockCall = vi.mocked(cache.fetchWithCache).mock.calls[0];
    const reqOptions = mockCall[1] as { body: string };
    const body = JSON.parse(reqOptions.body);

    expect(body.input).toEqual(objectInput);
  });
});
