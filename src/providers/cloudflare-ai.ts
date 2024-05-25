import invariant from 'tiny-invariant';

import logger from '../logger';
import { fetchWithCache } from '../cache';
import { REQUEST_TIMEOUT_MS, parseChatPrompt } from './shared';

import type Cloudflare from 'cloudflare';

/**
 * These are parameters that have nothing to do with model invocation
 * TextGeneration was picked by default but other params can be added here
 * to omit them from the types
 */
type ICloudflareParamsToIgnore = keyof Pick<
  Cloudflare.Workers.AI.AIRunParams.TextGeneration,
  'messages' | 'prompt' | 'raw' | 'stream' | 'account_id'
>;

export type ICloudflareProviderBaseConfig = {
  accountId?: string;
  accountIdEnvar?: string;
  apiKey?: string;
  apiKeyEnvar?: string;
  apiBaseUrl?: string;
};

export type ICloudflareTextGenerationOptions = {
  frequency_penalty?: number;
  lora?: number;
  max_tokens?: number;
  presence_penalty?: number;
  repetition_penalty?: number;
  seed?: number;
  temperature?: number;
  top_k?: number;
  top_p?: number;
};

export type ICloudflareProviderConfig = ICloudflareProviderBaseConfig &
  ICloudflareTextGenerationOptions;

import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  EnvOverrides,
  ProviderEmbeddingResponse,
  ProviderResponse,
} from '../types';

export type IBuildCloudflareResponse<SuccessData extends Record<string, unknown>> =
  | {
      success: true;
      errors: [];
      messages: unknown[];
      result: SuccessData;
    }
  | { success: false; errors: unknown[]; messages: unknown[] };

class CloudflareAiGenericProvider implements ApiProvider {
  deploymentName: string;
  config: ICloudflareProviderConfig;
  env?: EnvOverrides;

  constructor(
    deploymentName: string,
    options: {
      config?: ICloudflareProviderConfig;
      id?: string;
      env?: EnvOverrides;
    } = {},
  ) {
    const { config, id, env } = options;
    this.env = env;

    this.deploymentName = deploymentName;

    this.config = config || {};
    this.id = id ? () => id : this.id;
  }

  getApiConfig(): { accountId: string; apiToken: string } {
    const apiTokenCandidate =
      this.config?.apiKey ||
      (this.config?.apiKeyEnvar
        ? process.env[this.config.apiKeyEnvar] ||
          this.env?.[this.config.apiKeyEnvar as keyof EnvOverrides]
        : undefined) ||
      this.env?.CLOUDFLARE_API_KEY ||
      process.env.CLOUDFLARE_API_KEY;

    invariant(
      apiTokenCandidate,
      'Cloudflare API token required. Supply it via config apiKey or apiKeyEnvar, or the CLOUDFLARE_API_KEY environment variable',
    );

    const accountIdCandidate =
      this.config?.accountId ||
      (this.config?.accountIdEnvar
        ? process.env[this.config.accountIdEnvar] ||
          this.env?.[this.config.apiKeyEnvar as keyof EnvOverrides]
        : undefined) ||
      this.env?.CLOUDFLARE_ACCOUNT_ID ||
      process.env.CLOUDFLARE_ACCOUNT_ID;

    invariant(
      accountIdCandidate,
      'Cloudflare account ID required. Supply it via config apiKey or apiKeyEnvar, or the CLOUDFLARE_API_KEY environment variable',
    );

    invariant(
      apiTokenCandidate,
      'Cloudflare API token required. Supply it via config apiKey or apiKeyEnvar, or the CLOUDFLARE_API_KEY environment variable',
    );

    return {
      apiToken: apiTokenCandidate,
      accountId: accountIdCandidate,
    };
  }

  /**
   * @see https://developers.cloudflare.com/api/operations/workers-ai-post-run-model
   */
  getApiBaseUrl(): string {
    const { accountId } = this.getApiConfig();
    return this.config.apiBaseUrl || `https://api.cloudflare.com/client/v4/accounts/${accountId}`;
  }

  /**
   * @see https://developers.cloudflare.com/api/operations/workers-ai-post-run-model
   */
  buildUrl() {
    return `${this.getApiBaseUrl()}/ai/run/${this.deploymentName}`;
  }

  id(): string {
    return `cloudflare-ai:${this.deploymentName}`;
  }

  toString(): string {
    return `[Cloudflare AI Provider ${this.deploymentName}]`;
  }

