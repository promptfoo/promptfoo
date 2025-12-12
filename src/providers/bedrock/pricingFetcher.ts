import {
  PricingClient,
  GetProductsCommand,
  type GetProductsCommandOutput,
} from '@aws-sdk/client-pricing';
import type { AwsCredentialIdentity, AwsCredentialIdentityProvider } from '@aws-sdk/types';
import { getCache, isCacheEnabled } from '../../cache';
import logger from '../../logger';

/**
 * Cache TTL for pricing data in milliseconds.
 * AWS pricing updates up to 3x daily, so 4 hours is a reasonable TTL.
 */
const PRICING_CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

/**
 * Valid AWS regions where Bedrock is available.
 * Used for fail-fast validation to avoid unnecessary API calls with invalid regions.
 * See: https://docs.aws.amazon.com/bedrock/latest/userguide/bedrock-regions.html
 */
const VALID_BEDROCK_REGIONS = new Set([
  // US regions
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
  // EU regions
  'eu-central-1',
  'eu-west-1',
  'eu-west-2',
  'eu-west-3',
  'eu-north-1',
  // Asia Pacific regions
  'ap-south-1',
  'ap-southeast-1',
  'ap-southeast-2',
  'ap-northeast-1',
  'ap-northeast-2',
  'ap-northeast-3',
  // South America
  'sa-east-1',
  // Canada
  'ca-central-1',
  // Middle East
  'me-south-1',
  'me-central-1',
  // Africa
  'af-south-1',
  // GovCloud
  'us-gov-west-1',
]);

export interface BedrockPricingData {
  models: Map<string, BedrockModelPricing>;
  region: string;
  fetchedAt: Date;
}

export interface BedrockModelPricing {
  input: number;
  output: number;
}

/**
 * Module-level cache of pricing fetch promises by region.
 * This ensures only ONE fetch happens per region, even with concurrent requests.
 *
 * Example scenario:
 * - 10 concurrent requests start with no cache
 * - All 10 call getPricingData('us-east-1')
 * - First request creates a fetch promise and stores it in the map
 * - Requests 2-10 reuse the same promise
 * - Result: 1 API call instead of 10
 */
const pricingFetchPromises = new Map<string, Promise<BedrockPricingData | null>>();

/**
 * Maps Bedrock model IDs to their pricing API model names.
 * The pricing API uses human-readable model names rather than model IDs.
 *
 * Handles model IDs with region prefixes (e.g., us.anthropic.claude-3-5-sonnet-20241022-v2:0)
 * by stripping the prefix before matching.
 */
