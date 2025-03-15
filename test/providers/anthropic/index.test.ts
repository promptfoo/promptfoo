import * as anthropic from '../../../src/providers/anthropic';

describe('Anthropic exports', () => {
  it('should export types', () => {
    expect(anthropic.DEFAULT_ANTHROPIC_MODEL).toBeDefined();
    expect(typeof anthropic.AnthropicMessageOptions).toBe('undefined'); // This is just a type, not a value
    expect(typeof anthropic.AnthropicCompletionOptions).toBe('undefined'); // This is just a type, not a value
  });

  it('should export utility functions', () => {
    expect(anthropic.ANTHROPIC_MODELS).toBeDefined();
    expect(anthropic.outputFromMessage).toBeDefined();
    expect(anthropic.parseMessages).toBeDefined();
    expect(anthropic.calculateAnthropicCost).toBeDefined();
    expect(anthropic.getTokenUsage).toBeDefined();
  });

  it('should export provider classes', () => {
    expect(anthropic.AnthropicMessagesProvider).toBeDefined();
    expect(anthropic.AnthropicCompletionProvider).toBeDefined();
    expect(anthropic.AnthropicLlmRubricProvider).toBeDefined();
  });

  it('should export default providers and relevant functions', () => {
    expect(anthropic.DefaultGradingProvider).toBeDefined();
    expect(anthropic.DefaultGradingJsonProvider).toBeDefined();
    expect(anthropic.DefaultLlmRubricProvider).toBeDefined();
    expect(anthropic.DefaultSuggestionsProvider).toBeDefined();
    expect(anthropic.getAnthropicProviders).toBeDefined();
  });
});
