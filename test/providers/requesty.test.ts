import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearCache } from '../../src/cache';
import { createRequestyProvider, RequestyProvider } from '../../src/providers/requesty';
import * as fetchModule from '../../src/util/fetch/index';
import { mockProcessEnv } from '../util/utils';

const REQUESTY_API_BASE = 'https://router.requesty.ai/v1';

vi.mock('../../src/util', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    maybeLoadFromExternalFile: vi.fn((x) => x),
    renderVarsInObject: vi.fn((x) => x),
  };
});

vi.mock('../../src/util/fetch/index');

function jsonResponse(body: unknown, status = 200, statusText = 'OK') {
  return new Response(JSON.stringify(body), {
    status,
    statusText,
    headers: new Headers({ 'Content-Type': 'application/json' }),
  });
}

const OK_COMPLETION = {
  choices: [{ message: { content: 'Test output' }, finish_reason: 'stop' }],
  usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
};

describe('Requesty', () => {
  const mockedFetchWithRetries = vi.mocked(fetchModule.fetchWithRetries);

  afterEach(async () => {
    await clearCache();
    vi.clearAllMocks();
  });

  describe('RequestyProvider', () => {
    const provider = new RequestyProvider('openai/gpt-4o-mini', {});

    it('initializes with correct model name', () => {
      expect(provider.modelName).toBe('openai/gpt-4o-mini');
    });

    it('returns correct id', () => {
      expect(provider.id()).toBe('requesty:openai/gpt-4o-mini');
    });

    it('returns correct string representation', () => {
      expect(provider.toString()).toBe('[Requesty Provider openai/gpt-4o-mini]');
    });

    it('serializes to JSON correctly', () => {
      const p = new RequestyProvider('anthropic/claude-sonnet-4-5', {
        config: { temperature: 0.7, max_tokens: 100 },
      });

      expect(p.toJSON()).toEqual({
        provider: 'requesty',
        model: 'anthropic/claude-sonnet-4-5',
        config: {
          temperature: 0.7,
          max_tokens: 100,
          apiKeyEnvar: 'REQUESTY_API_KEY',
          apiBaseUrl: REQUESTY_API_BASE,
          headers: {
            'HTTP-Referer': 'https://promptfoo.dev/',
            'X-Title': 'promptfoo',
          },
          passthrough: {},
        },
      });
    });

    it('redacts inline API keys when serializing to JSON', () => {
      const p = new RequestyProvider('openai/gpt-4o-mini', {
        config: { apiKey: 'secret-key' },
      });
      expect(p.toJSON().config.apiKey).toBeUndefined();
    });

    it('lets user-supplied headers override attribution defaults', () => {
      const p = new RequestyProvider('openai/gpt-4o-mini', {
        config: { headers: { 'X-Title': 'my-app', 'X-Custom': 'foo' } },
      });
      expect(p.config.headers).toEqual({
        'HTTP-Referer': 'https://promptfoo.dev/',
        'X-Title': 'my-app',
        'X-Custom': 'foo',
      });
    });

    it('falls back to the default apiBaseUrl and apiKeyEnvar when none are configured', () => {
      const p = new RequestyProvider('openai/gpt-4o-mini', {});
      expect(p.config.apiBaseUrl).toBe(REQUESTY_API_BASE);
      expect(p.config.apiKeyEnvar).toBe('REQUESTY_API_KEY');
    });

    it('falls back to the default when apiBaseUrl or apiKeyEnvar is an empty string', () => {
      const p = new RequestyProvider('openai/gpt-4o-mini', {
        config: { apiBaseUrl: '', apiKeyEnvar: '' },
      });
      expect(p.config.apiBaseUrl).toBe(REQUESTY_API_BASE);
      expect(p.config.apiKeyEnvar).toBe('REQUESTY_API_KEY');
    });

    it('does not fall back to OPENAI_API_KEY when REQUESTY_API_KEY is unset', () => {
      const restoreEnv = mockProcessEnv({
        OPENAI_API_KEY: 'openai-secret',
        REQUESTY_API_KEY: undefined,
      });
      try {
        const p = new RequestyProvider('openai/gpt-4o-mini', {});
        expect(p.getApiKey()).toBeUndefined();
      } finally {
        restoreEnv();
      }
    });

    it('prefers provider env overrides over process API keys', () => {
      const restoreEnv = mockProcessEnv({ REQUESTY_API_KEY: 'global-test-key' });
      try {
        const p = new RequestyProvider('openai/gpt-4o-mini', {
          env: { REQUESTY_API_KEY: 'provider-test-key' },
        });
        expect(p.getApiKey()).toBe('provider-test-key');
      } finally {
        restoreEnv();
      }
    });

    it('does not inherit OpenAI organization configuration', async () => {
      const restoreEnv = mockProcessEnv({
        REQUESTY_API_KEY: 'test-key',
        OPENAI_ORGANIZATION: 'org-leak',
      });
      try {
        const p = new RequestyProvider('openai/gpt-4o-mini', {});
        expect(p.getOrganization()).toBeUndefined();

        mockedFetchWithRetries.mockResolvedValueOnce(jsonResponse(OK_COMPLETION));

        await p.callApi('Hi');

        const [, init] = mockedFetchWithRetries.mock.calls[0] ?? [];
        const headers = (init as RequestInit | undefined)?.headers as Record<string, string>;
        expect(headers).not.toHaveProperty('OpenAI-Organization');
      } finally {
        restoreEnv();
      }
    });

    it('preserves custom apiBaseUrl and apiKeyEnvar overrides', () => {
      const restoreEnv = mockProcessEnv({ CUSTOM_REQUESTY_KEY: 'custom-test-key' });
      try {
        const p = new RequestyProvider('openai/gpt-4o-mini', {
          config: {
            apiBaseUrl: 'https://router.eu.requesty.ai/v1',
            apiKeyEnvar: 'CUSTOM_REQUESTY_KEY',
          },
        });
        expect(p.config.apiBaseUrl).toBe('https://router.eu.requesty.ai/v1');
        expect(p.config.apiKeyEnvar).toBe('CUSTOM_REQUESTY_KEY');
        expect(p.getApiKey()).toBe('custom-test-key');
      } finally {
        restoreEnv();
      }
    });

    it('falls back to the default API URL if config is cleared after construction', () => {
      const p = new RequestyProvider('openai/gpt-4o-mini', {});
      p.config.apiBaseUrl = undefined;
      expect(p.getApiUrl()).toBe(REQUESTY_API_BASE);
    });

    it('calls the default Requesty host and attaches attribution headers', async () => {
      const restoreEnv = mockProcessEnv({ REQUESTY_API_KEY: 'default-test-key' });
      try {
        const p = new RequestyProvider('openai/gpt-4o-mini', {});
        mockedFetchWithRetries.mockResolvedValueOnce(jsonResponse(OK_COMPLETION));

        await p.callApi('Test prompt');

        const [url, init] = mockedFetchWithRetries.mock.calls[0] ?? [];
        expect(url).toBe(`${REQUESTY_API_BASE}/chat/completions`);
        expect((init as RequestInit | undefined)?.headers).toMatchObject({
          Authorization: 'Bearer default-test-key',
          'HTTP-Referer': 'https://promptfoo.dev/',
          'X-Title': 'promptfoo',
        });
      } finally {
        restoreEnv();
      }
    });

    it('calls the configured apiBaseUrl instead of the default Requesty host', async () => {
      const restoreEnv = mockProcessEnv({ CUSTOM_REQUESTY_KEY: 'custom-test-key' });
      try {
        const customApiBaseUrl = 'https://router.eu.requesty.ai/v1';
        const p = new RequestyProvider('openai/gpt-4o-mini', {
          config: { apiBaseUrl: customApiBaseUrl, apiKeyEnvar: 'CUSTOM_REQUESTY_KEY' },
        });
        mockedFetchWithRetries.mockResolvedValueOnce(jsonResponse(OK_COMPLETION));

        await p.callApi('Test prompt');

        const [url, init] = mockedFetchWithRetries.mock.calls[0] ?? [];
        expect(url).toBe(`${customApiBaseUrl}/chat/completions`);
        expect((init as RequestInit | undefined)?.headers).toMatchObject({
          Authorization: 'Bearer custom-test-key',
        });
      } finally {
        restoreEnv();
      }
    });

    it('returns the completion output and token usage on success', async () => {
      const restoreEnv = mockProcessEnv({ REQUESTY_API_KEY: 'test-key' });
      try {
        const p = new RequestyProvider('openai/gpt-4o-mini', {});
        mockedFetchWithRetries.mockResolvedValueOnce(jsonResponse(OK_COMPLETION));

        const result = await p.callApi('Test prompt');

        expect(result.output).toBe('Test output');
        expect(result.tokenUsage).toMatchObject({ total: 10, prompt: 5, completion: 5 });
        expect(result.finishReason).toBe('stop');
      } finally {
        restoreEnv();
      }
    });

    it('surfaces API errors returned in the response body', async () => {
      const restoreEnv = mockProcessEnv({ REQUESTY_API_KEY: 'test-key' });
      try {
        const p = new RequestyProvider('openai/gpt-4o-mini', {});
        mockedFetchWithRetries.mockResolvedValueOnce(
          jsonResponse({ error: { message: 'bad request', type: 'invalid_request_error' } }),
        );

        const result = await p.callApi('Test prompt');
        expect(result.error).toContain('bad request');
      } finally {
        restoreEnv();
      }
    });

    it('surfaces non-2xx HTTP errors', async () => {
      const restoreEnv = mockProcessEnv({ REQUESTY_API_KEY: 'test-key' });
      try {
        const p = new RequestyProvider('openai/gpt-4o-mini', {});
        mockedFetchWithRetries.mockResolvedValueOnce(
          jsonResponse({ error: { message: 'upstream unavailable' } }, 502, 'Bad Gateway'),
        );

        const result = await p.callApi('Test prompt');
        expect(result.error).toContain('502');
      } finally {
        restoreEnv();
      }
    });

    describe('Thinking tokens handling', () => {
      it('prefixes reasoning content when both reasoning and content are present', async () => {
        const restoreEnv = mockProcessEnv({ REQUESTY_API_KEY: 'test-key' });
        try {
          const p = new RequestyProvider('google/gemini-2.5-flash', {});
          mockedFetchWithRetries.mockResolvedValueOnce(
            jsonResponse({
              choices: [
                {
                  message: { content: 'The answer', reasoning: 'Step-by-step thinking' },
                  finish_reason: 'stop',
                },
              ],
              usage: { total_tokens: 6, prompt_tokens: 3, completion_tokens: 3 },
            }),
          );

          const result = await p.callApi('Test prompt');
          expect(result.output).toBe('Thinking: Step-by-step thinking\n\nThe answer');
        } finally {
          restoreEnv();
        }
      });

      it('hides reasoning when showThinking is false', async () => {
        const restoreEnv = mockProcessEnv({ REQUESTY_API_KEY: 'test-key' });
        try {
          const p = new RequestyProvider('google/gemini-2.5-flash', {
            config: { showThinking: false },
          });
          mockedFetchWithRetries.mockResolvedValueOnce(
            jsonResponse({
              choices: [
                {
                  message: { content: 'The answer', reasoning: 'Step-by-step thinking' },
                  finish_reason: 'stop',
                },
              ],
              usage: { total_tokens: 6, prompt_tokens: 3, completion_tokens: 3 },
            }),
          );

          const result = await p.callApi('Test prompt');
          expect(result.output).toBe('The answer');
        } finally {
          restoreEnv();
        }
      });

      it('falls back to reasoning when there is no content', async () => {
        const restoreEnv = mockProcessEnv({ REQUESTY_API_KEY: 'test-key' });
        try {
          const p = new RequestyProvider('google/gemini-2.5-flash', {});
          mockedFetchWithRetries.mockResolvedValueOnce(
            jsonResponse({
              choices: [
                { message: { content: '', reasoning: 'Only reasoning' }, finish_reason: 'stop' },
              ],
              usage: { total_tokens: 4, prompt_tokens: 2, completion_tokens: 2 },
            }),
          );

          const result = await p.callApi('Test prompt');
          expect(result.output).toBe('Only reasoning');
        } finally {
          restoreEnv();
        }
      });

      it('prioritizes tool calls over content and reasoning', async () => {
        const restoreEnv = mockProcessEnv({ REQUESTY_API_KEY: 'test-key' });
        try {
          const p = new RequestyProvider('openai/gpt-4o-mini', {});
          const toolCalls = [
            { id: 'call_1', type: 'function', function: { name: 'get_weather', arguments: '{}' } },
          ];
          mockedFetchWithRetries.mockResolvedValueOnce(
            jsonResponse({
              choices: [
                {
                  message: { content: 'ignored', reasoning: 'ignored', tool_calls: toolCalls },
                  finish_reason: 'tool_calls',
                },
              ],
              usage: { total_tokens: 4, prompt_tokens: 2, completion_tokens: 2 },
            }),
          );

          const result = await p.callApi('Test prompt');
          expect(result.output).toEqual(toolCalls);
        } finally {
          restoreEnv();
        }
      });
    });
  });

  describe('createRequestyProvider', () => {
    it('creates a RequestyProvider with the model name parsed from the path', () => {
      const p = createRequestyProvider('requesty:openai/gpt-4o-mini');
      expect(p).toBeInstanceOf(RequestyProvider);
      expect(p.id()).toBe('requesty:openai/gpt-4o-mini');
    });

    it('preserves provider/model names that contain colons', () => {
      const p = createRequestyProvider('requesty:openai/gpt-4o-mini:beta');
      expect(p.id()).toBe('requesty:openai/gpt-4o-mini:beta');
    });

    it('threads env overrides through to the provider', () => {
      const p = createRequestyProvider('requesty:openai/gpt-4o-mini', {
        env: { REQUESTY_API_KEY: 'env-key' },
      }) as RequestyProvider;
      expect(p.getApiKey()).toBe('env-key');
    });
  });
});