export function mapBedrockModelIdToApiName(modelId: string): string {
  // Extract base model name (remove version suffix like :0, :1, :2)
  let baseId = modelId.split(':')[0];

  // Strip region prefix if present (us., eu., apac., us-gov., global., au., jp.)
  baseId = baseId.replace(/^(us|eu|apac|us-gov|global|au|jp)\./, '');

  // Common model mappings
  const mappings: Record<string, string> = {
    // Anthropic Claude models - Current generation
    'anthropic.claude-3-5-sonnet-20241022-v2': 'Claude 3.5 Sonnet v2',
    'anthropic.claude-3-5-sonnet-20240620-v1': 'Claude 3.5 Sonnet',
    'anthropic.claude-3-5-haiku-20241022-v1': 'Claude 3.5 Haiku',
    'anthropic.claude-3-opus-20240229-v1': 'Claude 3 Opus',
    'anthropic.claude-3-sonnet-20240229-v1': 'Claude 3 Sonnet',
    'anthropic.claude-3-haiku-20240307-v1': 'Claude 3 Haiku',
    // Anthropic Claude models - Legacy
    'anthropic.claude-instant-v1': 'Claude Instant',
    'anthropic.claude-v1': 'Claude',
    'anthropic.claude-v2': 'Claude v2',

    // Amazon Nova models
    'amazon.nova-micro-v1': 'Nova Micro',
    'amazon.nova-lite-v1': 'Nova Lite',
    'amazon.nova-pro-v1': 'Nova Pro',
    'amazon.nova-premier-v1': 'Nova Premier',
    // Amazon Titan models
    'amazon.titan-text-express-v1': 'Titan Text G1 - Express',
    'amazon.titan-text-lite-v1': 'Titan Text G1 - Lite',
    'amazon.titan-text-premier-v1': 'Titan Text G1 - Premier',

    // Meta Llama models - Llama 2
    'meta.llama2-13b-chat-v1': 'Llama 2 Chat 13B',
    'meta.llama2-70b-chat-v1': 'Llama 2 Chat 70B',
    // Meta Llama models - Llama 3
    'meta.llama3-8b-instruct-v1': 'Llama 3 8B Instruct',
    'meta.llama3-70b-instruct-v1': 'Llama 3 70B Instruct',
    // Meta Llama models - Llama 3.1
    'meta.llama3-1-405b-instruct-v1': 'Llama 3.1 405B Instruct',
    'meta.llama3-1-70b-instruct-v1': 'Llama 3.1 70B Instruct',
    'meta.llama3-1-8b-instruct-v1': 'Llama 3.1 8B Instruct',
    // Meta Llama models - Llama 3.2
    'meta.llama3-2-90b-instruct-v1': 'Llama 3.2 90B Instruct',
    'meta.llama3-2-11b-instruct-v1': 'Llama 3.2 11B Instruct',
    'meta.llama3-2-3b-instruct-v1': 'Llama 3.2 3B Instruct',
    'meta.llama3-2-1b-instruct-v1': 'Llama 3.2 1B Instruct',
    // Meta Llama models - Llama 3.3
    'meta.llama3-3-70b-instruct-v1': 'Llama 3.3 70B Instruct',
    // Meta Llama models - Llama 4
    'meta.llama4-scout-17b-instruct-v1': 'Llama 4 Scout 17B',
    'meta.llama4-maverick-17b-instruct-v1': 'Llama 4 Maverick 17B',

    // Mistral models (mapping keys without revision suffixes since we strip them above)
    'mistral.mistral-7b-instruct-v0': 'Mistral 7B Instruct',
    'mistral.mixtral-8x7b-instruct-v0': 'Mixtral 8x7B Instruct',
    'mistral.mistral-large-2402-v1': 'Mistral Large',
    'mistral.mistral-large-2407-v1': 'Mistral Large 2407',
    'mistral.mistral-small-2402-v1': 'Mistral Small',

    // Cohere models
    'cohere.command-r-v1': 'Command R',
    'cohere.command-r-plus-v1': 'Command R+',
    'cohere.command-text-v14': 'Command',
    'cohere.command-light-text-v14': 'Command Light',

    // AI21 models
    'ai21.jamba-1-5-large-v1': 'Jamba 1.5 Large',
    'ai21.jamba-1-5-mini-v1': 'Jamba 1.5 Mini',

    // DeepSeek models
    'deepseek.r1-v1': 'R1',

    // OpenAI models
    'openai.gpt-oss-120b-1': 'gpt-oss-120b',
    'openai.gpt-oss-20b-1': 'gpt-oss-20b',

    // Qwen models
    'qwen.qwen3-coder-480b-a35b-v1': 'Qwen3 Coder 480B',
    'qwen.qwen3-coder-30b-a3b-v1': 'Qwen3 Coder 30B',
    'qwen.qwen3-235b-a22b-2507-v1': 'Qwen3 235B',
    'qwen.qwen3-32b-v1': 'Qwen3 32B',

    // Writer AI models
    'writer.palmyra-x4-v1': 'Palmyra X4',
    'writer.palmyra-x5-v1': 'Palmyra X5',

    // Mistral Pixtral models
    'mistral.pixtral-large-2502-v1': 'Pixtral Large',

    // DeepSeek v3
    'deepseek.v3-v1': 'DeepSeek V3',
  };

  return mappings[baseId] || baseId;
}

