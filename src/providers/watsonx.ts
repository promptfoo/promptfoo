import type { WatsonXAI as WatsonXAIClient } from '@ibm-cloud/watsonx-ai';
import crypto from 'crypto';
import type { IamAuthenticator, BearerTokenAuthenticator } from 'ibm-cloud-sdk-core';
import { z } from 'zod';
import { getCache, isCacheEnabled } from '../cache';
import { getEnvString } from '../envars';
import logger from '../logger';
import type { ApiProvider, ProviderResponse, TokenUsage } from '../types';
import type { EnvOverrides } from '../types/env';
import type { ProviderOptions } from '../types/providers';
import invariant from '../util/invariant';
import { calculateCost } from './shared';

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

const WATSONX_MODELS = [
  {
    id: 'ibm/granite-20b-multilingual',
    cost: {
      input: 0.6 / 1e6,
      output: 0.6 / 1e6,
    },
  },
  {
    id: 'ibm/granite-13b-chat',
    cost: {
      input: 0.6 / 1e6,
      output: 0.6 / 1e6,
    },
  },
  {
    id: 'ibm/granite-13b-instruct',
    cost: {
      input: 0.6 / 1e6,
      output: 0.6 / 1e6,
    },
  },
  {
    id: 'ibm/granite-34b-code-instruct',
    cost: {
      input: 0.6 / 1e6,
      output: 0.6 / 1e6,
    },
  },
  {
    id: 'ibm/granite-20b-code-instruct',
    cost: {
      input: 0.6 / 1e6,
      output: 0.6 / 1e6,
    },
  },
  {
    id: 'ibm/granite-8b-code-instruct',
    cost: {
      input: 0.6 / 1e6,
      output: 0.6 / 1e6,
    },
  },
  {
    id: 'ibm/granite-3b-code-instruct',
    cost: {
      input: 0.6 / 1e6,
      output: 0.6 / 1e6,
    },
  },
  {
    id: 'ibm/granite-8b-japanese',
    cost: {
      input: 0.6 / 1e6,
      output: 0.6 / 1e6,
    },
  },
  {
    id: 'ibm/granite-7b-lab',
    cost: {
      input: 0.6 / 1e6,
      output: 0.6 / 1e6,
    },
  },
  {
    id: 'meta-llama/llama-3-2-11b-vision-instruct',
    cost: {
      input: 0.35 / 1e6,
      output: 0.35 / 1e6,
    },
  },
  {
    id: 'meta-llama/llama-3-2-90b-vision-instruct',
    cost: {
      input: 2.0 / 1e6,
      output: 2.0 / 1e6,
    },
  },
  {
    id: 'meta-llama/llama-3-2-11b-vision-instruct',
    cost: {
      input: 0.35 / 1e6,
      output: 0.35 / 1e6,
    },
  },
  {
    id: 'meta-llama/llama-guard-3-11b-vision',
    cost: {
      input: 0.35 / 1e6,
      output: 0.35 / 1e6,
    },
  },
  {
    id: 'meta-llama/llama-3-2-1b-instruct',
    cost: {
      input: 0.1 / 1e6,
      output: 0.1 / 1e6,
    },
  },
  {
    id: 'meta-llama/llama-3-2-3b-instruct',
    cost: {
      input: 0.15 / 1e6,
      output: 0.15 / 1e6,
    },
  },
  {
    id: 'meta-llama/llama-3-1-70b-instruct',
    cost: {
      input: 1.8 / 1e6,
      output: 1.8 / 1e6,
    },
  },
  {
    id: 'meta-llama/llama-3-1-8b-instruct',
    cost: {
      input: 0.6 / 1e6,
      output: 0.6 / 1e6,
    },
  },
  {
    id: 'meta-llama/llama-3-405b-instruct',
    cost: {
      input: 5.0 / 1e6,
      output: 16.0 / 1e6,
    },
  },
  {
    id: 'meta-llama/llama-3-8b-instruct',
    cost: {
      input: 0.6 / 1e6,
      output: 0.6 / 1e6,
    },
  },
  {
    id: 'meta-llama/llama-3-70b-instruct',
    cost: {
      input: 1.8 / 1e6,
      output: 1.8 / 1e6,
    },
  },
  {
    id: 'mindsandcompany/llama2-13b-dpo-v7-korean',
    cost: {
      input: 1.8 / 1e6,
      output: 1.8 / 1e6,
    },
  },
  {
    id: 'sdaia/allam-1-13b-instruct',
    cost: {
      input: 1.8 / 1e6,
      output: 1.8 / 1e6,
    },
  },
  {
    id: 'meta/codellama-34b-instruct',
    cost: {
      input: 1.8 / 1e6,
      output: 1.8 / 1e6,
    },
  },
  {
    id: 'mistral/mistral-large-2',
    cost: {
      input: 10.0 / 1e6,
      output: 10.0 / 1e6,
    },
  },
  {
    id: 'mistral/mixtal-8x7b-instruct',
    cost: {
      input: 0.6 / 1e6,
      output: 0.6 / 1e6,
    },
  },
  {
    id: 'core42/jais-13b-chat-arabic',
    cost: {
      input: 1.8 / 1e6,
      output: 1.8 / 1e6,
    },
  },
  {
    id: 'google/flan-t5-xl-3b',
    cost: {
      input: 0.6 / 1e6,
      output: 0.6 / 1e6,
    },
  },
  {
    id: 'google/flan-t5-xxl-11b',
    cost: {
      input: 1.8 / 1e6,
      output: 1.8 / 1e6,
    },
  },
  {
    id: 'google/flan-ul2-20b',
    cost: {
      input: 5.0 / 1e6,
      output: 5.0 / 1e6,
    },
  },
  {
    id: 'elyza/elyza-japanese-llama-2-7b-instruct',
    cost: {
      input: 1.8 / 1e6,
      output: 1.8 / 1e6,
    },
  },
  {
    id: 'bigscience/mt0-xxl-13b',
    cost: {
      input: 1.8 / 1e6,
      output: 1.8 / 1e6,
    },
  },
];

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

export function calculateWatsonXCost(
  modelName: string,
  config: any,
  promptTokens?: number,
  completionTokens?: number,
): number | undefined {
  return calculateCost(modelName, config, promptTokens, completionTokens, WATSONX_MODELS);
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

      providerResponse.cost = calculateWatsonXCost(
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
