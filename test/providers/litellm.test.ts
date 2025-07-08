import { createLiteLLMProvider, LiteLLMProvider } from '../../src/providers/litellm';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { OpenAiCompletionProvider } from '../../src/providers/openai/completion';
import { OpenAiEmbeddingProvider } from '../../src/providers/openai/embedding';

describe('LiteLLM Provider', () => {
  describe('createLiteLLMProvider', () => {
    it('should create a chat provider by default', () => {
      const provider = createLiteLLMProvider('litellm:gpt-4', {});
      expect(provider).toBeInstanceOf(LiteLLMProvider);
    });

    it('should create a chat provider when explicitly specified', () => {
      const provider = createLiteLLMProvider('litellm:chat:gpt-4', {});
      expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
    });

    it('should create a completion provider', () => {
      const provider = createLiteLLMProvider('litellm:completion:gpt-3.5-turbo-instruct', {});
      expect(provider).toBeInstanceOf(OpenAiCompletionProvider);
    });

    it('should create an embedding provider', () => {
      const provider = createLiteLLMProvider('litellm:embedding:text-embedding-3-small', {});
      expect(provider).toBeInstanceOf(OpenAiEmbeddingProvider);
    });

    it('should create an embedding provider with embeddings alias', () => {
      const provider = createLiteLLMProvider('litellm:embeddings:text-embedding-3-small', {});
      expect(provider).toBeInstanceOf(OpenAiEmbeddingProvider);
    });

    it('should use custom apiBaseUrl from config', () => {
      const customUrl = 'https://custom-litellm-server.com';
      const provider = createLiteLLMProvider('litellm:chat:gpt-4', {
        config: {
          config: {
            apiBaseUrl: customUrl,
          },
        },
      });
      expect(provider.config.apiBaseUrl).toBe(customUrl);
    });

    it('should use default apiBaseUrl if not provided', () => {
      const provider = createLiteLLMProvider('litellm:chat:gpt-4', {});
      expect(provider.config.apiBaseUrl).toBe('http://0.0.0.0:4000');
    });

    it('should set apiKeyRequired to false', () => {
      const provider = createLiteLLMProvider('litellm:chat:gpt-4', {});
      expect(provider.config.apiKeyRequired).toBe(false);
    });

    it('should set apiKeyEnvar to LITELLM_API_KEY', () => {
      const provider = createLiteLLMProvider('litellm:chat:gpt-4', {});
      expect(provider.config.apiKeyEnvar).toBe('LITELLM_API_KEY');
    });
  });

  describe('LiteLLMProvider (legacy)', () => {
    it('should create a provider with the correct id', () => {
      const provider = new LiteLLMProvider('gpt-4', {});
      expect(provider.id()).toBe('litellm:gpt-4');
    });

    it('should return correct string representation', () => {
      const provider = new LiteLLMProvider('gpt-4', {});
      expect(provider.toString()).toBe('[LiteLLM Provider gpt-4]');
    });

    it('should return correct JSON representation', () => {
      const provider = new LiteLLMProvider('gpt-4', {});
      const json = provider.toJSON();
      expect(json.provider).toBe('litellm');
      expect(json.model).toBe('gpt-4');
    });

    it('should use custom config options', () => {
      const provider = new LiteLLMProvider('gpt-4', {
        config: {
          apiBaseUrl: 'https://custom-server.com',
          temperature: 0.7,
        },
      });
      expect(provider.config.apiBaseUrl).toBe('https://custom-server.com');
      expect(provider.config.temperature).toBe(0.7);
    });
  });
}); 