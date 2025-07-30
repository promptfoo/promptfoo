import logger from '../../logger';
import { renderVarsInObject } from '../../util';
import invariant from '../../util/invariant';
import { OpenAiChatCompletionProvider } from '../openai/chat';

import type { ApiProvider, ProviderOptions } from '../../types';
import type { OpenAiCompletionOptions } from '../openai/types';

type XAIConfig = {
  region?: string;
  reasoning_effort?: 'low' | 'high';
  search_parameters?: Record<string, any>;
} & OpenAiCompletionOptions;

type XAIProviderOptions = Omit<ProviderOptions, 'config'> & {
  config?: {
    config?: XAIConfig;
  };
};

export const XAI_CHAT_MODELS = [
  // Grok-4 Models
  {
    id: 'grok-4-0709',
    cost: {
      input: 3.0 / 1e6,
      output: 15.0 / 1e6,
    },
    aliases: ['grok-4', 'grok-4-latest'],
  },
  // Grok-3 Models
  {
    id: 'grok-3-beta',
    cost: {
      input: 3.0 / 1e6,
      output: 15.0 / 1e6,
    },
    aliases: ['grok-3', 'grok-3-latest'],
  },
  {
    id: 'grok-3-fast-beta',
    cost: {
      input: 5.0 / 1e6,
      output: 25.0 / 1e6,
    },
    aliases: ['grok-3-fast', 'grok-3-fast-latest'],
  },
  {
    id: 'grok-3-mini-beta',
    cost: {
      input: 0.3 / 1e6,
      output: 0.5 / 1e6,
    },
    aliases: ['grok-3-mini', 'grok-3-mini-latest'],
  },
  {
    id: 'grok-3-mini-fast-beta',
    cost: {
      input: 0.6 / 1e6,
      output: 4.0 / 1e6,
    },
    aliases: ['grok-3-mini-fast', 'grok-3-mini-fast-latest'],
  },
  // Grok-2 Models
  {
    id: 'grok-2-1212',
    cost: {
      input: 2.0 / 1e6,
      output: 10.0 / 1e6,
    },
    aliases: ['grok-2', 'grok-2-latest'],
  },
  {
    id: 'grok-2-vision-1212',
    cost: {
      input: 2.0 / 1e6,
      output: 10.0 / 1e6,
    },
    aliases: ['grok-2-vision', 'grok-2-vision-latest'],
  },
  // Legacy models
  {
    id: 'grok-beta',
    cost: {
      input: 5.0 / 1e6,
      output: 15.0 / 1e6,
    },
  },
  {
    id: 'grok-vision-beta',
    cost: {
      input: 5.0 / 1e6,
      output: 15.0 / 1e6,
    },
  },
];

export const GROK_3_MINI_MODELS = [
  'grok-3-mini-beta',
  'grok-3-mini',
  'grok-3-mini-latest',
  'grok-3-mini-fast-beta',
  'grok-3-mini-fast',
  'grok-3-mini-fast-latest',
];

// Models that support reasoning_effort parameter (only Grok-3 mini models)
export const GROK_REASONING_EFFORT_MODELS = [
  'grok-3-mini-beta',
  'grok-3-mini',
  'grok-3-mini-latest',
  'grok-3-mini-fast-beta',
  'grok-3-mini-fast',
  'grok-3-mini-fast-latest',
];

// All reasoning models (including Grok-4 which doesn't support reasoning_effort)
export const GROK_REASONING_MODELS = [
  'grok-4-0709',
  'grok-4',
  'grok-4-latest',
  'grok-3-mini-beta',
  'grok-3-mini',
  'grok-3-mini-latest',
  'grok-3-mini-fast-beta',
  'grok-3-mini-fast',
  'grok-3-mini-fast-latest',
];

// Grok-4 models that have specific parameter restrictions
export const GROK_4_MODELS = ['grok-4-0709', 'grok-4', 'grok-4-latest'];

/**
 * Calculate xAI Grok cost based on model name and token usage
 */
