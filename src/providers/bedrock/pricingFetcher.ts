import { getCache, isCacheEnabled } from '../../cache';
import logger from '../../logger';
import type {
  GetProductsCommand,
  GetProductsCommandOutput,
  PricingClient,
} from '@aws-sdk/client-pricing';
import type { AwsCredentialIdentity, AwsCredentialIdentityProvider } from '@aws-sdk/types';

/**
 * Cache TTL for pricing data in milliseconds.
 * AWS pricing updates up to 3x daily, so 4 hours is a reasonable TTL.
 */
const PRICING_CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours
const BEDROCK_PRICING_SERVICE_CODES = ['AmazonBedrock', 'AmazonBedrockFoundationModels'] as const;

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
 * Maps Bedrock model IDs to their pricing API model names.
 * The pricing API uses human-readable model names rather than model IDs.
 *
 * Handles model IDs with region prefixes (e.g., us.anthropic.claude-3-5-sonnet-20241022-v2:0)
 * by stripping the prefix before matching.
 */
function isApplicationInferenceProfileArn(modelId: string): boolean {
  return modelId.includes(':application-inference-profile/');
}

function getPricingModelId(modelId: string): string {
  const inferenceProfileId = modelId.match(/inference-profile\/([a-zA-Z0-9-:.]+)$/)?.[1];

  return (inferenceProfileId ?? modelId).replace(/:\d+$/, '');
}

export function mapBedrockModelIdToApiName(modelId: string): string {
  if (isApplicationInferenceProfileArn(modelId)) {
    return modelId;
  }

  // Extract base model name (remove version suffix like :0, :1, :2)
  let baseId = getPricingModelId(modelId);

  // Strip region prefix if present (us., eu., apac., us-gov., global., au., jp.)
  baseId = baseId.replace(/^(us|eu|apac|us-gov|global|au|jp)\./, '');

  // Common model mappings
  const mappings: Record<string, string> = {
    // Anthropic Claude models - Current generation
    'anthropic.claude-3-5-sonnet-20241022-v2': 'Claude 3.5 Sonnet v2',
    'anthropic.claude-3-5-sonnet-20240620-v1': 'Claude 3.5 Sonnet',
    'anthropic.claude-3-5-haiku-20241022-v1': 'Claude 3.5 Haiku',
    'anthropic.claude-3-7-sonnet-20250219-v1': 'Claude 3.7 Sonnet',
    'anthropic.claude-3-opus-20240229-v1': 'Claude 3 Opus',
    'anthropic.claude-3-sonnet-20240229-v1': 'Claude 3 Sonnet',
    'anthropic.claude-3-haiku-20240307-v1': 'Claude 3 Haiku',
    'anthropic.claude-haiku-4-5-20251001-v1': 'Claude Haiku 4.5',
    'anthropic.claude-sonnet-4-20250514-v1': 'Claude Sonnet 4',
    'anthropic.claude-sonnet-4-5-20250929-v1': 'Claude Sonnet 4.5',
    'anthropic.claude-sonnet-4-6': 'Claude Sonnet 4.6',
    'anthropic.claude-opus-4-20250514-v1': 'Claude Opus 4',
    'anthropic.claude-opus-4-1-20250805-v1': 'Claude Opus 4.1',
    'anthropic.claude-opus-4-5-20251101-v1': 'Claude Opus 4.5',
    'anthropic.claude-opus-4-6-v1': 'Claude Opus 4.6',
    'anthropic.claude-opus-4-7': 'Claude Opus 4.7',
    // Anthropic Claude models - Legacy
    'anthropic.claude-instant-v1': 'Claude Instant',
    'anthropic.claude-v1': 'Claude',
    'anthropic.claude-v2': 'Claude v2',

    // Amazon Nova models
    'amazon.nova-micro-v1': 'Nova Micro',
    'amazon.nova-lite-v1': 'Nova Lite',
    'amazon.nova-pro-v1': 'Nova Pro',
    'amazon.nova-premier-v1': 'Nova Premier',
    'amazon.nova-2-lite-v1': 'Nova 2.0 Lite',
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
    'deepseek.v3-v1': 'DeepSeek V3.1',
    'deepseek.v3.2': 'DeepSeek v3.2',

    // OpenAI models
    'openai.gpt-oss-120b-1': 'gpt-oss-120b',
    'openai.gpt-oss-20b-1': 'gpt-oss-20b',
    'openai.gpt-oss-safeguard-120b': 'GPT OSS Safeguard 120B',
    'openai.gpt-oss-safeguard-20b': 'GPT OSS Safeguard 20B',

    // Qwen models
    'qwen.qwen3-coder-next': 'Qwen3 Coder Next',
    'qwen.qwen3-coder-480b-a35b-v1': 'Qwen3 Coder 480B A35B',
    'qwen.qwen3-coder-30b-a3b-v1': 'Qwen3 Coder 30B A3B',
    'qwen.qwen3-next-80b-a3b': 'Qwen3 Next 80B A3B',
    'qwen.qwen3-vl-235b-a22b': 'Qwen3 VL 235B A22B',
    'qwen.qwen3-235b-a22b-2507-v1': 'Qwen3 235B A22B 2507',
    'qwen.qwen3-32b-v1': 'Qwen3 32B',

    // Writer AI models
    'writer.palmyra-x4-v1': 'Palmyra X4',
    'writer.palmyra-x5-v1': 'Palmyra X5',

    // Mistral Pixtral models
    'mistral.pixtral-large-2502-v1': 'Pixtral Large 25.02',
  };

  return mappings[baseId] || baseId;
}

