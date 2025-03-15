import type Anthropic from '@anthropic-ai/sdk';

// Default model to use for all default providers
export const DEFAULT_ANTHROPIC_MODEL = 'claude-3-7-sonnet-20250219';

export interface AnthropicMessageOptions {
  apiBaseUrl?: string;
  apiKey?: string;
  cost?: number;
  extra_body?: Record<string, any>;
  headers?: Record<string, string>;
  max_tokens?: number;
  model?: string;
  temperature?: number;
  thinking?: Anthropic.Messages.ThinkingConfigParam;
  tool_choice?: Anthropic.Messages.ToolChoice;
  tools?: Anthropic.Tool[];
  top_k?: number;
  top_p?: number;
  beta?: string[]; // For features like 'output-128k-2025-02-19'
  showThinking?: boolean;
}

export interface AnthropicCompletionOptions {
  apiKey?: string;
  max_tokens_to_sample?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
}

/**
 * Helper function to create a lazy-loaded provider
 * @param getter Factory function to create provider instance
 * @param cache Reference to the cached instance
 * @returns Object with getter that lazily initializes the provider
 */
export function createLazyProvider<T>(getter: () => T, cache: { value?: T }): { instance: T } {
  return {
    get instance() {
      if (!cache.value) {
        cache.value = getter();
      }
      return cache.value;
    },
  };
}
