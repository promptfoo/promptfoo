import { MistralChatCompletionProvider, MistralEmbeddingProvider } from '../mistral';

import type { EnvOverrides } from '../../contracts/env';

export const DefaultEmbeddingProvider = new MistralEmbeddingProvider();
export const DefaultGradingProvider = new MistralChatCompletionProvider('mistral-large-latest');
export const DefaultGradingJsonProvider = new MistralChatCompletionProvider(
  'mistral-large-latest',
  {
    config: {
      response_format: { type: 'json_object' },
    },
  },
);
export const DefaultSuggestionsProvider = new MistralChatCompletionProvider('mistral-large-latest');
export const DefaultSynthesizeProvider = new MistralChatCompletionProvider('mistral-large-latest');

/** Bind explicit helper overrides to the providers used after selection. */
export function getMistralProviders(env?: EnvOverrides) {
  return {
    embeddingProvider: env ? new MistralEmbeddingProvider({ env }) : DefaultEmbeddingProvider,
    gradingProvider: env
      ? new MistralChatCompletionProvider('mistral-large-latest', { env })
      : DefaultGradingProvider,
    gradingJsonProvider: env
      ? new MistralChatCompletionProvider('mistral-large-latest', {
          env,
          config: { response_format: { type: 'json_object' } },
        })
      : DefaultGradingJsonProvider,
    suggestionsProvider: env
      ? new MistralChatCompletionProvider('mistral-large-latest', { env })
      : DefaultSuggestionsProvider,
    synthesizeProvider: env
      ? new MistralChatCompletionProvider('mistral-large-latest', { env })
      : DefaultSynthesizeProvider,
  };
}
