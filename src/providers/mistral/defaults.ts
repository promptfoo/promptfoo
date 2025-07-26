import { MistralChatCompletionProvider, MistralEmbeddingProvider } from '../mistral';

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
