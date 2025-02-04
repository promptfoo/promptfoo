import type Cloudflare from 'cloudflare';
import { fetchWithCache } from '../cache';
import { getEnvString } from '../envars';
import logger from '../logger';
import type {
  ApiProvider,
  CallApiContextParams,
  CallApiOptionsParams,
  ProviderEmbeddingResponse,
  ProviderResponse,
} from '../types';
import type { EnvOverrides } from '../types/env';
import invariant from '../util/invariant';
import { REQUEST_TIMEOUT_MS, parseChatPrompt } from './shared';

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

export type ICloudflareSuccessResponse<SuccessData extends Record<string, unknown>> = {
  success: true;
  errors: [];
  messages: unknown[];
  result: SuccessData;
};

export type IBuildCloudflareResponse<SuccessData extends Record<string, unknown>> =
  | ICloudflareSuccessResponse<SuccessData>
  | { success: false; errors: unknown[]; messages: unknown[] };

abstract class CloudflareAiGenericProvider implements ApiProvider {
  abstract readonly modelType: 'embedding' | 'chat' | 'completion';

  deploymentName: string;
  public readonly config: ICloudflareProviderConfig;
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
      getEnvString('CLOUDFLARE_API_KEY');

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
      getEnvString('CLOUDFLARE_ACCOUNT_ID');

    invariant(
      accountIdCandidate,
      'Cloudflare account ID required. Supply it via config apiKey or apiKeyEnvar, or the CLOUDFLARE_ACCOUNT_ID environment variable',
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
    return `cloudflare-ai:${this.modelType}:${this.deploymentName}`;
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
    _response: IBuildCloudflareResponse<Record<string, unknown>>,
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

  /**
   * Handles the actual marshalling of Cloudflare API response data into the response types expected
   * by inheriting consumers
   *
   * This is meant to be used internally across the inheriting providers
   * @param body
   * @returns
   */
  protected async handleApiCall<
    InitialResponse extends IBuildCloudflareResponse<Record<string, unknown>>,
    SuccessResponse extends InitialResponse = InitialResponse extends ICloudflareSuccessResponse<
      Record<string, unknown>
    >
      ? InitialResponse
      : never,
  >(
    body: Record<string, unknown>,
  ): Promise<
    | {
        data: SuccessResponse;
        cached: boolean;
        tokenUsage: ProviderEmbeddingResponse['tokenUsage'];
      }
    | { error: string }
  > {
    let data: InitialResponse;
    let cached: boolean;

    logger.debug(`Calling Cloudflare AI API: ${JSON.stringify(body)}`);

    const url = this.buildUrl();

    try {
      ({ data, cached } = (await fetchWithCache(
        url,
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
        error: `API response error: ${JSON.stringify(data.errors)} (messages: ${String(
          data.messages,
        )} -- URL: ${url}): ${JSON.stringify(data)}`,
        tokenUsage,
      };
    }

    return {
      cached,
      data: data as SuccessResponse,
      tokenUsage,
    };
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
  readonly modelType = 'embedding';

  async callEmbeddingApi(text: string): Promise<ProviderEmbeddingResponse> {
    const body: Omit<Cloudflare.Workers.AI.AIRunParams.TextEmbeddings, ICloudflareParamsToIgnore> =
      {
        text,
      };

    const cfResponse = await this.handleApiCall<ICloudflareEmbeddingResponse>(body);
    if ('error' in cfResponse) {
      return { error: cfResponse.error };
    }

    const { data, tokenUsage, cached } = cfResponse;

    try {
      const embedding = data.result.data[0];
      if (!embedding) {
        logger.error(
          `No data could be found in the Cloudflare API response: ${JSON.stringify(data)}`,
        );
        throw new Error('No embedding returned');
      }
      const ret = {
        cached,
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
  readonly modelType = 'completion';

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

    const cfResponse = await this.handleApiCall<ICloudflareTextGenerationResponse>(body);
    if ('error' in cfResponse) {
      return { error: cfResponse.error };
    }

    const { data, cached, tokenUsage } = cfResponse;

    return {
      output: data.result.response,
      tokenUsage,
      cached,
    };
  }
}

export class CloudflareAiChatCompletionProvider extends CloudflareAiGenericProvider {
  readonly modelType = 'chat';

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

    const cfResponse = await this.handleApiCall<ICloudflareTextGenerationResponse>(body);
    if ('error' in cfResponse) {
      return { error: cfResponse.error };
    }

    const { data, cached, tokenUsage } = cfResponse;

    return {
      output: data.result.response,
      tokenUsage,
      cached,
    };
  }
}
