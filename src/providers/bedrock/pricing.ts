import {
  CLAUDE_5_REGIONAL_PREMIUM,
  calculateCacheInputCost,
  isClaudeFableOrMythos5Model,
} from '../anthropic/util';

export type BedrockServiceTier = {
  type: 'priority' | 'default' | 'flex';
};

/** Bedrock model pricing per 1M tokens. */
const BEDROCK_PRICING: Record<string, { input: number; output: number }> = {
  // Claude 5
  'anthropic.claude-fable-5': { input: 10, output: 50 },
  // Claude Opus 4.8
  'anthropic.claude-opus-4-8': { input: 5, output: 25 },
  // Claude Opus 4.7
  'anthropic.claude-opus-4-7': { input: 5, output: 25 },
  // Claude Opus 4.6
  'anthropic.claude-opus-4-6': { input: 5, output: 25 },
  // Claude Opus 4.5
  'anthropic.claude-opus-4-5': { input: 5, output: 25 },
  // Claude Opus 4/4.1
  'anthropic.claude-opus-4': { input: 15, output: 75 },
  // Claude Sonnet 4/4.5
  'anthropic.claude-sonnet-4': { input: 3, output: 15 },
  // Claude Haiku 4.5
  'anthropic.claude-haiku-4': { input: 1, output: 5 },
  // Claude 3.x
  'anthropic.claude-3-opus': { input: 15, output: 75 },
  'anthropic.claude-3-5-sonnet': { input: 3, output: 15 },
  'anthropic.claude-3-7-sonnet': { input: 3, output: 15 },
  'anthropic.claude-3-5-haiku': { input: 0.8, output: 4 },
  'anthropic.claude-3-haiku': { input: 0.25, output: 1.25 },
  // Amazon Nova
  'amazon.nova-micro': { input: 0.035, output: 0.14 },
  'amazon.nova-lite': { input: 0.06, output: 0.24 },
  'amazon.nova-pro': { input: 0.8, output: 3.2 },
  'amazon.nova-premier': { input: 2.5, output: 10 },
  // Amazon Nova 2 (reasoning models) - pricing estimated, verify at aws.amazon.com/bedrock/pricing
  'amazon.nova-2-lite': { input: 0.15, output: 0.6 },
  // Amazon Titan Text
  'amazon.titan-text-lite': { input: 0.15, output: 0.2 },
  'amazon.titan-text-express': { input: 0.8, output: 1.6 },
  'amazon.titan-text-premier': { input: 0.5, output: 1.5 },
  // Meta Llama
  'meta.llama3-1-8b': { input: 0.22, output: 0.22 },
  'meta.llama3-1-70b': { input: 0.99, output: 0.99 },
  'meta.llama3-1-405b': { input: 5.32, output: 16 },
  'meta.llama3-2-1b': { input: 0.1, output: 0.1 },
  'meta.llama3-2-3b': { input: 0.15, output: 0.15 },
  'meta.llama3-2-11b': { input: 0.35, output: 0.35 },
  'meta.llama3-2-90b': { input: 2.0, output: 2.0 },
  'meta.llama3-3-70b': { input: 0.99, output: 0.99 },
  'meta.llama4-scout': { input: 0.17, output: 0.68 },
  'meta.llama4-maverick': { input: 0.17, output: 0.68 },
  'meta.llama4': { input: 1.0, output: 3.0 },
  // Mistral
  'mistral.mistral-7b': { input: 0.15, output: 0.2 },
  'mistral.mixtral-8x7b': { input: 0.45, output: 0.7 },
  'mistral.mistral-large': { input: 4, output: 12 },
  'mistral.mistral-small': { input: 1, output: 3 },
  'mistral.pixtral-large': { input: 2, output: 6 },
  // AI21 Jamba
  'ai21.jamba-1-5-mini': { input: 0.2, output: 0.4 },
  'ai21.jamba-1-5-large': { input: 2, output: 8 },
  // Cohere
  'cohere.command-r': { input: 0.5, output: 1.5 },
  'cohere.command-r-plus': { input: 3, output: 15 },
  // DeepSeek
  'deepseek.deepseek-r1': { input: 1.35, output: 5.4 },
  'deepseek.r1': { input: 1.35, output: 5.4 },
  // Qwen
  'qwen.qwen3-32b': { input: 0.2, output: 0.6 },
  'qwen.qwen3-235b': { input: 0.18, output: 0.54 },
  'qwen.qwen3-coder-30b': { input: 0.2, output: 0.6 },
  'qwen.qwen3-coder-480b': { input: 1.5, output: 7.5 },
  'qwen.qwen3': { input: 0.5, output: 1.5 },
  // Writer Palmyra
  'writer.palmyra-vision': { input: 0.15, output: 0.6 },
  'writer.palmyra-x5': { input: 0.6, output: 6 },
  'writer.palmyra-x4': { input: 2.5, output: 10 },
  // Newer OpenAI Chat-compatible families (base rates from https://aws.amazon.com/bedrock/pricing/;
  // verify there as rates change). Keys are variant-specific because rates differ within a
  // family, and `includes()` matches the first key in insertion order — so list more specific
  // ids first (e.g. `glm-4.7-flash` before `glm-4.7`). `includes()` also tolerates geo prefixes
  // (e.g. `us.zai.glm-5`). Region-specific overrides are applied below where AWS publishes them.
  // Z.AI GLM
  'zai.glm-5': { input: 1.0, output: 3.2 },
  'zai.glm-4.7-flash': { input: 0.07, output: 0.4 },
  'zai.glm-4.7': { input: 0.6, output: 2.2 },
  // MiniMax (M2 / M2.1 / M2.5 share a rate)
  'minimax.minimax-m2': { input: 0.3, output: 1.2 },
  // Moonshot Kimi
  'kimi-k2.5': { input: 0.6, output: 3.0 },
  'kimi-k2-thinking': { input: 0.6, output: 2.5 },
  // NVIDIA Nemotron
  'nemotron-nano-12b-v2': { input: 0.2, output: 0.6 },
  'nemotron-nano-3-30b': { input: 0.06, output: 0.24 },
  'nemotron-nano': { input: 0.06, output: 0.23 },
  'nemotron-super': { input: 0.15, output: 0.65 },
  // Google Gemma 3
  'gemma-3-4b': { input: 0.04, output: 0.08 },
  'gemma-3-12b': { input: 0.09, output: 0.29 },
  'gemma-3-27b': { input: 0.23, output: 0.38 },
  // OpenAI GPT-OSS (open-weight models served via InvokeModel/Converse). The frontier
  // gpt-5.x models are not available through Converse — they use the OpenAI-compatible
  // Responses API (see src/providers/bedrock/openaiResponses.ts).
  'openai.gpt-oss-120b': { input: 0.15, output: 0.6 },
  'openai.gpt-oss-20b': { input: 0.07, output: 0.3 },
};

