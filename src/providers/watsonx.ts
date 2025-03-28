import type { WatsonXAI as WatsonXAIClient } from '@ibm-cloud/watsonx-ai';
import crypto from 'crypto';
import type { IamAuthenticator, BearerTokenAuthenticator } from 'ibm-cloud-sdk-core';
import { z } from 'zod';
import { getCache, isCacheEnabled, fetchWithCache } from '../cache';
import { getEnvString } from '../envars';
import logger from '../logger';
import type { ApiProvider, ProviderResponse, TokenUsage } from '../types';
import type { EnvOverrides } from '../types/env';
import type { ProviderOptions } from '../types/providers';
import invariant from '../util/invariant';
import { calculateCost, REQUEST_TIMEOUT_MS } from './shared';

interface TextGenRequestParametersModel {
  max_new_tokens: number;
}

interface TextGenRequestParams {
  input: string;
  modelId: string;
  projectId: string;
  parameters: TextGenRequestParametersModel;
}

const ConfigSchema = z.object({
  apiKey: z.string().optional(),
  apiKeyEnvar: z.string().optional(),
  apiBearerToken: z.string().optional(),
  apiBearerTokenEnvar: z.string().optional(),
  serviceUrl: z.string().optional(),
  version: z.string().optional(),
  projectId: z.string().optional(),
  modelId: z.string().optional(),
  maxNewTokens: z.number().optional(),
});

const TextGenResponseSchema = z.object({
  model_id: z.string(),
  model_version: z.string(),
  created_at: z.string(),
  results: z.array(
    z.object({
      generated_text: z.string(),
      generated_token_count: z.number().optional(),
      input_token_count: z.number().optional(),
      stop_reason: z.string().optional(),
    }),
  ),
});

const TIER_PRICING = {
  class_1: 0.6,
  class_2: 1.8,
  class_3: 5.0,
  class_c1: 0.1,
  class_5: 0.25,
  class_7: 16.0,
  class_8: 0.15,
  class_9: 0.35,
  class_10: 2.0,
  class_11: 0.005,
  class_12: 0.2,
};

function convertResponse(response: z.infer<typeof TextGenResponseSchema>): ProviderResponse {
  const firstResult = response.results && response.results[0];

  if (!firstResult) {
    throw new Error('No results returned from text generation API.');
  }

  const totalGeneratedTokens = firstResult.generated_token_count || 0;
  const promptTokens = firstResult.input_token_count || 0;
  const completionTokens = totalGeneratedTokens - promptTokens;

  const tokenUsage: Partial<TokenUsage> = {
    total: totalGeneratedTokens,
    prompt: promptTokens,
    completion: completionTokens >= 0 ? completionTokens : totalGeneratedTokens,
  };

  const providerResponse: ProviderResponse = {
    error: undefined,
    output: firstResult.generated_text || '',
    tokenUsage,
    cost: undefined,
    cached: undefined,
    logProbs: undefined,
  };

  return providerResponse;
}

function sortObject(obj: any): any {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(sortObject);
  }
  const sortedKeys = Object.keys(obj)
    .filter((key) => obj[key] !== undefined)
    .sort();
  const result: any = {};
  sortedKeys.forEach((key) => {
    result[key] = sortObject(obj[key]);
  });
  return result;
}

export function generateConfigHash(config: any): string {
  const sortedConfig = sortObject(config);
  return crypto.createHash('md5').update(JSON.stringify(sortedConfig)).digest('hex');
}

interface ModelSpec {
  model_id: string;
  input_tier: string;
  output_tier: string;
}

interface WatsonXModel {
  id: string;
  cost: {
    input: number;
    output: number;
  };
}

async function fetchModelSpecs(): Promise<ModelSpec[]> {
  try {
    const { data } = await fetchWithCache(
      'https://us-south.ml.cloud.ibm.com/ml/v1/foundation_model_specs?version=2023-09-30',
      {
        headers: {
          'Content-Type': 'application/json',
        },
      },
      REQUEST_TIMEOUT_MS,
    );

    // Handle string response that needs to be parsed
    const parsedData = typeof data === 'string' ? JSON.parse(data) : data;
    return parsedData?.resources || [];
  } catch (error) {
    logger.error(`Failed to fetch model specs: ${error}`);
    return [];
  }
}

