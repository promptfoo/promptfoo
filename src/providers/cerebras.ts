import { resolveProviderCreatorInput } from './creator';
import { calculateCustomUsageCost, extractOpenAIBillingUsage } from './openai/billing';
import { type OpenAiChatCompletionCostData, OpenAiChatCompletionProvider } from './openai/chat';
import { splitLocalOptions } from './openai/localOptions';
import { calculateCost } from './shared';

import type { ApiProvider, CallApiContextParams, CallApiOptionsParams } from '../types/index';
import type { ProviderCreatorOptions } from './creator';
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
  if (CEREBRAS_CHAT_MODELS.some((model) => model.id === modelName)) {
    return calculateCost(modelName, config, promptTokens, completionTokens, CEREBRAS_CHAT_MODELS);
  }
  if (
    typeof promptTokens !== 'number' ||
    typeof completionTokens !== 'number' ||
    !Number.isFinite(promptTokens) ||
    !Number.isFinite(completionTokens)
  ) {
    return undefined;
  }

  return calculateCustomUsageCost(
    extractOpenAIBillingUsage({ prompt_tokens: promptTokens, completion_tokens: completionTokens }),
    config,
    false,
  );
}

// Create a custom provider class that overrides the getOpenAiBody method
class CerebrasProvider extends OpenAiChatCompletionProvider {
  override getOrganization(): string | undefined {
    return this.config.organization;
  }

  override async getOpenAiBody(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ) {
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
    const effectiveConfig = { ...passthrough, ...config };
    // The request body uses the provider selector unless passthrough overrides it.
    const modelName = typeof passthrough.model === 'string' ? passthrough.model : this.modelName;
    if (data.usage) {
      const customCost = calculateCustomUsageCost(
        extractOpenAIBillingUsage(data.usage),
        effectiveConfig,
        false,
      );
      if (customCost !== undefined) {
        return customCost;
      }
    }
    return CEREBRAS_CHAT_MODELS.some((model) => model.id === modelName)
      ? calculateCerebrasCost(
          modelName,
          effectiveConfig,
          data.usage?.prompt_tokens,
          data.usage?.completion_tokens,
        )
      : undefined;
  }
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
  options: ProviderCreatorOptions = {},
): ApiProvider {
  const providerOptions = resolveProviderCreatorInput(options);
  const splits = providerPath.split(':');
  const modelName = splits.slice(1).join(':');

  const config = providerOptions.config || {};
  // Only genuine model parameters belong in the request body; promptfoo's own settings
  // (credentials, headers, cost overrides, basePath) stay local.
  const { localOptions, modelParameters } = splitLocalOptions(config);

  const cerebrasConfig = {
    ...providerOptions,
    config: {
      ...localOptions,
      apiBaseUrl: localOptions.apiBaseUrl || 'https://api.cerebras.ai/v1',
      apiKeyEnvar: localOptions.apiKeyEnvar || 'CEREBRAS_API_KEY',
      passthrough: { ...modelParameters, ...config.passthrough },
    },
  };

  return new CerebrasProvider(modelName, cerebrasConfig);
}
