import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache } from '../../src/cache';
import { createPopNowProvider, PopNowProvider } from '../../src/providers/popnow';
import * as fetchModule from '../../src/util/fetch/index';
import { mockProcessEnv } from '../util/utils';

const POPNOW_API_BASE = 'https://api.popnow.ai/v1';

vi.mock('../../src/util', async (importOriginal: any) => {
  return {
    ...(await importOriginal()),
    maybeLoadFromExternalFile: vi.fn((x: unknown) => x),
    renderVarsInObject: vi.fn((x: unknown) => x),
  };
});

vi.mock('../../src/util/fetch/index.ts');

const jsonResponse = (body: unknown, status = 200, statusText = 'OK') =>
  new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: new Headers({ 'Content-Type': 'application/json' }),
  });

describe('PopNow', () => {
  const mockedFetchWithRetries = vi.mocked(fetchModule.fetchWithRetries);

  afterEach(async () => {
    await clearCache();
    vi.clearAllMocks();
  });

  describe('PopNowProvider', () => {
    let restoreEnv: () => void;

    beforeEach(() => {
      restoreEnv = mockProcessEnv({ POPNOW_API_KEY: 'popnow-test-key' });
    });

    afterEach(() => {
      restoreEnv();
    });

    it('should initialize with correct model name', () => {
      const provider = new PopNowProvider('google/gemini-3.7-flash/chat', {});
      expect(provider.modelName).toBe('google/gemini-3.7-flash/chat');
    });

    it('should return correct id', () => {
      const provider = new PopNowProvider('google/gemini-3.7-flash/chat', {});
      expect(provider.id()).toBe('popnow:google/gemini-3.7-flash/chat');
    });

    it('should return correct string representation', () => {
      const provider = new PopNowProvider('google/gemini-3.7-flash/chat', {});
      expect(provider.toString()).toBe('[PopNow Provider google/gemini-3.7-flash/chat]');
    });

    it('should serialize to JSON correctly without API key', () => {
      const provider = new PopNowProvider('google/gemini-3.7-flash/chat', {
        config: {
          temperature: 0.7,
          max_tokens: 100,
        },
      });

      expect(provider.toJSON()).toEqual({
        provider: 'popnow',
        model: 'google/gemini-3.7-flash/chat',
        config: {
          temperature: 0.7,
          max_tokens: 100,
          apiKeyEnvar: 'POPNOW_API_KEY',
          apiBaseUrl: POPNOW_API_BASE,
        },
      });
    });

    it('should serialize to JSON correctly with API key redacted', () => {
      const provider = new PopNowProvider('google/gemini-3.7-flash/chat', {
        config: {
          apiKey: 'secret-api-key',
          temperature: 0.7,
        },
      });

      expect(provider.toJSON()).toEqual({
        provider: 'popnow',
        model: 'google/gemini-3.7-flash/chat',
        config: {
          apiKey: undefined,
          temperature: 0.7,
          apiKeyEnvar: 'POPNOW_API_KEY',
          apiBaseUrl: POPNOW_API_BASE,
        },
      });
    });

    it('should use default apiBaseUrl and apiKeyEnvar when not specified', () => {
      const provider = new PopNowProvider('google/gemini-3.7-flash/chat', {});
      expect(provider.config.apiBaseUrl).toBe(POPNOW_API_BASE);
      expect(provider.config.apiKeyEnvar).toBe('POPNOW_API_KEY');
    });

    it('should preserve custom apiBaseUrl and apiKeyEnvar overrides', () => {
      const restoreCustomEnv = mockProcessEnv({ CUSTOM_POPNOW_KEY: 'custom-test-key' });

      try {
        const provider = new PopNowProvider('google/gemini-3.7-flash/chat', {
          config: {
            apiBaseUrl: 'https://proxy.example.com/popnow/v1',
            apiKeyEnvar: 'CUSTOM_POPNOW_KEY',
          },
        });

        expect(provider.config.apiBaseUrl).toBe('https://proxy.example.com/popnow/v1');
        expect(provider.config.apiKeyEnvar).toBe('CUSTOM_POPNOW_KEY');
        expect(provider.getApiKey()).toBe('custom-test-key');
      } finally {
        restoreCustomEnv();
      }
    });

    it('should not fall back to OPENAI_API_KEY or forward the OpenAI organization', () => {
      const restore = mockProcessEnv({
        POPNOW_API_KEY: undefined,
        OPENAI_API_KEY: 'sk-openai-secret',
        OPENAI_ORGANIZATION: 'org-openai-secret',
      });
      try {
        const provider = new PopNowProvider('google/gemini-3.7-flash/chat', {});
        expect(provider.getApiKey()).toBeUndefined();
        expect(provider.getOrganization()).toBeUndefined();
      } finally {
        restore();
      }
    });

    it('should apply GPT-6 request rules to task-suffixed model ids', async () => {
      const provider = new PopNowProvider('openai/gpt-6.1-terra/chat', {
        config: { reasoning_effort: 'high' },
      });

      const { body } = await provider.getOpenAiBody('Test prompt');

      expect(body.model).toBe('openai/gpt-6.1-terra/chat');
      expect(body.reasoning_effort).toBe('high');
      expect(body.max_tokens).toBeUndefined();
    });

    it.each([
      ['anthropic/claude-sonnet-5.5/chat', undefined, false],
      ['google/gemini-3.7-flash/chat', 'anthropic/claude-sonnet-5.5/chat', false],
      ['anthropic/claude-sonnet-5.5/chat', 'google/gemini-3.7-flash/chat', true],
    ] as const)('handles sampling for %s with override %s', async (model, override, supported) => {
      const sampling = { temperature: 0.3, top_p: 0.7, top_k: 5 };
      const provider = new PopNowProvider(model, {
        config: { passthrough: { ...sampling, ...(override && { model: override }) } },
      });

      const { body } = await provider.getOpenAiBody('Test prompt');
      expect(body.model).toBe(override ?? model);
      if (supported) {
        expect(body).toMatchObject(sampling);
      } else {
        for (const field of Object.keys(sampling)) {
          expect(body).not.toHaveProperty(field);
        }
      }
    });

    it('should call the PopNow API and return output', async () => {
      const provider = new PopNowProvider('google/gemini-3.7-flash/chat', {});
      mockedFetchWithRetries.mockResolvedValueOnce(
        jsonResponse({
          choices: [{ message: { content: 'PopNow output' }, finish_reason: 'stop' }],
          usage: { total_tokens: 12, prompt_tokens: 5, completion_tokens: 7 },
        }),
      );

      const result = await provider.callApi('Test prompt');

      const [url, init] = mockedFetchWithRetries.mock.calls[0] ?? [];
      expect(url).toBe(`${POPNOW_API_BASE}/chat/completions`);
      expect((init as RequestInit | undefined)?.headers).toMatchObject({
        Authorization: 'Bearer popnow-test-key',
      });
      expect(result.output).toBe('PopNow output');
      expect(result.tokenUsage).toEqual({
        total: 12,
        prompt: 5,
        completion: 7,
        numRequests: 1,
      });
    });

    it('should call the configured apiBaseUrl instead of the default host', async () => {
      const customApiBaseUrl = 'https://proxy.example.com/popnow/v1';
      const provider = new PopNowProvider('google/gemini-3.7-flash/chat', {
        config: { apiBaseUrl: customApiBaseUrl },
      });
      mockedFetchWithRetries.mockResolvedValueOnce(
        jsonResponse({
          choices: [{ message: { content: 'Custom host output' }, finish_reason: 'stop' }],
          usage: { total_tokens: 8, prompt_tokens: 3, completion_tokens: 5 },
        }),
      );

      await provider.callApi('Test prompt');

      const [url] = mockedFetchWithRetries.mock.calls[0] ?? [];
      expect(url).toBe(`${customApiBaseUrl}/chat/completions`);
    });

    it('should surface API errors', async () => {
      const provider = new PopNowProvider('google/gemini-3.7-flash/chat', {});
      mockedFetchWithRetries.mockResolvedValueOnce(
        jsonResponse(
          {
            error: {
              message: 'Invalid request',
              type: 'invalid_request_error',
            },
          },
          400,
          'Bad Request',
        ),
      );

      const result = await provider.callApi('Test prompt');
      expect(result.error).toContain('400 Bad Request');
      expect(result.error).toContain('Invalid request');
    });

    it('should surface server errors', async () => {
      const provider = new PopNowProvider('google/gemini-3.7-flash/chat', {});
      mockedFetchWithRetries.mockResolvedValueOnce(
        jsonResponse(
          { error: { message: 'Upstream unavailable', type: 'server_error' } },
          500,
          'Internal Server Error',
        ),
      );

      const result = await provider.callApi('Test prompt');
      expect(result.error).toContain('500 Internal Server Error');
      expect(result.error).toContain('Upstream unavailable');
      expect(result.metadata?.http?.status).toBe(500);
    });

    it('should surface rate limit errors', async () => {
      const provider = new PopNowProvider('google/gemini-3.7-flash/chat', {});
      mockedFetchWithRetries.mockResolvedValueOnce(
        jsonResponse(
          { error: { message: 'Too many requests', type: 'rate_limit_error' } },
          429,
          'Too Many Requests',
        ),
      );

      const result = await provider.callApi('Test prompt');
      expect(result.error).toContain('429 Too Many Requests');
      expect(result.error).toContain('Too many requests');
      expect(result.metadata?.http?.status).toBe(429);
    });

    it('should surface request timeouts', async () => {
      const provider = new PopNowProvider('google/gemini-3.7-flash/chat', {});
      mockedFetchWithRetries.mockRejectedValueOnce(new Error('Request timed out after 5000 ms'));

      const result = await provider.callApi('Test prompt');
      expect(result.error).toContain('API call error');
      expect(result.error).toContain('Request timed out after 5000 ms');
    });

    it('should not price calls from the OpenAI catalog', async () => {
      const provider = new PopNowProvider('openai/gpt-6.1-terra/chat', {});
      mockedFetchWithRetries.mockResolvedValueOnce(
        jsonResponse({
          choices: [{ message: { content: 'PopNow output' }, finish_reason: 'stop' }],
          usage: { total_tokens: 12, prompt_tokens: 5, completion_tokens: 7 },
        }),
      );

      const result = await provider.callApi('Test prompt');
      expect(result.output).toBe('PopNow output');
      expect(result.cost).toBeUndefined();
    });

    it('should use cost rates set in the config', async () => {
      const provider = new PopNowProvider('openai/gpt-6.1-terra/chat', {
        config: { inputCost: 0.000001, outputCost: 0.000002 },
      });
      mockedFetchWithRetries.mockResolvedValueOnce(
        jsonResponse({
          choices: [{ message: { content: 'PopNow output' }, finish_reason: 'stop' }],
          usage: { total_tokens: 12, prompt_tokens: 5, completion_tokens: 7 },
        }),
      );

      const result = await provider.callApi('Test prompt');
      expect(result.cost).toBeCloseTo(0.000019, 10);
    });
  });

  describe('createPopNowProvider', () => {
    it('should create PopNow provider from provider path', () => {
      const provider = createPopNowProvider('popnow:google/gemini-3.7-flash/chat', {
        config: {
          config: { temperature: 0.5 },
        },
      });

      expect(provider).toBeInstanceOf(PopNowProvider);
      expect((provider as PopNowProvider).modelName).toBe('google/gemini-3.7-flash/chat');
    });

    it('should pass env overrides through provider creation', () => {
      const provider = createPopNowProvider('popnow:anthropic/claude-sonnet-5.5/chat', {
        config: {
          config: {
            apiKeyEnvar: 'POPNOW_API_KEY_OVERRIDE',
          },
        },
        env: {
          POPNOW_API_KEY_OVERRIDE: 'env-override-key',
        },
      }) as PopNowProvider;

      expect(provider.getApiKey()).toBe('env-override-key');
      expect(provider.id()).toBe('popnow:anthropic/claude-sonnet-5.5/chat');
    });

    it.each([
      'popnow:google/nano-banana-2.1/text-to-image',
      'popnow:openai/text-embedding-3-small/embedding',
      'popnow:openai/gpt-6.1-terra',
    ])('should reject non-chat model %s', (providerPath) => {
      expect(() => createPopNowProvider(providerPath)).toThrow(/only chat models/);
    });
  });
});
