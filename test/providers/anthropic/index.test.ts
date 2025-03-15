import { AnthropicCompletionProvider } from '../../../src/providers/anthropic/completion';
import {
  DEFAULT_ANTHROPIC_MODEL,
  AnthropicLlmRubricProvider,
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

  it('should export getAnthropicProviders function', () => {
    expect(getAnthropicProviders).toBeDefined();

    const providers = getAnthropicProviders();
    expect(providers.gradingProvider).toBeDefined();
    expect(providers.gradingJsonProvider).toBeDefined();
    expect(providers.llmRubricProvider).toBeDefined();
    expect(providers.suggestionsProvider).toBeDefined();
    expect(providers.datasetGenerationProvider).toBeDefined();
    expect(providers.synthesizeProvider).toBeDefined();
  });
});
