import { loadApiProvider } from '../../../src/providers';
import type { ApiProvider } from '../../../src/types/providers';

describe('GitHub Models Provider Integration', () => {
  it('should load GitHub provider with default model', async () => {
    const provider = (await loadApiProvider('github:', {
      basePath: process.cwd(),
    })) as ApiProvider;

    expect(provider).toBeDefined();
    expect(provider.id()).toBe('openai/gpt-4.1'); // Default model
  });

  it('should load GitHub provider with specific model', async () => {
    const provider = (await loadApiProvider('github:openai/gpt-4o-mini', {
      basePath: process.cwd(),
    })) as ApiProvider;

    expect(provider).toBeDefined();
    expect(provider.id()).toBe('openai/gpt-4o-mini');
  });

  it('should load GitHub provider with azureml models', async () => {
    const provider = (await loadApiProvider('github:azureml/Phi-4', {
      basePath: process.cwd(),
    })) as ApiProvider;

    expect(provider).toBeDefined();
    expect(provider.id()).toBe('azureml/Phi-4');
  });

  it('should set correct configuration', async () => {
    const provider = (await loadApiProvider('github:openai/gpt-4o', {
      basePath: process.cwd(),
      options: {
        config: {
          temperature: 0.7,
          max_tokens: 1000,
        },
      },
    })) as ApiProvider;

    expect(provider).toBeDefined();

    // Check that it's using OpenAI provider under the hood
    const providerClass = provider.constructor.name;
    expect(providerClass).toBe('OpenAiChatCompletionProvider');
  });
});
