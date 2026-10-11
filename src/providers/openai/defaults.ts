import { OpenAiChatCompletionProvider } from './chat';
import { OpenAiEmbeddingProvider } from './embedding';
import { OpenAiModerationProvider } from './moderation';
import { OpenAiResponsesProvider } from './responses';

import type { EnvOverrides } from '../../contracts/env';

const DEFAULT_OPENAI_MODEL = 'gpt-6-sol';

function createProviders(env?: EnvOverrides) {
  return {
    embeddingProvider: new OpenAiEmbeddingProvider('text-embedding-3-large', { env }),
    gradingProvider: new OpenAiChatCompletionProvider(DEFAULT_OPENAI_MODEL, { env }),
    gradingJsonProvider: new OpenAiChatCompletionProvider(DEFAULT_OPENAI_MODEL, {
      env,
      config: { response_format: { type: 'json_object' } },
    }),
    suggestionsProvider: new OpenAiChatCompletionProvider(DEFAULT_OPENAI_MODEL, { env }),
    moderationProvider: new OpenAiModerationProvider('omni-moderation-latest', { env }),
    webSearchProvider: new OpenAiResponsesProvider(DEFAULT_OPENAI_MODEL, {
      env,
      config: { tools: [{ type: 'web_search_preview' }] },
    }),
  };
}

const defaults = createProviders();
export const {
  embeddingProvider: DefaultEmbeddingProvider,
  gradingProvider: DefaultGradingProvider,
  gradingJsonProvider: DefaultGradingJsonProvider,
  suggestionsProvider: DefaultSuggestionsProvider,
  moderationProvider: DefaultModerationProvider,
  webSearchProvider: DefaultWebSearchProvider,
} = defaults;

/** Bind explicit helper overrides to the providers used after selection. */
export function getOpenAiProviders(env?: EnvOverrides) {
  return env ? createProviders(env) : { ...defaults };
}
