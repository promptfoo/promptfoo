import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache } from '../../../src/cache';
import { GroqResponsesProvider } from '../../../src/providers/groq/index';
import * as fetchModule from '../../../src/util/fetch/index';

const GROQ_API_BASE = 'https://api.groq.com/openai/v1';

vi.mock('../../../src/util/fetch/index.ts');

describe('GroqResponsesProvider', () => {
  const mockedFetchWithRetries = vi.mocked(fetchModule.fetchWithRetries);

  beforeEach(() => {
    process.env.GROQ_API_KEY = 'test-key';
  });

  afterEach(async () => {
    delete process.env.GROQ_API_KEY;
    await clearCache();
    vi.clearAllMocks();
  });

  describe('constructor and identification', () => {
    it('should initialize with correct model name', () => {
      const provider = new GroqResponsesProvider('openai/gpt-oss-120b', {});
      expect(provider.modelName).toBe('openai/gpt-oss-120b');
    });

    it('should return correct id', () => {
      const provider = new GroqResponsesProvider('openai/gpt-oss-120b', {});
      expect(provider.id()).toBe('groq:responses:openai/gpt-oss-120b');
    });

    it('should return correct string representation', () => {
      const provider = new GroqResponsesProvider('openai/gpt-oss-120b', {});
      expect(provider.toString()).toBe('[Groq Responses Provider openai/gpt-oss-120b]');
    });

    it('should configure correct API base URL and key envar', () => {
      const provider = new GroqResponsesProvider('openai/gpt-oss-120b', {});
      expect(provider.config).toMatchObject({
        apiKeyEnvar: 'GROQ_API_KEY',
        apiBaseUrl: GROQ_API_BASE,
      });
    });
  });

  describe('reasoning model detection', () => {
    it('should identify gpt-oss as reasoning model', () => {
      const provider = new GroqResponsesProvider('openai/gpt-oss-120b', {});
      expect(provider['isReasoningModel']()).toBe(true);
    });

    it('should identify deepseek-r1 as reasoning model', () => {
      const provider = new GroqResponsesProvider('deepseek-r1-distill-llama-70b', {});
      expect(provider['isReasoningModel']()).toBe(true);
    });

    it('should identify qwen as reasoning model', () => {
      const provider = new GroqResponsesProvider('qwen/qwen3-32b', {});
      expect(provider['isReasoningModel']()).toBe(true);
    });

    it('should identify regular models as non-reasoning', () => {
      const provider = new GroqResponsesProvider('llama-3.3-70b-versatile', {});
      expect(provider['isReasoningModel']()).toBe(false);
    });
  });

  describe('temperature support', () => {
    it('should support temperature for gpt-oss models', () => {
      const provider = new GroqResponsesProvider('openai/gpt-oss-120b', {});
      expect(provider['supportsTemperature']()).toBe(true);
    });

    it('should support temperature for deepseek-r1 models', () => {
      const provider = new GroqResponsesProvider('deepseek-r1-distill-llama-70b', {});
      expect(provider['supportsTemperature']()).toBe(true);
    });

    it('should support temperature for qwen models', () => {
      const provider = new GroqResponsesProvider('qwen/qwen3-32b', {});
      expect(provider['supportsTemperature']()).toBe(true);
    });
  });

  describe('serialization', () => {
    it('should serialize to JSON correctly', () => {
      const provider = new GroqResponsesProvider('openai/gpt-oss-120b', {
        config: {
          temperature: 0.7,
        },
      });

      expect(provider.toJSON()).toEqual({
        provider: 'groq:responses',
        model: 'openai/gpt-oss-120b',
        config: {
          temperature: 0.7,
          apiKeyEnvar: 'GROQ_API_KEY',
          apiBaseUrl: GROQ_API_BASE,
        },
      });
    });

    it('should redact API key in serialization', () => {
      const provider = new GroqResponsesProvider('openai/gpt-oss-120b', {
        config: {
          apiKey: 'secret-key',
        },
      });

      const json = provider.toJSON();
      expect(json.config.apiKey).toBeUndefined();
    });
  });

  describe('callApi', () => {
    it('should call Groq Responses API endpoint', async () => {
      const provider = new GroqResponsesProvider('openai/gpt-oss-120b', {});

      const mockResponse = new Response(
        JSON.stringify({
          error: {
            message: 'Test error',
            type: 'test_error',
          },
        }),
        {
          status: 400,
          statusText: 'Bad Request',
          headers: new Headers({ 'Content-Type': 'application/json' }),
        },
      );
      mockedFetchWithRetries.mockResolvedValueOnce(mockResponse);

      const result = await provider.callApi('Test prompt');

      expect(mockedFetchWithRetries).toHaveBeenCalledWith(
        `${GROQ_API_BASE}/responses`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-key',
          }),
        }),
        expect.any(Number),
        undefined,
      );

      expect(result.error).toContain('400');
    });

    it('should process successful response', async () => {
      const provider = new GroqResponsesProvider('openai/gpt-oss-120b', {});

      const mockResponse = new Response(
        JSON.stringify({
          id: 'resp_123',
          model: 'openai/gpt-oss-120b',
          output: [
            {
              type: 'message',
              role: 'assistant',
              content: [
                {
                  type: 'output_text',
                  text: 'Hello, world!',
                },
              ],
            },
          ],
          usage: {
            input_tokens: 10,
            output_tokens: 5,
            total_tokens: 15,
          },
        }),
        {
          status: 200,
          statusText: 'OK',
          headers: new Headers({ 'Content-Type': 'application/json' }),
        },
      );
      mockedFetchWithRetries.mockResolvedValueOnce(mockResponse);

      const result = await provider.callApi('Test prompt');

      expect(result.output).toBe('Hello, world!');
      expect(result.tokenUsage).toEqual({
        total: 15,
        prompt: 10,
        completion: 5,
        numRequests: 1,
      });
    });

    it('should handle missing API key', async () => {
      delete process.env.GROQ_API_KEY;
      const originalOpenAIKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      try {
        const provider = new GroqResponsesProvider('openai/gpt-oss-120b', {});
        await expect(provider.callApi('Test prompt')).rejects.toThrow('API key is not set');
      } finally {
        // Restore OPENAI_API_KEY if it was set
        if (originalOpenAIKey) {
          process.env.OPENAI_API_KEY = originalOpenAIKey;
        }
      }
    });

    it('should handle network errors', async () => {
      const provider = new GroqResponsesProvider('openai/gpt-oss-120b', {});

      mockedFetchWithRetries.mockRejectedValueOnce(new Error('Network error'));

      const result = await provider.callApi('Test prompt');
      expect(result.error).toContain('Network error');
    });
  });
});
