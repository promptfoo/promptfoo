import crypto from 'crypto';

import { z } from 'zod';
import { fetchWithCache, getCache, isCacheEnabled } from '../cache';
import { getEnvString } from '../envars';
import logger from '../logger';
import { type GenAISpanContext, type GenAISpanResult, withGenAISpan } from '../tracing/genaiTracer';
import { type TargetSpanContext, withTargetSpan } from '../tracing/targetTracer';
import invariant from '../util/invariant';
import { createEmptyTokenUsage } from '../util/tokenUsageUtils';
import { calculateCost, parseChatPrompt, REQUEST_TIMEOUT_MS } from './shared';
import type { WatsonXAI as WatsonXAIClient } from '@ibm-cloud/watsonx-ai';
import type { BearerTokenAuthenticator, IamAuthenticator } from 'ibm-cloud-sdk-core';

import type { EnvVarKey } from '../envars';
import type { EnvOverrides } from '../types/env';
import type {
  ApiProvider,
  CallApiContextParams,
  ProviderResponse,
  TokenUsage,
} from '../types/index';
import type { ProviderOptions } from '../types/providers';

interface TextGenRequestParametersModel {
  max_new_tokens?: number;
  min_new_tokens?: number;
  decoding_method?: 'greedy' | 'sample';
  length_penalty?: {
    decay_factor?: number;
    start_index?: number;
  };
  random_seed?: number;
  stop_sequences?: string[];
  temperature?: number;
  time_limit?: number;
  top_k?: number;
  top_p?: number;
  repetition_penalty?: number;
  truncate_input_tokens?: number;
  include_stop_sequence?: boolean;
}

interface TextGenRequestParams {
  input: string;
  modelId: string;
  projectId: string;
  parameters: TextGenRequestParametersModel;
}

