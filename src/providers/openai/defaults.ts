import { OpenAiChatCompletionProvider } from './chat';
import { OpenAiEmbeddingProvider } from './embedding';
import { OpenAiModerationProvider } from './moderation';

export const DefaultEmbeddingProvider = new OpenAiEmbeddingProvider('text-embedding-3-large');
export const DefaultGradingProvider = new OpenAiChatCompletionProvider('gpt-4.1-2025-04-14');
export const DefaultGradingJsonProvider = new OpenAiChatCompletionProvider('gpt-4.1-2025-04-14', {
  config: {
    response_format: { type: 'json_object' },
  },
});
export const DefaultSuggestionsProvider = new OpenAiChatCompletionProvider('gpt-4.1-2025-04-14');
export const DefaultModerationProvider = new OpenAiModerationProvider('omni-moderation-latest');

// Redteam specific providers - using most capable model for attack generation
// and potentially a smaller model for judging to save costs
export const DefaultRedteamAttackProvider = new OpenAiChatCompletionProvider('gpt-4.1-2025-04-14', {
  config: {
    response_format: { type: 'json_object' },
  },
});
export const DefaultRedteamJudgeProvider = new OpenAiChatCompletionProvider('gpt-4o-mini', {
  config: {
    response_format: { type: 'json_object' },
  },
});
