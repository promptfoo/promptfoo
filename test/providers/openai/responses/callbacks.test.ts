// Load-bearing: registers shared vi.mock / beforeEach hooks before any
// module-under-test import below. See ./setup.ts for details.
import './setup';

import { describe, expect, it, vi } from 'vitest';
import * as cache from '../../../../src/cache';
import { OpenAiResponsesProvider } from '../../../../src/providers/openai/responses';

describe('OpenAiResponsesProvider function callbacks', () => {
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

      vi.mocked(cache.fetchWithCache).mockResolvedValue({
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

    it('should handle multiple function calls including status updates', async () => {
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

      vi.mocked(cache.fetchWithCache).mockResolvedValue({
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
      // With our fix, the first call returns "11" and second call returns JSON (due to empty args)
      // They should be joined with newline
      expect(result.output).toContain('11');
      expect(result.output).toContain('function_call');
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

      vi.mocked(cache.fetchWithCache).mockResolvedValue({
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

      vi.mocked(cache.fetchWithCache).mockResolvedValue({
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

    it('should handle single function call with empty arguments and status completed', async () => {
      const mockApiResponse = {
        id: 'resp_abc123',
        status: 'completed',
        model: 'gpt-4o',
        output: [
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

      vi.mocked(cache.fetchWithCache).mockResolvedValue({
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
      const parsedOutput = JSON.parse(result.output);
      expect(parsedOutput.type).toBe('function_call');
      expect(parsedOutput.name).toBe('addNumbers');
      expect(parsedOutput.status).toBe('no_arguments_provided');
      expect(parsedOutput.note).toContain('Consider using the correct Responses API tool format');
    });

    it('should handle function call with empty arguments but no status', async () => {
      const mockApiResponse = {
        id: 'resp_abc123',
        status: 'completed',
        model: 'gpt-4o',
        output: [
          {
            type: 'function_call',
            name: 'addNumbers',
            arguments: '{}',
            call_id: 'call_123',
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

      const provider = new OpenAiResponsesProvider('gpt-4o', {
        config: {
          apiKey: 'test-key',
          functionToolCallbacks: {
            addNumbers: async (args: string) => {
              const { a, b } = JSON.parse(args || '{}');
              return JSON.stringify((a || 0) + (b || 0));
            },
          },
        },
      });

      const result = await provider.callApi('Add numbers');

      expect(result.error).toBeUndefined();
      // Should execute callback since no status=completed, even with empty args
      expect(result.output).toBe('0');
    });

    it('should handle function call with status completed but non-empty arguments', async () => {
      const mockApiResponse = {
        id: 'resp_abc123',
        status: 'completed',
        model: 'gpt-4o',
        output: [
          {
            type: 'function_call',
            status: 'completed',
            name: 'addNumbers',
            arguments: '{"a": 10, "b": 15}',
            call_id: 'call_123',
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

      const result = await provider.callApi('Add 10 and 15');

      expect(result.error).toBeUndefined();
      // Should execute callback since arguments are not empty
      expect(result.output).toBe('25');
    });

    it('should handle multiple function calls with all empty arguments', async () => {
      const mockApiResponse = {
        id: 'resp_abc123',
        status: 'completed',
        model: 'gpt-4o',
        output: [
          {
            type: 'function_call',
            status: 'completed',
            name: 'addNumbers',
            arguments: '{}',
            call_id: 'call_123',
          },
          {
            type: 'function_call',
            status: 'completed',
            name: 'multiplyNumbers',
            arguments: '{}',
            call_id: 'call_456',
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

      const provider = new OpenAiResponsesProvider('gpt-4o', {
        config: {
          apiKey: 'test-key',
          functionToolCallbacks: {
            addNumbers: async (args: string) => {
              const { a, b } = JSON.parse(args);
              return JSON.stringify(a + b);
            },
            multiplyNumbers: async (args: string) => {
              const { a, b } = JSON.parse(args);
              return JSON.stringify(a * b);
            },
          },
        },
      });

      const result = await provider.callApi('Do math operations');

      expect(result.error).toBeUndefined();
      // Should contain both function call JSONs
      expect(result.output).toContain('addNumbers');
      expect(result.output).toContain('multiplyNumbers');
      expect(result.output).toContain('no_arguments_provided');
      // Should have newline separator
      expect(result.output).toContain('\n');
    });

    it('should handle function call with empty string arguments', async () => {
      const mockApiResponse = {
        id: 'resp_abc123',
        status: 'completed',
        model: 'gpt-4o',
        output: [
          {
            type: 'function_call',
            status: 'completed',
            name: 'greetUser',
            arguments: '',
            call_id: 'call_123',
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

      const provider = new OpenAiResponsesProvider('gpt-4o', {
        config: {
          apiKey: 'test-key',
          functionToolCallbacks: {
            greetUser: async (_args: string) => {
              return 'Hello!';
            },
          },
        },
      });

      const result = await provider.callApi('Greet the user');

      expect(result.error).toBeUndefined();
      // Empty string arguments should still execute the callback
      expect(result.output).toBe('Hello!');
    });

    it('should handle tool callback integration test with expected result format', async () => {
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

      vi.mocked(cache.fetchWithCache).mockResolvedValue({
        data: mockApiResponse,
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const provider = new OpenAiResponsesProvider('gpt-4o', {
        config: {
          temperature: 0,
          apiKey: 'test-key',
          tools: [
            {
              type: 'function',
              function: {
                name: 'addNumbers',
                description: 'Add two numbers together',
                parameters: {
                  type: 'object',
                  properties: {
                    a: { type: 'number' },
                    b: { type: 'number' },
                  },
                  required: ['a', 'b'],
                },
              },
            },
          ],
          tool_choice: 'auto',
          functionToolCallbacks: {
            addNumbers: async (parametersJsonString: string) => {
              const { a, b } = JSON.parse(parametersJsonString);
              return JSON.stringify(a + b);
            },
          },
        },
      });

      const result = await provider.callApi('Please add the following numbers together: 5 and 6');

      expect(result.error).toBeUndefined();
      expect(result.output).toBe('11');
    });
  });
});
