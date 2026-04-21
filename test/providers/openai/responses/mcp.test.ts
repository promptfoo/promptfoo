// Load-bearing: registers shared vi.mock / beforeEach hooks before any
// module-under-test import below. See ./setup.ts for details.
import './setup';

import { describe, expect, it, vi } from 'vitest';
import * as cache from '../../../../src/cache';
import { OpenAiResponsesProvider } from '../../../../src/providers/openai/responses';

describe('OpenAiResponsesProvider MCP request handling', () => {
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
              allowed_tools: ['ask_question'],
            },
          ],
        },
      });

      await provider.callApi('Test prompt');

      const mockCall = vi.mocked(cache.fetchWithCache).mock.calls[0];
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

      const mockCall = vi.mocked(cache.fetchWithCache).mock.calls[0];
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

      const mockCall = vi.mocked(cache.fetchWithCache).mock.calls[0];
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

      const mockCall = vi.mocked(cache.fetchWithCache).mock.calls[0];
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
});
