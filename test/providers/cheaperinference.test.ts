import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache } from '../../src/cache';
import {
  CheaperInferenceProvider,
  createCheaperInferenceProvider,
} from '../../src/providers/cheaperinference';
import * as fetchModule from '../../src/util/fetch/index';
import { mockProcessEnv } from '../util/utils';

const CHEAPERINFERENCE_API_BASE = 'https://api.cheaperinference.com/v1';

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

describe('CheaperInference', () => {
  const mockedFetchWithRetries = vi.mocked(fetchModule.fetchWithRetries);

  afterEach(async () => {
    await clearCache();
    vi.clearAllMocks();
  });

  describe('CheaperInferenceProvider', () => {
    let restoreEnv: () => void;

    beforeEach(() => {
      restoreEnv = mockProcessEnv({ CHEAPERINFERENCE_API_KEY: 'ci-test-key' });
    });

    afterEach(() => {
      restoreEnv();
    });

    it('should initialize with correct model name', () => {
      const provider = new CheaperInferenceProvider('claude-sonnet-5', {});
      expect(provider.modelName).toBe('claude-sonnet-5');
    });

    it('should return correct id', () => {
      const provider = new CheaperInferenceProvider('claude-sonnet-5', {});
      expect(provider.id()).toBe('cheaperinference:claude-sonnet-5');
    });

    it('should return correct string representation', () => {
      const provider = new CheaperInferenceProvider('claude-sonnet-5', {});
      expect(provider.toString()).toBe('[Cheaper Inference Provider claude-sonnet-5]');
    });

    it('should serialize to JSON correctly without API key', () => {
      const provider = new CheaperInferenceProvider('claude-sonnet-5', {
        config: {
          temperature: 0.7,
          max_tokens: 100,
        },
      });

      expect(provider.toJSON()).toEqual({
        provider: 'cheaperinference',
        model: 'claude-sonnet-5',
        config: {
          temperature: 0.7,
          max_tokens: 100,
          apiKeyEnvar: 'CHEAPERINFERENCE_API_KEY',
          apiBaseUrl: CHEAPERINFERENCE_API_BASE,
        },
      });
    });

    it('should serialize to JSON correctly with API key redacted', () => {
      const provider = new CheaperInferenceProvider('claude-sonnet-5', {
        config: {
          apiKey: 'secret-api-key',
          temperature: 0.7,
        },
      });

      expect(provider.toJSON()).toEqual({
        provider: 'cheaperinference',
        model: 'claude-sonnet-5',
        config: {
          apiKey: undefined,
          temperature: 0.7,
          apiKeyEnvar: 'CHEAPERINFERENCE_API_KEY',
          apiBaseUrl: CHEAPERINFERENCE_API_BASE,
        },
      });
    });

    it('should use default apiBaseUrl and apiKeyEnvar when not specified', () => {
      const provider = new CheaperInferenceProvider('claude-sonnet-5', {});
      expect(provider.config.apiBaseUrl).toBe(CHEAPERINFERENCE_API_BASE);
      expect(provider.config.apiKeyEnvar).toBe('CHEAPERINFERENCE_API_KEY');
    });

    it('should preserve custom apiBaseUrl and apiKeyEnvar overrides', () => {
      const restoreCustomEnv = mockProcessEnv({ CUSTOM_CHEAPERINFERENCE_KEY: 'custom-test-key' });

      try {
        const provider = new CheaperInferenceProvider('claude-sonnet-5', {
          config: {
            apiBaseUrl: 'https://proxy.example.com/ci/v1',
            apiKeyEnvar: 'CUSTOM_CHEAPERINFERENCE_KEY',
          },
        });

        expect(provider.config.apiBaseUrl).toBe('https://proxy.example.com/ci/v1');
        expect(provider.config.apiKeyEnvar).toBe('CUSTOM_CHEAPERINFERENCE_KEY');
        expect(provider.getApiKey()).toBe('custom-test-key');
      } finally {
        restoreCustomEnv();
      }
    });

    it('should call the Cheaper Inference API and return output', async () => {
      const provider = new CheaperInferenceProvider('claude-sonnet-5', {});
      mockedFetchWithRetries.mockResolvedValueOnce(
        jsonResponse({
          choices: [{ message: { content: 'Gateway output' }, finish_reason: 'stop' }],
          usage: { total_tokens: 12, prompt_tokens: 5, completion_tokens: 7 },
        }),
      );

      const result = await provider.callApi('Test prompt');

      const [url, init] = mockedFetchWithRetries.mock.calls[0] ?? [];
      expect(url).toBe(`${CHEAPERINFERENCE_API_BASE}/chat/completions`);
      expect((init as RequestInit | undefined)?.headers).toMatchObject({
        Authorization: 'Bearer ci-test-key',
      });
      expect(result.output).toBe('Gateway output');
      expect(result.tokenUsage).toEqual({
        total: 12,
        prompt: 5,
        completion: 7,
        numRequests: 1,
      });
    });

    it('should call the configured apiBaseUrl instead of the default host', async () => {
      const customApiBaseUrl = 'https://proxy.example.com/ci/v1';
      const provider = new CheaperInferenceProvider('claude-sonnet-5', {
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
      const provider = new CheaperInferenceProvider('claude-sonnet-5', {});
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
  });

  describe('createCheaperInferenceProvider', () => {
    it('should create Cheaper Inference provider from provider path', () => {
      const provider = createCheaperInferenceProvider('cheaperinference:claude-sonnet-5', {
        config: {
          config: { temperature: 0.5 },
        },
      });

      expect(provider).toBeInstanceOf(CheaperInferenceProvider);
      expect((provider as CheaperInferenceProvider).modelName).toBe('claude-sonnet-5');
    });

    it('should pass env overrides through provider creation', () => {
      const provider = createCheaperInferenceProvider('cheaperinference:gpt-5.6-luna', {
        config: {
          config: {
            apiKeyEnvar: 'CHEAPERINFERENCE_API_KEY_OVERRIDE',
          },
        },
        env: {
          CHEAPERINFERENCE_API_KEY_OVERRIDE: 'env-override-key',
        },
      }) as CheaperInferenceProvider;

      expect(provider.getApiKey()).toBe('env-override-key');
      expect(provider.id()).toBe('cheaperinference:gpt-5.6-luna');
    });
  });
});
