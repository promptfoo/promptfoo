import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadApiProvider } from '../../src/providers';
import { ProviderOptionsSchema } from '../../src/validators/providers';
import { mockProcessEnv } from '../util/utils';

function getApiKey(provider: Awaited<ReturnType<typeof loadApiProvider>>): string | undefined {
  return (provider as typeof provider & { getApiKey(): string | undefined }).getApiKey();
}

describe('gateway provider config handling', () => {
  let restoreEnv: () => void;

  beforeEach(() => {
    restoreEnv = mockProcessEnv({
      F5_API_BASE_URL: undefined,
      ENVOY_API_BASE_URL: undefined,
      CDP_DOMAIN: undefined,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    restoreEnv();
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

    it('preserves scoped URL and credentials through config validation', async () => {
      vi.stubEnv('F5_API_BASE_URL', 'https://process.example.com');
      const options = ProviderOptionsSchema.parse({
        env: { F5_API_BASE_URL: 'https://provider.example.com/', F5_API_KEY: 'provider-key' },
      });
      const provider = await loadApiProvider('f5:path-name', {
        options,
        env: { F5_API_BASE_URL: 'https://suite.example.com' },
      });
      expect(provider).toHaveProperty(
        'config.apiBaseUrl',
        'https://provider.example.com/path-name',
      );
      expect(getApiKey(provider)).toBe('provider-key');

      const configured = await loadApiProvider('f5:path-name', {
        options: { ...options, config: { apiBaseUrl: 'https://config.example.com' } },
      });
      expect(configured).toHaveProperty(
        'config.apiBaseUrl',
        'https://config.example.com/path-name',
      );
    });

    it('uses the suite URL before the process URL', async () => {
      vi.stubEnv('F5_API_BASE_URL', 'https://process.example.com');
      const provider = await loadApiProvider('f5:/path-name', {
        env: { F5_API_BASE_URL: 'https://suite.example.com/' },
      });
      expect(provider).toHaveProperty('config.apiBaseUrl', 'https://suite.example.com/path-name');
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

    it('reads a scoped domain and token after config validation', async () => {
      vi.stubEnv('CDP_DOMAIN', 'process.example.com');
      const options = ProviderOptionsSchema.parse({
        env: { CDP_DOMAIN: 'provider.example.com', CDP_TOKEN: 'cloudera-key' },
      });
      const provider = await loadApiProvider('cloudera:my-model', { options });
      expect(provider).toHaveProperty(
        'config.apiBaseUrl',
        'https://provider.example.com/namespaces/serving-default/endpoints/my-model/v1',
      );
      expect(getApiKey(provider)).toBe('cloudera-key');
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

    it('preserves its scoped default credential through config validation', async () => {
      const options = ProviderOptionsSchema.parse({ env: { QWAK_TOKEN: 'jfrog-key' } });
      const provider = await loadApiProvider('jfrog:my-model', { options });
      expect(getApiKey(provider)).toBe('jfrog-key');
    });
  });

  describe('envoy', () => {
    it('prefers a scoped URL and preserves a scoped credential through config validation', async () => {
      vi.stubEnv('ENVOY_API_BASE_URL', 'https://process.example.com');
      const options = ProviderOptionsSchema.parse({
        config: { apiKeyEnvar: 'ENVOY_API_KEY' },
        env: { ENVOY_API_BASE_URL: 'https://provider.example.com', ENVOY_API_KEY: 'envoy-key' },
      });
      const provider = await loadApiProvider('envoy:my-model', {
        options,
        env: { ENVOY_API_BASE_URL: 'https://suite.example.com' },
      });
      expect(provider).toHaveProperty('config.apiBaseUrl', 'https://provider.example.com/v1');
      expect(getApiKey(provider)).toBe('envoy-key');

      const configured = await loadApiProvider('envoy:my-model', {
        options: { ...options, config: { apiBaseUrl: 'https://config.example.com/v1/' } },
      });
      expect(configured).toHaveProperty('config.apiBaseUrl', 'https://config.example.com/v1');
    });

    it('still accepts the process environment', async () => {
      vi.stubEnv('ENVOY_API_BASE_URL', 'https://from-process-env');
      const provider = await loadApiProvider('envoy:my-model', {
        options: { config: { apiKey: 'k' } },
      });
      expect(provider).toHaveProperty('config.apiBaseUrl', 'https://from-process-env/v1');
    });
  });

  describe('litellm', () => {
    it('preserves its scoped URL and credential through config validation', async () => {
      const options = ProviderOptionsSchema.parse({
        env: { LITELLM_API_BASE: 'https://proxy.example.com', LITELLM_API_KEY: 'litellm-key' },
      });
      const provider = await loadApiProvider('litellm:my-model', { options });
      expect(provider).toHaveProperty('config.apiBaseUrl', 'https://proxy.example.com');
      expect(getApiKey(provider)).toBe('litellm-key');
    });
  });

  describe('llama', () => {
    it('keeps colons in the model name', async () => {
      const provider = await loadApiProvider('llama:llama3:8b');
      expect(provider.id()).toContain('llama3:8b');
    });
  });
});
