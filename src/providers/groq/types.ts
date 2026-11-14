import type { ProviderOptions } from '../../types/providers';
import type { OpenAiCompletionOptions } from '../openai/types';

export type GroqChatServiceTier = 'auto' | 'on_demand' | 'flex' | 'performance' | null;
export type GroqResponsesServiceTier = 'auto' | 'default' | 'flex';

/**
 * Groq-specific completion options for Chat Completions API.
 */
export type GroqCompletionOptions = Omit<OpenAiCompletionOptions, 'service_tier'> & {
  service_tier?: GroqChatServiceTier;
  systemPrompt?: string;
  parallel_tool_calls?: boolean | null;
  /** Controls how reasoning is presented. Options: 'parsed', 'raw', 'hidden'. */
  reasoning_format?: 'parsed' | 'raw' | 'hidden' | null;
  /** For GPT-OSS models, set to false to hide reasoning output. */
  include_reasoning?: boolean;
  /** Compound model tool configuration. */
  compound_custom?: {
    tools?: {
      enabled_tools?: string[];
      wolfram_settings?: {
        authorization?: string;
      };
    };
  };
  /** Web search customization settings. */
  search_settings?: {
    exclude_domains?: string[];
    include_domains?: string[];
    country?: string;
  };
};

/**
 * Groq Responses API options.
 * Note: Unlike Chat Completions API, does NOT support reasoning_format or include_reasoning.
 * Reasoning is controlled via reasoning.effort inherited from OpenAiCompletionOptions.
 */
export type GroqResponsesOptions = Omit<OpenAiCompletionOptions, 'service_tier'> & {
  service_tier?: GroqResponsesServiceTier;
  systemPrompt?: string;
  parallel_tool_calls?: boolean | null;
};

export type GroqProviderOptions = ProviderOptions & {
  config?: GroqCompletionOptions;
};

export type GroqResponsesProviderOptions = ProviderOptions & {
  config?: GroqResponsesOptions;
};