let modelSpecsCache: WatsonXModel[] | null = null;

export function clearModelSpecsCache() {
  modelSpecsCache = null;
}

async function getModelSpecs(): Promise<WatsonXModel[]> {
  if (!modelSpecsCache) {
    const specs = await fetchModelSpecs();
    modelSpecsCache = specs.map((spec) => ({
      id: spec.model_id,
      cost: {
        input: TIER_PRICING[spec.input_tier.toLowerCase() as keyof typeof TIER_PRICING] / 1e6 || 0,
        output:
          TIER_PRICING[spec.output_tier.toLowerCase() as keyof typeof TIER_PRICING] / 1e6 || 0,
      },
    }));
  }
  return modelSpecsCache;
}

export async function calculateWatsonXCost(
  modelName: string,
  config: any,
  promptTokens?: number,
  completionTokens?: number,
): Promise<number | undefined> {
  if (!promptTokens || !completionTokens) {
    return undefined;
  }

  const models = await getModelSpecs();
  const model = models.find((m) => m.id === modelName);
  if (!model) {
    return undefined;
  }

  const cost = calculateCost(modelName, config, promptTokens, completionTokens, models);
  return cost;
}

export class WatsonXProvider implements ApiProvider {
  modelName: string;
  options: ProviderOptions;
  env?: EnvOverrides;
  client?: WatsonXAIClient;
  config: z.infer<typeof ConfigSchema>;

  constructor(modelName: string, options: ProviderOptions) {
    const validationResult = ConfigSchema.safeParse(options.config);
    if (!validationResult.success) {
      const errors = validationResult.error.errors.map((e) => e.message).join(', ');
      throw new Error(`WatsonXProvider requires a valid config. Issues: ${errors}`);
    }

    const validatedConfig = validationResult.data;

    const { env } = options;
    this.modelName = modelName;
    this.options = options;
    this.env = env;
    this.config = validatedConfig;
  }

  id(): string {
    return `watsonx:${this.modelName}`;
  }

  toString(): string {
    return `[Watsonx Provider ${this.modelName}]`;
  }

  async getAuth(): Promise<IamAuthenticator | BearerTokenAuthenticator> {
    const { IamAuthenticator, BearerTokenAuthenticator } = await import('ibm-cloud-sdk-core');

    const apiKey =
      this.config.apiKey ||
      (this.config.apiKeyEnvar
        ? process.env[this.config.apiKeyEnvar] ||
          this.env?.[this.config.apiKeyEnvar as keyof EnvOverrides]
        : undefined) ||
      this.env?.WATSONX_AI_APIKEY ||
      getEnvString('WATSONX_AI_APIKEY');

    const bearerToken =
      this.config.apiBearerToken ||
      (this.config.apiBearerTokenEnvar
        ? process.env[this.config.apiBearerTokenEnvar] ||
          this.env?.[this.config.apiBearerTokenEnvar as keyof EnvOverrides]
        : undefined) ||
      this.env?.WATSONX_AI_BEARER_TOKEN ||
      getEnvString('WATSONX_AI_BEARER_TOKEN');

    const authType = this.env?.WATSONX_AI_AUTH_TYPE || getEnvString('WATSONX_AI_AUTH_TYPE');

    if (authType === 'iam' && apiKey) {
      logger.info('Using IAM Authentication based on WATSONX_AI_AUTH_TYPE.');
      return new IamAuthenticator({ apikey: apiKey });
    } else if (authType === 'bearertoken' && bearerToken) {
      logger.info('Using Bearer Token Authentication based on WATSONX_AI_AUTH_TYPE.');
      return new BearerTokenAuthenticator({ bearerToken });
    }

    if (apiKey) {
      logger.info('Using IAM Authentication.');
      return new IamAuthenticator({ apikey: apiKey });
    } else if (bearerToken) {
      logger.info('Using Bearer Token Authentication.');
      return new BearerTokenAuthenticator({ bearerToken });
    } else {
      throw new Error(
        'Authentication credentials not provided. Please set either `WATSONX_AI_APIKEY` for IAM Authentication or `WATSONX_AI_BEARER_TOKEN` for Bearer Token Authentication.',
      );
    }
  }

