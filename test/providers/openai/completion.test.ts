import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { disableCache, enableCache, fetchWithCache } from '../../../src/cache';
import logger from '../../../src/logger';
import { OpenAiCompletionProvider } from '../../../src/providers/openai/completion';
import { mockProcessEnv } from '../../util/utils';
import { getOpenAiMissingApiKeyMessage, restoreEnvVar } from './shared';

vi.mock('../../../src/cache');
vi.mock('../../../src/logger');

const mockFetchWithCache = vi.mocked(fetchWithCache);

describe('OpenAI Provider', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    disableCache();
    // Set a default API key for tests unless explicitly testing missing key
    mockProcessEnv({ OPENAI_API_KEY: 'test-api-key' });
  });

  afterEach(() => {
    enableCache();
  });

  describe('OpenAiCompletionProvider', () => {
    const mockResponse = {
      data: {
        choices: [{ text: 'Test output' }],
        usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
      },
      cached: false,
      status: 200,
      statusText: 'OK',
      severity: 'info',
    };

    it('should reject a Codex-only completion passthrough model override before dispatch', async () => {
      const provider = new OpenAiCompletionProvider('gpt-3.5-turbo-instruct', {
        config: { apiKey: 'test-key', passthrough: { model: 'gpt-5.3-codex-spark' } },
      });

      await expect(provider.callApi('Test prompt')).rejects.toThrow(
        'only available through openai:codex-sdk',
      );
      expect(mockFetchWithCache).not.toHaveBeenCalled();
    });

    it('should call API successfully with text completion', async () => {
      mockFetchWithCache.mockResolvedValue(mockResponse);

      const provider = new OpenAiCompletionProvider('text-davinci-003');
      const result = await provider.callApi('Test prompt');

      expect(mockFetchWithCache).toHaveBeenCalledTimes(1);
      expect(result.output).toBe('Test output');
      expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5, numRequests: 1 });
    });

    it.each([
      ['babbage-002', 0.4, 0.4],
      ['davinci-002', 2, 2],
      ['ft:babbage-002:company::model', 1.6, 1.6],
      ['ft:davinci-002:company::model', 12, 12],
    ])('should call and price supported Completions model %s', async (model, inputRate, outputRate) => {
      mockFetchWithCache.mockResolvedValueOnce({
        ...mockResponse,
        data: {
          choices: [{ text: 'Test output' }],
          usage: { total_tokens: 3_000, prompt_tokens: 2_000, completion_tokens: 1_000 },
        },
      });

      const result = await new OpenAiCompletionProvider(model).callApi('Test prompt');
      const request = mockFetchWithCache.mock.calls[0] as [string, { body: string }];

      expect(request[0]).toContain('/completions');
      expect(JSON.parse(request[1].body)).toMatchObject({ model, prompt: 'Test prompt' });
      expect(result.cost).toBeCloseTo((2_000 * inputRate + 1_000 * outputRate) / 1e6, 10);
    });

    it('should handle API errors', async () => {
      mockFetchWithCache.mockResolvedValue({
        data: {
          error: {
            message: 'Test error',
            type: 'test_error',
          },
        },
        cached: false,
        status: 400,
        statusText: 'Bad Request',
      });

      const provider = new OpenAiCompletionProvider('text-davinci-003');
      const result = await provider.callApi('Test prompt');

      expect(result.error).toBeDefined();
      expect(result.error).toContain('Test error');
    });

    it('should handle fetch errors', async () => {
      mockFetchWithCache.mockRejectedValue(new Error('Network error'));

      const provider = new OpenAiCompletionProvider('text-davinci-003');
      const result = await provider.callApi('Test prompt');

      expect(result.error).toBeDefined();
      expect(result.error).toContain('Network error');
    });

    it('should handle missing API key', async () => {
      // Save the original env var and clear it for this test
      const originalApiKey = process.env.OPENAI_API_KEY;
      mockProcessEnv({ OPENAI_API_KEY: undefined });

      try {
        const provider = new OpenAiCompletionProvider('text-davinci-003', {
          config: {
            apiKeyRequired: true,
          },
          env: {
            OPENAI_API_KEY: undefined,
          },
        });

        await expect(provider.callApi('Test prompt')).rejects.toThrow(
          getOpenAiMissingApiKeyMessage(),
        );
      } finally {
        restoreEnvVar('OPENAI_API_KEY', originalApiKey);
      }
    });

    it('should use custom apiKeyEnvar in missing API key errors', async () => {
      const originalApiKey = process.env.OPENAI_API_KEY;
      const originalCustomApiKey = process.env.CUSTOM_OPENAI_KEY;
      mockProcessEnv({ OPENAI_API_KEY: undefined });
      mockProcessEnv({ CUSTOM_OPENAI_KEY: undefined });

      try {
        const provider = new OpenAiCompletionProvider('text-davinci-003', {
          config: {
            apiKeyEnvar: 'CUSTOM_OPENAI_KEY',
          },
          env: {
            OPENAI_API_KEY: undefined,
            CUSTOM_OPENAI_KEY: undefined,
          },
        });

        await expect(provider.callApi('Test prompt')).rejects.toThrow(
          getOpenAiMissingApiKeyMessage('CUSTOM_OPENAI_KEY'),
        );
      } finally {
        restoreEnvVar('OPENAI_API_KEY', originalApiKey);
        restoreEnvVar('CUSTOM_OPENAI_KEY', originalCustomApiKey);
      }
    });

    it('should warn about unknown model', () => {
      const warnSpy = vi.spyOn(logger, 'warn');

      new OpenAiCompletionProvider('unknown-model');

      expect(warnSpy).toHaveBeenCalledWith(
        'FYI: Using unknown OpenAI completion model: unknown-model',
      );
      warnSpy.mockRestore();
    });

    it('should handle cached responses', async () => {
      mockFetchWithCache.mockResolvedValue({
        ...mockResponse,
        cached: true,
      });

      const provider = new OpenAiCompletionProvider('text-davinci-003');
      const result = await provider.callApi('Test prompt');

      expect(result.cached).toBe(true);
      expect(result.output).toBe('Test output');
    });

    it('should handle responses without usage information', async () => {
      mockFetchWithCache.mockResolvedValue({
        data: {
          choices: [{ text: 'Test output' }],
        },
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const provider = new OpenAiCompletionProvider('text-davinci-003');
      const result = await provider.callApi('Test prompt');

      expect(result.output).toBe('Test output');
      expect(result.tokenUsage).toEqual({});
    });

    it('should handle fetchWithCache returning undefined response', async () => {
      mockFetchWithCache.mockResolvedValue(undefined as any);

      const provider = new OpenAiCompletionProvider('text-davinci-003');
      const result = await provider.callApi('Test prompt');

      expect(mockFetchWithCache).toHaveBeenCalledTimes(1);
      expect(result.error).toContain('Cannot destructure property');
    });

    it('should pass custom headers from config', async () => {
      mockFetchWithCache.mockResolvedValue(mockResponse);

      const customHeaders = {
        'X-Test-Header': 'test-value',
      };

      const provider = new OpenAiCompletionProvider('text-davinci-003', {
        config: {
          headers: customHeaders,
        },
      });

      await provider.callApi('Test prompt');

      expect(mockFetchWithCache).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-OpenAI-Originator': 'promptfoo',
            'X-Test-Header': 'test-value',
          }),
        }),
        expect.any(Number),
        'json',
        undefined,
        undefined,
      );
    });

    it('should pass passthrough config fields in body', async () => {
      mockFetchWithCache.mockResolvedValue(mockResponse);

      const provider = new OpenAiCompletionProvider('text-davinci-003', {
        config: {
          passthrough: { logprobs: 3 },
        },
      });

      await provider.callApi('Test prompt');

      const actualCall = mockFetchWithCache.mock.calls[0];
      const body = JSON.parse(actualCall[1]?.body as string);
      expect(body.logprobs).toBe(3);
    });

    it('should handle response parsing errors', async () => {
      mockFetchWithCache.mockResolvedValue({
        data: {}, // Missing choices array
        cached: false,
        status: 200,
        statusText: 'OK',
      });

      const provider = new OpenAiCompletionProvider('text-davinci-003');
      const result = await provider.callApi('Test prompt');

      expect(result.error).toMatch(/API error:/);
    });

    it('should handle invalid OPENAI_STOP env var', async () => {
      mockProcessEnv({ OPENAI_STOP: '{invalid json}' });

      const provider = new OpenAiCompletionProvider('text-davinci-003', {
        config: {
          apiKey: 'test-api-key',
        },
      });

      await expect(provider.callApi('test')).rejects.toThrow(
        /OPENAI_STOP is not a valid JSON string/,
      );

      mockProcessEnv({ OPENAI_STOP: undefined });
    });
  });
});