export function calculateXAICost(
  modelName: string,
  config: any,
  promptTokens?: number,
  completionTokens?: number,
  reasoningTokens?: number,
): number | undefined {
  if (!promptTokens || !completionTokens) {
    return undefined;
  }

  const model = XAI_CHAT_MODELS.find(
    (m) => m.id === modelName || (m.aliases && m.aliases.includes(modelName)),
  );
  if (!model || !model.cost) {
    return undefined;
  }

  const inputCost = config.cost ?? model.cost.input;
  const outputCost = config.cost ?? model.cost.output;

  const inputCostTotal = inputCost * promptTokens;
  const outputCostTotal = outputCost * completionTokens;

  logger.debug(
    `XAI cost calculation for ${modelName}: ` +
      `promptTokens=${promptTokens}, completionTokens=${completionTokens}, ` +
      `reasoningTokens=${reasoningTokens || 'N/A'}, ` +
      `inputCost=${inputCostTotal}, outputCost=${outputCostTotal}`,
  );

  return inputCostTotal + outputCostTotal;
}

class XAIProvider extends OpenAiChatCompletionProvider {
  private originalConfig?: XAIConfig;

  protected get apiKey(): string | undefined {
    return this.config?.apiKey;
  }

  protected isReasoningModel(): boolean {
    return GROK_REASONING_MODELS.includes(this.modelName);
  }

  protected supportsReasoningEffort(): boolean {
    return GROK_REASONING_EFFORT_MODELS.includes(this.modelName);
  }

  protected supportsTemperature(): boolean {
    return true;
  }

  getOpenAiBody(prompt: string, context?: any, callApiOptions?: any) {
    const result = super.getOpenAiBody(prompt, context, callApiOptions);

    // Ensure we have a valid result
    if (!result || !result.body) {
      return result;
    }

    // Filter out unsupported parameters for Grok-4
    if (this.modelName && GROK_4_MODELS.includes(this.modelName)) {
      delete result.body.presence_penalty;
      delete result.body.frequency_penalty;
      delete result.body.stop;
      // Grok-4 doesn't support reasoning_effort parameter
      delete result.body.reasoning_effort;
    }

    // Filter reasoning_effort for models that don't support it
    if (!this.supportsReasoningEffort() && result.body.reasoning_effort) {
      delete result.body.reasoning_effort;
    }

    // Handle search parameters
    const searchParams = this.originalConfig?.search_parameters;
    if (searchParams) {
      result.body.search_parameters = renderVarsInObject(searchParams, context?.vars);
    }

    return result;
  }

  constructor(modelName: string, providerOptions: XAIProviderOptions) {
    // Extract the nested config
    const xaiConfig = providerOptions.config?.config;

    super(modelName, {
      ...providerOptions,
      config: {
        ...providerOptions.config,
        ...xaiConfig, // Merge the nested config into the main config
        apiKeyEnvar: 'XAI_API_KEY',
        apiBaseUrl: xaiConfig?.region
          ? `https://${xaiConfig.region}.api.x.ai/v1`
          : 'https://api.x.ai/v1',
      },
    });

    // Store the original config for later use
    this.originalConfig = xaiConfig;
  }

  id(): string {
    return `xai:${this.modelName}`;
  }

  toString(): string {
    return `[xAI Provider ${this.modelName}]`;
  }

  toJSON() {
    return {
      provider: 'xai',
      model: this.modelName,
      config: {
        ...this.config,
        ...(this.apiKey && { apiKey: undefined }),
      },
    };
  }

