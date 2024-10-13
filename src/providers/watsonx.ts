import type { WatsonXAI as WatsonXAIClient } from '@ibm-cloud/watsonx-ai';
import { WatsonXAI } from '@ibm-cloud/watsonx-ai';
import crypto from 'crypto';
import { IamAuthenticator } from 'ibm-cloud-sdk-core';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { getCache, isCacheEnabled } from '../cache';
import { getEnvString } from '../envars';
import logger from '../logger';
import type { ApiProvider, EnvOverrides, ProviderResponse, TokenUsage } from '../types';
import type { ProviderOptions } from '../types/providers';

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

export class WatsonXProvider implements ApiProvider {
  modelName: string;
  options: ProviderOptions;
  env?: EnvOverrides;
  apiKey: string;
  client: WatsonXAIClient;

  constructor(modelName: string, options: ProviderOptions) {
    const validationResult = ConfigSchema.safeParse(options.config);
    if (!validationResult.success) {
      const errors = validationResult.error.errors.map((e) => e.message).join(', ');
      throw new Error(`WatsonXProvider requires a valid config. Issues: ${errors}`);
    }

    const { env } = options;
    this.modelName = modelName;
    this.options = options;
    this.env = env;
    this.apiKey = this.getApiKey();

    this.client = WatsonXAI.newInstance({
      version: this.options.config.version || '2023-05-29',
      serviceUrl: this.options.config.serviceUrl || 'https://us-south.ml.cloud.ibm.com',
      authenticator: new IamAuthenticator({ apikey: this.apiKey }),
    });
  }

  id(): string {
    return `watsonx:${this.modelName}`;
  }

  toString(): string {
    return `[Watsonx Provider ${this.modelName}]`;
  }

  getApiKey(): string {
    const apiKey =
      this.options.config.apiKey ||
      (this.options.config.apiKeyEnvar
        ? process.env[this.options.config.apiKeyEnvar] ||
          this.env?.[this.options.config.apiKeyEnvar as keyof EnvOverrides]
        : undefined) ||
      this.env?.WATSONX_API_KEY ||
      getEnvString('WATSONX_API_KEY');
    invariant(
      apiKey,
      'WatsonX API key is not set. Set the WATSONX_API_KEY environment variable or add `apiKey` to the provider config.',
    );
    return apiKey;
  }

  getProjectId(): string {
    const projectId =
      this.options.config.projectId ||
      (this.options.config.projectIdEnvar
        ? process.env[this.options.config.projectIdEnvar] ||
          this.env?.[this.options.config.projectIdEnvar as keyof EnvOverrides]
        : undefined) ||
      this.env?.WATSONX_PROJECT_ID ||
      getEnvString('WATSONX_PROJECT_ID');
    invariant(
      projectId && projectId.trim() !== '',
      'WatsonX project ID is not set. Set the WATSONX_PROJECT_ID environment variable or add `projectId` to the provider config.',
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

  getClient(): WatsonXAIClient {
    return this.client;
  }

  async callApi(prompt: string): Promise<ProviderResponse> {
    const modelId = this.getModelId();
    const projectId = this.getProjectId();
    const client = this.getClient();

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