type BedrockPricing = { input: number; output: number };

const BEDROCK_REGION_PRICING_MODEL_PREFIXES = [
  'zai.glm-',
  'minimax.minimax-',
  'kimi-k2',
  'nemotron-',
  'gemma-3-',
] as const;

const BEDROCK_REGION_PRICING: Record<string, Record<string, BedrockPricing>> = {
  'ap-northeast-1': {
    'zai.glm-5': { input: 1.2, output: 3.84 },
    'zai.glm-4.7-flash': { input: 0.08, output: 0.48 },
    'zai.glm-4.7': { input: 0.72, output: 2.64 },
    'minimax.minimax-m2.5': { input: 0.36, output: 1.44 },
    'minimax.minimax-m2.1': { input: 0.36, output: 1.44 },
    'minimax.minimax-m2': { input: 0.36, output: 1.45 },
    'kimi-k2.5': { input: 0.72, output: 3.6 },
    'kimi-k2-thinking': { input: 0.73, output: 3.03 },
    'nemotron-nano-12b-v2': { input: 0.24, output: 0.73 },
    'nemotron-nano-3-30b': { input: 0.07, output: 0.29 },
    'nemotron-nano': { input: 0.07, output: 0.28 },
    'nemotron-super': { input: 0.18, output: 0.78 },
    'gemma-3-4b': { input: 0.05, output: 0.1 },
    'gemma-3-12b': { input: 0.11, output: 0.35 },
    'gemma-3-27b': { input: 0.28, output: 0.46 },
  },
  'ap-south-1': {
    'zai.glm-5': { input: 1.2, output: 3.84 },
    'zai.glm-4.7-flash': { input: 0.08, output: 0.48 },
    'zai.glm-4.7': { input: 0.72, output: 2.64 },
    'minimax.minimax-m2.5': { input: 0.36, output: 1.44 },
    'minimax.minimax-m2.1': { input: 0.36, output: 1.44 },
    'minimax.minimax-m2': { input: 0.35, output: 1.41 },
    'kimi-k2.5': { input: 0.72, output: 3.6 },
    'kimi-k2-thinking': { input: 0.71, output: 2.94 },
    'nemotron-nano-12b-v2': { input: 0.24, output: 0.71 },
    'nemotron-nano-3-30b': { input: 0.07, output: 0.28 },
    'nemotron-nano': { input: 0.07, output: 0.27 },
    'nemotron-super': { input: 0.18, output: 0.78 },
    'gemma-3-4b': { input: 0.05, output: 0.09 },
    'gemma-3-12b': { input: 0.11, output: 0.34 },
    'gemma-3-27b': { input: 0.27, output: 0.45 },
  },
  'ap-southeast-2': {
    'zai.glm-5': { input: 1.03, output: 3.3 },
    'zai.glm-4.7-flash': { input: 0.0721, output: 0.412 },
    'zai.glm-4.7': { input: 0.618, output: 2.266 },
    'minimax.minimax-m2.5': { input: 0.31, output: 1.24 },
    'minimax.minimax-m2.1': { input: 0.309, output: 1.236 },
    'minimax.minimax-m2': { input: 0.309, output: 1.236 },
    'kimi-k2.5': { input: 0.618, output: 3.09 },
    'kimi-k2-thinking': { input: 0.618, output: 2.575 },
    'nemotron-nano-12b-v2': { input: 0.206, output: 0.618 },
    'nemotron-nano-3-30b': { input: 0.0618, output: 0.2472 },
    'nemotron-nano': { input: 0.0618, output: 0.2369 },
    'nemotron-super': { input: 0.15, output: 0.67 },
    'gemma-3-4b': { input: 0.0412, output: 0.0824 },
    'gemma-3-12b': { input: 0.0927, output: 0.2987 },
    'gemma-3-27b': { input: 0.2369, output: 0.3914 },
  },
  'ap-southeast-3': {
    'zai.glm-5': { input: 1.2, output: 3.84 },
    'zai.glm-4.7-flash': { input: 0.08, output: 0.48 },
    'zai.glm-4.7': { input: 0.72, output: 2.64 },
    'minimax.minimax-m2.5': { input: 0.36, output: 1.44 },
    'minimax.minimax-m2.1': { input: 0.36, output: 1.44 },
    'kimi-k2.5': { input: 0.72, output: 3.6 },
    'nemotron-super': { input: 0.18, output: 0.78 },
  },
  'eu-central-1': {
    'zai.glm-5': { input: 1.2, output: 3.84 },
    'zai.glm-4.7-flash': { input: 0.08, output: 0.48 },
    'minimax.minimax-m2.5': { input: 0.36, output: 1.44 },
    'minimax.minimax-m2.1': { input: 0.36, output: 1.44 },
    'nemotron-super': { input: 0.18, output: 0.78 },
  },
  'eu-north-1': {
    'zai.glm-5': { input: 1.2, output: 3.84 },
    'zai.glm-4.7-flash': { input: 0.08, output: 0.48 },
    'zai.glm-4.7': { input: 0.72, output: 2.64 },
    'minimax.minimax-m2.5': { input: 0.36, output: 1.44 },
    'minimax.minimax-m2.1': { input: 0.36, output: 1.44 },
    'kimi-k2.5': { input: 0.72, output: 3.6 },
    'nemotron-super': { input: 0.18, output: 0.78 },
  },
  'eu-south-1': {
    'zai.glm-4.7-flash': { input: 0.08, output: 0.48 },
    'minimax.minimax-m2.5': { input: 0.36, output: 1.44 },
    'minimax.minimax-m2.1': { input: 0.36, output: 1.44 },
    'minimax.minimax-m2': { input: 0.35, output: 1.41 },
    'nemotron-nano-12b-v2': { input: 0.24, output: 0.71 },
    'nemotron-nano-3-30b': { input: 0.07, output: 0.28 },
    'nemotron-nano': { input: 0.07, output: 0.27 },
    'nemotron-super': { input: 0.18, output: 0.78 },
    'gemma-3-4b': { input: 0.05, output: 0.09 },
    'gemma-3-12b': { input: 0.11, output: 0.34 },
    'gemma-3-27b': { input: 0.27, output: 0.45 },
  },
  'eu-west-1': {
    'zai.glm-4.7-flash': { input: 0.08, output: 0.48 },
    'minimax.minimax-m2.5': { input: 0.36, output: 1.44 },
    'minimax.minimax-m2.1': { input: 0.36, output: 1.44 },
    'minimax.minimax-m2': { input: 0.35, output: 1.41 },
    'nemotron-nano-12b-v2': { input: 0.24, output: 0.71 },
    'nemotron-nano-3-30b': { input: 0.07, output: 0.28 },
    'nemotron-nano': { input: 0.07, output: 0.27 },
    'nemotron-super': { input: 0.18, output: 0.78 },
    'gemma-3-4b': { input: 0.05, output: 0.09 },
    'gemma-3-12b': { input: 0.11, output: 0.34 },
    'gemma-3-27b': { input: 0.27, output: 0.45 },
  },
  'eu-west-2': {
    'zai.glm-5': { input: 1.55, output: 4.96 },
    'zai.glm-4.7-flash': { input: 0.11, output: 0.62 },
    'minimax.minimax-m2.5': { input: 0.47, output: 1.86 },
    'minimax.minimax-m2.1': { input: 0.47, output: 1.86 },
    'minimax.minimax-m2': { input: 0.47, output: 1.86 },
    'nemotron-nano-12b-v2': { input: 0.31, output: 0.93 },
    'nemotron-nano-3-30b': { input: 0.09, output: 0.37 },
    'nemotron-nano': { input: 0.09, output: 0.36 },
    'nemotron-super': { input: 0.23, output: 1.01 },
    'gemma-3-4b': { input: 0.06, output: 0.12 },
    'gemma-3-12b': { input: 0.14, output: 0.45 },
    'gemma-3-27b': { input: 0.36, output: 0.59 },
  },
  'sa-east-1': {
    'zai.glm-5': { input: 1.2, output: 3.84 },
    'zai.glm-4.7-flash': { input: 0.08, output: 0.48 },
    'zai.glm-4.7': { input: 0.72, output: 2.64 },
    'minimax.minimax-m2.5': { input: 0.36, output: 1.44 },
    'minimax.minimax-m2.1': { input: 0.36, output: 1.44 },
    'minimax.minimax-m2': { input: 0.36, output: 1.45 },
    'kimi-k2.5': { input: 0.72, output: 3.6 },
    'kimi-k2-thinking': { input: 0.73, output: 3.03 },
    'nemotron-nano-12b-v2': { input: 0.24, output: 0.73 },
    'nemotron-nano-3-30b': { input: 0.07, output: 0.29 },
    'nemotron-nano': { input: 0.07, output: 0.28 },
    'nemotron-super': { input: 0.18, output: 0.78 },
    'gemma-3-4b': { input: 0.05, output: 0.1 },
    'gemma-3-12b': { input: 0.11, output: 0.35 },
    'gemma-3-27b': { input: 0.28, output: 0.46 },
  },
  'us-gov-east-1': {
    'nemotron-nano-12b-v2': { input: 0.24, output: 0.72 },
    'nemotron-nano-3-30b': { input: 0.072, output: 0.288 },
    'nemotron-nano': { input: 0.072, output: 0.276 },
    'nemotron-super': { input: 0.18, output: 0.78 },
  },
  'us-gov-west-1': {
    'nemotron-nano-12b-v2': { input: 0.24, output: 0.72 },
    'nemotron-nano-3-30b': { input: 0.072, output: 0.288 },
    'nemotron-nano': { input: 0.072, output: 0.276 },
    'nemotron-super': { input: 0.18, output: 0.78 },
  },
};

