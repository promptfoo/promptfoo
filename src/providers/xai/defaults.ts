import { XAIProvider } from './chat';

// Default model for xAI grading - Grok 4.1 Fast offers excellent cost/performance
// Supports 2M context window, fast inference, and reasoning capabilities
export const DEFAULT_XAI_MODEL = 'grok-4-1-fast-reasoning';

export const DefaultGradingProvider = new XAIProvider(DEFAULT_XAI_MODEL);

export const DefaultGradingJsonProvider = new XAIProvider(DEFAULT_XAI_MODEL, {
  config: {
    response_format: { type: 'json_object' },
  },
});

export const DefaultSuggestionsProvider = new XAIProvider(DEFAULT_XAI_MODEL);

export const DefaultSynthesizeProvider = new XAIProvider(DEFAULT_XAI_MODEL);
