import type { ApiProvider, ProviderOptions } from '../../types';
import { OllamaChatProvider } from './chat';
import { OllamaCompletionProvider } from './completion';
import { OllamaEmbeddingProvider } from './embedding';

/**
 * Create an Ollama provider based on the specified path
 */
export function createOllamaProvider(
  providerPath: string,
  options: {
    config?: ProviderOptions;
    id?: string;
  } = {},
): ApiProvider {
  const splits = providerPath.split(':');

  // Default to the model name if no type is specified (for backward compatibility)
  if (splits.length < 2) {
    return new OllamaCompletionProvider(splits[0], {
      id: options.id,
      config: options.config,
    });
  }

  const providerType = splits[1];
  const modelName = splits.slice(2).join(':');

  // Route to the appropriate provider based on the type
  switch (providerType) {
    case 'chat':
      return new OllamaChatProvider(modelName, {
        id: options.id,
        config: options.config,
      });

    case 'completion':
      return new OllamaCompletionProvider(modelName, {
        id: options.id,
        config: options.config,
      });

    case 'embedding':
    case 'embeddings':
      return new OllamaEmbeddingProvider(modelName, {
        id: options.id,
        config: options.config,
      });

    default:
      // If the type isn't recognized, assume it's part of the model name
      // This is for backward compatibility with the old format
      return new OllamaCompletionProvider(`${providerType}:${modelName}`, {
        id: options.id,
        config: options.config,
      });
  }
}

// Export all provider classes for direct imports
export * from './chat';
export * from './completion';
export * from './embedding';
