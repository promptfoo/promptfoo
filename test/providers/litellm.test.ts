import { createLiteLLMProvider } from '../../src/providers/litellm';
import { OpenAiChatCompletionProvider } from '../../src/providers/openai/chat';
import { OpenAiCompletionProvider } from '../../src/providers/openai/completion';
import { OpenAiEmbeddingProvider } from '../../src/providers/openai/embedding';

describe('LiteLLM Provider', () => {
  describe('createLiteLLMProvider', () => {
    it('should create a chat provider by default', () => {
      const provider = createLiteLLMProvider('litellm:gpt-4', {});
      expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
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

    it('should support embeddings alias', () => {
      const provider = createLiteLLMProvider('litellm:embeddings:text-embedding-3-small', {});
      expect(provider).toBeInstanceOf(OpenAiEmbeddingProvider);
    });

    it('should use custom apiBaseUrl from config', () => {
      const customUrl = 'https://custom.litellm.com';
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

    it('should handle model names with colons', () => {
      const provider = createLiteLLMProvider('litellm:chat:custom:model:v1', {});
      expect(provider).toBeInstanceOf(OpenAiChatCompletionProvider);
      expect(provider.id()).toContain('custom:model:v1');
    });

    it('should pass through additional config options', () => {
      const provider = createLiteLLMProvider('litellm:chat:gpt-4', {
        config: {
          config: {
            temperature: 0.7,
            max_tokens: 100,
          },
        },
      });
      expect(provider.config.temperature).toBe(0.7);
      expect(provider.config.max_tokens).toBe(100);
    });
  });
});
