import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache } from '../../src/cache';
import { OrcaRouterProvider } from '../../src/providers/orcarouter';
import * as fetchModule from '../../src/util/fetch/index';
import { mockProcessEnv } from '../util/utils';

const ORCAROUTER_API_BASE = 'https://api.orcarouter.ai/v1';

vi.mock('../../src/util', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    maybeLoadFromExternalFile: vi.fn((x) => x),
    renderVarsInObject: vi.fn((x) => x),
  };
});

vi.mock('../../src/util/fetch');

describe('OrcaRouter', () => {
  const mockedFetchWithRetries = vi.mocked(fetchModule.fetchWithRetries);

  afterEach(async () => {
    await clearCache();
    vi.clearAllMocks();
  });

  describe('OrcaRouterProvider', () => {
    const provider = new OrcaRouterProvider('openai/gpt-5.5', {});

    it('initializes with correct model name', () => {
      expect(provider.modelName).toBe('openai/gpt-5.5');
    });

    it('returns correct id', () => {
      expect(provider.id()).toBe('orcarouter:openai/gpt-5.5');
    });

    it('returns correct string representation', () => {
      expect(provider.toString()).toBe('[OrcaRouter Provider openai/gpt-5.5]');
    });

    it('serializes to JSON correctly', () => {
      const p = new OrcaRouterProvider('anthropic/claude-opus-4.7', {
        config: { temperature: 0.7, max_tokens: 100 },
      });

      expect(p.toJSON()).toEqual({
        provider: 'orcarouter',
        model: 'anthropic/claude-opus-4.7',
        config: {
          temperature: 0.7,
          max_tokens: 100,
          apiKeyEnvar: 'ORCAROUTER_API_KEY',
          apiBaseUrl: ORCAROUTER_API_BASE,
          passthrough: {},
        },
      });
    });

    it('falls back to the default apiBaseUrl and apiKeyEnvar when none are configured', () => {
      const p = new OrcaRouterProvider('openai/gpt-5.5', {});
      expect(p.config.apiBaseUrl).toBe(ORCAROUTER_API_BASE);
      expect(p.config.apiKeyEnvar).toBe('ORCAROUTER_API_KEY');
    });

    it('falls back to the default when apiBaseUrl or apiKeyEnvar is an empty string', () => {
      const p = new OrcaRouterProvider('openai/gpt-5.5', {
        config: { apiBaseUrl: '', apiKeyEnvar: '' },
      });
      expect(p.config.apiBaseUrl).toBe(ORCAROUTER_API_BASE);
      expect(p.config.apiKeyEnvar).toBe('ORCAROUTER_API_KEY');
    });

    it('does not fall back to OPENAI_API_KEY when ORCAROUTER_API_KEY is unset', () => {
      const restoreEnv = mockProcessEnv({
        OPENAI_API_KEY: 'openai-secret',
        ORCAROUTER_API_KEY: undefined,
      });
      try {
        const p = new OrcaRouterProvider('openai/gpt-5.5', {});
        expect(p.getApiKey()).toBeUndefined();
      } finally {
        restoreEnv();
      }
    });

    it('throws a clear error when no API key is configured', async () => {
      const restoreEnv = mockProcessEnv({
        OPENAI_API_KEY: 'openai-secret',
        ORCAROUTER_API_KEY: undefined,
      });
      try {
        const p = new OrcaRouterProvider('openai/gpt-5.5', {});
        await expect(p.callApi('Test prompt')).rejects.toThrow(/ORCAROUTER_API_KEY/);
      } finally {
        restoreEnv();
      }
    });

    it('preserves custom apiBaseUrl and apiKeyEnvar overrides', () => {
      const restoreEnv = mockProcessEnv({ CUSTOM_ORCA_KEY: 'custom-test-key' });
      try {
        const p = new OrcaRouterProvider('openai/gpt-5.5', {
          config: {
            apiBaseUrl: 'https://proxy.example.com/orcarouter/v1',
            apiKeyEnvar: 'CUSTOM_ORCA_KEY',
          },
        });
        expect(p.config.apiBaseUrl).toBe('https://proxy.example.com/orcarouter/v1');
        expect(p.config.apiKeyEnvar).toBe('CUSTOM_ORCA_KEY');
        expect(p.getApiKey()).toBe('custom-test-key');
      } finally {
        restoreEnv();
      }
    });

    it('calls the default OrcaRouter host and attaches attribution headers', async () => {
      const restoreEnv = mockProcessEnv({ ORCAROUTER_API_KEY: 'default-test-key' });
      try {
        const p = new OrcaRouterProvider('openai/gpt-5.5', {});

        const response = new Response(
          JSON.stringify({
            choices: [{ message: { content: 'Test output' }, finish_reason: 'stop' }],
            usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
          }),
          {
            status: 200,
            statusText: 'OK',
            headers: new Headers({ 'Content-Type': 'application/json' }),
          },
        );
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        await p.callApi('Test prompt');

        const [url, init] = mockedFetchWithRetries.mock.calls[0] ?? [];
        expect(url).toBe(`${ORCAROUTER_API_BASE}/chat/completions`);
        expect((init as RequestInit | undefined)?.headers).toMatchObject({
          Authorization: 'Bearer default-test-key',
          'HTTP-Referer': 'https://promptfoo.dev/',
          'X-Title': 'promptfoo',
        });
      } finally {
        restoreEnv();
      }
    });

    it('passes routing options (models / route) as top-level body fields', async () => {
      const restoreEnv = mockProcessEnv({ ORCAROUTER_API_KEY: 'test-key' });
      try {
        const p = new OrcaRouterProvider('openai/gpt-5.5', {
          config: {
            route: 'fallback',
            models: ['openai/gpt-5.5', 'anthropic/claude-opus-4.7'],
          },
        });

        const response = new Response(
          JSON.stringify({
            choices: [{ message: { content: 'Out' }, finish_reason: 'stop' }],
            usage: { total_tokens: 10, prompt_tokens: 5, completion_tokens: 5 },
          }),
          {
            status: 200,
            statusText: 'OK',
            headers: new Headers({ 'Content-Type': 'application/json' }),
          },
        );
        mockedFetchWithRetries.mockResolvedValueOnce(response);

        await p.callApi('Test prompt');

        const [, init] = mockedFetchWithRetries.mock.calls[0] ?? [];
        const body = JSON.parse((init as RequestInit | undefined)?.body as string);
        expect(body.route).toBe('fallback');
        expect(body.models).toEqual(['openai/gpt-5.5', 'anthropic/claude-opus-4.7']);
      } finally {
        restoreEnv();
      }
    });

    describe('Reasoning / thinking', () => {
      beforeEach(() => {
        mockProcessEnv({ ORCAROUTER_API_KEY: 'test-key' });
      });

      afterEach(() => {
        mockProcessEnv({ ORCAROUTER_API_KEY: undefined });
      });

      it('prefixes reasoning when showThinking is true (default)', async () => {
        const mockResponse = {
          choices: [
            {
              message: {
                content: 'The answer is 42.',
                reasoning: 'Let me think this through carefully.',
              },
            },
          ],
          usage: { total_tokens: 30, prompt_tokens: 10, completion_tokens: 20 },
        };
        mockedFetchWithRetries.mockResolvedValueOnce(
          new Response(JSON.stringify(mockResponse), {
            status: 200,
            statusText: 'OK',
            headers: new Headers({ 'Content-Type': 'application/json' }),
          }),
        );

        const result = await provider.callApi('Test prompt');
        expect(result.output).toBe(
          'Thinking: Let me think this through carefully.\n\nThe answer is 42.',
        );
      });

      it('hides reasoning when showThinking is false', async () => {
        const p = new OrcaRouterProvider('anthropic/claude-opus-4.7', {
          config: { showThinking: false },
        });
        const mockResponse = {
          choices: [
            {
              message: {
                content: 'The answer is 42.',
                reasoning: 'Thinking content',
              },
            },
          ],
          usage: { total_tokens: 30, prompt_tokens: 10, completion_tokens: 20 },
        };
        mockedFetchWithRetries.mockResolvedValueOnce(
          new Response(JSON.stringify(mockResponse), {
            status: 200,
            statusText: 'OK',
            headers: new Headers({ 'Content-Type': 'application/json' }),
          }),
        );

        const result = await p.callApi('Test prompt');
        expect(result.output).toBe('The answer is 42.');
      });

      it('prioritizes tool calls over content and reasoning', async () => {
        const toolCall = {
          id: 'call_abc',
          type: 'function',
          function: { name: 'get_weather', arguments: '{"loc":"SF"}' },
        };
        const mockResponse = {
          choices: [
            {
              message: {
                content: 'I should call the weather tool.',
                reasoning: 'User wants weather data.',
                tool_calls: [toolCall],
              },
            },
          ],
          usage: { total_tokens: 50, prompt_tokens: 20, completion_tokens: 30 },
        };
        mockedFetchWithRetries.mockResolvedValueOnce(
          new Response(JSON.stringify(mockResponse), {
            status: 200,
            statusText: 'OK',
            headers: new Headers({ 'Content-Type': 'application/json' }),
          }),
        );

        const result = await provider.callApi('Weather in SF?');
        expect(result.output).toEqual([toolCall]);
      });

      it('parses JSON when response_format.type is json_schema', async () => {
        const p = new OrcaRouterProvider('openai/gpt-5.5', {
          config: {
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'test_schema',
                schema: { type: 'object', properties: { name: { type: 'string' } } },
              },
            },
          },
        });

        mockedFetchWithRetries.mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              choices: [{ message: { content: '{"name": "Jane"}' } }],
              usage: { total_tokens: 30, prompt_tokens: 10, completion_tokens: 20 },
            }),
            {
              status: 200,
              statusText: 'OK',
              headers: new Headers({ 'Content-Type': 'application/json' }),
            },
          ),
        );

        const result = await p.callApi('Generate JSON');
        expect(result.output).toEqual({ name: 'Jane' });
      });

      it('returns an API error on non-2xx status', async () => {
        mockedFetchWithRetries.mockResolvedValueOnce(
          new Response(
            JSON.stringify({ error: { message: 'API Error', type: 'invalid_request_error' } }),
            {
              status: 400,
              statusText: 'Bad Request',
              headers: new Headers({ 'Content-Type': 'application/json' }),
            },
          ),
        );

        const result = await provider.callApi('Test prompt');
        expect(result.error).toContain('400 Bad Request');
      });
    });
  });
});
