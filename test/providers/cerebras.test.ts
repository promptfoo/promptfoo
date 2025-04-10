import { createCerebrasProvider } from '../../src/providers/cerebras';
import { loadApiProvider } from '../../src/providers';
import type { ApiProvider } from '../../src/types';

describe('Cerebras provider', () => {
  let provider: ApiProvider;

  beforeAll(() => {
    process.env.CEREBRAS_API_KEY = 'test-key';
  });

  afterAll(() => {
    delete process.env.CEREBRAS_API_KEY;
  });

  describe('createCerebrasProvider', () => {
    it('should create a chat provider when chat is specified', () => {
      provider = createCerebrasProvider('cerebras:chat:llama3.1-8b');
      expect(provider.id()).toBe('openai:llama3.1-8b');
      expect(provider.toString()).toContain('OpenAI');
      expect(provider.getApiKey()).toBe('test-key');
      expect(provider.getApiUrl()).toBe('https://api.cerebras.ai/v1');
    });

    it('should create a completion provider when completion is specified', () => {
      provider = createCerebrasProvider('cerebras:completion:llama3.1-8b');
      expect(provider.id()).toBe('openai:llama3.1-8b');
      expect(provider.toString()).toContain('OpenAI');
      expect(provider.getApiKey()).toBe('test-key');
      expect(provider.getApiUrl()).toBe('https://api.cerebras.ai/v1');
    });

    it('should default to chat provider when no type is specified', () => {
      provider = createCerebrasProvider('cerebras:llama3.1-8b');
      expect(provider.id()).toBe('openai:llama3.1-8b');
      expect(provider.toString()).toContain('OpenAI');
      expect(provider.getApiKey()).toBe('test-key');
      expect(provider.getApiUrl()).toBe('https://api.cerebras.ai/v1');
    });
  });

  describe('loadApiProvider', () => {
    it('should load the provider from the registry', async () => {
      provider = await loadApiProvider('cerebras:chat:llama3.1-8b');
      expect(provider.id()).toBe('openai:llama3.1-8b');
      expect(provider.toString()).toContain('OpenAI');
      expect(provider.getApiKey()).toBe('test-key');
      expect(provider.getApiUrl()).toBe('https://api.cerebras.ai/v1');
    });
  });
}); 