/**
 * Gets pricing data for a region, with caching and coordinated concurrent fetches.
 * This function ensures only ONE fetch happens per region, even with concurrent requests.
 *
 * Flow:
 * 1. Check persistent cache (file-based cache via getCache())
 * 2. If cached, return cached data
 * 3. If not cached, check if a fetch is in progress for this region
 * 4. If fetch in progress, wait for it
 * 5. If no fetch in progress, start one and cache the result
 *
 * @param region - AWS region for Bedrock models (e.g., 'us-east-1')
 * @param credentials - AWS credentials for Pricing API access (identity or provider)
 * @returns Promise resolving to pricing data, or null if fetch fails
 */
export async function getPricingData(
  region: string,
  credentials?: AwsCredentialIdentity | AwsCredentialIdentityProvider,
): Promise<BedrockPricingData | null> {
  // Fail fast for invalid regions
  if (!VALID_BEDROCK_REGIONS.has(region)) {
    logger.warn('[Bedrock Pricing]: Invalid region, skipping pricing fetch', {
      region,
      validRegions: Array.from(VALID_BEDROCK_REGIONS),
    });
    return null;
  }

  const cache = await getCache();
  const cacheKey = `bedrock-pricing:${region}`;

  // Check persistent cache first
  if (isCacheEnabled()) {
    try {
      const cachedData = await cache.get(cacheKey);
      if (cachedData) {
        const parsed = JSON.parse(cachedData as string);
        const fetchedAt = new Date(parsed.fetchedAt);
        const cacheAge = Date.now() - fetchedAt.getTime();

        // Check if cache is still valid (within TTL)
        if (cacheAge < PRICING_CACHE_TTL_MS) {
          const models = new Map<string, BedrockModelPricing>(
            parsed.models as Array<[string, BedrockModelPricing]>,
          );
          const pricingData = {
            models,
            region: parsed.region,
            fetchedAt,
          };
          logger.debug('[Bedrock Pricing]: Using cached pricing data', {
            region,
            modelCount: models.size,
            cachedAt: fetchedAt.toISOString(),
            cacheAgeHours: (cacheAge / (60 * 60 * 1000)).toFixed(1),
          });
          return pricingData;
        } else {
          logger.debug('[Bedrock Pricing]: Cached pricing data expired', {
            region,
            cacheAgeHours: (cacheAge / (60 * 60 * 1000)).toFixed(1),
            ttlHours: (PRICING_CACHE_TTL_MS / (60 * 60 * 1000)).toFixed(1),
          });
        }
      }
    } catch (err) {
      logger.debug('[Bedrock Pricing]: Failed to parse cached pricing', {
        error: String(err),
      });
    }
  }

  // No cached data, check if there's already a fetch in progress for this region
  let fetchPromise = pricingFetchPromises.get(region);

  if (fetchPromise) {
    logger.debug('[Bedrock Pricing]: Reusing in-flight pricing fetch', { region });
  } else {
    // No fetch in progress, start a new one
    logger.debug('[Bedrock Pricing]: Starting new pricing fetch', { region });
    fetchPromise = fetchBedrockPricing(region, credentials);
    pricingFetchPromises.set(region, fetchPromise);

    // Clean up the promise after it completes (success or failure)
    fetchPromise.finally(() => {
      pricingFetchPromises.delete(region);
      logger.debug('[Bedrock Pricing]: Cleared fetch promise from cache', { region });
    });
  }

  // Wait for the fetch (either the one we started or one already in progress)
  const pricingData = await fetchPromise;

  // Cache the result if successful
  if (pricingData && isCacheEnabled()) {
    try {
      const cacheData = JSON.stringify({
        models: Array.from(pricingData.models.entries()),
        region: pricingData.region,
        fetchedAt: pricingData.fetchedAt.toISOString(),
      });
      await cache.set(cacheKey, cacheData);
      logger.debug('[Bedrock Pricing]: Cached pricing data', { region });
    } catch (err) {
      logger.debug('[Bedrock Pricing]: Failed to cache pricing data', {
        error: String(err),
      });
    }
  }

  return pricingData;
}

