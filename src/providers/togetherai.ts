import { OpenAiChatCompletionProvider } from './openai/chat';
import { OpenAiCompletionProvider } from './openai/completion';
import { OpenAiEmbeddingProvider } from './openai/embedding';
import { splitLocalOptions } from './openai/localOptions';

import type { EnvOverrides } from '../types/env';
import type { ApiProvider, ProviderOptions } from '../types/index';
import type { OpenAiCompletionOptions } from './openai/types';

// The chat provider resolves these itself: it loads `file://` references, renders Nunjucks
// vars, merges in MCP tools and normalizes tool shapes. `passthrough` is spread into the
// body last, so a raw copy of one of them would clobber the resolved value. It emits each
// of these whenever it is configured, so dropping the raw copy cannot lose a parameter.
// `reasoning_effort` is deliberately absent: the chat provider only renders and emits it
// for recognized reasoning model patterns or names containing `gpt-oss`, so passthrough
// has to keep carrying it for other models. The completion and embedding providers do not
// resolve these four options, so the filter applies to chat alone.
const chatResolvedOptionNames = [
  'functions',
  'response_format',
  'tool_choice',
  'tools',
] satisfies (keyof OpenAiCompletionOptions)[];

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
  const { modelParameters } = splitLocalOptions(config, isChat ? chatResolvedOptionNames : []);
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
