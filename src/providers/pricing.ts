import { ANTHROPIC_MODELS } from './anthropic/util';
import { OPENAI_BILLING_MODELS } from './openai/util';

/** Catalog text-token rates in USD per token, without discounts or other charges. */
export interface ModelPricing {
  input: number;
  output: number;
  longContext?: {
    /** Input-token count above which the catalog's higher rates apply. */
    threshold: number;
    input: number;
    output: number;
  };
}

/**
 * Look up catalog text-token rates for an exact OpenAI or Anthropic model ID.
 * Returns a copy, or undefined for an unsupported provider/model or missing pricing.
 * This does not fetch live prices or calculate the complete cost of a request.
 */
export function getModelPricing(provider: string, modelName: string): ModelPricing | undefined {
  const models =
    provider === 'openai'
      ? OPENAI_BILLING_MODELS
      : provider === 'anthropic'
        ? ANTHROPIC_MODELS
        : undefined;
  const pricing: ModelPricing | undefined = models?.find((model) => model.id === modelName)?.cost;
  if (!pricing) {
    return undefined;
  }

  return {
    input: pricing.input,
    output: pricing.output,
    ...(pricing.longContext ? { longContext: { ...pricing.longContext } } : {}),
  };
}