/**
 * Fetches current Bedrock pricing from AWS Pricing API.
 * Internal function - use getPricingData() instead to get coordinated fetching.
 *
 * @param region - AWS region for Bedrock models (e.g., 'us-east-1')
 * @param credentials - AWS credentials for Pricing API access (identity or provider)
 * @returns Promise resolving to pricing data, or null if fetch fails
 */
async function fetchBedrockPricing(
  region: string,
  credentials?: AwsCredentialIdentity | AwsCredentialIdentityProvider,
): Promise<BedrockPricingData | null> {
  const startTime = Date.now();

  try {
    logger.debug('[Bedrock Pricing]: Fetching pricing from AWS Pricing API', {
      region,
    });

    // Create Pricing client (always use us-east-1 for Pricing API)
    const pricingClient = new PricingClient({
      region: 'us-east-1', // Pricing API only available in us-east-1
      ...(credentials ? { credentials } : {}),
    });

    // Fetch ALL pricing products with pagination
    let allPriceItems: string[] = [];
    let nextToken: string | undefined;

    do {
      const command = new GetProductsCommand({
        ServiceCode: 'AmazonBedrock',
        Filters: [
          {
            Type: 'TERM_MATCH',
            Field: 'regionCode',
            Value: region,
          },
        ],
        MaxResults: 100,
        NextToken: nextToken,
      });

      // Set 10-second timeout per page
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error('Pricing API request timed out after 10 seconds')),
          10000,
        );
      });

      const response = (await Promise.race([
        pricingClient.send(command),
        timeoutPromise,
      ])) as GetProductsCommandOutput;

      if (response.PriceList) {
        allPriceItems = allPriceItems.concat(response.PriceList);
      }

      nextToken = response.NextToken;
    } while (nextToken);

    // Parse pricing data
    const models = new Map<string, BedrockModelPricing>();
    const allModelsFound = new Set<string>();
    const usageTypeSamples: Record<string, string> = {};

    for (const priceItem of allPriceItems) {
      try {
        const product = JSON.parse(priceItem);
        const attrs = product.product?.attributes;

        if (!attrs || !attrs.model) {
          continue;
        }

        const modelName = attrs.model;
        const inferenceType = attrs.inferenceType || '';
        const usagetype = attrs.usagetype || '';
        const feature = attrs.feature || '';

        // Track all models we find (for debugging)
        allModelsFound.add(modelName);

        // Store sample usagetype for each model (for debugging)
        if (!usageTypeSamples[modelName]) {
          usageTypeSamples[modelName] = usagetype;
        }

        // Only process On-demand Inference pricing
        if (feature !== 'On-demand Inference') {
          continue;
        }

        // Get pricing from OnDemand terms with defensive checks
        if (product.terms?.OnDemand) {
          const onDemand = Object.values(product.terms.OnDemand)[0] as any;
          if (!onDemand?.priceDimensions) {
            continue;
          }

          const priceDim = Object.values(onDemand.priceDimensions)[0] as any;
          if (!priceDim?.pricePerUnit?.USD) {
            continue;
          }

          const price = parseFloat(priceDim.pricePerUnit.USD);

          // Skip invalid prices (NaN, negative, or Infinity)
          if (!Number.isFinite(price) || price < 0) {
            logger.debug('[Bedrock Pricing]: Skipping invalid price', {
              modelName,
              priceRaw: priceDim.pricePerUnit?.USD,
              parsedPrice: price,
            });
            continue;
          }

          // Only create model entry when we find on-demand pricing
          if (!models.has(modelName)) {
            models.set(modelName, { input: 0, output: 0 });
          }

          const modelPricing = models.get(modelName)!;

          // Pricing is per 1K tokens, convert to per-token
          if (inferenceType.toLowerCase().includes('input')) {
            modelPricing.input = price / 1000;
          } else if (inferenceType.toLowerCase().includes('output')) {
            modelPricing.output = price / 1000;
          }
        }
      } catch (err) {
        logger.debug('[Bedrock Pricing]: Failed to parse price item', {
          error: String(err),
        });
        continue;
      }
    }

    const duration = Date.now() - startTime;

    logger.debug('[Bedrock Pricing]: Successfully fetched pricing', {
      region,
      modelCount: models.size,
      durationMs: duration,
      allModelsFound: Array.from(allModelsFound).sort(),
      usageTypeSamples,
    });

    return {
      models,
      region,
      fetchedAt: new Date(),
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.warn('[Bedrock Pricing]: Failed to fetch pricing from API', {
      region,
      error: String(error),
      durationMs: duration,
    });
    return null;
  }
}

