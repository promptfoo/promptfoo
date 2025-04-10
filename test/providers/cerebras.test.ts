import { loadApiProvider } from '../../src/providers';
import { createCerebrasProvider } from '../../src/providers/cerebras';
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
    it('should create a chat provider', () => {
      provider = createCerebrasProvider('cerebras:llama3.1-8b');
      expect(provider.id()).toBe('openai:llama3.1-8b');
      expect(provider.toString()).toContain('OpenAI');
      expect(provider.getApiKey()).toBe('test-key');
      expect(provider.getApiUrl()).toBe('https://api.cerebras.ai/v1');
    });
  });

  describe('loadApiProvider', () => {
    it('should load the provider from the registry', async () => {
      provider = await loadApiProvider('cerebras:llama3.1-8b');
      expect(provider.id()).toBe('openai:llama3.1-8b');
      expect(provider.toString()).toContain('OpenAI');
      expect(provider.getApiKey()).toBe('test-key');
      expect(provider.getApiUrl()).toBe('https://api.cerebras.ai/v1');
    });
  });
});