const ConfigSchema = z.object({
  // Authentication options
  apiKey: z.string().optional(),
  apiKeyEnvar: z.string().optional(),
  apiBearerToken: z.string().optional(),
  apiBearerTokenEnvar: z.string().optional(),

  // Service configuration
  serviceUrl: z.string().optional(),
  version: z.string().optional(),
  projectId: z.string().optional(),
  modelId: z.string().optional(),

  // Text generation parameters
  maxNewTokens: z.number().optional(),
  minNewTokens: z.number().optional(),
  decodingMethod: z.enum(['greedy', 'sample']).optional(),
  lengthPenalty: z
    .object({
      decayFactor: z.number().optional(),
      startIndex: z.number().optional(),
    })
    .optional(),
  randomSeed: z.number().optional(),
  stopSequences: z.array(z.string()).optional(),
  temperature: z.number().min(0).max(2).optional(),
  timeLimit: z.number().optional(),
  topK: z.number().optional(),
  topP: z.number().min(0).max(1).optional(),
  repetitionPenalty: z.number().optional(),
  truncateInputTokens: z.number().optional(),
  includeStopSequence: z.boolean().optional(),
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
    const {
      data,
      cached: _cached,
      latencyMs: _latencyMs,
    } = await fetchWithCache(
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

async function calculateWatsonXCost(
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
      const errors = validationResult.error.issues.map((e) => e.message).join(', ');
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
    let IamAuthenticator: any;
    let BearerTokenAuthenticator: any;

    try {
      ({ IamAuthenticator, BearerTokenAuthenticator } = await import('ibm-cloud-sdk-core'));
    } catch (err) {
      logger.error(`Error loading ibm-cloud-sdk-core: ${err}`);
      throw new Error(
        'The ibm-cloud-sdk-core package is required as a peer dependency. Please install it in your project or globally.',
      );
    }

    const apiKey =
      this.config.apiKey ||
      (this.config.apiKeyEnvar
        ? getEnvString(this.config.apiKeyEnvar as EnvVarKey) ||
          this.env?.[this.config.apiKeyEnvar as keyof EnvOverrides]
        : undefined) ||
      this.env?.WATSONX_AI_APIKEY ||
      getEnvString('WATSONX_AI_APIKEY');

    const bearerToken =
      this.config.apiBearerToken ||
      (this.config.apiBearerTokenEnvar
        ? getEnvString(this.config.apiBearerTokenEnvar as EnvVarKey) ||
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
        ? getEnvString(this.options.config.projectIdEnvar) ||
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

    try {
      const { WatsonXAI } = await import('@ibm-cloud/watsonx-ai');
      this.client = WatsonXAI.newInstance({
        version: this.options.config.version || '2023-05-29',
        serviceUrl: this.options.config.serviceUrl || 'https://us-south.ml.cloud.ibm.com',
        authenticator,
      });
      return this.client!;
    } catch (err) {
      logger.error(`Error loading @ibm-cloud/watsonx-ai: ${err}`);
      throw new Error(
        'The @ibm-cloud/watsonx-ai package is required as a peer dependency. Please install it in your project or globally.',
      );
    }
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    // Set up outer target span context (service name based on context label)
    const targetSpanContext: TargetSpanContext = {
      targetType: 'llm',
      providerId: this.id(),
      traceparent: context?.traceparent,
      promptLabel: context?.prompt?.label,
      evalId: context?.evaluationId || context?.test?.metadata?.evaluationId,
      testIndex: context?.test?.vars?.__testIdx as number | undefined,
      iteration: context?.iteration,
    };

    return withTargetSpan(targetSpanContext, async () => {
      // Set up inner GenAI span context (provider-specific service name)
      const spanContext: GenAISpanContext = {
        system: 'watsonx',
        operationName: 'chat',
        model: this.modelName,
        providerId: this.id(),
        maxTokens: this.options.config.maxNewTokens,
        testIndex: context?.test?.vars?.__testIdx as number | undefined,
        promptLabel: context?.prompt?.label,
        evalId: context?.evaluationId || context?.test?.metadata?.evaluationId,
        iteration: context?.iteration,
        // W3C Trace Context for linking to evaluation trace
        traceparent: context?.traceparent,
      };

      // Result extractor to set response attributes on the span
      const resultExtractor = (response: ProviderResponse): GenAISpanResult => {
        const result: GenAISpanResult = {};
        if (response.tokenUsage) {
          result.tokenUsage = {
            prompt: response.tokenUsage.prompt,
            completion: response.tokenUsage.completion,
            total: response.tokenUsage.total,
          };
        }
        return result;
      };

      // Wrap the API call in a GenAI span (inner span with provider-specific service name)
      return withGenAISpan(
        spanContext,
        () => this.callApiInternal(prompt, context),
        resultExtractor,
      );
    });
  }

  private async callApiInternal(
    prompt: string,
    context?: CallApiContextParams,
  ): Promise<ProviderResponse> {
    const client = await this.getClient();

    // Merge configs: provider config -> prompt-level config
    const config = {
      ...this.config,
      ...context?.prompt?.config,
    };

    const modelId = this.getModelId();
    const projectId = this.getProjectId();

    const cache = getCache();
    const configHash = generateConfigHash(config);
    const cacheKey = `watsonx:${this.modelName}:${configHash}:${prompt}`;
    const cacheEnabled = isCacheEnabled();
    if (cacheEnabled) {
      const cachedResponse = await cache.get(cacheKey);
      if (cachedResponse) {
        logger.debug(
          `Watsonx: Returning cached response for prompt "${prompt}" with config "${configHash}": ${cachedResponse}`,
        );
        const resp = JSON.parse(cachedResponse as string) as ProviderResponse;
        return { ...resp, cached: true };
      }
    }

    try {
      // Build parameters with conditional inclusion
      const parameters: TextGenRequestParametersModel = {
        max_new_tokens: config.maxNewTokens || 100,
        ...(config.minNewTokens !== undefined && { min_new_tokens: config.minNewTokens }),
        ...(config.decodingMethod && { decoding_method: config.decodingMethod }),
        ...(config.lengthPenalty && {
          length_penalty: {
            ...(config.lengthPenalty.decayFactor !== undefined && {
              decay_factor: config.lengthPenalty.decayFactor,
            }),
            ...(config.lengthPenalty.startIndex !== undefined && {
              start_index: config.lengthPenalty.startIndex,
            }),
          },
        }),
        ...(config.randomSeed !== undefined && { random_seed: config.randomSeed }),
        ...(config.stopSequences?.length && { stop_sequences: config.stopSequences }),
        ...(config.temperature !== undefined && { temperature: config.temperature }),
        ...(config.timeLimit !== undefined && { time_limit: config.timeLimit }),
        ...(config.topK !== undefined && { top_k: config.topK }),
        ...(config.topP !== undefined && { top_p: config.topP }),
        ...(config.repetitionPenalty !== undefined && {
          repetition_penalty: config.repetitionPenalty,
        }),
        ...(config.truncateInputTokens !== undefined && {
          truncate_input_tokens: config.truncateInputTokens,
        }),
        ...(config.includeStopSequence !== undefined && {
          include_stop_sequence: config.includeStopSequence,
        }),
      };

      const params: TextGenRequestParams = {
        input: prompt,
        modelId,
        projectId,
        parameters,
      };

      const apiResponse = await client.generateText(params);
      const parsedResponse = TextGenResponseSchema.safeParse(apiResponse.result);

      if (!parsedResponse.success) {
        const resultKeys =
          apiResponse?.result && typeof apiResponse.result === 'object'
            ? Object.keys(apiResponse.result as unknown as Record<string, unknown>)
            : undefined;
        logger.error('Watsonx: Invalid response structure from API', {
          issues: parsedResponse.error.issues,
          resultKeys,
        });
        throw new Error(
          `Invalid API response structure: ${parsedResponse.error.issues.map((i) => i.message).join(', ')}`,
        );
      }

      const textGenResponse = parsedResponse.data;
      const providerResponse = convertResponse(textGenResponse);

      providerResponse.cost = await calculateWatsonXCost(
        this.modelName,
        config,
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
        tokenUsage: createEmptyTokenUsage(),
      };
    }
  }
}

/**
 * WatsonX Chat Provider using the textChat API for messages-based interactions.
 */
export class WatsonXChatProvider extends WatsonXProvider {
  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    const client = await this.getClient();

    // Merge configs: provider config -> prompt-level config
    const config = {
      ...this.config,
      ...context?.prompt?.config,
    };

    const modelId = this.getModelId();
    const projectId = this.getProjectId();

    const cache = getCache();
    const configHash = generateConfigHash(config);
    const cacheKey = `watsonx:chat:${this.modelName}:${configHash}:${prompt}`;
    const cacheEnabled = isCacheEnabled();
    if (cacheEnabled) {
      const cachedResponse = await cache.get(cacheKey);
      if (cachedResponse) {
        logger.debug(
          `Watsonx Chat: Returning cached response for prompt with config "${configHash}"`,
        );
        const resp = JSON.parse(cachedResponse as string) as ProviderResponse;
        return { ...resp, cached: true };
      }
    }

    try {
      // Parse chat messages using shared utility
      const messages = parseChatPrompt(prompt, [{ role: 'user' as const, content: prompt }]);

      // Build chat params
      const params: Record<string, any> = {
        modelId,
        projectId,
        messages,
        ...(config.temperature !== undefined && { temperature: config.temperature }),
        ...(config.maxNewTokens !== undefined && { maxTokens: config.maxNewTokens }),
        ...(config.topP !== undefined && { topP: config.topP }),
        ...(config.stopSequences?.length && { stop: config.stopSequences }),
        ...(config.randomSeed !== undefined && { seed: config.randomSeed }),
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await (client as any).textChat(params);
      const result = response.result as any;

      const providerResponse = this.convertChatResponse(result);

      providerResponse.cost = await calculateWatsonXCost(
        this.modelName,
        config,
        providerResponse.tokenUsage?.prompt,
        providerResponse.tokenUsage?.completion,
      );

      if (isCacheEnabled()) {
        await cache.set(cacheKey, JSON.stringify(providerResponse));
      }

      return providerResponse;
    } catch (err) {
      logger.error(`Watsonx Chat: API call error: ${String(err)}`);

      return {
        error: `API call error: ${String(err)}`,
        output: '',
        tokenUsage: createEmptyTokenUsage(),
      };
    }
  }

  private convertChatResponse(result: any): ProviderResponse {
    const choice = result?.choices?.[0];
    const message = choice?.message;

    // Handle tool calls if present
    if (message?.tool_calls?.length) {
      return {
        output: JSON.stringify(message.tool_calls),
        tokenUsage: {
          prompt: result?.usage?.prompt_tokens,
          completion: result?.usage?.completion_tokens,
          total: result?.usage?.total_tokens,
        },
      };
    }

    return {
      output: message?.content || '',
      tokenUsage: {
        prompt: result?.usage?.prompt_tokens,
        completion: result?.usage?.completion_tokens,
        total: result?.usage?.total_tokens,
      },
    };
  }
}
