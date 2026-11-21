import { resolveProviderCreatorInput } from './creator';
import { OpenAiChatCompletionProvider } from './openai/chat';
import { OpenAiCompletionProvider } from './openai/completion';
import { OpenAiEmbeddingProvider } from './openai/embedding';
import { CHAT_RESOLVED_OPTION_NAMES, splitLocalOptions } from './openai/localOptions';

import type { ApiProvider } from '../types/index';
import type { ProviderCreatorOptions } from './creator';

// A Map, not an object literal, so a route segment naming an Object prototype member
// (`constructor`, `toString`) does not resolve to that member.
const providersByType = new Map<
  string,
  | typeof OpenAiChatCompletionProvider
  | typeof OpenAiCompletionProvider
  | typeof OpenAiEmbeddingProvider
>([
  ['chat', OpenAiChatCompletionProvider],
  ['completion', OpenAiCompletionProvider],
  ['embedding', OpenAiEmbeddingProvider],
  ['embeddings', OpenAiEmbeddingProvider],
]);

/**
 * Creates a TogetherAI provider using OpenAI-compatible endpoints
 *
 * TogetherAI supports many parameters beyond standard OpenAI ones.
 * Model parameters are passed through; connection and runtime options stay local.
 */
export function createTogetherAiProvider(
  providerPath: string,
  options: ProviderCreatorOptions = {},
): ApiProvider {
  const providerOptions = resolveProviderCreatorInput(options);
  const splits = providerPath.split(':');

  // Without an explicit type the whole remainder is the model name and we default to chat.
  const routed = providersByType.get(splits[1]);
  const Provider = routed ?? OpenAiChatCompletionProvider;
  const modelName = splits.slice(routed ? 2 : 1).join(':');

  const config = providerOptions.config || {};
  const isChat = Provider === OpenAiChatCompletionProvider;
  const { modelParameters } = splitLocalOptions(config, isChat ? CHAT_RESOLVED_OPTION_NAMES : []);
  const togetherAiConfig = {
    ...providerOptions,
    config: {
      ...config,
      apiBaseUrl: config.apiBaseUrl || 'https://api.together.xyz/v1',
      apiKeyEnvar: config.apiKeyEnvar || 'TOGETHER_API_KEY',
      passthrough: { ...modelParameters, ...config.passthrough },
    },
  };

  return new Provider(modelName, togetherAiConfig);
}
