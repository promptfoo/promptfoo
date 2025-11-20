/**
 * AWS Bedrock Model Pricing
 *
 * Pricing data for AWS Bedrock foundation models.
 * Source: https://aws.amazon.com/bedrock/pricing/
 * Last updated: 2025-01-20
 *
 * AWS pricing is listed per 1,000 tokens on their website. Our cost values are
 * stored as per-token rates (divide AWS price by 1000). This allows direct
 * multiplication: cost = rate * token_count.
 *
 * Example: AWS shows $0.035/1K tokens → we store 0.000035/token (0.035/1000)
 * Inline comments show equivalent $/1M tokens for easier verification.
 *
 * Note: Pricing may vary by region. Actual costs may differ.
 * Users can override pricing via config.cost parameter.
 */

import { calculateCost } from '../shared';
import type { ModelCost, ProviderConfig } from '../shared';

interface BedrockModelWithPricing {
  id: string;
  cost: ModelCost;
}

export const BEDROCK_MODELS_WITH_PRICING: BedrockModelWithPricing[] = [
  // === AMAZON NOVA MODELS ===
  // https://aws.amazon.com/bedrock/pricing/
  {
    id: 'amazon.nova-micro-v1:0',
    cost: {
      input: 0.000035 / 1000, // $0.035 per 1M tokens
      output: 0.00014 / 1000, // $0.14 per 1M tokens
    },
  },
  {
    id: 'amazon.nova-lite-v1:0',
    cost: {
      input: 0.00006 / 1000, // $0.06 per 1M tokens
      output: 0.00024 / 1000, // $0.24 per 1M tokens
    },
  },
  {
    id: 'amazon.nova-pro-v1:0',
    cost: {
      input: 0.0008 / 1000, // $0.80 per 1M tokens
      output: 0.0032 / 1000, // $3.20 per 1M tokens
    },
  },

  // Regional variants (us., eu., apac.)
  {
    id: 'us.amazon.nova-premier-v1:0',
    cost: {
      input: 0.002 / 1000, // $2.00 per 1M tokens (estimated)
      output: 0.008 / 1000, // $8.00 per 1M tokens (estimated)
    },
  },

  // === ANTHROPIC CLAUDE MODELS ===
  // Claude 3.5 Sonnet
  {
    id: 'anthropic.claude-3-5-sonnet-20241022-v2:0',
    cost: {
      input: 0.003 / 1000, // $3.00 per 1M tokens
      output: 0.015 / 1000, // $15.00 per 1M tokens
    },
  },
  {
    id: 'us.anthropic.claude-3-5-sonnet-20241022-v2:0',
    cost: {
      input: 0.003 / 1000,
      output: 0.015 / 1000,
    },
  },
  {
    id: 'eu.anthropic.claude-3-5-sonnet-20241022-v2:0',
    cost: {
      input: 0.003 / 1000,
      output: 0.015 / 1000,
    },
  },
  {
    id: 'apac.anthropic.claude-3-5-sonnet-20241022-v2:0',
    cost: {
      input: 0.003 / 1000,
      output: 0.015 / 1000,
    },
  },

  // Claude 4.5 Sonnet
  {
    id: 'anthropic.claude-sonnet-4-5-20250929-v1:0',
    cost: {
      input: 0.003 / 1000, // $3.00 per 1M tokens
      output: 0.015 / 1000, // $15.00 per 1M tokens
    },
  },
  {
    id: 'us.anthropic.claude-sonnet-4-5-20250929-v1:0',
    cost: {
      input: 0.003 / 1000,
      output: 0.015 / 1000,
    },
  },

  // Claude 3.5 Haiku
  {
    id: 'anthropic.claude-3-5-haiku-20241022-v1:0',
    cost: {
      input: 0.0008 / 1000, // $0.80 per 1M tokens
      output: 0.004 / 1000, // $4.00 per 1M tokens
    },
  },
  {
    id: 'us.anthropic.claude-3-5-haiku-20241022-v1:0',
    cost: {
      input: 0.0008 / 1000,
      output: 0.004 / 1000,
    },
  },
  {
    id: 'eu.anthropic.claude-3-5-haiku-20241022-v1:0',
    cost: {
      input: 0.0008 / 1000,
      output: 0.004 / 1000,
    },
  },

  // Claude 4 Opus
  {
    id: 'anthropic.claude-opus-4-1-20250805-v1:0',
    cost: {
      input: 0.015 / 1000, // $15.00 per 1M tokens
      output: 0.075 / 1000, // $75.00 per 1M tokens
    },
  },
  {
    id: 'us.anthropic.claude-opus-4-1-20250805-v1:0',
    cost: {
      input: 0.015 / 1000,
      output: 0.075 / 1000,
    },
  },

  // Claude 3 Opus
  {
    id: 'anthropic.claude-3-opus-20240229-v1:0',
    cost: {
      input: 0.015 / 1000, // $15.00 per 1M tokens
      output: 0.075 / 1000, // $75.00 per 1M tokens
    },
  },
  {
    id: 'us.anthropic.claude-3-opus-20240229-v1:0',
    cost: {
      input: 0.015 / 1000,
      output: 0.075 / 1000,
    },
  },

  // Claude 3 Sonnet
  {
    id: 'anthropic.claude-3-sonnet-20240229-v1:0',
    cost: {
      input: 0.003 / 1000, // $3.00 per 1M tokens
      output: 0.015 / 1000, // $15.00 per 1M tokens
    },
  },
  {
    id: 'us.anthropic.claude-3-sonnet-20240229-v1:0',
    cost: {
      input: 0.003 / 1000,
      output: 0.015 / 1000,
    },
  },

  // Claude 3 Haiku
  {
    id: 'anthropic.claude-3-haiku-20240307-v1:0',
    cost: {
      input: 0.00025 / 1000, // $0.25 per 1M tokens
      output: 0.00125 / 1000, // $1.25 per 1M tokens
    },
  },
  {
    id: 'us.anthropic.claude-3-haiku-20240307-v1:0',
    cost: {
      input: 0.00025 / 1000,
      output: 0.00125 / 1000,
    },
  },

  // Claude 2.x (legacy)
  {
    id: 'anthropic.claude-v2',
    cost: {
      input: 0.008 / 1000, // $8.00 per 1M tokens
      output: 0.024 / 1000, // $24.00 per 1M tokens
    },
  },
  {
    id: 'anthropic.claude-v2:1',
    cost: {
      input: 0.008 / 1000,
      output: 0.024 / 1000,
    },
  },
  {
    id: 'anthropic.claude-instant-v1',
    cost: {
      input: 0.0008 / 1000, // $0.80 per 1M tokens
      output: 0.0024 / 1000, // $2.40 per 1M tokens
    },
  },

  // === META LLAMA MODELS ===
  // Llama 3.3
  {
    id: 'meta.llama3-3-70b-instruct-v1:0',
    cost: {
      input: 0.00072 / 1000, // $0.72 per 1M tokens
      output: 0.00072 / 1000, // $0.72 per 1M tokens
    },
  },
  {
    id: 'us.meta.llama3-3-70b-instruct-v1:0',
    cost: {
      input: 0.00072 / 1000,
      output: 0.00072 / 1000,
    },
  },

  // Llama 3.2
  {
    id: 'meta.llama3-2-1b-instruct-v1:0',
    cost: {
      input: 0.0001 / 1000, // $0.10 per 1M tokens
      output: 0.0004 / 1000, // $0.40 per 1M tokens
    },
  },
  {
    id: 'us.meta.llama3-2-1b-instruct-v1:0',
    cost: {
      input: 0.0001 / 1000,
      output: 0.0004 / 1000,
    },
  },
  {
    id: 'meta.llama3-2-3b-instruct-v1:0',
    cost: {
      input: 0.00015 / 1000, // $0.15 per 1M tokens
      output: 0.0006 / 1000, // $0.60 per 1M tokens
    },
  },
  {
    id: 'us.meta.llama3-2-3b-instruct-v1:0',
    cost: {
      input: 0.00015 / 1000,
      output: 0.0006 / 1000,
    },
  },
  {
    id: 'meta.llama3-2-11b-vision-instruct-v1:0',
    cost: {
      input: 0.00036 / 1000, // $0.36 per 1M tokens
      output: 0.00036 / 1000, // $0.36 per 1M tokens
    },
  },
  {
    id: 'us.meta.llama3-2-11b-vision-instruct-v1:0',
    cost: {
      input: 0.00036 / 1000,
      output: 0.00036 / 1000,
    },
  },
  {
    id: 'meta.llama3-2-90b-vision-instruct-v1:0',
    cost: {
      input: 0.00144 / 1000, // $1.44 per 1M tokens
      output: 0.00144 / 1000, // $1.44 per 1M tokens
    },
  },
  {
    id: 'us.meta.llama3-2-90b-vision-instruct-v1:0',
    cost: {
      input: 0.00144 / 1000,
      output: 0.00144 / 1000,
    },
  },

  // Llama 3.1
  {
    id: 'meta.llama3-1-8b-instruct-v1:0',
    cost: {
      input: 0.0003 / 1000, // $0.30 per 1M tokens
      output: 0.0006 / 1000, // $0.60 per 1M tokens
    },
  },
  {
    id: 'us.meta.llama3-1-8b-instruct-v1:0',
    cost: {
      input: 0.0003 / 1000,
      output: 0.0006 / 1000,
    },
  },
  {
    id: 'meta.llama3-1-70b-instruct-v1:0',
    cost: {
      input: 0.00099 / 1000, // $0.99 per 1M tokens
      output: 0.00099 / 1000, // $0.99 per 1M tokens
    },
  },
  {
    id: 'us.meta.llama3-1-70b-instruct-v1:0',
    cost: {
      input: 0.00099 / 1000,
      output: 0.00099 / 1000,
    },
  },
  {
    id: 'meta.llama3-1-405b-instruct-v1:0',
    cost: {
      input: 0.00532 / 1000, // $5.32 per 1M tokens
      output: 0.016 / 1000, // $16.00 per 1M tokens
    },
  },
  {
    id: 'us.meta.llama3-1-405b-instruct-v1:0',
    cost: {
      input: 0.00532 / 1000,
      output: 0.016 / 1000,
    },
  },

  // Llama 3
  {
    id: 'meta.llama3-8b-instruct-v1:0',
    cost: {
      input: 0.0003 / 1000, // $0.30 per 1M tokens
      output: 0.0006 / 1000, // $0.60 per 1M tokens
    },
  },
  {
    id: 'meta.llama3-70b-instruct-v1:0',
    cost: {
      input: 0.00099 / 1000, // $0.99 per 1M tokens
      output: 0.00099 / 1000, // $0.99 per 1M tokens
    },
  },

  // Llama 2
  {
    id: 'meta.llama2-13b-chat-v1',
    cost: {
      input: 0.00075 / 1000, // $0.75 per 1M tokens
      output: 0.001 / 1000, // $1.00 per 1M tokens
    },
  },
  {
    id: 'meta.llama2-70b-chat-v1',
    cost: {
      input: 0.00195 / 1000, // $1.95 per 1M tokens
      output: 0.00256 / 1000, // $2.56 per 1M tokens
    },
  },

  // Llama 4
  {
    id: 'meta.llama4-scout-17b-instruct-v1:0',
    cost: {
      input: 0.0003 / 1000, // $0.30 per 1M tokens (estimated)
      output: 0.0006 / 1000, // $0.60 per 1M tokens (estimated)
    },
  },
  {
    id: 'meta.llama4-maverick-17b-instruct-v1:0',
    cost: {
      input: 0.0003 / 1000, // $0.30 per 1M tokens (estimated)
      output: 0.0006 / 1000, // $0.60 per 1M tokens (estimated)
    },
  },

  // === MISTRAL MODELS ===
  {
    id: 'mistral.mistral-7b-instruct-v0:2',
    cost: {
      input: 0.00015 / 1000, // $0.15 per 1M tokens
      output: 0.00015 / 1000, // $0.15 per 1M tokens
    },
  },
  {
    id: 'mistral.mixtral-8x7b-instruct-v0:1',
    cost: {
      input: 0.00045 / 1000, // $0.45 per 1M tokens
      output: 0.00045 / 1000, // $0.45 per 1M tokens
    },
  },
  {
    id: 'mistral.mistral-small-2402-v1:0',
    cost: {
      input: 0.0003 / 1000, // $0.30 per 1M tokens
      output: 0.0009 / 1000, // $0.90 per 1M tokens
    },
  },
  {
    id: 'mistral.mistral-large-2402-v1:0',
    cost: {
      input: 0.003 / 1000, // $3.00 per 1M tokens
      output: 0.009 / 1000, // $9.00 per 1M tokens
    },
  },
  {
    id: 'mistral.mistral-large-2407-v1:0',
    cost: {
      input: 0.003 / 1000, // $3.00 per 1M tokens
      output: 0.009 / 1000, // $9.00 per 1M tokens
    },
  },

  // === COHERE MODELS ===
  {
    id: 'cohere.command-text-v14',
    cost: {
      input: 0.0015 / 1000, // $1.50 per 1M tokens
      output: 0.002 / 1000, // $2.00 per 1M tokens
    },
  },
  {
    id: 'cohere.command-light-text-v14',
    cost: {
      input: 0.0003 / 1000, // $0.30 per 1M tokens
      output: 0.0006 / 1000, // $0.60 per 1M tokens
    },
  },
  {
    id: 'cohere.command-r-v1:0',
    cost: {
      input: 0.0005 / 1000, // $0.50 per 1M tokens
      output: 0.0015 / 1000, // $1.50 per 1M tokens
    },
  },
  {
    id: 'cohere.command-r-plus-v1:0',
    cost: {
      input: 0.003 / 1000, // $3.00 per 1M tokens
      output: 0.015 / 1000, // $15.00 per 1M tokens
    },
  },

  // === AI21 LABS MODELS ===
  {
    id: 'ai21.jamba-1-5-large-v1:0',
    cost: {
      input: 0.002 / 1000, // $2.00 per 1M tokens
      output: 0.008 / 1000, // $8.00 per 1M tokens
    },
  },
  {
    id: 'ai21.jamba-1-5-mini-v1:0',
    cost: {
      input: 0.0002 / 1000, // $0.20 per 1M tokens
      output: 0.0004 / 1000, // $0.40 per 1M tokens
    },
  },
  {
    id: 'ai21.j2-ultra-v1',
    cost: {
      input: 0.0188 / 1000, // $18.80 per 1M tokens
      output: 0.0188 / 1000, // $18.80 per 1M tokens
    },
  },
  {
    id: 'ai21.j2-mid-v1',
    cost: {
      input: 0.0125 / 1000, // $12.50 per 1M tokens
      output: 0.0125 / 1000, // $12.50 per 1M tokens
    },
  },

  // === DEEPSEEK MODELS ===
  {
    id: 'deepseek.r1-v1:0',
    cost: {
      input: 0.0004 / 1000, // $0.40 per 1M tokens
      output: 0.0016 / 1000, // $1.60 per 1M tokens
    },
  },
  {
    id: 'us.deepseek.r1-v1:0',
    cost: {
      input: 0.0004 / 1000,
      output: 0.0016 / 1000,
    },
  },
  {
    id: 'deepseek.v3.1',
    cost: {
      input: 0.00014 / 1000, // $0.14 per 1M tokens (estimated)
      output: 0.00056 / 1000, // $0.56 per 1M tokens (estimated)
    },
  },

  // === OPENAI MODELS (via Bedrock) ===
  {
    id: 'openai.gpt-oss-120b-1:0',
    cost: {
      input: 0.0004 / 1000, // $0.40 per 1M tokens
      output: 0.0016 / 1000, // $1.60 per 1M tokens
    },
  },
  {
    id: 'openai.gpt-oss-20b-1:0',
    cost: {
      input: 0.0002 / 1000, // $0.20 per 1M tokens
      output: 0.0008 / 1000, // $0.80 per 1M tokens
    },
  },

  // === QWEN MODELS (Alibaba) ===
  {
    id: 'qwen.qwen3-32b-v1:0',
    cost: {
      input: 0.0002 / 1000, // $0.20 per 1M tokens
      output: 0.0008 / 1000, // $0.80 per 1M tokens
    },
  },
  {
    id: 'qwen.qwen3-235b-a22b-2507-v1:0',
    cost: {
      input: 0.0008 / 1000, // $0.80 per 1M tokens
      output: 0.0032 / 1000, // $3.20 per 1M tokens
    },
  },
  {
    id: 'qwen.qwen3-coder-30b-a3b-v1:0',
    cost: {
      input: 0.0002 / 1000, // $0.20 per 1M tokens (estimated)
      output: 0.0008 / 1000, // $0.80 per 1M tokens (estimated)
    },
  },
  {
    id: 'qwen.qwen3-coder-480b-a35b-v1:0',
    cost: {
      input: 0.001 / 1000, // $1.00 per 1M tokens
      output: 0.004 / 1000, // $4.00 per 1M tokens
    },
  },

  // === AMAZON TITAN MODELS ===
  {
    id: 'amazon.titan-text-lite-v1',
    cost: {
      input: 0.00015 / 1000, // $0.15 per 1M tokens
      output: 0.0002 / 1000, // $0.20 per 1M tokens
    },
  },
  {
    id: 'amazon.titan-text-express-v1',
    cost: {
      input: 0.0002 / 1000, // $0.20 per 1M tokens
      output: 0.0006 / 1000, // $0.60 per 1M tokens
    },
  },
  {
    id: 'amazon.titan-text-premier-v1:0',
    cost: {
      input: 0.0005 / 1000, // $0.50 per 1M tokens
      output: 0.0015 / 1000, // $1.50 per 1M tokens
    },
  },
];

/**
 * Calculate cost for a Bedrock API call
 *
 * @param modelName - Bedrock model ID (e.g., 'amazon.nova-lite-v1:0')
 * @param config - Provider configuration (may include custom cost override)
 * @param promptTokens - Number of input tokens
 * @param completionTokens - Number of output tokens
 * @returns Cost in USD, or undefined if cannot be calculated
 */
export function calculateBedrockCost(
  modelName: string,
  config: ProviderConfig,
  promptTokens: number | undefined,
  completionTokens: number | undefined,
): number | undefined {
  // Use shared utility - handles validation and custom cost overrides
  return calculateCost(
    modelName,
    config,
    promptTokens,
    completionTokens,
    BEDROCK_MODELS_WITH_PRICING,
  );
}
