// Load-bearing: registers shared vi.mock / beforeEach hooks before any
// module-under-test import below. See ./setup.ts for details.
import './setup';

import { describe, expect, it, vi } from 'vitest';
import * as cache from '../../../../src/cache';
import { OpenAiResponsesProvider } from '../../../../src/providers/openai/responses';

describe('OpenAiResponsesProvider MCP assertions', () => {
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

      vi.mocked(cache.fetchWithCache).mockResolvedValue({
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
      const { handleIsValidOpenAiToolsCall } = await import('../../../../src/assertions/openai');
      const assertionResult = await handleIsValidOpenAiToolsCall({
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

      vi.mocked(cache.fetchWithCache).mockResolvedValue({
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
      const { handleIsValidOpenAiToolsCall } = await import('../../../../src/assertions/openai');
      const assertionResult = await handleIsValidOpenAiToolsCall({
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
});