function getBedrockPricing(modelId: string, region?: string): BedrockPricing | undefined {
  const normalizedModelId = modelId.toLowerCase();
  const regionPricing = region ? BEDROCK_REGION_PRICING[region.toLowerCase()] : undefined;
  if (regionPricing) {
    for (const [modelPrefix, pricing] of Object.entries(regionPricing)) {
      if (normalizedModelId.includes(modelPrefix)) {
        return pricing;
      }
    }
    if (
      BEDROCK_REGION_PRICING_MODEL_PREFIXES.some((prefix) => normalizedModelId.includes(prefix))
    ) {
      return undefined;
    }
  }

  for (const [modelPrefix, pricing] of Object.entries(BEDROCK_PRICING)) {
    if (normalizedModelId.includes(modelPrefix)) {
      return pricing;
    }
  }
  return undefined;
}

/**
 * Calculate cost based on model and token usage
 */
export function calculateBedrockCost(
  modelId: string,
  promptTokens?: number,
  completionTokens?: number,
  cacheReadTokens = 0,
  cacheWriteTokens = 0,
  region?: string,
  serviceTier?: BedrockServiceTier,
): number | undefined {
  if (promptTokens === undefined || completionTokens === undefined) {
    return undefined;
  }

  const normalizedModelId = modelId.toLowerCase();
  const pricing = getBedrockPricing(normalizedModelId, region);
  if (!pricing) {
    return undefined;
  }
  // Global endpoints bill at base rate; regional and geo endpoints carry a 10%
  // premium. The model ID may be a bare `global.` profile or an
  // inference-profile ARN wrapping it (`arn:...:inference-profile/global....`).
  const isGlobalEndpoint =
    normalizedModelId.startsWith('global.') || normalizedModelId.includes('/global.');
  const endpointMultiplier =
    isClaudeFableOrMythos5Model(normalizedModelId) && !isGlobalEndpoint
      ? CLAUDE_5_REGIONAL_PREMIUM
      : 1;
  const serviceTierMultiplier =
    serviceTier?.type === 'priority' ? 1.75 : serviceTier?.type === 'flex' ? 0.5 : 1;
  const pricingMultiplier = endpointMultiplier * serviceTierMultiplier;
  const inputRate = (pricing.input / 1_000_000) * pricingMultiplier;
  const inputCost = normalizedModelId.includes('anthropic.claude')
    ? calculateCacheInputCost(inputRate, promptTokens, cacheReadTokens, cacheWriteTokens)
    : promptTokens * inputRate;
  const outputCost = (completionTokens / 1_000_000) * pricing.output * pricingMultiplier;
  return inputCost + outputCost;
}
