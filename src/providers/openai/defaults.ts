import { OpenAiChatCompletionProvider } from './chat';
import { OpenAiEmbeddingProvider } from './embedding';
import { OpenAiModerationProvider } from './moderation';
import { OpenAiResponsesProvider } from './responses';

export const DefaultEmbeddingProvider = new OpenAiEmbeddingProvider('text-embedding-3-large');
export const DefaultGradingProvider = new OpenAiChatCompletionProvider('gpt-5-2025-08-07');
export const DefaultGradingJsonProvider = new OpenAiChatCompletionProvider('gpt-5-2025-08-07', {
  config: {
    response_format: { type: 'json_object' },
  },
});
export const DefaultSuggestionsProvider = new OpenAiChatCompletionProvider('gpt-5-2025-08-07');
export const DefaultModerationProvider = new OpenAiModerationProvider('omni-moderation-latest');
export const DefaultWebSearchProvider = new OpenAiResponsesProvider('gpt-5.1', {
  config: {
    tools: [{ type: 'web_search_preview' }],
  },
});
