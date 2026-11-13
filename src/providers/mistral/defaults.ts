import { MistralChatCompletionProvider, MistralEmbeddingProvider } from '../mistral';

import type { EnvOverrides } from '../../contracts/env';

const DEFAULT_MISTRAL_MODEL = 'mistral-large-latest';

function createProviders(env?: EnvOverrides) {
  return {
    embeddingProvider: new MistralEmbeddingProvider({ env }),
    gradingProvider: new MistralChatCompletionProvider(DEFAULT_MISTRAL_MODEL, { env }),
    gradingJsonProvider: new MistralChatCompletionProvider(DEFAULT_MISTRAL_MODEL, {
      env,
      config: { response_format: { type: 'json_object' } },
    }),
    suggestionsProvider: new MistralChatCompletionProvider(DEFAULT_MISTRAL_MODEL, { env }),
    synthesizeProvider: new MistralChatCompletionProvider(DEFAULT_MISTRAL_MODEL, { env }),
  };
}

const defaults = createProviders();
export const {
  embeddingProvider: DefaultEmbeddingProvider,
  gradingProvider: DefaultGradingProvider,
  gradingJsonProvider: DefaultGradingJsonProvider,
  suggestionsProvider: DefaultSuggestionsProvider,
  synthesizeProvider: DefaultSynthesizeProvider,
} = defaults;

/** Bind explicit helper overrides to the providers used after selection. */
export function getMistralProviders(env?: EnvOverrides) {
  return env ? createProviders(env) : { ...defaults };
}
