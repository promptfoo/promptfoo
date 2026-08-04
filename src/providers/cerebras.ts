import { type OpenAiChatCompletionCostData, OpenAiChatCompletionProvider } from './openai/chat';
import { calculateCost } from './shared';

import type { EnvOverrides } from '../types/env';
import type { ApiProvider, ProviderOptions } from '../types/index';
import type { OpenAiCompletionOptions } from './openai/types';

export const CEREBRAS_CHAT_MODELS = [
  {
    id: 'gpt-oss-120b',
    cost: { input: 0.35 / 1e6, output: 0.75 / 1e6 },
  },
  {
    id: 'gemma-4-31b',
    cost: { input: 0.99 / 1e6, output: 1.49 / 1e6 },
  },
  {
    id: 'zai-glm-4.7',
    cost: { input: 2.25 / 1e6, output: 2.75 / 1e6 },
  },
];

export function calculateCerebrasCost(
  modelName: string,
  config: OpenAiCompletionOptions,
  promptTokens?: number,
  completionTokens?: number,
): number | undefined {
  return calculateCost(modelName, config, promptTokens, completionTokens, CEREBRAS_CHAT_MODELS);
}

/**
 * Creates a Cerebras provider using OpenAI-compatible chat endpoints
 *
 * Documentation: https://docs.cerebras.ai
 *
 * Cerebras API supports the OpenAI-compatible chat completion interface.
 * Cerebras-supported parameters are automatically passed through to the Cerebras API.
 */
export function createCerebrasProvider(
  providerPath: string,
  options: {
    config?: ProviderOptions;
    id?: string;
    env?: EnvOverrides;
  } = {},
): ApiProvider {
  const splits = providerPath.split(':');
  const modelName = splits.slice(1).join(':');

  // Filter out basePath from config to avoid passing it to the API
  const { basePath: _, ...configWithoutBasePath } = options.config?.config || {};

  // Create a custom provider class that overrides the getOpenAiBody method
  class CerebrasProvider extends OpenAiChatCompletionProvider {
    async getOpenAiBody(prompt: string, context?: any, callApiOptions?: any) {
      // Get the body from the parent method
      const { body, config } = await super.getOpenAiBody(prompt, context, callApiOptions);

      // Cerebras API doesn't support both max_tokens and max_completion_tokens
      // If max_completion_tokens is set, use it and remove max_tokens
      if (body.max_completion_tokens) {
        delete body.max_tokens;
      }

      // Promptfoo pricing overrides are local billing metadata, not Cerebras request fields.
      delete body.cost;
      delete body.inputCost;
      delete body.outputCost;

      return { body, config };
    }

    protected override calculateResponseCost(
      data: OpenAiChatCompletionCostData,
      config: OpenAiCompletionOptions,
      cached: boolean,
    ): number | undefined {
      if (cached) {
        return 0;
      }

      const passthrough = (config.passthrough ?? {}) as Partial<OpenAiCompletionOptions> & {
        model?: unknown;
      };
      const modelName = typeof passthrough.model === 'string' ? passthrough.model : this.modelName;
      return calculateCerebrasCost(
        modelName,
        { ...config, ...passthrough },
        data.usage?.prompt_tokens,
        data.usage?.completion_tokens,
      );
    }
  }

  const cerebrasConfig = {
    ...options,
    config: {
      apiBaseUrl: 'https://api.cerebras.ai/v1',
      apiKeyEnvar: 'CEREBRAS_API_KEY',
      passthrough: {
        ...configWithoutBasePath,
      },
    },
  };

  return new CerebrasProvider(modelName, cerebrasConfig);
}
