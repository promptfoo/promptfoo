import { OpenAiChatCompletionProvider } from './openai/chat';
import { OpenAiCompletionProvider } from './openai/completion';
import { OpenAiEmbeddingProvider } from './openai/embedding';

import type { EnvOverrides } from '../types/env';
import type { ApiProvider, ProviderOptions } from '../types/index';
import type { OpenAiCompletionOptions, OpenAiSharedOptions } from './openai/types';

// These are consumed by promptfoo or its transport, not TogetherAI's model endpoint.
// Requiring every shared option here keeps future connection settings out of passthrough.
const localOptions = {
  apiKey: true,
  apiKeyEnvar: true,
  apiKeyRequired: true,
  apiHost: true,
  apiBaseUrl: true,
  organization: true,
  headers: true,
  maxRetries: true,
  cost: true,
  inputCost: true,
  outputCost: true,
  audioCost: true,
  audioInputCost: true,
  audioOutputCost: true,
  passthrough: true,
  mcp: true,
  functionToolCallbacks: true,
  showThinking: true,
  omitDefaults: true,
  basePath: true,
  linkedTargetId: true,
} satisfies Record<keyof OpenAiSharedOptions, boolean> &
  Partial<Record<keyof OpenAiCompletionOptions | 'basePath' | 'linkedTargetId', boolean>>;
const localOptionNames = new Set(Object.keys(localOptions));

/**
 * Creates a TogetherAI provider using OpenAI-compatible endpoints
 *
 * TogetherAI supports many parameters beyond standard OpenAI ones.
 * Model parameters are passed through; connection and runtime options stay local.
 */
export function createTogetherAiProvider(
  providerPath: string,
  options: {
    config?: ProviderOptions;
    id?: string;
    env?: EnvOverrides;
  } = {},
): ApiProvider {
  const splits = providerPath.split(':');

  const config = options.config?.config || {};
  const modelParameters = Object.fromEntries(
    Object.entries(config).filter(([key]) => !localOptionNames.has(key)),
  );
  const togetherAiConfig = {
    ...options.config,
    id: options.id ?? options.config?.id,
    env: options.config?.env ?? options.env,
    config: {
      ...config,
      apiBaseUrl: config.apiBaseUrl || 'https://api.together.xyz/v1',
      apiKeyEnvar: config.apiKeyEnvar || 'TOGETHER_API_KEY',
      passthrough: { ...modelParameters, ...config.passthrough },
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
