import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearCache } from '../../src/cache';
import { createNvidiaProvider, NvidiaProvider } from '../../src/providers/nvidia/chat';
import { mockProcessEnv } from '../util/utils';

const NVIDIA_NIM_API_BASE = 'https://integrate.api.nvidia.com/v1';

vi.mock('../../src/util', async (importOriginal) => {
  return {
    ...(await importOriginal()),
    maybeLoadFromExternalFile: vi.fn((x) => x),
    renderVarsInObject: vi.fn((x) => x),
  };
});

vi.mock('../../src/util/fetch');

describe('NVIDIA NIM', () => {
  afterEach(async () => {
    await clearCache();
    vi.clearAllMocks();
  });

  describe('NvidiaProvider', () => {
    it('initializes with the model name', () => {
      const provider = new NvidiaProvider('meta/llama-3.3-70b-instruct', {});
      expect(provider.modelName).toBe('meta/llama-3.3-70b-instruct');
    });

    it('returns the prefixed id', () => {
      const provider = new NvidiaProvider('meta/llama-3.3-70b-instruct', {});
      expect(provider.id()).toBe('nvidia:meta/llama-3.3-70b-instruct');
    });

    it('returns a human-readable string', () => {
      const provider = new NvidiaProvider('meta/llama-3.3-70b-instruct', {});
      expect(provider.toString()).toBe('[NVIDIA NIM Provider meta/llama-3.3-70b-instruct]');
    });

    it('serialises to JSON without leaking apiKey', () => {
      const provider = new NvidiaProvider('meta/llama-3.3-70b-instruct', {
        config: {
          temperature: 0.7,
          max_tokens: 256,
          apiKey: 'should-not-appear',
        },
      });

      expect(provider.toJSON()).toEqual({
        provider: 'nvidia',
        model: 'meta/llama-3.3-70b-instruct',
        config: {
          temperature: 0.7,
          max_tokens: 256,
          apiKey: undefined,
          apiKeyEnvar: 'NVIDIA_API_KEY',
          apiBaseUrl: NVIDIA_NIM_API_BASE,
        },
      });
    });

    it('falls back to the default apiBaseUrl and apiKeyEnvar', () => {
      const provider = new NvidiaProvider('meta/llama-3.3-70b-instruct', {});
      expect(provider.config.apiBaseUrl).toBe(NVIDIA_NIM_API_BASE);
      expect(provider.config.apiKeyEnvar).toBe('NVIDIA_API_KEY');
    });

    it('falls back to the default when apiBaseUrl or apiKeyEnvar is an empty string', () => {
      const provider = new NvidiaProvider('meta/llama-3.3-70b-instruct', {
        config: {
          apiBaseUrl: '',
          apiKeyEnvar: '',
        },
      });

      expect(provider.config.apiBaseUrl).toBe(NVIDIA_NIM_API_BASE);
      expect(provider.config.apiKeyEnvar).toBe('NVIDIA_API_KEY');
    });

    it('respects custom apiBaseUrl and apiKeyEnvar overrides', () => {
      const restoreEnv = mockProcessEnv({ CUSTOM_NVIDIA_KEY: 'test-only-fake-key' });

      try {
        const provider = new NvidiaProvider('meta/llama-3.3-70b-instruct', {
          config: {
            apiBaseUrl: 'https://proxy.example.com/nvidia/v1',
            apiKeyEnvar: 'CUSTOM_NVIDIA_KEY',
          },
        });

        expect(provider.config.apiBaseUrl).toBe('https://proxy.example.com/nvidia/v1');
        expect(provider.config.apiKeyEnvar).toBe('CUSTOM_NVIDIA_KEY');
        expect(provider.getApiKey()).toBe('test-only-fake-key');
      } finally {
        restoreEnv();
      }
    });
  });

  describe('createNvidiaProvider', () => {
    it('parses the model name from the provider path', () => {
      const provider = createNvidiaProvider('nvidia:meta/llama-3.3-70b-instruct');
      expect(provider.id()).toBe('nvidia:meta/llama-3.3-70b-instruct');
    });

    it('preserves model names that contain colons', () => {
      const provider = createNvidiaProvider('nvidia:vendor/model:tag-v1');
      expect(provider.id()).toBe('nvidia:vendor/model:tag-v1');
    });

    it('throws when the provider path is missing the model', () => {
      expect(() => createNvidiaProvider('nvidia:')).toThrow(/expected "nvidia:<model>"/);
    });

    it('forwards config and env into the constructed provider', () => {
      const provider = createNvidiaProvider('nvidia:meta/llama-3.3-70b-instruct', {
        config: { config: { temperature: 0.5 } } as any,
        env: { NVIDIA_API_KEY: 'env-fake-key' },
      });
      expect(provider).toBeInstanceOf(NvidiaProvider);
    });
  });
});
