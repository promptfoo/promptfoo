import { createLiteLLMProvider, LiteLLMProvider } from '../../src/providers/litellm';

describe('LiteLLM Provider', () => {
  describe('createLiteLLMProvider', () => {
    it('should create a chat provider by default', () => {
      const provider = createLiteLLMProvider('litellm:gpt-4', {});
      expect(provider).toBeInstanceOf(LiteLLMProvider);
    });

    it('should create a chat provider when explicitly specified', () => {
      const provider = createLiteLLMProvider('litellm:chat:gpt-4', {});
      expect(provider).toBeInstanceOf(LiteLLMProvider);
    });

    it('should create a completion provider', () => {
      const provider = createLiteLLMProvider('litellm:completion:gpt-3.5-turbo-instruct', {});
      // Check that it has the right methods and identity
      expect(provider.id()).toBe('litellm:completion:gpt-3.5-turbo-instruct');
      expect(provider.toString()).toContain('LiteLLM Provider completion');
    });

    it('should create an embedding provider', () => {
      const provider = createLiteLLMProvider('litellm:embedding:text-embedding-3-small', {});
      // Check that it has the right methods and identity
      expect(provider.id()).toBe('litellm:embedding:text-embedding-3-small');
      expect(provider.toString()).toContain('LiteLLM Provider embedding');
    });

    it('should support embeddings alias', () => {
      const provider = createLiteLLMProvider('litellm:embeddings:text-embedding-3-small', {});
      // Check that it has the right methods and identity
      expect(provider.id()).toBe('litellm:embedding:text-embedding-3-small');
      expect(provider.toString()).toContain('LiteLLM Provider embedding');
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
      expect(provider).toBeInstanceOf(LiteLLMProvider);
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

    describe('Provider Identity', () => {
      it('should return LiteLLM identity for chat provider', () => {
        const provider = createLiteLLMProvider('litellm:gpt-4', {});
        expect(provider.id()).toBe('litellm:gpt-4');
        expect(provider.toString()).toBe('[LiteLLM Provider gpt-4]');
        expect(provider.toJSON).toBeDefined();
        expect(provider.toJSON!()).toEqual({
          provider: 'litellm',
          model: 'gpt-4',
          type: 'chat',
          config: expect.any(Object),
        });
      });

      it('should return LiteLLM identity for explicit chat provider', () => {
        const provider = createLiteLLMProvider('litellm:chat:gpt-4', {});
        expect(provider.id()).toBe('litellm:gpt-4');
        expect(provider.toString()).toBe('[LiteLLM Provider gpt-4]');
      });

      it('should return LiteLLM identity for completion provider', () => {
        const provider = createLiteLLMProvider('litellm:completion:gpt-3.5-turbo-instruct', {});
        expect(provider.id()).toBe('litellm:completion:gpt-3.5-turbo-instruct');
        expect(provider.toString()).toBe('[LiteLLM Provider completion gpt-3.5-turbo-instruct]');
        expect(provider.toJSON).toBeDefined();
        expect(provider.toJSON!()).toEqual({
          provider: 'litellm',
          model: 'gpt-3.5-turbo-instruct',
          type: 'completion',
          config: expect.any(Object),
        });
      });

      it('should return LiteLLM identity for embedding provider', () => {
        const provider = createLiteLLMProvider('litellm:embedding:text-embedding-3-small', {});
        expect(provider.id()).toBe('litellm:embedding:text-embedding-3-small');
        expect(provider.toString()).toBe('[LiteLLM Provider embedding text-embedding-3-small]');
        expect(provider.toJSON).toBeDefined();
        expect(provider.toJSON!()).toEqual({
          provider: 'litellm',
          model: 'text-embedding-3-small',
          type: 'embedding',
          config: expect.any(Object),
        });
      });
    });

    describe('Config handling', () => {
      it('should not override default apiBaseUrl with falsy values', () => {
        const provider1 = createLiteLLMProvider('litellm:chat:gpt-4', {
          config: {
            config: {
              apiBaseUrl: null as any,
            },
          },
        });
        expect(provider1.config.apiBaseUrl).toBe('http://0.0.0.0:4000');

        const provider2 = createLiteLLMProvider('litellm:chat:gpt-4', {
          config: {
            config: {
              apiBaseUrl: undefined,
            },
          },
        });
        expect(provider2.config.apiBaseUrl).toBe('http://0.0.0.0:4000');

        const provider3 = createLiteLLMProvider('litellm:chat:gpt-4', {
          config: {
            config: {
              apiBaseUrl: '',
            },
          },
        });
        expect(provider3.config.apiBaseUrl).toBe('');
      });

      it('should override default apiBaseUrl with truthy values', () => {
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
    });
  });

  describe('Embedding Provider Functionality', () => {
    it('should have callEmbeddingApi method', () => {
      const provider = createLiteLLMProvider('litellm:embedding:text-embedding-3-small', {});
      expect(typeof provider.callEmbeddingApi).toBe('function');
    });

    it('should be recognized as a valid embedding provider', () => {
      const provider = createLiteLLMProvider('litellm:embedding:text-embedding-3-small', {});
      // Check that it has either callEmbeddingApi or callSimilarityApi (matching the validation in matchers.ts)
      const isValidEmbeddingProvider =
        'callEmbeddingApi' in provider || 'callSimilarityApi' in provider;
      expect(isValidEmbeddingProvider).toBe(true);
    });

    it('should not have callEmbeddingApi method for chat providers', () => {
      const provider = createLiteLLMProvider('litellm:chat:gpt-4', {});
      expect('callEmbeddingApi' in provider).toBe(false);
    });

    it('should not have callEmbeddingApi method for completion providers', () => {
      const provider = createLiteLLMProvider('litellm:completion:gpt-3.5-turbo-instruct', {});
      expect('callEmbeddingApi' in provider).toBe(false);
    });

    it('should pass through custom configuration to embedding provider', () => {
      const customConfig = {
        apiBaseUrl: 'https://custom.litellm.com',
        apiKey: 'custom-key',
        temperature: 0.5,
      };
      const provider = createLiteLLMProvider('litellm:embedding:text-embedding-3-small', {
        config: {
          config: customConfig,
        },
      });
      expect(provider.config).toMatchObject(customConfig);
    });

    it('should handle model names with colons for embedding providers', () => {
      const provider = createLiteLLMProvider('litellm:embedding:custom:embedding:model:v1', {});
      expect(provider.id()).toBe('litellm:embedding:custom:embedding:model:v1');
      expect(typeof provider.callEmbeddingApi).toBe('function');
    });
  });
});
