import type { ApiProvider, ProviderOptions } from '../types';
import type { EnvOverrides } from '../types/env';
import { OpenAiChatCompletionProvider } from './openai/chat';

/**
 * Creates a Perplexity API provider using OpenAI-compatible endpoints
 *
 * Documentation: https://docs.perplexity.ai/
 *
 * Perplexity API follows OpenAI's API format and can be used as a wrapper around OpenAI chat completion.
 * All parameters are automatically passed through to the Perplexity API.
 *
 * Supported models:
 * - sonar: Lightweight search model for quick factual queries
 * - sonar-pro: Advanced search offering for more complex queries (8k max output tokens)
 * - sonar-reasoning: Fast reasoning model with search
 * - sonar-reasoning-pro: Premier reasoning model powered by DeepSeek R1 with Chain of Thought (CoT)
 * - sonar-deep-research: Expert-level research model for comprehensive reports
 * - r1-1776: Offline chat model (DeepSeek R1) without search capabilities
 *
 * Special parameters:
 * - search_domain_filter: List of domains to include/exclude (prefix with `-` to exclude)
 * - search_recency_filter: Time filter for sources ('month', 'week', 'day', 'hour')
 * - return_related_questions: Get follow-up question suggestions
 * - return_images: Include images in responses (default: false)
 * - web_search_options.search_context_size: Control amount of search context ('low', 'medium', 'high')
 * - web_search_options.user_location: Location info to refine search results
 * - search_after_date_filter: Restrict to content published after date (format: "MM/DD/YYYY")
 * - search_before_date_filter: Restrict to content published before date (format: "MM/DD/YYYY")
 */
export function createPerplexityProvider(
  providerPath: string,
  options: {
    config?: ProviderOptions;
    id?: string;
    env?: EnvOverrides;
  } = {},
): ApiProvider {
  const splits = providerPath.split(':');
  const modelName = splits.slice(1).join(':');

  const config = options.config?.config || {};

  // Special case handling for response_format
  const responseFormat = config.response_format;

  // Handle Perplexity-specific parameters
  const perplexityConfig = {
    ...options,
    config: {
      apiBaseUrl: 'https://api.perplexity.ai',
      apiKeyEnvar: 'PERPLEXITY_API_KEY',
      passthrough: {
        ...config,
        // Pass through Perplexity-specific parameters
        ...(config.search_domain_filter && { 
          search_domain_filter: config.search_domain_filter 
        }),
        ...(config.search_recency_filter && {
          search_recency_filter: config.search_recency_filter
        }),
        ...(config.return_related_questions && {
          return_related_questions: config.return_related_questions
        }),
        ...(config.return_images && { 
          return_images: config.return_images 
        }),
        ...(config.search_after_date_filter && {
          search_after_date_filter: config.search_after_date_filter
        }),
        ...(config.search_before_date_filter && {
          search_before_date_filter: config.search_before_date_filter
        }),
        ...(config.web_search_options && { 
          web_search_options: config.web_search_options 
        }),
        // Handle structured output
        ...(responseFormat && { 
          response_format: responseFormat 
        }),
      },
    },
  };

  // All Perplexity models use the chat completions endpoint
  return new OpenAiChatCompletionProvider(modelName || 'sonar', perplexityConfig);
}
