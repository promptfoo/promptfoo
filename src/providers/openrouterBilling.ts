import type { ProviderResponse } from '../types/providers';
import type { OpenAiChatCompletionCostData } from './openai/chat';
import type { OpenAiCompletionOptions } from './openai/types';

type OpenRouterUsage = NonNullable<OpenAiChatCompletionCostData['usage']> & {
  cost?: unknown;
  is_byok?: unknown;
  cost_details?: unknown;
};

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function calculateOpenRouterResponseCost(
  data: OpenAiChatCompletionCostData,
  config: OpenAiCompletionOptions,
): number | undefined {
  // Cache replay preserves logical cost; the evaluator tracks incurred spending separately.
  if (
    config.cost !== undefined ||
    config.inputCost !== undefined ||
    config.outputCost !== undefined
  ) {
    // Explicit user rates override billing; incomplete rates must not fall back to OpenAI prices.
    const inputCost = config.inputCost ?? config.cost;
    const outputCost = config.outputCost ?? config.cost;
    const promptTokens = data.usage?.prompt_tokens;
    const completionTokens = data.usage?.completion_tokens;
    if (
      !isNonNegativeFiniteNumber(inputCost) ||
      !isNonNegativeFiniteNumber(outputCost) ||
      !isNonNegativeFiniteNumber(promptTokens) ||
      !isNonNegativeFiniteNumber(completionTokens)
    ) {
      return undefined;
    }
    const cost = promptTokens * inputCost + completionTokens * outputCost;
    return Number.isFinite(cost) ? cost : undefined;
  }

  const usage = data.usage as OpenRouterUsage | undefined;
  // BYOK is billed separately upstream, so the gateway charge cannot represent the total cost.
  if (usage?.is_byok === true) {
    return undefined;
  }
  // https://openrouter.ai/docs/cookbook/administration/usage-accounting
  const cost = usage?.cost;
  return isNonNegativeFiniteNumber(cost) ? cost : undefined;
}

export function getOpenRouterBillingMetadata(
  data: OpenAiChatCompletionCostData,
): ProviderResponse['metadata'] {
  const usage = data.usage as OpenRouterUsage | undefined;
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) {
    return undefined;
  }
  const details =
    usage.cost_details &&
    typeof usage.cost_details === 'object' &&
    !Array.isArray(usage.cost_details)
      ? (usage.cost_details as Record<string, unknown>)
      : undefined;

  const billing: Record<string, unknown> = {};
  const amounts = {
    accountCharge: usage.cost,
    reportedUpstreamInferenceCost: details?.upstream_inference_cost,
    reportedUpstreamPromptCost: details?.upstream_inference_prompt_cost,
    reportedUpstreamCompletionCost: details?.upstream_inference_completions_cost,
    reportedServerToolCost: details?.server_tool_cost,
  };
  for (const [name, amount] of Object.entries(amounts)) {
    if (isNonNegativeFiniteNumber(amount)) {
      billing[name] = amount;
    }
  }
  if (typeof usage.is_byok === 'boolean') {
    billing.isByok = usage.is_byok;
  }
  return Object.keys(billing).length > 0 ? { openrouter: billing } : undefined;
}
