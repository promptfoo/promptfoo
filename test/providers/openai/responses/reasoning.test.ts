// Load-bearing: registers shared vi.mock / beforeEach hooks before any
// module-under-test import below. See ./setup.ts for details.
import './setup';

import { describe, expect, it, vi } from 'vitest';
import * as cache from '../../../../src/cache';
import { OpenAiResponsesProvider } from '../../../../src/providers/openai/responses';
import { LONG_RUNNING_MODEL_TIMEOUT_MS } from '../../../../src/providers/shared';
import { setOpenAiEnv } from './setup';
import type { Mock } from 'vitest';

describe('OpenAiResponsesProvider reasoning models', () => {
  it('should prefer OPENAI_MAX_COMPLETION_TOKENS over OPENAI_MAX_TOKENS for reasoning models', async () => {
    setOpenAiEnv({
      OPENAI_MAX_COMPLETION_TOKENS: '4096',
      OPENAI_MAX_TOKENS: '2048',
    });

    const provider = new OpenAiResponsesProvider('o1-preview', {
      config: { apiKey: 'test-key' },
    });

    const { body } = await provider.getOpenAiBody('Test prompt');
    expect(body.max_output_tokens).toBe(4096);
  });

  it('should fall back to OPENAI_MAX_TOKENS for reasoning models when OPENAI_MAX_COMPLETION_TOKENS is unset', async () => {
    setOpenAiEnv({ OPENAI_MAX_TOKENS: '2048' });

    const provider = new OpenAiResponsesProvider('o1-preview', {
      config: { apiKey: 'test-key' },
    });

    const { body } = await provider.getOpenAiBody('Test prompt');
    expect(body.max_output_tokens).toBe(2048);
  });

  it('should not apply a hardcoded max_output_tokens default for reasoning models', async () => {
    const provider = new OpenAiResponsesProvider('o1-preview', {
      config: { apiKey: 'test-key' },
    });

    const { body } = await provider.getOpenAiBody('Test prompt');
    expect(body.max_output_tokens).toBeUndefined();
    expect('max_output_tokens' in body).toBe(false);
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
    vi.mocked(cache.fetchWithCache).mockResolvedValue({
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
      undefined,
    );

    // Assertions
    expect(result.error).toBeUndefined();
    expect(result.output).toBe('This is a response from o1-pro');
    // Just test that the total tokens is present, but don't test for reasoning tokens
    // as the implementation may handle these details differently
    expect(result.tokenUsage?.total).toBe(45);
  });

  it.each([
    { model: 'o3', reasoningEffort: 'high', maxOutputTokens: 2000 },
    { model: 'o3-pro', reasoningEffort: 'high', maxOutputTokens: 2000 },
    { model: 'o4-mini', reasoningEffort: 'medium', maxOutputTokens: 1000 },
    { model: 'codex-mini-latest', reasoningEffort: 'medium', maxOutputTokens: 1000 },
  ] as const)('should configure $model model correctly with reasoning parameters', async ({
    model,
    reasoningEffort,
    maxOutputTokens,
  }) => {
    const mockApiResponse = {
      id: 'resp_abc123',
      status: 'completed',
      model,
      output: [
        {
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'output_text',
              text: `Response from ${model} model`,
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

    const provider = new OpenAiResponsesProvider(model, {
      config: {
        apiKey: 'test-key',
        reasoning_effort: reasoningEffort,
        max_output_tokens: maxOutputTokens,
      },
    });

    await provider.callApi('Test prompt');

    const mockCall = vi.mocked(cache.fetchWithCache).mock.calls[0];
    const reqOptions = mockCall[1] as { body: string };
    const body = JSON.parse(reqOptions.body);

    expect(body.model).toBe(model);
    expect(body.reasoning).toEqual({ effort: reasoningEffort });
    expect(body.max_output_tokens).toBe(maxOutputTokens);
    expect(body.temperature).toBeUndefined();
  });

  describe('deep research model validation', () => {
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
      expect(cache.fetchWithCache).not.toHaveBeenCalled();
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

      (cache.fetchWithCache as Mock).mockResolvedValueOnce({
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
      expect(cache.fetchWithCache).not.toHaveBeenCalled();
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

      (cache.fetchWithCache as Mock).mockResolvedValueOnce({
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
        LONG_RUNNING_MODEL_TIMEOUT_MS,
        'json',
        undefined,
        undefined,
      );
    });

    it('should use longer timeout for gpt-5-pro models', async () => {
      const mockData = {
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Response complete' }],
          },
        ],
        usage: { input_tokens: 100, output_tokens: 200 },
      };

      (cache.fetchWithCache as Mock).mockResolvedValueOnce({
        data: mockData,
        status: 200,
        statusText: 'OK',
        cached: false,
      });

      const provider = new OpenAiResponsesProvider('gpt-5-pro', {
        config: {
          apiKey: 'test-key',
        },
      });

      await provider.callApi('Test prompt');

      // Check that fetchWithCache was called with 10-minute timeout
      expect(cache.fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        LONG_RUNNING_MODEL_TIMEOUT_MS,
        'json',
        undefined,
        undefined,
      );
    });

    it('should use longer timeout for gpt-5.2-pro models', async () => {
      const mockData = {
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Response complete' }],
          },
        ],
        usage: { input_tokens: 100, output_tokens: 200 },
      };

      (cache.fetchWithCache as Mock).mockResolvedValueOnce({
        data: mockData,
        status: 200,
        statusText: 'OK',
        cached: false,
      });

      const provider = new OpenAiResponsesProvider('gpt-5.2-pro', {
        config: {
          apiKey: 'test-key',
        },
      });

      await provider.callApi('Test prompt');

      expect(cache.fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        LONG_RUNNING_MODEL_TIMEOUT_MS,
        'json',
        undefined,
        undefined,
      );
    });

    it('should use longer timeout for gpt-5.4-pro models', async () => {
      const mockData = {
        output: [
          {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'Response complete' }],
          },
        ],
        usage: { input_tokens: 100, output_tokens: 200 },
      };

      (cache.fetchWithCache as Mock).mockResolvedValueOnce({
        data: mockData,
        status: 200,
        statusText: 'OK',
        cached: false,
      });

      const provider = new OpenAiResponsesProvider('gpt-5.4-pro', {
        config: {
          apiKey: 'test-key',
        },
      });

      await provider.callApi('Test prompt');

      expect(cache.fetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Object),
        LONG_RUNNING_MODEL_TIMEOUT_MS,
        'json',
        undefined,
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

      vi.mocked(cache.fetchWithCache).mockResolvedValue({
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

    vi.mocked(cache.fetchWithCache).mockResolvedValue({
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
});
