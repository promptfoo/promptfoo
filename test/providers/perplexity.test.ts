import { clearCache } from '../../src/cache';
import { loadApiProvider } from '../../src/providers';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai';

describe('Perplexity Providers', () => {
  afterEach(async () => {
    jest.clearAllMocks();
    await clearCache();
  });

  describe('Provider Loading', () => {
    it('loadApiProvider with perplexity', async () => {
      const provider = await loadApiProvider('perplexity:llama-3-sonar-large-32k-online');
      expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
      expect(provider.id()).toBe('llama-3-sonar-large-32k-online');
      expect(provider.config.apiBaseUrl).toBe('https://api.perplexity.ai');
      expect(provider.config.apiKeyEnvar).toBe('PERPLEXITY_API_KEY');
    });
  });
});
