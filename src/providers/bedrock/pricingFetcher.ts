import {
  PricingClient,
  GetProductsCommand,
  type GetProductsCommandOutput,
} from '@aws-sdk/client-pricing';
import type { AwsCredentialIdentity } from '@aws-sdk/types';
import logger from '../../logger';
import { sanitizeObject } from '../../util/sanitizer';

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
 */
export function mapBedrockModelIdToApiName(modelId: string): string {
  // Extract base model name (remove version suffix)
  const baseId = modelId.split(':')[0];

  // Common model mappings
  const mappings: Record<string, string> = {
    // Anthropic Claude models
    'anthropic.claude-3-5-sonnet-20241022-v2': 'Claude 3.5 Sonnet v2',
    'anthropic.claude-3-5-sonnet-20240620-v1': 'Claude 3.5 Sonnet',
    'anthropic.claude-3-5-haiku-20241022-v1': 'Claude 3.5 Haiku',
    'anthropic.claude-3-opus-20240229-v1': 'Claude 3 Opus',
    'anthropic.claude-3-sonnet-20240229-v1': 'Claude 3 Sonnet',
    'anthropic.claude-3-haiku-20240307-v1': 'Claude 3 Haiku',

    // Amazon Nova models
    'amazon.nova-micro-v1': 'Nova Micro',
    'amazon.nova-lite-v1': 'Nova Lite',
    'amazon.nova-pro-v1': 'Nova Pro',

    // Meta Llama models
    'meta.llama3-1-405b-instruct-v1': 'Llama 3.1 405B Instruct',
    'meta.llama3-1-70b-instruct-v1': 'Llama 3.1 70B Instruct',
    'meta.llama3-1-8b-instruct-v1': 'Llama 3.1 8B Instruct',
    'meta.llama3-2-90b-instruct-v1': 'Llama 3.2 90B Instruct',
    'meta.llama3-2-11b-instruct-v1': 'Llama 3.2 11B Instruct',
    'meta.llama3-2-3b-instruct-v1': 'Llama 3.2 3B Instruct',
    'meta.llama3-2-1b-instruct-v1': 'Llama 3.2 1B Instruct',
    'meta.llama3-3-70b-instruct-v1': 'Llama 3.3 70B Instruct',

    // Mistral models
    'mistral.mistral-7b-instruct-v0:2': 'Mistral 7B Instruct',
    'mistral.mixtral-8x7b-instruct-v0:1': 'Mixtral 8x7B Instruct',
    'mistral.mistral-large-2402-v1': 'Mistral Large',
    'mistral.mistral-large-2407-v1': 'Mistral Large 2',
    'mistral.mistral-small-2402-v1': 'Mistral Small',

    // Cohere models
    'cohere.command-r-v1': 'Command R',
    'cohere.command-r-plus-v1': 'Command R+',

    // AI21 models
    'ai21.jamba-1-5-large-v1': 'Jamba 1.5 Large',
    'ai21.jamba-1-5-mini-v1': 'Jamba 1.5 Mini',
  };

  return mappings[baseId] || baseId;
}

/**
 * Fetches current Bedrock pricing from AWS Pricing API.
 * This function is called once per evaluation run to get real-time pricing.
 *
 * @param region - AWS region for Bedrock models (e.g., 'us-east-1')
 * @param credentials - AWS credentials for Pricing API access
 * @returns Promise resolving to pricing data, or null if fetch fails
 */
export async function fetchBedrockPricing(
  region: string,
  credentials?: AwsCredentialIdentity,
): Promise<BedrockPricingData | null> {
  const startTime = Date.now();

  try {
    logger.debug('[Bedrock Pricing]: Fetching pricing from AWS Pricing API', {
      region,
    });

    // Create Pricing client (always use us-east-1 for Pricing API)
    const pricingClient = new PricingClient({
      region: 'us-east-1', // Pricing API only available in us-east-1
      credentials,
    });

    // Fetch Bedrock pricing products
    const command = new GetProductsCommand({
      ServiceCode: 'AmazonBedrock',
      Filters: [
        {
          Type: 'TERM_MATCH',
          Field: 'regionCode',
          Value: region,
        },
      ],
      MaxResults: 100, // Get all models in one request
    });

    // Set 5-second timeout
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Pricing API request timed out after 5 seconds')), 5000);
    });

    const response = (await Promise.race([
      pricingClient.send(command),
      timeoutPromise,
    ])) as GetProductsCommandOutput;

    // Parse pricing data
    const models = new Map<string, BedrockModelPricing>();

    if (response.PriceList) {
      for (const priceItem of response.PriceList) {
        try {
          const product = JSON.parse(priceItem);
          const attrs = product.product?.attributes;

          if (!attrs || !attrs.model) {
            continue;
          }

          const modelName = attrs.model;
          const inferenceType = attrs.inferenceType || '';

          // Get pricing from OnDemand terms
          if (product.terms?.OnDemand) {
            const onDemand = Object.values(product.terms.OnDemand)[0] as any;
            const priceDim = Object.values(onDemand.priceDimensions)[0] as any;
            const price = parseFloat(priceDim.pricePerUnit.USD);

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
    }

    const duration = Date.now() - startTime;
    logger.debug('[Bedrock Pricing]: Successfully fetched pricing', {
      region,
      modelCount: models.size,
      durationMs: duration,
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
 * Calculates cost using fetched pricing data, with fallback to static pricing.
 *
 * @param modelId - Bedrock model ID (e.g., 'anthropic.claude-3-5-sonnet-20241022-v2:0')
 * @param pricingData - Fetched pricing data (or null if fetch failed)
 * @param promptTokens - Number of input tokens
 * @param completionTokens - Number of output tokens
 * @param staticPricing - Static pricing data to use as fallback
 * @returns Cost in dollars, or undefined if no pricing available
 */
export function calculateCostWithFetchedPricing(
  modelId: string,
  pricingData: BedrockPricingData | null | undefined,
  promptTokens: number | undefined,
  completionTokens: number | undefined,
  staticPricing: { input: number; output: number } | undefined,
): number | undefined {
  if (promptTokens === undefined || completionTokens === undefined) {
    return undefined;
  }

  let inputCostPerToken: number | undefined;
  let outputCostPerToken: number | undefined;

  // Try to use fetched pricing first
  if (pricingData) {
    const modelName = mapBedrockModelIdToApiName(modelId);
    const fetchedModelPricing = pricingData.models.get(modelName);

    if (fetchedModelPricing) {
      inputCostPerToken = fetchedModelPricing.input;
      outputCostPerToken = fetchedModelPricing.output;
      logger.debug('[Bedrock Pricing]: Using fetched pricing', {
        modelId,
        modelName,
        inputCostPerToken,
        outputCostPerToken,
      });
    }
  }

  // Fall back to static pricing if fetched pricing not available
  if (inputCostPerToken === undefined || outputCostPerToken === undefined) {
    if (staticPricing) {
      inputCostPerToken = staticPricing.input;
      outputCostPerToken = staticPricing.output;
      logger.debug('[Bedrock Pricing]: Using static pricing (fallback)', {
        modelId,
        inputCostPerToken,
        outputCostPerToken,
      });
    } else {
      logger.debug('[Bedrock Pricing]: No pricing available', {
        modelId,
      });
      return undefined;
    }
  }

  const cost = promptTokens * inputCostPerToken + completionTokens * outputCostPerToken;

  return cost;
}
