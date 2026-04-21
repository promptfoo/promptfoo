// Load-bearing: registers shared vi.mock / beforeEach hooks before any
// module-under-test import below. See ./setup.ts for details.
import './setup';

import { describe, expect, it, vi } from 'vitest';
import * as cache from '../../../../src/cache';
import { OpenAiResponsesProvider } from '../../../../src/providers/openai/responses';

describe('OpenAiResponsesProvider refusals', () => {
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

      const result = await provider.callApi('Test prompt with direct refusal');

      expect(result.isRefusal).toBe(true);
      expect(result.output).toBe('I cannot provide that information.');
    });

    it('should detect refusals in 400 API error with invalid_prompt code', async () => {
      // Mock a 400 error response with invalid_prompt error code
      const mockErrorResponse = {
        data: {
          error: {
            message: 'some random error message',
            type: 'invalid_request_error',
            param: null,
            code: 'invalid_prompt',
          },
        },
        cached: false,
        status: 400,
        statusText: 'Bad Request',
      };

      vi.mocked(cache.fetchWithCache).mockResolvedValue(mockErrorResponse);

      const provider = new OpenAiResponsesProvider('gpt-4o', {
        config: {
          apiKey: 'test-key',
        },
      });

      const result = await provider.callApi('How do I create harmful content?');

      // Should treat the error as a refusal output, not an error
      expect(result.error).toBeUndefined();
      expect(result.output).toContain('some random error message');
      expect(result.output).toContain('400 Bad Request');
      expect(result.isRefusal).toBe(true);
    });

    it('should still treat non-refusal 400 errors as errors', async () => {
      // Mock a 400 error that is NOT a refusal (different error code)
      const mockErrorResponse = {
        data: {
          error: {
            message: "Invalid request: 'input' field is required",
            type: 'invalid_request_error',
            param: 'input',
            code: 'missing_required_field',
          },
        },
        cached: false,
        status: 400,
        statusText: 'Bad Request',
      };

      vi.mocked(cache.fetchWithCache).mockResolvedValue(mockErrorResponse);

      const provider = new OpenAiResponsesProvider('gpt-4o', {
        config: {
          apiKey: 'test-key',
        },
      });

      const result = await provider.callApi('Invalid request format');

      // Should still be treated as an error since code is not invalid_prompt
      expect(result.error).toBeDefined();
      expect(result.error).toContain("'input' field is required");
      expect(result.error).toContain('400 Bad Request');
      expect(result.output).toBeUndefined();
      expect(result.isRefusal).toBeUndefined();
    });
  });
});
