// Load-bearing: registers shared vi.mock / beforeEach hooks before any
// module-under-test import below. See ./setup.ts for details.
import './setup';

import { describe, expect, it, vi } from 'vitest';
import * as cache from '../../../../src/cache';
import { OpenAiResponsesProvider } from '../../../../src/providers/openai/responses';

describe('OpenAiResponsesProvider tool loading', () => {
  describe('tool loading from external files', () => {
    it('should return loaded tools array in config for downstream validation', async () => {
      const provider = new OpenAiResponsesProvider('gpt-4o', {
        config: {
          apiKey: 'test-key',
          tools: [{ type: 'web_search_preview' }],
        },
      });

      const context = { prompt: { raw: 'test', label: 'test' }, vars: {} };
      const { body, config } = await provider.getOpenAiBody('test prompt', context);

      // Verify tools are returned in both body and config
      expect(body.tools).toEqual([{ type: 'web_search_preview' }]);
      expect(config.tools).toEqual([{ type: 'web_search_preview' }]);
      expect(Array.isArray(config.tools)).toBe(true);
    });

    it('should return undefined tools when not configured', async () => {
      const provider = new OpenAiResponsesProvider('gpt-4o', {
        config: {
          apiKey: 'test-key',
        },
      });

      const context = { prompt: { raw: 'test', label: 'test' }, vars: {} };
      const { body, config } = await provider.getOpenAiBody('test prompt', context);

      expect(body.tools).toBeUndefined();
      expect(config.tools).toBeUndefined();
    });

    it('should throw clear error for Python tool files', async () => {
      const provider = new OpenAiResponsesProvider('gpt-4o', {
        config: {
          apiKey: 'test-key',
          tools: 'file://tools.py:get_tools' as any,
        },
      });

      const context = { prompt: { raw: 'test', label: 'test' }, vars: {} };
      await expect(provider.getOpenAiBody('test prompt', context)).rejects.toThrow(
        /Failed to load tools/,
      );
    });

    it('should allow deep-research validation to work with loaded tools', async () => {
      const provider = new OpenAiResponsesProvider('o4-mini-deep-research', {
        config: {
          apiKey: 'test-key',
          tools: [{ type: 'web_search_preview' }],
        },
      });

      // Mock the API call
      vi.mocked(cache.fetchWithCache).mockResolvedValue({
        data: {
          id: 'resp_123',
          object: 'response',
          status: 'completed',
          model: 'o4-mini-deep-research',
          output: [
            {
              type: 'message',
              content: [{ type: 'output_text', text: 'Response' }],
            },
          ],
          usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 },
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      // This should not throw TypeError because config.tools is now an array
      const result = await provider.callApi('test');
      expect(result.error).toBeUndefined();
    });

    it('should return error for deep-research without web_search_preview', async () => {
      const provider = new OpenAiResponsesProvider('o4-mini-deep-research', {
        config: {
          apiKey: 'test-key',
          tools: [
            {
              type: 'function',
              function: { name: 'test', parameters: { type: 'object', properties: {} } },
            },
          ],
        },
      });

      const result = await provider.callApi('test');

      expect(result.error).toContain('requires the web_search_preview tool');
    });
  });
});
