import { clearCache } from '../../src/cache';
import { loadApiProvider } from '../../src/providers';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai';

describe('GitHub Providers', () => {
  afterEach(async () => {
    jest.clearAllMocks();
    await clearCache();
  });

  describe('Provider Loading', () => {
    it('loadApiProvider with github', async () => {
      const provider = await loadApiProvider('github:gpt-4o-mini');
      expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
      // Intentionally openai, because it's just a wrapper around openai
      expect(provider.id()).toBe('gpt-4o-mini');
    });
  });
});
