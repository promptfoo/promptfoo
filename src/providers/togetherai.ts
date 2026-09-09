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

// The chat provider resolves these itself: it loads `file://` references, renders Nunjucks
// vars, merges in MCP tools and normalizes tool shapes. `passthrough` is spread into the
// body last, so a raw copy of one of them would clobber the resolved value. It emits each
// of these whenever it is configured, so dropping the raw copy cannot lose a parameter.
// `reasoning_effort` is deliberately absent: the chat provider only emits it for models it
// recognizes as reasoning models, which no TogetherAI model name but `gpt-oss` matches, so
// passthrough has to keep carrying it. The completion and embedding providers resolve
// nothing and only spread `passthrough`, so the filter applies to chat alone.
const chatResolvedOptionNames = new Set<string>([
  'functions',
  'response_format',
  'tool_choice',
  'tools',
] satisfies (keyof OpenAiCompletionOptions)[]);

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
  options: {
    config?: ProviderOptions;
    id?: string;
    env?: EnvOverrides;
  } = {},
): ApiProvider {
  const splits = providerPath.split(':');

  // Without an explicit type the whole remainder is the model name and we default to chat.
  const routed = providersByType.get(splits[1]);
  const Provider = routed ?? OpenAiChatCompletionProvider;
  const modelName = splits.slice(routed ? 2 : 1).join(':');

  const config = options.config?.config || {};
  const isChat = Provider === OpenAiChatCompletionProvider;
  const modelParameters = Object.fromEntries(
    Object.entries(config).filter(
      ([key]) => !localOptionNames.has(key) && !(isChat && chatResolvedOptionNames.has(key)),
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

  return new Provider(modelName, togetherAiConfig);
}
