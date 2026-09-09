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
  useDefaultApiKey: true,
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

// The OpenAI provider resolves these itself: it loads `file://` references, renders
// Nunjucks vars and normalizes tool shapes. `passthrough` is spread into the body last,
// so a raw copy of one of them would clobber the resolved value.
const resolvedOptionNames = new Set<string>([
  'functions',
  'reasoning_effort',
  'response_format',
  'tool_choice',
  'tools',
] satisfies (keyof OpenAiCompletionOptions)[]);

const providersByType = {
  chat: OpenAiChatCompletionProvider,
  completion: OpenAiCompletionProvider,
  embedding: OpenAiEmbeddingProvider,
  embeddings: OpenAiEmbeddingProvider,
};

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
    Object.entries(config).filter(
      ([key]) => !localOptionNames.has(key) && !resolvedOptionNames.has(key),
    ),
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

  // If no specific type is provided, the whole remainder is the model name and we
  // default to chat.
  const Provider = providersByType[splits[1] as keyof typeof providersByType];
  const modelName = splits.slice(Provider ? 2 : 1).join(':');
  return new (Provider ?? OpenAiChatCompletionProvider)(modelName, togetherAiConfig);
}
