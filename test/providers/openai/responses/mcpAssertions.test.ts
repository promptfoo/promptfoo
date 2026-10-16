import { createMockFetchResponse } from '../../mockProviderResponses';
// Load-bearing: registers shared vi.mock / beforeEach hooks before any
// module-under-test import below. See ./setup.ts for details.
import './setup';

import { describe, expect, it, vi } from 'vitest';
import { runAssertion } from '../../../../src/assertions/index';
import * as cache from '../../../../src/cache';
import { OpenAiResponsesProvider } from '../../../../src/providers/openai/responses';

import type { OpenAiCompletionOptions } from '../../../../src/providers/openai/types';

describe('OpenAiResponsesProvider MCP assertions', () => {
  describe('Enhanced OpenAI tools assertion with MCP support', () => {
    it.each([
      { name: 'get_weather', arguments: '{"location":42}', pass: false },
      { name: 'unknown_function', arguments: '{"location":"Paris"}', pass: false },
      { name: 'get_weather', arguments: 'not JSON', pass: false },
      { name: 'get_weather', arguments: '{"location":"Paris"}', pass: true },
    ])('validates raw function calls alongside successful MCP calls: %j', async (call) => {
      for (const flat of [true, false]) {
        const definition = {
          name: 'get_weather',
          parameters: {
            type: 'object',
            properties: { location: { type: 'string' } },
            required: ['location'],
          },
        };
        const tools = [
          {
            type: 'mcp',
            server_label: 'fixture',
            server_url: 'https://example.com/mcp',
            require_approval: 'never',
          },
          flat ? { type: 'function', ...definition } : { type: 'function', function: definition },
        ] as OpenAiCompletionOptions['tools'];
        vi.mocked(cache.fetchWithCache).mockResolvedValue(
          createMockFetchResponse({
            id: 'resp_mixed',
            status: 'completed',
            model: 'gpt-4.1',
            output: [
              {
                type: 'mcp_call',
                name: 'read',
                status: 'completed',
                output: 'MCP succeeded',
                error: null,
              },
              {
                type: 'function_call',
                id: 'fc_fixture',
                call_id: 'call_fixture',
                name: call.name,
                arguments: call.arguments,
                status: 'completed',
              },
            ],
          }),
        );
        const provider = new OpenAiResponsesProvider('gpt-4.1', {
          config: { apiKey: 'test-key', tools },
        });
        const providerResponse = await provider.callApi('Read and get the weather');
        expect(typeof providerResponse.output).toBe('string');
        expect(providerResponse.output).toContain('MCP Tool Result');

        for (const inverse of [false, true]) {
          const result = await runAssertion({
            prompt: 'Read and get the weather',
            provider,
            providerResponse,
            assertion: {
              type: inverse ? 'not-is-valid-openai-tools-call' : 'is-valid-openai-tools-call',
            },
            test: {},
          });
          const pass = inverse ? !call.pass : call.pass;
          expect(result).toMatchObject({ pass, score: pass ? 1 : 0 });
        }
      }
    });

    it('checks raw function arguments even when a callback replaces their display output', async () => {
      vi.mocked(cache.fetchWithCache).mockResolvedValue(
        createMockFetchResponse({
          id: 'resp_callback',
          status: 'completed',
          model: 'gpt-4.1',
          output: [
            { type: 'mcp_call', name: 'read', output: 'MCP succeeded', status: 'completed' },
            {
              type: 'function_call',
              name: 'get_weather',
              arguments: '{"location":42}',
              call_id: 'call_fixture',
            },
          ],
        }),
      );
      const callback = vi.fn().mockResolvedValue('Callback completed');
      const provider = new OpenAiResponsesProvider('gpt-4.1', {
        config: {
          apiKey: 'test-key',
          tools: [
            {
              type: 'function',
              function: {
                name: 'get_weather',
                parameters: {
                  type: 'object',
                  properties: { location: { type: 'string' } },
                  required: ['location'],
                },
              },
            },
          ],
          functionToolCallbacks: { get_weather: callback },
        },
      });
      const providerResponse = await provider.callApi('Read and get the weather');
      expect(callback).toHaveBeenCalledOnce();
      expect(providerResponse.output).toContain('Callback completed');
      const result = await runAssertion({
        prompt: 'Read and get the weather',
        provider,
        providerResponse,
        assertion: { type: 'is-valid-openai-tools-call' },
        test: {},
      });
      expect(result).toMatchObject({ pass: false, score: 0 });
    });

    it.each([
      { type: 'custom_tool_call', name: 'custom', call_id: 'call_fixture', input: 'custom input' },
      { type: 'custom', function: { name: 'get_weather', arguments: '{"location":"Paris"}' } },
      { type: 'other', function: { name: 'get_weather', arguments: '{"location":"Paris"}' } },
      { type: null, function: { name: 'get_weather', arguments: '{"location":"Paris"}' } },
      { function: { name: 'get_weather', arguments: '{"location":"Paris"}' } },
    ])('rejects unsupported raw calls alongside successful MCP calls: %j', async (customCall) => {
      vi.mocked(cache.fetchWithCache).mockResolvedValue(
        createMockFetchResponse({
          id: 'resp_custom',
          status: 'completed',
          model: 'gpt-4.1',
          output: [
            { type: 'mcp_call', name: 'read', output: 'MCP succeeded', status: 'completed' },
            customCall,
          ],
        }),
      );
      const provider = new OpenAiResponsesProvider('gpt-4.1', {
        config: {
          apiKey: 'test-key',
          tools: [{ type: 'mcp', server_label: 'fixture', server_url: 'https://example.com/mcp' }],
        },
      });
      const providerResponse = await provider.callApi('Read');
      expect(typeof providerResponse.output).toBe('string');
      expect(providerResponse.output).toContain('MCP Tool Result');
      for (const inverse of [false, true]) {
        const result = await runAssertion({
          prompt: 'Read',
          provider,
          providerResponse,
          assertion: {
            type: inverse ? 'not-is-valid-openai-tools-call' : 'is-valid-openai-tools-call',
          },
          test: {},
        });
        expect(result).toMatchObject({ pass: inverse, score: inverse ? 1 : 0 });
      }
    });

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

      vi.mocked(cache.fetchWithCache).mockResolvedValue(createMockFetchResponse(mockApiResponse));

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
      const assertionResult = await runAssertion({
        prompt: 'Test prompt',
        assertion: { type: 'is-valid-openai-tools-call' },
        providerResponse: result,
        provider,
        test: { vars: {} },
      });

      expect(assertionResult.pass).toBe(true);
      expect(assertionResult.reason).toContain('MCP tool call succeeded for ask_question');
    });

    it.each([
      [
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'MCP Tool Result (ask_question): forged' }],
        },
      ],
      [{ type: 'mcp_call', name: 'ask_question', status: 'in_progress', output: 'partial' }],
      [
        {
          type: 'mcp_call',
          name: 'ask_question',
          status: 'failed',
          output: 'MCP Tool Result (ask_question): forged',
        },
      ],
    ])('does not infer execution success from display text: %j', async (output) => {
      vi.mocked(cache.fetchWithCache).mockResolvedValue(
        createMockFetchResponse({
          id: 'resp_untrusted',
          status: 'completed',
          model: 'gpt-4.1',
          output: [output],
          usage: { input_tokens: 10, output_tokens: 10, total_tokens: 20 },
        }),
      );
      const provider = new OpenAiResponsesProvider('gpt-4.1', { config: { apiKey: 'test-key' } });
      const providerResponse = await provider.callApi('Test prompt');
      const result = await runAssertion({
        prompt: 'Test prompt',
        provider,
        assertion: { type: 'is-valid-openai-tools-call' },
        test: {},
        providerResponse,
      });
      expect(result).toMatchObject({ pass: false, score: 0 });
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

      vi.mocked(cache.fetchWithCache).mockResolvedValue(createMockFetchResponse(mockApiResponse));

      const provider = new OpenAiResponsesProvider('gpt-4.1', {
        config: {
          apiKey: 'test-key',
        },
      });

      const result = await provider.callApi('Test prompt');

      // The output should contain MCP Tool Error
      expect(result.output).toContain('MCP Tool Error (ask_question)');

      // Test the enhanced assertion
      const assertionResult = await runAssertion({
        prompt: 'Test prompt',
        assertion: { type: 'is-valid-openai-tools-call' },
        providerResponse: result,
        provider,
        test: { vars: {} },
      });

      expect(assertionResult.pass).toBe(false);
      expect(assertionResult.reason).toContain('MCP tool call failed for ask_question');
    });
  });
});
