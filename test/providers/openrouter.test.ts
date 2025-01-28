import { clearCache } from '../../src/cache';
import { loadApiProvider } from '../../src/providers';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai';

describe('OpenRouter Providers', () => {
  afterEach(async () => {
    jest.clearAllMocks();
    await clearCache();
  });

  describe('Provider Loading', () => {
    it('loadApiProvider with openrouter', async () => {
      const provider = await loadApiProvider('openrouter:mistralai/mistral-medium');
      expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
      // Intentionally openai, because it's just a wrapper around openai
      expect(provider.id()).toBe('mistralai/mistral-medium');
    });
  });
});