/**
 * Gets pricing data for a region, caching only successfully fetched public price data.
 *
 * Flow:
 * 1. Check persistent cache (file-based cache via getCache())
 * 2. If cached, return cached data
 * 3. If not cached, fetch using this caller's credential context
 * 4. Cache the successful result for other callers
 *
 * @param region - AWS region for Bedrock models (e.g., 'us-east-1')
 * @param credentials - AWS credentials for Pricing API access (identity or provider)
 * @returns Promise resolving to pricing data, or null if fetch fails
 */
export async function getPricingData(
  region: string,
  credentials?: AwsCredentialIdentity | AwsCredentialIdentityProvider,
): Promise<BedrockPricingData | null> {
  const cacheKey = `bedrock-pricing:${region}`;
  let cache: Awaited<ReturnType<typeof getCache>> | undefined;

  // Check persistent cache first
  if (isCacheEnabled()) {
    try {
      cache = await getCache();
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

  // Fetches are not shared while in flight: separate credential contexts must not
  // inherit another caller's authentication failure.
  logger.debug('[Bedrock Pricing]: Starting new pricing fetch', { region });
  const pricingData = await fetchBedrockPricing(region, credentials);

  // Cache the result if successful
  if (pricingData && isCacheEnabled()) {
    try {
      cache ??= await getCache();
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
 * Internal function - use getPricingData() instead to reuse successful cached data.
 *
 * @param region - AWS region for Bedrock models (e.g., 'us-east-1')
 * @param credentials - AWS credentials for Pricing API access (identity or provider)
 * @returns Promise resolving to pricing data, or null if fetch fails
 */
async function sendPricingCommandWithTimeout(
  pricingClient: PricingClient,
  command: GetProductsCommand,
): Promise<GetProductsCommandOutput> {
  const timeoutMs = 5_000;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`Pricing API request timed out after ${timeoutMs / 1000} seconds`)),
      timeoutMs,
    );
  });

  return Promise.race([pricingClient.send(command), timeoutPromise]).finally(() => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }) as Promise<GetProductsCommandOutput>;
}

