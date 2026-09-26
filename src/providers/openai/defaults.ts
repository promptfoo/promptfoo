import { OpenAiChatCompletionProvider } from './chat';
import { OpenAiEmbeddingProvider } from './embedding';
import { OpenAiModerationProvider } from './moderation';
import { OpenAiResponsesProvider } from './responses';

import type { EnvOverrides } from '../../types/env';

const DEFAULT_OPENAI_MODEL = 'gpt-6-sol';

export const DefaultEmbeddingProvider = new OpenAiEmbeddingProvider('text-embedding-3-large');
export const DefaultGradingProvider = new OpenAiChatCompletionProvider(DEFAULT_OPENAI_MODEL);
export const DefaultGradingJsonProvider = new OpenAiChatCompletionProvider(DEFAULT_OPENAI_MODEL, {
  config: {
    response_format: { type: 'json_object' },
  },
});
export const DefaultSuggestionsProvider = new OpenAiChatCompletionProvider(DEFAULT_OPENAI_MODEL);
export const DefaultModerationProvider = new OpenAiModerationProvider('omni-moderation-latest');
export const DefaultWebSearchProvider = new OpenAiResponsesProvider(DEFAULT_OPENAI_MODEL, {
  config: {
    tools: [{ type: 'web_search_preview' }],
  },
});

/** Bind explicit helper overrides to the providers used after selection. */
export function getOpenAiProviders(env?: EnvOverrides) {
  return {
    embeddingProvider: env
      ? new OpenAiEmbeddingProvider('text-embedding-3-large', { env })
      : DefaultEmbeddingProvider,
    gradingProvider: env
      ? new OpenAiChatCompletionProvider(DEFAULT_OPENAI_MODEL, { env })
      : DefaultGradingProvider,
    gradingJsonProvider: env
      ? new OpenAiChatCompletionProvider(DEFAULT_OPENAI_MODEL, {
          env,
          config: { response_format: { type: 'json_object' } },
        })
      : DefaultGradingJsonProvider,
    suggestionsProvider: env
      ? new OpenAiChatCompletionProvider(DEFAULT_OPENAI_MODEL, { env })
      : DefaultSuggestionsProvider,
    moderationProvider: env
      ? new OpenAiModerationProvider('omni-moderation-latest', { env })
      : DefaultModerationProvider,
    webSearchProvider: env
      ? new OpenAiResponsesProvider(DEFAULT_OPENAI_MODEL, {
          env,
          config: { tools: [{ type: 'web_search_preview' }] },
        })
      : DefaultWebSearchProvider,
  };
}
