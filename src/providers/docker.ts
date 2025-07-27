import type { EnvOverrides, ProviderOptions } from '../types';
import type { OpenAiCompletionOptions } from './openai/types';
import { OpenAiChatCompletionProvider } from './openai/chat';
import { OpenAiCompletionProvider } from './openai/completion';
import { OpenAiEmbeddingProvider } from './openai/embedding';
import { getEnvString } from '../envars';

export function parseProviderPath(providerPath: string): {
  type: 'chat' | 'completion' | 'embeddings';
  model: string;
} {
  const splits = providerPath.split(':');
  const type = splits[1];
  switch (type) {
    case 'chat':
    case 'completion':
    case 'embeddings':
      return {
        type,
        model: splits.slice(2).join(':'),
      };
    case 'embedding':
      return {
        type: 'embeddings',
        model: splits.slice(2).join(':'),
      };
    default:
      return {
        type: 'chat',
        model: splits.slice(1).join(':'),
      };
  }
}

/**
 * Factory for creating Docker Model Runner providers using OpenAI-compatible endpoints.
 */
export function createDockerProvider(
  providerPath: string,
  options: { config?: ProviderOptions; id?: string; env?: EnvOverrides } = {},
) {
  const apiUrl =
    options?.env?.DOCKER_MODEL_RUNNER_BASE_URL ??
    getEnvString('DOCKER_MODEL_RUNNER_BASE_URL') ??
    'http://localhost:12434';
  const apiBaseUrl = apiUrl + '/engines/v1';

  const apiKey =
    options?.env?.DOCKER_MODEL_RUNNER_API_KEY ??
    getEnvString('DOCKER_MODEL_RUNNER_API_KEY') ??
    'dmr';

  const openaiOptions = {
    ...options,
    config: {
      ...(options.config || {}),
      apiBaseUrl,
      apiKey,
    } as OpenAiCompletionOptions,
  };
  const { type, model } = parseProviderPath(providerPath);
  switch (type) {
    case 'chat':
    default:
      return new OpenAiChatCompletionProvider(model, openaiOptions);
    case 'completion':
      return new OpenAiCompletionProvider(model, openaiOptions);
    case 'embeddings':
      return new OpenAiEmbeddingProvider(model, openaiOptions);
  }
}
