import { beforeEach, describe, expect, it, vi } from 'vitest';
import { loadApiProvider } from '../../src/providers';

/**
 * Regression coverage for gateway-style providers that build `apiBaseUrl` themselves.
 *
 * These providers previously hardcoded `apiBaseUrl` and `apiKeyEnvar` *after* spreading the
 * user's config, so an explicit value was silently discarded, and f5 concatenated the base URL
 * without validating it.
 */
describe('gateway provider config handling', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  describe('f5', () => {
    it('appends the gateway path from the provider ID to the configured origin', async () => {
      const provider = await loadApiProvider('f5:path-name', {
        options: { config: { apiBaseUrl: 'https://gw.example.com', apiKey: 'k' } },
      });
      expect(provider).toHaveProperty('config.apiBaseUrl', 'https://gw.example.com/path-name');
    });

    it('trims trailing slashes instead of producing a double slash', async () => {
      const provider = await loadApiProvider('f5:path-name', {
        options: { config: { apiBaseUrl: 'https://gw.example.com/', apiKey: 'k' } },
      });
      expect(provider).toHaveProperty('config.apiBaseUrl', 'https://gw.example.com/path-name');
    });

    it('throws a clear error instead of requesting "undefined/<path>"', async () => {
      await expect(
        loadApiProvider('f5:path-name', { options: { config: { apiKey: 'k' } } }),
      ).rejects.toThrow(/F5 provider requires a gateway URL/);
    });

    it('falls back to F5_API_BASE_URL', async () => {
      vi.stubEnv('F5_API_BASE_URL', 'https://env-gw.example.com');
      const provider = await loadApiProvider('f5:path-name', {
        options: { config: { apiKey: 'k' } },
      });
      expect(provider).toHaveProperty('config.apiBaseUrl', 'https://env-gw.example.com/path-name');
    });

    it('honors an explicit apiKeyEnvar', async () => {
      const provider = await loadApiProvider('f5:path-name', {
        options: {
          config: { apiBaseUrl: 'https://gw.example.com', apiKeyEnvar: 'MY_GATEWAY_KEY' },
        },
      });
      expect(provider).toHaveProperty('config.apiKeyEnvar', 'MY_GATEWAY_KEY');
    });

    it('defaults apiKeyEnvar to F5_API_KEY', async () => {
      const provider = await loadApiProvider('f5:path-name', {
        options: { config: { apiBaseUrl: 'https://gw.example.com', apiKey: 'k' } },
      });
      expect(provider).toHaveProperty('config.apiKeyEnvar', 'F5_API_KEY');
    });
  });

  describe('cloudera', () => {
    it('honors an explicit apiBaseUrl instead of rebuilding it from domain/namespace', async () => {
      const provider = await loadApiProvider('cloudera:my-model', {
        options: {
          config: { apiBaseUrl: 'https://proxy.example.com/v1', domain: 'ignored.example.com' },
        },
      });
      expect(provider).toHaveProperty('config.apiBaseUrl', 'https://proxy.example.com/v1');
    });

    it('honors an explicit apiKeyEnvar', async () => {
      const provider = await loadApiProvider('cloudera:my-model', {
        options: { config: { domain: 'd.example.com', apiKeyEnvar: 'MY_CDP_TOKEN' } },
      });
      expect(provider).toHaveProperty('config.apiKeyEnvar', 'MY_CDP_TOKEN');
    });

    it('still derives the default URL from domain/namespace/endpoint', async () => {
      const provider = await loadApiProvider('cloudera:my-model', {
        options: { config: { domain: 'd.example.com' } },
      });
      expect(provider).toHaveProperty(
        'config.apiBaseUrl',
        'https://d.example.com/namespaces/serving-default/endpoints/my-model/v1',
      );
      expect(provider).toHaveProperty('config.apiKeyEnvar', 'CDP_TOKEN');
    });
  });

  describe('jfrog', () => {
    it('honors an explicit apiBaseUrl', async () => {
      const provider = await loadApiProvider('jfrog:my-model', {
        options: { config: { apiBaseUrl: 'https://proxy.example.com/v1/my-model' } },
      });
      expect(provider).toHaveProperty('config.apiBaseUrl', 'https://proxy.example.com/v1/my-model');
    });

    it('appends the model name to baseUrl and trims trailing slashes', async () => {
      const provider = await loadApiProvider('jfrog:my-model', {
        options: { config: { baseUrl: 'https://host.example.com/v1/' } },
      });
      expect(provider).toHaveProperty('config.apiBaseUrl', 'https://host.example.com/v1/my-model');
    });

    it('honors an explicit apiKeyEnvar', async () => {
      const provider = await loadApiProvider('jfrog:my-model', {
        options: { config: { apiKeyEnvar: 'MY_QWAK_TOKEN' } },
      });
      expect(provider).toHaveProperty('config.apiKeyEnvar', 'MY_QWAK_TOKEN');
    });
  });

  describe('envoy', () => {
    it('reads ENVOY_API_BASE_URL through getEnvString so `env:` overrides apply', async () => {
      const provider = await loadApiProvider('envoy:my-model', {
        options: { config: { apiKey: 'k' }, env: { ENVOY_API_BASE_URL: 'https://from-env-block' } },
      });
      expect(provider).toHaveProperty('config.apiBaseUrl', 'https://from-env-block/v1');
    });

    it('still accepts the process environment', async () => {
      vi.stubEnv('ENVOY_API_BASE_URL', 'https://from-process-env');
      const provider = await loadApiProvider('envoy:my-model', {
        options: { config: { apiKey: 'k' } },
      });
      expect(provider).toHaveProperty('config.apiBaseUrl', 'https://from-process-env/v1');
    });
  });

  describe('llama', () => {
    it('keeps colons in the model name', async () => {
      const provider = await loadApiProvider('llama:llama3:8b');
      expect(provider.id()).toContain('llama3:8b');
    });
  });
});
