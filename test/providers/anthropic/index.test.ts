import { AnthropicCompletionProvider } from '../../../src/providers/anthropic/completion';
import {
  DEFAULT_ANTHROPIC_MODEL,
  AnthropicLlmRubricProvider,
  DefaultGradingProvider,
  DefaultGradingJsonProvider,
  DefaultLlmRubricProvider,
  DefaultSuggestionsProvider,
  getAnthropicProviders,
} from '../../../src/providers/anthropic/defaults';
import { AnthropicGenericProvider } from '../../../src/providers/anthropic/generic';
import { AnthropicMessagesProvider } from '../../../src/providers/anthropic/messages';
import {
  ANTHROPIC_MODELS,
  outputFromMessage,
  parseMessages,
  calculateAnthropicCost,
  getTokenUsage,
} from '../../../src/providers/anthropic/util';

describe('Anthropic modules', () => {
  it('should export core values', () => {
    expect(DEFAULT_ANTHROPIC_MODEL).toBeDefined();
    // Types are exported but we don't need to check them as values
    // AnthropicMessageOptions and AnthropicCompletionOptions are types, not values
  });

  it('should export utility functions', () => {
    expect(ANTHROPIC_MODELS).toBeDefined();
    expect(outputFromMessage).toBeDefined();
    expect(parseMessages).toBeDefined();
    expect(calculateAnthropicCost).toBeDefined();
    expect(getTokenUsage).toBeDefined();
  });

  it('should export provider classes', () => {
    expect(AnthropicGenericProvider).toBeDefined();
    expect(AnthropicMessagesProvider).toBeDefined();
    expect(AnthropicCompletionProvider).toBeDefined();
    expect(AnthropicLlmRubricProvider).toBeDefined();
  });

  it('should export default providers and relevant functions', () => {
    expect(DefaultGradingProvider).toBeDefined();
    expect(DefaultGradingJsonProvider).toBeDefined();
    expect(DefaultLlmRubricProvider).toBeDefined();
    expect(DefaultSuggestionsProvider).toBeDefined();
    expect(getAnthropicProviders).toBeDefined();
  });
});
