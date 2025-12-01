import { DeepSeekProvider } from '../deepseek';

// Default model for DeepSeek grading - deepseek-chat is the most capable general model
// Cost-effective with prompt caching support
export const DEFAULT_DEEPSEEK_MODEL = 'deepseek-chat';

export const DefaultGradingProvider = new DeepSeekProvider(DEFAULT_DEEPSEEK_MODEL);

export const DefaultGradingJsonProvider = new DeepSeekProvider(DEFAULT_DEEPSEEK_MODEL, {
  config: {
    response_format: { type: 'json_object' },
  },
});

export const DefaultSuggestionsProvider = new DeepSeekProvider(DEFAULT_DEEPSEEK_MODEL);

export const DefaultSynthesizeProvider = new DeepSeekProvider(DEFAULT_DEEPSEEK_MODEL);
