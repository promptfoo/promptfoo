import { OpenAiGenericProvider } from '../../../src/providers/openai';

describe('OpenAI Provider', () => {
  describe('OpenAiGenericProvider', () => {
    const provider = new OpenAiGenericProvider('test-model', {
      config: {
        apiKey: 'test-key',
        organization: 'test-org',
      },
    });

    beforeEach(() => {
      process.env = {};
    });

    it('should generate correct API URL', () => {
      expect(provider.getApiUrl()).toBe('https://api.openai.com/v1');
    });

    it('should use custom API host', () => {
      const customProvider = new OpenAiGenericProvider('test-model', {
        config: { apiHost: 'custom.openai.com' },
      });
      expect(customProvider.getApiUrl()).toBe('https://custom.openai.com/v1');
    });

    it('should use custom API base URL', () => {
      const customProvider = new OpenAiGenericProvider('test-model', {
        config: { apiBaseUrl: 'https://custom.api.com/openai' },
      });
      expect(customProvider.getApiUrl()).toBe('https://custom.api.com/openai');
    });

    it('should get organization', () => {
      expect(provider.getOrganization()).toBe('test-org');
    });

    it('should get organization from env', () => {
      process.env.OPENAI_ORGANIZATION = 'env-org';
      const envProvider = new OpenAiGenericProvider('test-model');
      expect(envProvider.getOrganization()).toBe('env-org');
    });

    it('should get API key', () => {
      expect(provider.getApiKey()).toBe('test-key');
    });

    it('should get API key from env', () => {
      process.env.OPENAI_API_KEY = 'env-key';
      const envProvider = new OpenAiGenericProvider('test-model');
      expect(envProvider.getApiKey()).toBe('env-key');
    });

    it('should get API key from custom env var', () => {
      process.env.CUSTOM_API_KEY = 'custom-key';
      const customProvider = new OpenAiGenericProvider('test-model', {
        config: { apiKeyEnvar: 'CUSTOM_API_KEY' },
      });
      expect(customProvider.getApiKey()).toBe('custom-key');
    });

    it('should generate correct ID', () => {
      expect(provider.id()).toBe('openai:test-model');
    });

    it('should generate custom ID with API host', () => {
      const customProvider = new OpenAiGenericProvider('test-model', {
        config: { apiHost: 'custom.openai.com' },
      });
      expect(customProvider.id()).toBe('test-model');
    });

    it('should have correct string representation', () => {
      expect(provider.toString()).toBe('[OpenAI Provider test-model]');
    });

    it('should require API key by default', () => {
      expect(provider.requiresApiKey()).toBe(true);
    });

    it('should allow disabling API key requirement', () => {
      const customProvider = new OpenAiGenericProvider('test-model', {
        config: { apiKeyRequired: false },
      });
      expect(customProvider.requiresApiKey()).toBe(false);
    });

    it('should throw not implemented for callApi', async () => {
      await expect(provider.callApi('test prompt')).rejects.toThrow('Not implemented');
    });
  });
});
