import { disableCache, enableCache, fetchWithCache } from '../../../src/cache';
import logger from '../../../src/logger';
import { OpenAiCompletionProvider } from '../../../src/providers/openai/completion';
import type { Prompt } from '../../../src/types';

jest.mock('../../../src/cache');
jest.mock('../../../src/logger');

const mockFetchWithCache = jest.mocked(fetchWithCache);

describe('OpenAI Provider', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    disableCache();
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

    const mockPrompt: Prompt = {
      raw: 'Test prompt',
      display: 'Test prompt',
      label: 'test',
    };

    it('should use default fetchWithCache when context.fetchWithCache not provided', async () => {
      mockFetchWithCache.mockResolvedValue(mockResponse);

      const provider = new OpenAiCompletionProvider('text-davinci-003');
      const result = await provider.callApi('Test prompt');

      expect(mockFetchWithCache).toHaveBeenCalledTimes(1);
      expect(result.output).toBe('Test output');
      expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5 });
    });

    it('should always use default fetchWithCache regardless of context', async () => {
      const mockContextFetch = jest.fn().mockResolvedValue(mockResponse);
      mockFetchWithCache.mockResolvedValue(mockResponse);

      const provider = new OpenAiCompletionProvider('text-davinci-003');
      const result = await provider.callApi('Test prompt', {
        fetchWithCache: mockContextFetch,
        prompt: mockPrompt,
        vars: {},
      });

      expect(mockFetchWithCache).toHaveBeenCalledTimes(1);
      expect(mockContextFetch).not.toHaveBeenCalled();
      expect(result.output).toBe('Test output');
      expect(result.tokenUsage).toEqual({ total: 10, prompt: 5, completion: 5 });
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
      mockFetchWithCache.mockRejectedValue(new Error('OpenAI API key is not set'));

      const provider = new OpenAiCompletionProvider('text-davinci-003', {
        config: {
          apiKeyRequired: true,
        },
        env: {
          OPENAI_API_KEY: undefined,
        },
      });

      const result = await provider.callApi('Test prompt');
      expect(result.error).toContain('API call error: Error: OpenAI API key is not set');
    });

    it('should warn about unknown model', () => {
      const warnSpy = jest.spyOn(logger, 'warn');

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
  });
});
