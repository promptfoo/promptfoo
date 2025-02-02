import { OpenAiChatCompletionProvider } from './chat';
import { OpenAiEmbeddingProvider } from './embedding';
import { createGradingProvider, createGradingJsonProvider } from './grading';
import { OpenAiModerationProvider } from './moderation';

export const DefaultEmbeddingProvider = new OpenAiEmbeddingProvider('text-embedding-3-large');

// These will be initialized asynchronously when needed
export let DefaultGradingProvider: OpenAiChatCompletionProvider;
export let DefaultGradingJsonProvider: OpenAiChatCompletionProvider;

// Initialize the grading providers
createGradingProvider().then((provider) => {
  DefaultGradingProvider = provider;
});

createGradingJsonProvider().then((provider) => {
  DefaultGradingJsonProvider = provider;
});

export const DefaultSuggestionsProvider = new OpenAiChatCompletionProvider('gpt-4o-2024-05-13');
export const DefaultModerationProvider = new OpenAiModerationProvider('omni-moderation-latest');
