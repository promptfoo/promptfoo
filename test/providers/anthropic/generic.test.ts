import { AnthropicGenericProvider } from '../../../src/providers/anthropic/generic';

jest.mock('proxy-agent', () => ({
  ProxyAgent: jest.fn().mockImplementation(() => ({})),
}));

describe('AnthropicGenericProvider', () => {
  describe('constructor', () => {
    it('should initialize with the given model name', () => {
      const provider = new AnthropicGenericProvider('claude-3-5-sonnet-20241022');
      expect(provider.modelName).toBe('claude-3-5-sonnet-20241022');
      expect(provider.config).toEqual({});
    });

    it('should use custom configuration if provided', () => {
      const provider = new AnthropicGenericProvider('claude-3-5-sonnet-20241022', {
        config: {
          apiKey: 'test-key',
          apiBaseUrl: 'https://custom.anthropic.api',
          headers: { 'Custom-Header': 'Value' },
        },
      });

      expect(provider.config.apiKey).toBe('test-key');
      expect(provider.config.apiBaseUrl).toBe('https://custom.anthropic.api');
      expect(provider.config.headers).toEqual({ 'Custom-Header': 'Value' });
    });

    it('should set a custom ID if provided', () => {
      const provider = new AnthropicGenericProvider('claude-3-5-sonnet-20241022', {
        id: 'custom-id',
      });

      expect(provider.id()).toBe('custom-id');
    });
  });

  describe('id', () => {
    it('should return the formatted ID', () => {
      const provider = new AnthropicGenericProvider('claude-3-5-sonnet-20241022');
      expect(provider.id()).toBe('anthropic:claude-3-5-sonnet-20241022');
    });
  });

  describe('toString', () => {
    it('should return a formatted string representation', () => {
      const provider = new AnthropicGenericProvider('claude-3-5-sonnet-20241022');
      expect(provider.toString()).toBe('[Anthropic Provider claude-3-5-sonnet-20241022]');
    });
  });

  describe('getApiKey', () => {
    it('should return the API key from config', () => {
      const provider = new AnthropicGenericProvider('claude-3-5-sonnet-20241022', {
        config: { apiKey: 'test-key' },
      });

      expect(provider.getApiKey()).toBe('test-key');
    });

    it('should use environment variables if no config key is provided', () => {
      // Mock process.env
      const originalEnv = process.env;
      process.env = { ...originalEnv, ANTHROPIC_API_KEY: 'env-test-key' };

      const provider = new AnthropicGenericProvider('claude-3-5-sonnet-20241022');
      expect(provider.getApiKey()).toBe('env-test-key');

      // Restore process.env
      process.env = originalEnv;
    });

    it('should prefer config over environment variables', () => {
      // Mock process.env
      const originalEnv = process.env;
      process.env = { ...originalEnv, ANTHROPIC_API_KEY: 'env-test-key' };

      const provider = new AnthropicGenericProvider('claude-3-5-sonnet-20241022', {
        config: { apiKey: 'config-test-key' },
      });

      expect(provider.getApiKey()).toBe('config-test-key');

      // Restore process.env
      process.env = originalEnv;
    });
  });

  describe('getApiBaseUrl', () => {
    it('should return the base URL from config', () => {
      const provider = new AnthropicGenericProvider('claude-3-5-sonnet-20241022', {
        config: { apiBaseUrl: 'https://custom.anthropic.api' },
      });

      expect(provider.getApiBaseUrl()).toBe('https://custom.anthropic.api');
    });

    it('should use environment variables if no config URL is provided', () => {
      // Mock process.env
      const originalEnv = process.env;
      process.env = { ...originalEnv, ANTHROPIC_BASE_URL: 'https://env.anthropic.api' };

      const provider = new AnthropicGenericProvider('claude-3-5-sonnet-20241022');
      expect(provider.getApiBaseUrl()).toBe('https://env.anthropic.api');

      // Restore process.env
      process.env = originalEnv;
    });
  });

  describe('callApi', () => {
    it('should throw an error when called directly', async () => {
      const provider = new AnthropicGenericProvider('claude-3-5-sonnet-20241022');
      await expect(provider.callApi('test')).rejects.toThrow('Not implemented');
    });
  });
});
