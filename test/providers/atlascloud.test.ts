import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearCache } from '../../src/cache';
import { AtlasCloudProvider, createAtlasCloudProvider } from '../../src/providers/atlascloud';
import * as fetchModule from '../../src/util/fetch/index';
import { mockProcessEnv } from '../util/utils';

const ATLASCLOUD_API_BASE = 'https://api.atlascloud.ai/v1';

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

describe('AtlasCloud', () => {
  const mockedFetchWithRetries = vi.mocked(fetchModule.fetchWithRetries);

  afterEach(async () => {
    await clearCache();
    vi.clearAllMocks();
  });

  describe('AtlasCloudProvider', () => {
    let restoreEnv: () => void;

    beforeEach(() => {
      restoreEnv = mockProcessEnv({ ATLASCLOUD_API_KEY: 'atlas-test-key' });
    });

    afterEach(() => {
      restoreEnv();
    });

    it('should initialize with correct model name', () => {
      const provider = new AtlasCloudProvider('deepseek-v3', {});
      expect(provider.modelName).toBe('deepseek-v3');
    });

    it('should return correct id', () => {
      const provider = new AtlasCloudProvider('deepseek-v3', {});
      expect(provider.id()).toBe('atlascloud:deepseek-v3');
    });

    it('should return correct string representation', () => {
      const provider = new AtlasCloudProvider('deepseek-v3', {});
      expect(provider.toString()).toBe('[Atlas Cloud Provider deepseek-v3]');
    });

    it('should serialize to JSON correctly without API key', () => {
      const provider = new AtlasCloudProvider('deepseek-v3', {
        config: {
          temperature: 0.7,
          max_tokens: 100,
        },
      });

      expect(provider.toJSON()).toEqual({
        provider: 'atlascloud',
        model: 'deepseek-v3',
        config: {
          temperature: 0.7,
          max_tokens: 100,
          apiKeyEnvar: 'ATLASCLOUD_API_KEY',
          apiBaseUrl: ATLASCLOUD_API_BASE,
        },
      });
    });

    it('should serialize to JSON correctly with API key redacted', () => {
      const provider = new AtlasCloudProvider('deepseek-v3', {
        config: {
          apiKey: 'secret-api-key',
          temperature: 0.7,
        },
      });

      expect(provider.toJSON()).toEqual({
        provider: 'atlascloud',
        model: 'deepseek-v3',
        config: {
          apiKey: undefined,
          temperature: 0.7,
          apiKeyEnvar: 'ATLASCLOUD_API_KEY',
          apiBaseUrl: ATLASCLOUD_API_BASE,
        },
      });
    });

    it('should use default apiBaseUrl and apiKeyEnvar when not specified', () => {
      const provider = new AtlasCloudProvider('deepseek-v3', {});
      expect(provider.config.apiBaseUrl).toBe(ATLASCLOUD_API_BASE);
      expect(provider.config.apiKeyEnvar).toBe('ATLASCLOUD_API_KEY');
    });

    it('should preserve custom apiBaseUrl and apiKeyEnvar overrides', () => {
      const restoreCustomEnv = mockProcessEnv({ CUSTOM_ATLASCLOUD_KEY: 'custom-test-key' });

      try {
        const provider = new AtlasCloudProvider('deepseek-v3', {
          config: {
            apiBaseUrl: 'https://proxy.example.com/atlas/v1',
            apiKeyEnvar: 'CUSTOM_ATLASCLOUD_KEY',
          },
        });

        expect(provider.config.apiBaseUrl).toBe('https://proxy.example.com/atlas/v1');
        expect(provider.config.apiKeyEnvar).toBe('CUSTOM_ATLASCLOUD_KEY');
        expect(provider.getApiKey()).toBe('custom-test-key');
      } finally {
        restoreCustomEnv();
      }
    });

    it('should call the Atlas Cloud API and return output', async () => {
      const provider = new AtlasCloudProvider('deepseek-v3', {});
      mockedFetchWithRetries.mockResolvedValueOnce(
        jsonResponse({
          choices: [{ message: { content: 'Atlas output' }, finish_reason: 'stop' }],
          usage: { total_tokens: 12, prompt_tokens: 5, completion_tokens: 7 },
        }),
      );

      const result = await provider.callApi('Test prompt');

      const [url, init] = mockedFetchWithRetries.mock.calls[0] ?? [];
      expect(url).toBe(`${ATLASCLOUD_API_BASE}/chat/completions`);
      expect((init as RequestInit | undefined)?.headers).toMatchObject({
        Authorization: 'Bearer atlas-test-key',
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
      const provider = new AtlasCloudProvider('deepseek-v3', {
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
      const provider = new AtlasCloudProvider('deepseek-v3', {});
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

  describe('createAtlasCloudProvider', () => {
    it('should create Atlas Cloud provider from provider path', () => {
      const provider = createAtlasCloudProvider('atlascloud:deepseek-v3', {
        config: {
          config: { temperature: 0.5 },
        },
      });

      expect(provider).toBeInstanceOf(AtlasCloudProvider);
      expect((provider as AtlasCloudProvider).modelName).toBe('deepseek-v3');
    });

    it('should pass env overrides through provider creation', () => {
      const provider = createAtlasCloudProvider('atlascloud:qwen/qwen3-32b', {
        config: {
          config: {
            apiKeyEnvar: 'ATLASCLOUD_API_KEY_OVERRIDE',
          },
        },
        env: {
          ATLASCLOUD_API_KEY_OVERRIDE: 'env-override-key',
        },
      }) as AtlasCloudProvider;

      expect(provider.getApiKey()).toBe('env-override-key');
      expect(provider.id()).toBe('atlascloud:qwen/qwen3-32b');
    });
  });
});