async function fetchAllPriceItems(pricingClient: PricingClient, region: string): Promise<string[]> {
  const { GetProductsCommand } = await import('@aws-sdk/client-pricing');
  const allPriceItems: string[] = [];

  for (const serviceCode of BEDROCK_PRICING_SERVICE_CODES) {
    let nextToken: string | undefined;
    do {
      const response = await sendPricingCommandWithTimeout(
        pricingClient,
        new GetProductsCommand({
          ServiceCode: serviceCode,
          Filters: [
            {
              Type: 'TERM_MATCH',
              Field: 'regionCode',
              Value: region,
            },
          ],
          MaxResults: 100,
          NextToken: nextToken,
        }),
      );

      if (response.PriceList) {
        allPriceItems.push(...response.PriceList);
      }

      nextToken = response.NextToken;
    } while (nextToken);
  }

  return allPriceItems;
}

function getOnDemandUsdPricePerToken(product: any, tokensPerPriceUnit: number): number | undefined {
  const onDemand = Object.values(product.terms?.OnDemand ?? {})[0] as any;
  const priceDim = Object.values(onDemand?.priceDimensions ?? {})[0] as any;
  const priceRaw = priceDim?.pricePerUnit?.USD;

  if (!priceRaw) {
    return undefined;
  }

  const price = parseFloat(priceRaw);
  return Number.isFinite(price) && price >= 0 ? price / tokensPerPriceUnit : undefined;
}

function setModelPricingRate(
  models: Map<string, BedrockModelPricing>,
  modelName: string,
  rateType: 'input' | 'output' | undefined,
  pricePerToken: number,
) {
  if (!rateType) {
    return;
  }

  if (!models.has(modelName)) {
    models.set(modelName, { input: 0, output: 0 });
  }

  models.get(modelName)![rateType] = pricePerToken;
}

function removeIncompleteModelPricing(models: Map<string, BedrockModelPricing>) {
  for (const [modelName, modelPricing] of models) {
    if (modelPricing.input <= 0 || modelPricing.output <= 0) {
      logger.debug('[Bedrock Pricing]: Skipping incomplete pricing data', {
        modelName,
        modelPricing,
      });
      models.delete(modelName);
    }
  }
}

function getFoundationModelName(serviceName: string): string | undefined {
  const suffix = ' (Amazon Bedrock Edition)';
  if (!serviceName.endsWith(suffix)) {
    return undefined;
  }

  const foundationModelName = serviceName.slice(0, -suffix.length);
  const aliases: Record<string, string> = {
    'Cohere Command R': 'Command R',
    'Cohere Command R+': 'Command R+',
    'Cohere Generate Model - Command': 'Command',
    'Cohere Generate Model - Command-Light': 'Command Light',
    'Meta Llama 2 Chat 13B': 'Llama 2 Chat 13B',
    'Meta Llama 2 Chat 70B': 'Llama 2 Chat 70B',
  };
  return aliases[foundationModelName] ?? foundationModelName;
}

function getStandardTextTokenRateType(attrs: any): 'input' | 'output' | undefined {
  const normalizedInferenceType = String(attrs.inferenceType ?? '').toLowerCase();
  if (attrs.feature === 'On-demand Inference') {
    return normalizedInferenceType === 'input tokens' ||
      normalizedInferenceType === 'text input token'
      ? 'input'
      : normalizedInferenceType === 'output tokens' ||
          normalizedInferenceType === 'text output token'
        ? 'output'
        : undefined;
  }

  const usageType = String(attrs.usagetype ?? '').toLowerCase();
  return usageType.endsWith('_inputtokencount-units') ||
    usageType.endsWith('_input_tokens_standard-units')
    ? 'input'
    : usageType.endsWith('_outputtokencount-units') ||
        usageType.endsWith('_output_tokens_standard-units')
      ? 'output'
      : undefined;
}

