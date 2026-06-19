import { MistralChatCompletionProvider, MistralEmbeddingProvider } from '../mistral';

import type { EnvOverrides } from '../../types/env';
import type { DefaultProviders } from '../../types/index';

const DEFAULT_MISTRAL_GRADING_MODEL = 'mistral-large-latest';

export const DefaultEmbeddingProvider = new MistralEmbeddingProvider();
export const DefaultGradingProvider = new MistralChatCompletionProvider(
  DEFAULT_MISTRAL_GRADING_MODEL,
);
export const DefaultGradingJsonProvider = new MistralChatCompletionProvider(
  DEFAULT_MISTRAL_GRADING_MODEL,
  {
    config: {
      response_format: { type: 'json_object' },
    },
  },
);
export const DefaultSuggestionsProvider = new MistralChatCompletionProvider(
  DEFAULT_MISTRAL_GRADING_MODEL,
);
export const DefaultSynthesizeProvider = new MistralChatCompletionProvider(
  DEFAULT_MISTRAL_GRADING_MODEL,
);

export function getMistralProviders(
  env?: EnvOverrides,
): Pick<
  DefaultProviders,
  | 'embeddingProvider'
  | 'gradingJsonProvider'
  | 'gradingProvider'
  | 'suggestionsProvider'
  | 'synthesizeProvider'
> {
  if (!env) {
    return {
      embeddingProvider: DefaultEmbeddingProvider,
      gradingJsonProvider: DefaultGradingJsonProvider,
      gradingProvider: DefaultGradingProvider,
      suggestionsProvider: DefaultSuggestionsProvider,
      synthesizeProvider: DefaultSynthesizeProvider,
    };
  }

  return {
    embeddingProvider: new MistralEmbeddingProvider({ env }),
    gradingJsonProvider: new MistralChatCompletionProvider(DEFAULT_MISTRAL_GRADING_MODEL, {
      env,
      config: {
        response_format: { type: 'json_object' },
      },
    }),
    gradingProvider: new MistralChatCompletionProvider(DEFAULT_MISTRAL_GRADING_MODEL, { env }),
    suggestionsProvider: new MistralChatCompletionProvider(DEFAULT_MISTRAL_GRADING_MODEL, { env }),
    synthesizeProvider: new MistralChatCompletionProvider(DEFAULT_MISTRAL_GRADING_MODEL, { env }),
  };
}