/**
 * Fallback pricing for models not yet in AWS Pricing API.
 * Prices from official vendor documentation and third-party sources.
 * Patterns use hyphens to match Bedrock model ID format (e.g., claude-haiku-4-5).
 *
 * Sources:
 * - Anthropic: https://platform.claude.com/docs/en/about-claude/pricing
 * - AI21 Jamba: Azure pricing and Artificial Analysis
 * - Qwen: Estimated based on model size and market rates
 * - Llama: AWS Bedrock pricing patterns
 * - Writer AI: Estimated based on model capabilities
 * - Mistral Pixtral: Estimated based on Mistral Large pricing
 * - DeepSeek v3: Estimated based on model size and capabilities
 */
const FALLBACK_PRICING: Record<string, BedrockModelPricing> = {
  // ===== Claude Models =====
  // Claude 4.5 models (Anthropic official pricing - different from 4.0/4.1)
  // Source: https://claude.com/pricing
  'claude-opus-4-5': { input: 0.000005, output: 0.000025 }, // $5/$25 per MTok
  'claude-opus-4-5-20251101': { input: 0.000005, output: 0.000025 },
  'claude-sonnet-4-5': { input: 0.000003, output: 0.000015 }, // $3/$15 per MTok
  'claude-sonnet-4-5-20250929': { input: 0.000003, output: 0.000015 },
  'claude-haiku-4-5': { input: 0.000001, output: 0.000005 }, // $1/$5 per MTok
  'claude-haiku-4-5-20251001': { input: 0.000001, output: 0.000005 },
  // Claude 4.0/4.1 models (higher pricing than 4.5)
  'claude-opus-4': { input: 0.000015, output: 0.000075 }, // $15/$75 per MTok
  'claude-opus-4-1': { input: 0.000015, output: 0.000075 },
  'claude-opus-4-20250514': { input: 0.000015, output: 0.000075 },
  'claude-opus-4-1-20250805': { input: 0.000015, output: 0.000075 },
  'claude-sonnet-4': { input: 0.000003, output: 0.000015 }, // $3/$15 per MTok
  'claude-sonnet-4-20250514': { input: 0.000003, output: 0.000015 },
  // Claude 3.7 Sonnet
  'claude-3-7-sonnet': { input: 0.000003, output: 0.000015 }, // $3/$15 per MTok
  'claude-3-7-sonnet-20250219': { input: 0.000003, output: 0.000015 },

  // Claude 3.5 Sonnet v2 (October 2024 release, same pricing as v1)
  'claude-3-5-sonnet-20241022-v2': { input: 0.000003, output: 0.000015 },
  'claude-3-5-sonnet-v2': { input: 0.000003, output: 0.000015 },

  // ===== AI21 Jamba Models =====
  // From Azure pricing and Artificial Analysis
  'jamba-1-5-large': { input: 0.000002, output: 0.000008 },
  'jamba-1-5-mini': { input: 0.0000002, output: 0.0000004 },

  // ===== Qwen Models =====
  // Estimated based on model size and market rates
  'qwen3-coder-480b': { input: 0.000003, output: 0.000015 }, // Large coder model
  'qwen3-coder-30b': { input: 0.000001, output: 0.000005 }, // Medium coder model
  'qwen3-235b': { input: 0.000002, output: 0.00001 }, // Large general model
  'qwen3-32b': { input: 0.0000005, output: 0.0000025 }, // Medium general model

  // ===== Llama Models =====
  // Llama 3.2 3B (between 1B and 11B pricing)
  'llama3-2-3b': { input: 0.00000015, output: 0.00000015 }, // $0.15 per MTok (estimate)

  // ===== Writer AI Models =====
  // Estimated based on model capabilities and Writer API pricing
  'palmyra-x4': { input: 0.000001, output: 0.000003 }, // ~$1/$3 per MTok (estimate)
  'palmyra-x5': { input: 0.000002, output: 0.000006 }, // ~$2/$6 per MTok (estimate)

  // ===== Mistral Pixtral Models =====
  // Multimodal model pricing (estimated based on Mistral Large pricing)
  'pixtral-large': { input: 0.000003, output: 0.000009 }, // ~$3/$9 per MTok (estimate)

  // ===== DeepSeek Models =====
  // DeepSeek v3 (estimated based on model size and capabilities)
  'deepseek-v3': { input: 0.0000006, output: 0.000002 }, // ~$0.6/$2 per MTok (estimate)
  'deepseek.v3': { input: 0.0000006, output: 0.000002 }, // Alternative pattern
};