  protected buildApiHeaders(): {
    Authorization: `Bearer ${string}`;
    'Content-Type': 'application/json';
  } {
    const { apiToken } = this.getApiConfig();
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiToken}`,
    };
  }

  /**
   * Cloudflare does not report usage but if it starts to pipe it through its response we can
   * fill in this implementation
   */
  protected getTokenUsageFromResponse(
    _response: IBuildCloudflareResponse<{}>,
  ): ProviderEmbeddingResponse['tokenUsage'] {
    // TODO: Figure out token usage for invoked + cache situations
    const tokenUsage: ProviderEmbeddingResponse['tokenUsage'] = {
      cached: undefined,
      completion: undefined,
      prompt: undefined,
      total: undefined,
    };
    return tokenUsage;
  }

  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    throw new Error('Not implemented');
  }
}

type IEmbeddingsResponse = {
  shape: [number, number];
  data: number[][];
};

export type ICloudflareEmbeddingResponse = IBuildCloudflareResponse<IEmbeddingsResponse>;

export class CloudflareAiEmbeddingProvider extends CloudflareAiGenericProvider {
  async callEmbeddingApi(text: string): Promise<ProviderEmbeddingResponse> {
    const body: Omit<Cloudflare.Workers.AI.AIRunParams.TextEmbeddings, ICloudflareParamsToIgnore> =
      {
        text,
      };

    let data: ICloudflareEmbeddingResponse;
    let cached = false;

    try {
      ({ data, cached } = (await fetchWithCache(
        this.buildUrl(),
        {
          method: 'POST',
          headers: this.buildApiHeaders(),
          body: JSON.stringify(body),
        },
        REQUEST_TIMEOUT_MS,
      )) as unknown as any);
    } catch (err) {
      return {
        error: `API call error: ${String(err)}`,
        tokenUsage: {
          total: 0,
          prompt: 0,
          completion: 0,
        },
      };
    }

    logger.debug(`\tCloudflare AI API response (embeddings): ${JSON.stringify(data)}`);

    const tokenUsage = this.getTokenUsageFromResponse(data);

    if (!data.success) {
      return {
        error: `API response error: ${String(data.errors)} (messages: ${String(
          data.messages,
        )}): ${JSON.stringify(data)}`,
        tokenUsage,
      };
    }

    try {
      const embedding = data.result.data[0];
      if (!embedding) {
        throw new Error('No embedding returned');
      }
      const ret = {
        embedding,
        tokenUsage,
      };
      return ret;
    } catch (err) {
      return {
        error: `API response error: ${String(err)}: ${JSON.stringify(data)}`,
        tokenUsage,
      };
    }
  }
}

export type ICloudflareTextGenerationResponse = IBuildCloudflareResponse<{ response: string }>;

export class CloudflareAiCompletionProvider extends CloudflareAiGenericProvider {
  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const body: { [K in keyof ICloudflareTextGenerationOptions]: any } & { prompt: string } = {
      prompt,
      max_tokens: this.config.max_tokens,
      temperature: this.config.temperature,
      top_p: this.config.top_p,
      presence_penalty: this.config.presence_penalty,
      frequency_penalty: this.config.frequency_penalty,
      lora: this.config.lora,
      repetition_penalty: this.config.repetition_penalty,
      seed: this.config.seed,
      top_k: this.config.top_k,
    };

    logger.debug(`Calling Cloudflare AI API: ${JSON.stringify(body)}`);
    let data: ICloudflareTextGenerationResponse;
    let cached = false;

    try {
      ({ data, cached } = (await fetchWithCache(
        this.buildUrl(),
        {
          method: 'POST',
          headers: this.buildApiHeaders(),
          body: JSON.stringify(body),
        },
        REQUEST_TIMEOUT_MS,
      )) as unknown as any);
    } catch (err) {
      return {
        error: `API call error: ${String(err)}`,
      };
    }
    logger.debug(`\tCloudflare AI API response: ${JSON.stringify(data)}`);
    const tokenUsage = this.getTokenUsageFromResponse(data);

    if (!data.success) {
      return {
        error: `API response error: ${String(data.errors)} (messages: ${String(
          data.messages,
        )}): ${JSON.stringify(data)}`,
        tokenUsage,
      };
    }

    try {
      return {
        output: data.result.response,
        tokenUsage,
      };
    } catch (err) {
      return {
        error: `API response error: ${String(err)}: ${JSON.stringify(data)}`,
      };
    }
  }
}

export class CloudflareAiChatCompletionProvider extends CloudflareAiGenericProvider {
  async callApi(
    prompt: string,
    context?: CallApiContextParams,
    callApiOptions?: CallApiOptionsParams,
  ): Promise<ProviderResponse> {
    const messages = parseChatPrompt(prompt, [{ role: 'user', content: prompt }]);

    const body: { [K in keyof ICloudflareTextGenerationOptions]: any } & {
      messages: { role: string; content: string }[];
    } = {
      messages,
      max_tokens: this.config.max_tokens,
      temperature: this.config.temperature,
      top_p: this.config.top_p,
      presence_penalty: this.config.presence_penalty,
      frequency_penalty: this.config.frequency_penalty,
      lora: this.config.lora,
      repetition_penalty: this.config.repetition_penalty,
      seed: this.config.seed,
      top_k: this.config.top_k,
    };

    logger.debug(`Calling Cloudflare AI API: ${JSON.stringify(body)}`);
    let data: ICloudflareTextGenerationResponse;
    let cached = false;

    try {
      ({ data, cached } = (await fetchWithCache(
        this.buildUrl(),
        {
          method: 'POST',
          headers: this.buildApiHeaders(),
          body: JSON.stringify(body),
        },
        REQUEST_TIMEOUT_MS,
      )) as unknown as any);
    } catch (err) {
      return {
        error: `API call error: ${String(err)}`,
      };
    }
    logger.debug(`\tCloudflare AI API response: ${JSON.stringify(data)}`);
    const tokenUsage = this.getTokenUsageFromResponse(data);

    if (!data.success) {
      return {
        error: `API response error: ${String(data.errors)} (messages: ${String(
          data.messages,
        )}): ${JSON.stringify(data)}`,
        tokenUsage,
      };
    }

    try {
      return {
        output: data.result.response,
        tokenUsage,
      };
    } catch (err) {
      return {
        error: `API response error: ${String(err)}: ${JSON.stringify(data)}`,
      };
    }
  }
}
