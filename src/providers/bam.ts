import { getCache, isCacheEnabled } from '../cache';
import { REQUEST_TIMEOUT_MS } from './shared';

import type {
  ApiProvider,
  EnvOverrides,
  ProviderResponse,
  TokenUsage,
} from '../types.js';
import {
  Client as GenAIClient,
  TextGenerationCreateInput,
  TextGenerationCreateOutput,
} from '@ibm-generative-ai/node-sdk';
import logger from '../logger';

interface BAMGenerationParameters {
  apiKey?: string | null;
  apiKeyEnvar?: string | null;
  top_k?: number | null;
  top_p?: number | null;
  typical_p?: number | null;
  beam_width?: number | null;
  time_limit?: number | null;
  random_seed?: number | null;
  temperature?: number | null;
  length_penalty?: {
    start_index?: number | null;
    decay_factor?: number | null;
  } | null;
  max_new_tokens?: number | null;
  min_new_tokens?: number | null;
  return_options?: {
    input_text?: boolean | null;
    token_ranks?: boolean | null;
    input_tokens?: boolean | null;
    top_n_tokens?: number | null;
    token_logprobs?: boolean | null;
    generated_tokens?: boolean | null;
    input_parameters?: boolean | null;
  } | null;
  stop_sequences?: string[] | null;
  decoding_method?: 'greedy' | 'sample' | null;
  repetition_penalty?: number | null;
  include_stop_sequence?: boolean;
  truncate_input_tokens?: number | null;
}

interface BAMModerations {
  hap?:
    | boolean
    | {
        input?: boolean;
        output?: boolean;
        threshold?: number;
        send_tokens?: boolean;
      };
  stigma?:
    | boolean
    | {
        input?: boolean;
        output?: boolean;
        threshold?: number;
        send_tokens?: boolean;
      };
  implicit_hate?:
    | boolean
    | {
        input?: boolean;
        output?: boolean;
        threshold?: number;
        send_tokens?: boolean;
      };
}

function convertResponse(response: TextGenerationCreateOutput): ProviderResponse {
  const totalGeneratedTokens = response.results.reduce(
    (acc, result) => acc + result.generated_token_count,
    0,
  );
  const tokenUsage: Partial<TokenUsage> = {
    total: totalGeneratedTokens,
    prompt: response.results[0]?.input_token_count || 0,
    completion: totalGeneratedTokens - (response.results[0]?.input_token_count || 0),
  };

  const providerResponse: ProviderResponse = {
    error: undefined,
    output: response.results.map((result) => ({
      generated_text: result.generated_text,
      generated_token_count: result.generated_token_count,
      input_token_count: result.input_token_count,
      stop_reason: result.stop_reason,
      seed: result.seed,
    })),

    tokenUsage,
    cost: undefined,
    cached: undefined,
    logProbs: undefined,
  };

  return providerResponse;
}

export class BAMChatProvider implements ApiProvider {
  modelName: string;
  config?: BAMGenerationParameters;
  moderations?: BAMModerations;
  env?: EnvOverrides;
  apiKey?: string;
  client: GenAIClient;

  constructor(
    modelName: string,
    options: {
      id?: string;
      config?: BAMGenerationParameters;
      env?: EnvOverrides;
      moderations?: BAMModerations;
    } = {},
  ) {
    const { id, config, env, moderations } = options;
    this.env = env;
    this.modelName = modelName;
    this.config = config;
    this.moderations = moderations;
    this.id = id ? () => id : this.id;
    this.apiKey = process.env?.BAM_API_KAY;
    this.client = new GenAIClient({
      apiKey: this.apiKey,
      endpoint: 'https://bam-api.res.ibm.com/',
    });
  }

  id(): string {
    return `bam:chat:${this.modelName || 'google/flan-ul2'}`;
  }

  toString(): string {
    return `[BAM chat Provider ${this.modelName || 'google/flan-ul2'}]`;
  }

  getApiKey(): string | undefined {
    logger.debug(`BAM apiKeyenvar: ${this.config?.apiKeyEnvar}`);
    return (
      this.config?.apiKey ||
      (this.config?.apiKeyEnvar
        ? process.env[this.config.apiKeyEnvar] ||
          this.env?.[this.config.apiKeyEnvar as keyof EnvOverrides]
        : undefined) ||
      this.env?.BAM_API_KEY ||
      process.env.BAM_API_KEY
    );
  }

  async callApi(prompt: string): Promise<ProviderResponse> {
    if (!this.apiKey) {
      throw new Error(
        'BAM API key is not set. Set the BAM_API_KEY environment variable or add `apiKey` to the provider config.',
      );
    }

    try {
      const cache = await getCache();
      const params: TextGenerationCreateInput = {
        model_id: this.modelName,
        input: prompt,
        parameters: {},
        moderations: {},
      };

      const cacheKey = `bam:${JSON.stringify(params)}`;
      if (isCacheEnabled()) {
        // Try to get the cached response
        const cachedResponse = await cache.get(cacheKey);
        if (cachedResponse) {
          logger.debug(`Returning cached response for ${prompt}: ${cachedResponse}`);
          return {
            output: JSON.parse(cachedResponse as string),
            tokenUsage: {},
          };
        }
      }
      const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
      const result = await this.client.text.generation.create(params, { signal });

      return convertResponse(result);
    } catch (err) {
      logger.error(`BAM API call error: ${String(err)}`);

      return {
        error: `API call error: ${String(err)}`,
      };
    }
  }
}

export class BAMEmbeddingProvider extends BAMChatProvider {}
