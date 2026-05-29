import { OpenAiChatCompletionProvider } from './chat';
import { OpenAiEmbeddingProvider } from './embedding';
import { OpenAiModerationProvider } from './moderation';
import { OpenAiResponsesProvider } from './responses';

import type { EnvOverrides } from '../../types/env';
import type { DefaultProviders } from '../../types/index';

export const DEFAULT_OPENAI_GRADING_MODEL = 'gpt-5.5-2026-04-23';
const DEFAULT_OPENAI_EMBEDDING_MODEL = 'text-embedding-3-large';
const DEFAULT_OPENAI_MODERATION_MODEL = 'omni-moderation-latest';

export const DefaultEmbeddingProvider = new OpenAiEmbeddingProvider(DEFAULT_OPENAI_EMBEDDING_MODEL);
export const DefaultGradingProvider = new OpenAiChatCompletionProvider(
  DEFAULT_OPENAI_GRADING_MODEL,
);
export const DefaultGradingJsonProvider = new OpenAiChatCompletionProvider(
  DEFAULT_OPENAI_GRADING_MODEL,
  {
    config: {
      response_format: { type: 'json_object' },
    },
  },
);
export const DefaultSuggestionsProvider = new OpenAiChatCompletionProvider(
  DEFAULT_OPENAI_GRADING_MODEL,
);
export const DefaultModerationProvider = new OpenAiModerationProvider(
  DEFAULT_OPENAI_MODERATION_MODEL,
);
export const DefaultWebSearchProvider = new OpenAiResponsesProvider('gpt-5.5-2026-04-23', {
  config: {
    tools: [{ type: 'web_search_preview' }],
  },
});

export function getOpenAiProviders(env?: EnvOverrides): DefaultProviders {
  if (!env) {
    return {
      embeddingProvider: DefaultEmbeddingProvider,
      gradingJsonProvider: DefaultGradingJsonProvider,
      gradingProvider: DefaultGradingProvider,
      moderationProvider: DefaultModerationProvider,
      suggestionsProvider: DefaultSuggestionsProvider,
      synthesizeProvider: DefaultGradingJsonProvider,
      webSearchProvider: DefaultWebSearchProvider,
    };
  }

  const gradingJsonProvider = new OpenAiChatCompletionProvider(DEFAULT_OPENAI_GRADING_MODEL, {
    env,
    config: {
      response_format: { type: 'json_object' },
    },
  });

  return {
    embeddingProvider: new OpenAiEmbeddingProvider(DEFAULT_OPENAI_EMBEDDING_MODEL, { env }),
    gradingJsonProvider,
    gradingProvider: new OpenAiChatCompletionProvider(DEFAULT_OPENAI_GRADING_MODEL, { env }),
    moderationProvider: new OpenAiModerationProvider(DEFAULT_OPENAI_MODERATION_MODEL, { env }),
    suggestionsProvider: new OpenAiChatCompletionProvider(DEFAULT_OPENAI_GRADING_MODEL, { env }),
    synthesizeProvider: gradingJsonProvider,
    webSearchProvider: new OpenAiResponsesProvider(DEFAULT_OPENAI_GRADING_MODEL, {
      env,
      config: {
        tools: [{ type: 'web_search_preview' }],
      },
    }),
  };
}
