import type { ApiProvider, ProviderOptions } from '../types';
import type { CallApiContextParams, CallApiOptionsParams, ProviderResponse } from '../types';
import type { EnvOverrides } from '../types/env';
import { OpenAiChatCompletionProvider } from './openai/chat';
import type { OpenAiCompletionOptions } from './openai/types';

/**
 * Calculate the cost of using the Perplexity API based on token usage
 *
 * Pricing based on Perplexity's documentation:
 * https://docs.perplexity.ai/docs/pricing
 *
 * @param modelName - Name of the Perplexity model
 * @param promptTokens - Number of prompt tokens
 * @param completionTokens - Number of completion tokens
 * @param usageTier - Usage tier (high, medium, low) - defaults to medium
 * @returns Cost in USD
 */
export function calculatePerplexityCost(
  modelName: string,
  promptTokens?: number,
  completionTokens?: number,
  usageTier: 'high' | 'medium' | 'low' = 'medium',
): number {
  if (!promptTokens && !completionTokens) {
    return 0;
  }

  // Default values for tokens
  const inputTokens = promptTokens || 0;
  const outputTokens = completionTokens || 0;

  // Pricing per million tokens
  let inputTokenPrice = 0;
  let outputTokenPrice = 0;

  // Base model prices
  const model = modelName.toLowerCase();

  if (model.includes('sonar-pro')) {
    // Sonar Pro pricing
    inputTokenPrice = 3;
    outputTokenPrice = 15;
  } else if (model.includes('sonar-reasoning-pro')) {
    // Sonar Reasoning Pro pricing
    inputTokenPrice = 2;
    outputTokenPrice = 8;
  } else if (model.includes('sonar-reasoning')) {
    // Sonar Reasoning pricing
    inputTokenPrice = 1;
    outputTokenPrice = 5;
  } else if (model.includes('sonar-deep-research')) {
    // Sonar Deep Research pricing
    inputTokenPrice = 2;
    outputTokenPrice = 8;
  } else if (model.includes('r1-1776')) {
    // r1-1776 pricing
    inputTokenPrice = 2;
    outputTokenPrice = 8;
  } else if (model.includes('sonar')) {
    // Sonar pricing
    inputTokenPrice = 1;
    outputTokenPrice = 1;
  } else {
    // Default to Sonar pricing for unknown models
    inputTokenPrice = 1;
    outputTokenPrice = 1;
  }

  // Calculate cost: (tokens / 1M) * price per million
  const inputCost = (inputTokens / 1_000_000) * inputTokenPrice;
  const outputCost = (outputTokens / 1_000_000) * outputTokenPrice;

  return inputCost + outputCost;
}

interface PerplexityProviderOptions extends ProviderOptions {
  config?: OpenAiCompletionOptions & {
    usage_tier?: 'high' | 'medium' | 'low';
    search_domain_filter?: string[];
    search_recency_filter?: string;
    return_related_questions?: boolean;
    return_images?: boolean;
    search_after_date_filter?: string;
    search_before_date_filter?: string;
    web_search_options?: {
      search_context_size?: 'low' | 'medium' | 'high';
      user_location?: {
        latitude?: number;
        longitude?: number;
        country?: string;
      };
    };
    [key: string]: any;
  };
}

/**
 * Perplexity API provider
 *
 * Extends the OpenAI chat completion provider to use Perplexity's API endpoint
 * and adds custom cost calculation.
 */
export class PerplexityProvider extends OpenAiChatCompletionProvider {
  private usageTier: 'high' | 'medium' | 'low';
  public modelName: string;
  public config: any;

  constructor(modelName: string, providerOptions: PerplexityProviderOptions = {}) {
    // Handle the case when config is nested inside config
    const actualConfig = providerOptions.config?.config || providerOptions.config || {};

    // Create provider options with the correct config structure
    const normalizedOptions = {
      ...providerOptions,
      config: {
        ...actualConfig,
        apiBaseUrl: 'https://api.perplexity.ai',
        apiKeyEnvar: 'PERPLEXITY_API_KEY',
      },
    };

    super(modelName, normalizedOptions);

    // Store the model name
    this.modelName = modelName;

    // Store the config for access in tests
    this.config = normalizedOptions.config;

    // Store the usage tier for cost calculation
    this.usageTier = normalizedOptions.config?.usage_tier || 'medium';
  }

  /**
   * Override callApi to use our custom cost calculation
   */
  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    // Call the parent method to get the response
    const response = await super.callApi(prompt, context, callApiOptions);

    // If there was an error, just return it
    if (response.error) {
      return response;
    }

    // Replace the cost calculation with our own
    if (response.tokenUsage) {
      if (response.tokenUsage.cached) {
        // For cached responses, don't recalculate cost
        return response;
      }

      // Calculate the cost using our function
      const cost = calculatePerplexityCost(
        this.modelName,
        response.tokenUsage.prompt,
        response.tokenUsage.completion,
        this.usageTier,
      );

      // Return the response with our calculated cost
      return {
        ...response,
        cost,
      };
    }

    return response;
  }

  id(): string {
    return this.modelName;
  }

  toString(): string {
    return `[Perplexity Provider ${this.modelName}]`;
  }

  toJSON() {
    return {
      provider: 'perplexity',
      model: this.modelName,
      config: {
        ...this.config,
        apiKey: undefined,
      },
    };
  }
}

/**
 * Creates a Perplexity API provider
 *
 * @param providerPath - Provider path, e.g., "perplexity:sonar"
 * @param options - Provider options
 * @returns A Perplexity API provider
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
  const modelName = splits.slice(1).join(':') || 'sonar'; // Default to sonar if not specified

  return new PerplexityProvider(modelName, options as PerplexityProviderOptions);
}