  async callApi(prompt: string, context?: any, callApiOptions?: any): Promise<any> {
    try {
      const response = await super.callApi(prompt, context, callApiOptions);

      if (!response || response.error) {
        // Check if the error indicates an authentication issue
        if (
          response?.error &&
          (response.error.includes('502 Bad Gateway') ||
            response.error.includes('invalid API key') ||
            response.error.includes('authentication error'))
        ) {
          // Provide a more helpful error message for x.ai specific issues
          return {
            ...response,
            error: `x.ai API error: ${response.error}\n\nTip: Ensure your XAI_API_KEY environment variable is set correctly. You can get an API key from https://x.ai/`,
          };
        }
        return response;
      }

      // Rest of the existing response processing logic
      if (typeof response.raw === 'string') {
        try {
          const rawData = JSON.parse(response.raw);

          if (
            this.isReasoningModel() &&
            rawData?.usage?.completion_tokens_details?.reasoning_tokens
          ) {
            const reasoningTokens = rawData.usage.completion_tokens_details.reasoning_tokens;
            const acceptedPredictions =
              rawData.usage.completion_tokens_details.accepted_prediction_tokens || 0;
            const rejectedPredictions =
              rawData.usage.completion_tokens_details.rejected_prediction_tokens || 0;

            if (response.tokenUsage) {
              response.tokenUsage.completionDetails = {
                reasoning: reasoningTokens,
                acceptedPrediction: acceptedPredictions,
                rejectedPrediction: rejectedPredictions,
              };

              logger.debug(
                `XAI reasoning token details for ${this.modelName}: ` +
                  `reasoning=${reasoningTokens}, accepted=${acceptedPredictions}, rejected=${rejectedPredictions}`,
              );
            }
          }
        } catch (err) {
          logger.error(`Failed to parse raw response JSON: ${err}`);
        }
      } else if (typeof response.raw === 'object' && response.raw !== null) {
        const rawData = response.raw;

        if (
          this.isReasoningModel() &&
          rawData?.usage?.completion_tokens_details?.reasoning_tokens
        ) {
          const reasoningTokens = rawData.usage.completion_tokens_details.reasoning_tokens;
          const acceptedPredictions =
            rawData.usage.completion_tokens_details.accepted_prediction_tokens || 0;
          const rejectedPredictions =
            rawData.usage.completion_tokens_details.rejected_prediction_tokens || 0;

          if (response.tokenUsage) {
            response.tokenUsage.completionDetails = {
              reasoning: reasoningTokens,
              acceptedPrediction: acceptedPredictions,
              rejectedPrediction: rejectedPredictions,
            };

            logger.debug(
              `XAI reasoning token details for ${this.modelName}: ` +
                `reasoning=${reasoningTokens}, accepted=${acceptedPredictions}, rejected=${rejectedPredictions}`,
            );
          }
        }
      }

      if (response.tokenUsage && !response.cached) {
        const reasoningTokens = response.tokenUsage.completionDetails?.reasoning || 0;

        response.cost = calculateXAICost(
          this.modelName,
          this.config || {},
          response.tokenUsage.prompt,
          response.tokenUsage.completion,
          reasoningTokens,
        );
      }

      return response;
    } catch (err) {
      // Handle JSON parsing errors and other API errors
      const errorMessage = err instanceof Error ? err.message : String(err);

      // Check for common x.ai error patterns
      if (errorMessage.includes('Error parsing response') && errorMessage.includes('<html')) {
        // This is likely a 502 Bad Gateway or similar HTML error response
        return {
          error: `x.ai API error: Server returned an HTML error page instead of JSON. This often indicates an invalid API key or server issues.\n\nTip: Ensure your XAI_API_KEY environment variable is set correctly. You can get an API key from https://x.ai/`,
        };
      } else if (errorMessage.includes('502') || errorMessage.includes('Bad Gateway')) {
        return {
          error: `x.ai API error: 502 Bad Gateway - This often indicates an invalid API key.\n\nTip: Ensure your XAI_API_KEY environment variable is set correctly. You can get an API key from https://x.ai/`,
        };
      }

      // For other errors, pass them through with a helpful tip
      return {
        error: `x.ai API error: ${errorMessage}\n\nIf this persists, verify your API key at https://x.ai/`,
      };
    }
  }
}

export function createXAIProvider(
  providerPath: string,
  options: XAIProviderOptions = {},
): ApiProvider {
  const splits = providerPath.split(':');
  const modelName = splits.slice(1).join(':');
  invariant(modelName, 'Model name is required');
  return new XAIProvider(modelName, options);
}