function parseBedrockPriceItems(priceItems: string[]): {
  models: Map<string, BedrockModelPricing>;
  allModelsFound: Set<string>;
  usageTypeSamples: Record<string, string>;
} {
  const models = new Map<string, BedrockModelPricing>();
  const allModelsFound = new Set<string>();
  const usageTypeSamples: Record<string, string> = {};

  for (const priceItem of priceItems) {
    try {
      const product = JSON.parse(priceItem);
      const attrs = product.product?.attributes;
      const foundationModelName = getFoundationModelName(String(attrs?.servicename ?? ''));
      const modelName = attrs?.model ?? foundationModelName;

      if (!modelName) {
        continue;
      }

      allModelsFound.add(modelName);
      usageTypeSamples[modelName] ||= attrs.usagetype || '';

      const rateType = getStandardTextTokenRateType(attrs);
      if (!rateType) {
        continue;
      }

      // AmazonBedrock reports per-1K-token prices; foundation model marketplace
      // rows report per-million-token prices in their Units dimensions.
      const tokensPerPriceUnit = foundationModelName ? 1_000_000 : 1_000;
      const pricePerToken = getOnDemandUsdPricePerToken(product, tokensPerPriceUnit);
      if (pricePerToken === undefined) {
        logger.debug('[Bedrock Pricing]: Skipping invalid price', {
          modelName,
        });
        continue;
      }

      setModelPricingRate(models, modelName, rateType, pricePerToken);
    } catch (err) {
      logger.debug('[Bedrock Pricing]: Failed to parse price item', {
        error: String(err),
      });
    }
  }

  removeIncompleteModelPricing(models);
  return { models, allModelsFound, usageTypeSamples };
}

async function fetchBedrockPricing(
  region: string,
  credentials?: AwsCredentialIdentity | AwsCredentialIdentityProvider,
): Promise<BedrockPricingData | null> {
  const startTime = Date.now();

  try {
    logger.debug('[Bedrock Pricing]: Fetching pricing from AWS Pricing API', {
      region,
    });

    const { PricingClient } = await import('@aws-sdk/client-pricing');

    // Create Pricing client (always use us-east-1 for Pricing API)
    const pricingClient = new PricingClient({
      region: 'us-east-1', // Pricing API only available in us-east-1
      ...(credentials ? { credentials } : {}),
    });

    const allPriceItems = await fetchAllPriceItems(pricingClient, region);
    const { models, allModelsFound, usageTypeSamples } = parseBedrockPriceItems(allPriceItems);

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

function calculateModelCost(
  modelPricing: BedrockModelPricing,
  promptTokens: number,
  completionTokens: number,
): number {
  return promptTokens * modelPricing.input + completionTokens * modelPricing.output;
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

  if (isApplicationInferenceProfileArn(modelId)) {
    logger.debug(
      '[Bedrock Pricing]: Skipping automatic pricing for application inference profile ARN',
      { modelId },
    );
    return undefined;
  }

  const pricingModelId = getPricingModelId(modelId);
  if (/^global\./.test(pricingModelId)) {
    logger.debug('[Bedrock Pricing]: Skipping automatic pricing for global inference profile', {
      modelId,
    });
    return undefined;
  }

  const modelName = mapBedrockModelIdToApiName(modelId);

  if (!pricingData) {
    logger.debug('[Bedrock Pricing]: No AWS regional pricing data available', {
      modelId,
    });
    return undefined;
  }

  const modelPricing = pricingData.models.get(modelName);
  if (!modelPricing) {
    logger.debug('[Bedrock Pricing]: No AWS regional pricing found for model', {
      modelId,
      modelName,
      region: pricingData.region,
      availableModels: Array.from(pricingData.models.keys()),
    });
    return undefined;
  }

  logger.debug('[Bedrock Pricing]: Using fetched pricing', {
    modelId,
    modelName,
    inputCostPerToken: modelPricing.input,
    outputCostPerToken: modelPricing.output,
    promptTokens,
    completionTokens,
  });

  return calculateModelCost(modelPricing, promptTokens, completionTokens);
}
