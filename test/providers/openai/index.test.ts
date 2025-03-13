import { OpenAiGenericProvider } from '../../../src/providers/openai';

describe('OpenAI Provider', () => {
  describe('OpenAiGenericProvider', () => {
    const provider = new OpenAiGenericProvider('test-model', {
      config: {
        apiKey: 'test-key',
        organization: 'test-org',
      },
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

    it('should get organization', () => {
      expect(provider.getOrganization()).toBe('test-org');
    });

    it('should get API key', () => {
      expect(provider.getApiKey()).toBe('test-key');
    });
  });
});
