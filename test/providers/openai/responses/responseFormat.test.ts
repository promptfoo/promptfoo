// Load-bearing: registers shared vi.mock / beforeEach hooks before any
// module-under-test import below. See ./setup.ts for details.
import './setup';

import { describe, expect, it, vi } from 'vitest';
import * as cache from '../../../../src/cache';
import { OpenAiResponsesProvider } from '../../../../src/providers/openai/responses';

describe('OpenAiResponsesProvider response formats', () => {
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

      vi.mocked(cache.fetchWithCache).mockResolvedValue({
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

      const mockCall = vi.mocked(cache.fetchWithCache).mock.calls[0];
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

      vi.mocked(cache.fetchWithCache).mockResolvedValue({
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

      const mockCall = vi.mocked(cache.fetchWithCache).mock.calls[0];
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

      vi.mocked(cache.fetchWithCache).mockResolvedValue({
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

      const mockCall = vi.mocked(cache.fetchWithCache).mock.calls[0];
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

      vi.mocked(cache.fetchWithCache).mockResolvedValue({
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

      const mockCall = vi.mocked(cache.fetchWithCache).mock.calls[0];
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

      await provider.callApi('Test prompt');

      const mockCall = vi.mocked(cache.fetchWithCache).mock.calls[0];
      const reqOptions = mockCall[1] as { body: string };
      const body = JSON.parse(reqOptions.body);

      expect(body.text).toEqual({
        format: {
          type: 'text',
        },
      });
    });

    it('should handle external file loading for response_format correctly', async () => {
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

      vi.mocked(cache.fetchWithCache).mockResolvedValue({
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

      const mockCall = vi.mocked(cache.fetchWithCache).mock.calls[0];
      const reqOptions = mockCall[1] as { body: string };
      const body = JSON.parse(reqOptions.body);

      expect(body.text).toEqual({
        format: {
          type: 'text',
        },
      });
    });

    it('should accept external file reference syntax for response_format', async () => {
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
});