  getProjectId(): string {
    const projectId =
      this.options.config.projectId ||
      (this.options.config.projectIdEnvar
        ? process.env[this.options.config.projectIdEnvar] ||
          this.env?.[this.options.config.projectIdEnvar as keyof EnvOverrides]
        : undefined) ||
      this.env?.WATSONX_AI_PROJECT_ID ||
      getEnvString('WATSONX_AI_PROJECT_ID');
    invariant(
      projectId && projectId.trim() !== '',
      'WatsonX project ID is not set. Set the WATSONX_AI_PROJECT_ID environment variable or add `projectId` to the provider config.',
    );
    return projectId;
  }

  getModelId(): string {
    if (!this.modelName) {
      throw new Error('Model name must be specified.');
    }
    if (this.modelName.includes(':')) {
      const parts = this.modelName.split(':');
      if (parts.length < 2 || !parts[1]) {
        throw new Error(`Unable to extract modelId from modelName: ${this.modelName}`);
      }
      return parts[1];
    }
    const modelId = this.options.config.modelId || this.modelName;
    invariant(modelId, 'Model ID is required for WatsonX API call.');
    return modelId;
  }

  async getClient(): Promise<WatsonXAIClient> {
    if (this.client) {
      return this.client;
    }

    const authenticator = await this.getAuth();
    const { WatsonXAI } = await import('@ibm-cloud/watsonx-ai');
    this.client = WatsonXAI.newInstance({
      version: this.options.config.version || '2023-05-29',
      serviceUrl: this.options.config.serviceUrl || 'https://us-south.ml.cloud.ibm.com',
      authenticator,
    });
    return this.client;
  }

  async callApi(prompt: string): Promise<ProviderResponse> {
    const client = await this.getClient();

    const modelId = this.getModelId();
    const projectId = this.getProjectId();

    const cache = getCache();
    const configHash = generateConfigHash(this.options.config);
    const cacheKey = `watsonx:${this.modelName}:${configHash}:${prompt}`;
    const cacheEnabled = isCacheEnabled();
    if (cacheEnabled) {
      const cachedResponse = await cache.get(cacheKey);
      if (cachedResponse) {
        logger.debug(
          `Watsonx: Returning cached response for prompt "${prompt}" with config "${configHash}": ${cachedResponse}`,
        );
        return JSON.parse(cachedResponse as string) as ProviderResponse;
      }
    }

    try {
      const textGenRequestParametersModel: TextGenRequestParametersModel = {
        max_new_tokens: this.options.config.maxNewTokens || 100,
      };

      const params: TextGenRequestParams = {
        input: prompt,
        modelId,
        projectId,
        parameters: textGenRequestParametersModel,
      };

      const apiResponse = await client.generateText(params);
      const parsedResponse = TextGenResponseSchema.safeParse(apiResponse.result);

      if (!parsedResponse.success) {
        logger.error(
          `Watsonx: Invalid response structure for response: ${JSON.stringify(apiResponse.result)}, errors: ${JSON.stringify(parsedResponse.error.errors)}`,
        );
        throw new Error(
          `Invalid API response structure: ${JSON.stringify(parsedResponse.error.errors)}`,
        );
      }

      const textGenResponse = parsedResponse.data;
      const providerResponse = convertResponse(textGenResponse);

      providerResponse.cost = await calculateWatsonXCost(
        this.modelName,
        this.options.config,
        providerResponse.tokenUsage?.prompt,
        providerResponse.tokenUsage?.completion,
      );

      if (isCacheEnabled()) {
        await cache.set(cacheKey, JSON.stringify(providerResponse));
      }

      return providerResponse;
    } catch (err) {
      logger.error(`Watsonx: API call error: ${String(err)}`);

      return {
        error: `API call error: ${String(err)}`,
        output: '',
        tokenUsage: {},
      };
    }
  }
}
