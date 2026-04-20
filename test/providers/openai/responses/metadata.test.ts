// Load-bearing: registers shared vi.mock / beforeEach hooks before any
// module-under-test import below. See ./setup.ts for details.
import './setup';

import { describe, expect, it, vi } from 'vitest';
import * as cache from '../../../../src/cache';
import { OpenAiResponsesProvider } from '../../../../src/providers/openai/responses';

describe('OpenAiResponsesProvider HTTP metadata', () => {
  it('should include HTTP metadata in response', async () => {
    const mockHeaders = {
      'content-type': 'application/json',
      'x-request-id': 'test-request-123',
      'x-litellm-model-group': 'gpt-4o',
    };
    const mockApiResponse = {
      id: 'resp_abc123',
      status: 'completed',
      model: 'gpt-4o',
      output: [
        {
          type: 'message',
          id: 'msg_abc123',
          status: 'completed',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Test response' }],
        },
      ],
      usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
    };

    vi.mocked(cache.fetchWithCache).mockResolvedValue({
      data: mockApiResponse,
      cached: false,
      status: 200,
      statusText: 'OK',
      headers: mockHeaders,
    });

    const provider = new OpenAiResponsesProvider('gpt-4o', {
      config: { apiKey: 'test-key' },
    });

    const result = await provider.callApi('Test prompt');

    expect(result.metadata).toBeDefined();
    expect(result.metadata?.http).toBeDefined();
    expect(result.metadata?.http?.status).toBe(200);
    expect(result.metadata?.http?.statusText).toBe('OK');
    expect(result.metadata?.http?.headers).toEqual(mockHeaders);
  });

  it('should include HTTP metadata in error response', async () => {
    vi.mocked(cache.fetchWithCache).mockResolvedValue({
      data: { error: { message: 'Rate limit exceeded' } },
      cached: false,
      status: 429,
      statusText: 'Too Many Requests',
      headers: { 'retry-after': '60' },
    });

    const provider = new OpenAiResponsesProvider('gpt-4o', {
      config: { apiKey: 'test-key' },
    });

    const result = await provider.callApi('Test prompt');

    expect(result.error).toBeDefined();
    expect(result.metadata?.http?.status).toBe(429);
    expect(result.metadata?.http?.statusText).toBe('Too Many Requests');
    expect(result.metadata?.http?.headers).toEqual({ 'retry-after': '60' });
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

    const result = await provider.callApi('Very long prompt that would be truncated');

    expect(result.raw).toHaveProperty('truncation');
    expect(result.raw.truncation.tokens_truncated).toBe(100);
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

    vi.mocked(cache.fetchWithCache).mockResolvedValue({
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
      undefined,
    );
  });
});
