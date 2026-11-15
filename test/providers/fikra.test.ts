import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache } from '../../src/cache';
import { FikraProvider, createFikraProvider } from '../../src/providers/fikra';
import * as fetchModule from '../../src/util/fetch/index';
import { mockProcessEnv } from '../util/utils';

const FIKRA_API_BASE = 'https://api.fikraapi.co.ke/v1';

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

describe('Fikra', () => {
  const mockedFetchWithRetries = vi.mocked(fetchModule.fetchWithRetries);

  afterEach(async () => {
    await clearCache();
    vi.clearAllMocks();
  });

  describe('FikraProvider', () => {
    let restoreEnv: () => void;

    beforeEach(() => {
      restoreEnv = mockProcessEnv({ FIKRA_API_KEY: 'fikra-test-key' });
    });

    afterEach(() => {
      restoreEnv();
    });

    it('should initialize with correct model name', () => {
      const provider = new FikraProvider('deepseek-v4.1-flash', {});
      expect(provider.modelName).toBe('deepseek-v4.1-flash');
    });

    it('should return correct id', () => {
      const provider = new FikraProvider('deepseek-v4.1-flash', {});
      expect(provider.id()).toBe('fikra:deepseek-v4.1-flash');
    });

    it('should return correct string representation', () => {
      const provider = new FikraProvider('deepseek-v4.1-flash', {});
      expect(provider.toString()).toBe('[Fikra Provider deepseek-v4.1-flash]');
    });

    it('should serialize to JSON correctly without API key', () => {
      const provider = new FikraProvider('deepseek-v4.1-flash', {
        config: {
          temperature: 0.7,
          max_tokens: 100,
        },
      });

      expect(provider.toJSON()).toEqual({
        provider: 'fikra',
        model: 'deepseek-v4.1-flash',
        config: {
          temperature: 0.7,
          max_tokens: 100,
          apiKeyEnvar: 'FIKRA_API_KEY',
          apiBaseUrl: FIKRA_API_BASE,
        },
      });
    });

    it('should serialize to JSON correctly with API key redacted', () => {
      const provider = new FikraProvider('deepseek-v4.1-flash', {
        config: {
          apiKey: 'secret-api-key',
          temperature: 0.7,
        },
      });

      expect(provider.toJSON()).toEqual({
        provider: 'fikra',
        model: 'deepseek-v4.1-flash',
        config: {
          apiKey: undefined,
          temperature: 0.7,
          apiKeyEnvar: 'FIKRA_API_KEY',
          apiBaseUrl: FIKRA_API_BASE,
        },
      });
    });

    it('should use default apiBaseUrl and apiKeyEnvar when not specified', () => {
      const provider = new FikraProvider('deepseek-v4.1-flash', {});
      expect(provider.config.apiBaseUrl).toBe(FIKRA_API_BASE);
      expect(provider.config.apiKeyEnvar).toBe('FIKRA_API_KEY');
    });

    it('should preserve custom apiBaseUrl and apiKeyEnvar overrides', () => {
      const restoreCustomEnv = mockProcessEnv({ CUSTOM_FIKRA_KEY: 'custom-test-key' });

      try {
        const provider = new FikraProvider('deepseek-v4.1-flash', {
          config: {
            apiBaseUrl: 'https://proxy.example.com/atlas/v1',
            apiKeyEnvar: 'CUSTOM_FIKRA_KEY',
          },
        });

        expect(provider.config.apiBaseUrl).toBe('https://proxy.example.com/atlas/v1');
        expect(provider.config.apiKeyEnvar).toBe('CUSTOM_FIKRA_KEY');
        expect(provider.getApiKey()).toBe('custom-test-key');
      } finally {
        restoreCustomEnv();
      }
    });

    it('should call the Fikra API and return output', async () => {
      const provider = new FikraProvider('deepseek-v4.1-flash', {});
      mockedFetchWithRetries.mockResolvedValueOnce(
        jsonResponse({
          choices: [{ message: { content: 'Atlas output' }, finish_reason: 'stop' }],
          usage: { total_tokens: 12, prompt_tokens: 5, completion_tokens: 7 },
        }),
      );

      const result = await provider.callApi('Test prompt');

      const [url, init] = mockedFetchWithRetries.mock.calls[0] ?? [];
      expect(url).toBe(`${FIKRA_API_BASE}/chat/completions`);
      expect((init as RequestInit | undefined)?.headers).toMatchObject({
        Authorization: 'Bearer fikra-test-key',
      });
      expect(result.output).toBe('Atlas output');
      expect(result.tokenUsage).toEqual({
        total: 12,
        prompt: 5,
        completion: 7,
        numRequests: 1,
      });
    });

    it('should call the configured apiBaseUrl instead of the default host', async () => {
      const customApiBaseUrl = 'https://proxy.example.com/atlas/v1';
      const provider = new FikraProvider('deepseek-v4.1-flash', {
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
      const provider = new FikraProvider('deepseek-v4.1-flash', {});
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

  describe('createFikraProvider', () => {
    it('should create Fikra provider from provider path', () => {
      const provider = createFikraProvider('fikra:deepseek-v4.1-flash', {
        config: {
          config: { temperature: 0.5 },
        },
      });

      expect(provider).toBeInstanceOf(FikraProvider);
      expect((provider as FikraProvider).modelName).toBe('deepseek-v4.1-flash');
    });

    it('should pass env overrides through provider creation', () => {
      const provider = createFikraProvider('fikra:glm-5.3-flash', {
        config: {
          config: {
            apiKeyEnvar: 'FIKRA_API_KEY_OVERRIDE',
          },
        },
        env: {
          FIKRA_API_KEY_OVERRIDE: 'env-override-key',
        },
      }) as FikraProvider;

      expect(provider.getApiKey()).toBe('env-override-key');
      expect(provider.id()).toBe('fikra:glm-5.3-flash');
    });
  });
});
