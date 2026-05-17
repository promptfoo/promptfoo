import { OpenAiChatCompletionProvider } from './chat';
import { OpenAiEmbeddingProvider } from './embedding';
import { OpenAiModerationProvider } from './moderation';
import { OpenAiResponsesProvider } from './responses';

const DEFAULT_OPENAI_GRADING_MODEL = 'gpt-5.5-2026-04-23';

export const DefaultEmbeddingProvider = new OpenAiEmbeddingProvider('text-embedding-3-large');
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
export const DefaultModerationProvider = new OpenAiModerationProvider('omni-moderation-latest');
export const DefaultWebSearchProvider = new OpenAiResponsesProvider('gpt-5.5-2026-04-23', {
  config: {
    tools: [{ type: 'web_search_preview' }],
  },
});
