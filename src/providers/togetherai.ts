import type { ApiProvider, ProviderOptions } from '../types';
import type { EnvOverrides } from '../types/env';
import {
  OpenAiChatCompletionProvider,
  OpenAiCompletionProvider,
  OpenAiEmbeddingProvider,
} from './openai';

export function createTogetherAiProvider(
  providerPath: string,
  options: {
    config?: ProviderOptions;
    id?: string;
    env?: EnvOverrides;
  } = {},
): ApiProvider {
  const splits = providerPath.split(':');
  const togetherAiConfig = {
    ...options,
    config: {
      ...options.config,
      apiBaseUrl: 'https://api.together.xyz/v1',
      apiKeyEnvar: 'TOGETHER_API_KEY',
    },
  };

  if (splits[1] === 'chat') {
    const modelName = splits.slice(2).join(':');
    return new OpenAiChatCompletionProvider(modelName, togetherAiConfig);
  } else if (splits[1] === 'completion') {
    const modelName = splits.slice(2).join(':');
    return new OpenAiCompletionProvider(modelName, togetherAiConfig);
  } else if (splits[1] === 'embedding' || splits[1] === 'embeddings') {
    const modelName = splits.slice(2).join(':');
    return new OpenAiEmbeddingProvider(modelName, togetherAiConfig);
  } else {
    // If no specific type is provided, default to chat
    const modelName = splits.slice(1).join(':');
    return new OpenAiChatCompletionProvider(modelName, togetherAiConfig);
  }
}