/**
 * Attempts to find fallback pricing for a model not in AWS Pricing API.
 * Matches common model name patterns against known pricing.
 */
function getFallbackPricing(modelId: string): BedrockModelPricing | undefined {
  // Normalize model ID: remove region prefix, version suffix
  // Must match the same prefixes as mapBedrockModelIdToApiName
  const normalized = modelId
    .replace(/^(us|eu|apac|us-gov|global|au|jp)\./, '')
    .replace(/:\d+$/, '')
    .toLowerCase();

  // Try exact match patterns
  for (const [pattern, pricing] of Object.entries(FALLBACK_PRICING)) {
    if (normalized.includes(pattern)) {
      logger.debug('[Bedrock Pricing]: Using fallback pricing', {
        modelId,
        pattern,
        pricing,
      });
      return pricing;
    }
  }

  return undefined;
}

/**
 * Calculates cost using fetched pricing data.
 *
 * @param modelId - Bedrock model ID (e.g., 'anthropic.claude-3-5-sonnet-20241022-v2:0')
 * @param pricingData - Fetched pricing data (or null if fetch failed)
 * @param promptTokens - Number of input tokens
 * @param completionTokens - Number of output tokens
 * @returns Cost in dollars, or undefined if no pricing available
 */
export function calculateCostWithFetchedPricing(
  modelId: string,
  pricingData: BedrockPricingData | null | undefined,
  promptTokens: number | undefined,
  completionTokens: number | undefined,
): number | undefined {
  if (
    promptTokens === undefined ||
    completionTokens === undefined ||
    !Number.isFinite(promptTokens) ||
    !Number.isFinite(completionTokens) ||
    promptTokens < 0 ||
    completionTokens < 0
  ) {
    return undefined;
  }

  if (!pricingData) {
    logger.debug('[Bedrock Pricing]: No pricing data available', {
      modelId,
    });
    return undefined;
  }

  const modelName = mapBedrockModelIdToApiName(modelId);
  let modelPricing = pricingData.models.get(modelName);

  // If not found in API pricing, try fallback pricing
  if (!modelPricing) {
    modelPricing = getFallbackPricing(modelId);

    if (!modelPricing) {
      logger.debug('[Bedrock Pricing]: No pricing found (API or fallback)', {
        modelId,
        modelName,
        region: pricingData.region,
        availableModels: Array.from(pricingData.models.keys()),
      });
      return undefined;
    }

    logger.debug('[Bedrock Pricing]: Using fallback pricing (not in API)', {
      modelId,
      pricing: modelPricing,
    });
  }

  const inputCostPerToken = modelPricing.input;
  const outputCostPerToken = modelPricing.output;

  logger.debug('[Bedrock Pricing]: Using fetched pricing', {
    modelId,
    modelName,
    inputCostPerToken,
    outputCostPerToken,
    promptTokens,
    completionTokens,
  });

  const cost = promptTokens * inputCostPerToken + completionTokens * outputCostPerToken;

  return cost;
}
