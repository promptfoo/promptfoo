import { createHmac } from 'crypto';

import { fetchWithCache, getCache, getScopedCacheKey, isCacheEnabled } from '../cache';
import { getEnvString } from '../envars';
import logger from '../logger';
import { type GenAISpanContext, type GenAISpanResult, withGenAISpan } from '../tracing/genaiTracer';
import { maybeLoadToolsFromExternalFile } from '../util';
import { calculateCost, parseChatPrompt, REQUEST_TIMEOUT_MS } from './shared';

import type { EnvVarKey } from '../envars';
import type { EnvOverrides } from '../types/env';
import type {
  ApiProvider,
  CallApiContextParams,
  ProviderEmbeddingResponse,
  ProviderResponse,
  TokenUsage,
} from '../types/index';

const MISTRAL_CHAT_MODELS = [
  ...['open-mistral-7b', 'mistral-tiny', 'mistral-tiny-2312'].map((id) => ({
    id,
    cost: {
      input: 0.25 / 1000000,
      output: 0.25 / 1000000,
    },
  })),
  ...[
    'open-mistral-nemo',
    'open-mistral-nemo-2407',
    'mistral-tiny-2407',
    'mistral-tiny-latest',
  ].map((id) => ({
    id,
    cost: {
      input: 0.3 / 1000000,
      output: 0.3 / 1000000,
    },
  })),
  ...['mistral-small-2402', 'mistral-small-latest'].map((id) => ({
    id,
    cost: {
      input: 1 / 1000000,
      output: 3 / 1000000,
    },
  })),
  ...['mistral-medium-2312', 'mistral-medium', 'mistral-medium-latest'].map((id) => ({
    id,
    cost: {
      input: 2.7 / 1000000,
      output: 8.1 / 1000000,
    },
  })),
  {
    id: 'mistral-large-2402',
    cost: {
      input: 4 / 1000000,
      output: 12 / 1000000,
    },
  },
  ...['mistral-large-2407', 'mistral-large-latest'].map((id) => ({
    id,
    cost: {
      input: 3 / 1000000,
      output: 9 / 1000000,
    },
  })),
  ...['codestral-2405', 'codestral-latest'].map((id) => ({
    id,
    cost: {
      input: 1 / 1000000,
      output: 3 / 1000000,
    },
  })),
  ...['codestral-mamba-2407', 'open-codestral-mamba', 'codestral-mamba-latest'].map((id) => ({
    id,
    cost: {
      input: 0.25 / 1000000,
      output: 0.25 / 1000000,
    },
  })),
  ...['open-mixtral-8x7b', 'mistral-small', 'mistral-small-2312'].map((id) => ({
    id,
    cost: {
      input: 0.7 / 1000000,
      output: 0.7 / 1000000,
    },
  })),
  ...['open-mixtral-8x22b', 'open-mixtral-8x22b-2404'].map((id) => ({
    id,
    cost: {
      input: 2 / 1000000,
      output: 6 / 1000000,
    },
  })),
  // New Magistral models - reasoning models announced June 2025
  {
    id: 'magistral-small-2506',
    cost: {
      input: 0.5 / 1000000,
      output: 1.5 / 1000000,
    },
  },
  {
    id: 'magistral-medium-2506',
    cost: {
      input: 2 / 1000000,
      output: 5 / 1000000,
    },
  },
  // Also support latest aliases
  {
    id: 'magistral-small-latest',
    cost: {
      input: 0.5 / 1000000,
      output: 1.5 / 1000000,
    },
  },
  {
    id: 'magistral-medium-latest',
    cost: {
      input: 2 / 1000000,
      output: 5 / 1000000,
    },
  },
  // Multimodal model
  {
    id: 'pixtral-12b',
    cost: {
      input: 0.15 / 1000000,
      output: 0.15 / 1000000,
    },
  },
];

const MISTRAL_EMBEDDING_MODELS = [
  {
    id: 'mistral-embed',
    cost: {
      input: 0.1 / 1000000,
      output: 0.1 / 1000000,
    },
  },
];

interface MistralChatCompletionOptions {
  apiKey?: string;
  apiKeyEnvar?: string;
  apiHost?: string;
  apiBaseUrl?: string;
  tools?: unknown;
  tool_choice?:
    | 'none'
    | 'auto'
    | 'any'
    | 'required'
    | { type: 'function'; function?: { name: string } };
  parallel_tool_calls?: boolean;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  safe_prompt?: boolean;
  random_seed?: number;
  response_format?: { type: 'json_object' };
  cost?: number;
  inputCost?: number;
  outputCost?: number;
}

const MISTRAL_CACHE_HASH_KEY = 'promptfoo:mistral:cache-key:v1';
const MISTRAL_INFLIGHT_REQUESTS = new Map<string, Promise<MistralFetchResult>>();

type MistralFetchResult = { data: any; cached: boolean };

function hashMistralCacheValue(value: unknown): string {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  return createHmac('sha256', MISTRAL_CACHE_HASH_KEY)
    .update(serialized ?? String(value))
    .digest('hex');
}

function getMistralAuthCacheNamespace(apiKey: string): string {
  return createHmac('sha256', apiKey).update(MISTRAL_CACHE_HASH_KEY).digest('hex');
}

function fetchMistralWithDedupe(
  cacheKey: string,
  fetcher: () => Promise<MistralFetchResult>,
): Promise<MistralFetchResult> {
  const inflightCacheKey = getScopedCacheKey(cacheKey);
  let inflightRequest = MISTRAL_INFLIGHT_REQUESTS.get(inflightCacheKey);
  if (!inflightRequest) {
    inflightRequest = fetcher().finally(() => {
      MISTRAL_INFLIGHT_REQUESTS.delete(inflightCacheKey);
    });
    MISTRAL_INFLIGHT_REQUESTS.set(inflightCacheKey, inflightRequest);
  }
  return inflightRequest;
}

function getMistralUrlMetadata(url: string) {
  try {
    const parsedUrl = new URL(url);
    return {
      protocol: parsedUrl.protocol,
      hostname: parsedUrl.hostname,
      pathnameLength: parsedUrl.pathname.length,
      hasSearch: parsedUrl.search.length > 0,
    };
  } catch {
    return {
      valid: false,
      length: url.length,
    };
  }
}

function getSafeToolChoice(toolChoice: MistralChatCompletionOptions['tool_choice'] | undefined) {
  if (typeof toolChoice === 'string') {
    return ['none', 'auto', 'any', 'required'].includes(toolChoice) ? toolChoice : 'other';
  }
  if (toolChoice && typeof toolChoice === 'object') {
    return toolChoice.type === 'function' ? 'function' : 'object';
  }
  return undefined;
}

function getMistralRequestMetadata(params: {
  model: string;
  messages?: unknown;
  tools?: unknown;
  tool_choice?: MistralChatCompletionOptions['tool_choice'];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  safe_prompt?: boolean;
  random_seed?: number | null;
  parallel_tool_calls?: boolean;
  response_format?: unknown;
}) {
  return {
    model: params.model,
    messageCount: Array.isArray(params.messages) ? params.messages.length : undefined,
    temperature: params.temperature,
    top_p: params.top_p,
    max_tokens: params.max_tokens,
    safe_prompt: params.safe_prompt,
    random_seed: params.random_seed,
    toolCount: Array.isArray(params.tools) ? params.tools.length : undefined,
    hasTools: params.tools !== undefined,
    tool_choice: getSafeToolChoice(params.tool_choice),
    parallel_tool_calls: params.parallel_tool_calls,
    hasResponseFormat: params.response_format !== undefined,
  };
}

function getMistralResponseMetadata(data: any) {
  const usage = data?.usage;
  return {
    choiceCount: Array.isArray(data?.choices) ? data.choices.length : undefined,
    hasError: data?.error !== undefined,
    hasUsage: usage !== undefined,
    totalTokens: typeof usage?.total_tokens === 'number' ? usage.total_tokens : undefined,
    promptTokens: typeof usage?.prompt_tokens === 'number' ? usage.prompt_tokens : undefined,
    completionTokens:
      typeof usage?.completion_tokens === 'number' ? usage.completion_tokens : undefined,
  };
}

function getMistralEmbeddingResponseMetadata(data: any) {
  const usage = data?.usage;
  return {
    embeddingCount: Array.isArray(data?.data) ? data.data.length : undefined,
    hasError: data?.error !== undefined,
    hasUsage: usage !== undefined,
    totalTokens: typeof usage?.total_tokens === 'number' ? usage.total_tokens : undefined,
    promptTokens: typeof usage?.prompt_tokens === 'number' ? usage.prompt_tokens : undefined,
  };
}

function getMistralErrorMetadata(error: any) {
  return {
    code:
      typeof error?.code === 'string' || typeof error?.code === 'number' ? error.code : undefined,
    hasMessage: typeof error?.message === 'string',
    type: typeof error?.type === 'string' ? error.type : undefined,
  };
}

function getTokenUsage(data: any, cached: boolean): Partial<TokenUsage> {
  if (data.usage) {
    if (cached) {
      return { cached: data.usage.total_tokens, total: data.usage.total_tokens, numRequests: 1 };
    } else {
      return {
        total: data.usage.total_tokens,
        prompt: data.usage.prompt_tokens || 0,
        completion: data.usage.completion_tokens || 0,
        numRequests: 1,
      };
    }
  }
  return {};
}

function calculateMistralCost(
  modelName: string,
  config: MistralChatCompletionOptions,
  promptTokens?: number,
  completionTokens?: number,
): number | undefined {
  return calculateCost(modelName, config, promptTokens, completionTokens, [
    ...MISTRAL_CHAT_MODELS,
    ...MISTRAL_EMBEDDING_MODELS,
  ]);
}

export class MistralChatCompletionProvider implements ApiProvider {
  modelName: string;
  config: MistralChatCompletionOptions;
  env?: EnvOverrides;

  static MISTRAL_CHAT_MODELS = MISTRAL_CHAT_MODELS;

  static MISTRAL_CHAT_MODELS_NAMES = MISTRAL_CHAT_MODELS.map((model) => model.id);

  constructor(
    modelName: string,
    options: { id?: string; config?: MistralChatCompletionOptions; env?: EnvOverrides } = {},
  ) {
    if (!MistralChatCompletionProvider.MISTRAL_CHAT_MODELS_NAMES.includes(modelName)) {
      logger.warn(`Using unknown Mistral chat model: ${modelName}`);
    }
    const { id, config, env } = options;
    this.env = env;
    this.modelName = modelName;
    this.id = id ? () => id : this.id;
    this.config = config || {};
  }

  id(): string {
    return `mistral:${this.modelName}`;
  }

  toString(): string {
    return `[Mistral Provider ${this.modelName}]`;
  }

  getApiUrlDefault(): string {
    return 'https://api.mistral.ai/v1';
  }

  getApiUrl(): string {
    const apiHost =
      this.config.apiHost || this.env?.MISTRAL_API_HOST || getEnvString('MISTRAL_API_HOST');
    if (apiHost) {
      return `https://${apiHost}/v1`;
    }
    return (
      this.config.apiBaseUrl ||
      this.env?.MISTRAL_API_BASE_URL ||
      getEnvString('MISTRAL_API_BASE_URL') ||
      this.getApiUrlDefault()
    );
  }

  requiresApiKey(): boolean {
    return true;
  }

  getApiKey(): string | undefined {
    logger.debug(`Mistral apiKeyenvar: ${this.config.apiKeyEnvar}`);
    const apiKeyCandidate =
      this.config?.apiKey ||
      (this.config?.apiKeyEnvar
        ? getEnvString(this.config.apiKeyEnvar as EnvVarKey) ||
          this.env?.[this.config.apiKeyEnvar as keyof EnvOverrides]
        : undefined) ||
      this.env?.MISTRAL_API_KEY ||
      getEnvString('MISTRAL_API_KEY');
    return apiKeyCandidate;
  }

  private getCacheIdentityHash(apiUrl: string): string {
    return hashMistralCacheValue({
      apiUrl,
    });
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    // Merge configs from the provider and the prompt
    const config = {
      ...this.config,
      ...context?.prompt?.config,
    };

    // Set up tracing context
    const spanContext: GenAISpanContext = {
      system: 'mistral',
      operationName: 'chat',
      model: this.modelName,
      providerId: this.id(),
      temperature: config?.temperature,
      topP: config?.top_p,
      maxTokens: config?.max_tokens,
      testIndex: context?.test?.vars?.__testIdx as number | undefined,
      promptLabel: context?.prompt?.label,
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

    return withGenAISpan(
      spanContext,
      () => this.callApiInternal(prompt, context, config),
      resultExtractor,
    );
  }

  private async callApiInternal(
    prompt: string,
    context?: CallApiContextParams,
    config: MistralChatCompletionOptions = {},
  ): Promise<ProviderResponse> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error(
        'Mistral API key is not set. Set the MISTRAL_API_KEY environment variable or add `apiKey` or `apiKeyEnvar` to the provider config.',
      );
    }
    const apiUrl = this.getApiUrl();

    const messages = parseChatPrompt(prompt, [{ role: 'user', content: prompt }]);
    const loadedTools = config.tools
      ? await maybeLoadToolsFromExternalFile(config.tools, context?.vars)
      : undefined;
    const hasTools = Array.isArray(loadedTools)
      ? loadedTools.length > 0
      : loadedTools !== undefined;

    const params = {
      model: this.modelName,
      messages,
      temperature: config?.temperature,
      top_p: config?.top_p ?? 1,
      max_tokens: config?.max_tokens ?? 1024,
      safe_prompt: config?.safe_prompt ?? false,
      random_seed: config?.random_seed ?? null,
      ...(hasTools ? { tools: loadedTools } : {}),
      ...(config?.tool_choice ? { tool_choice: config.tool_choice } : {}),
      ...('parallel_tool_calls' in config
        ? { parallel_tool_calls: Boolean(config.parallel_tool_calls) }
        : {}),
      ...(config?.response_format ? { response_format: config.response_format } : {}),
    };

    const cacheKey = `mistral:chat:${this.modelName}:${this.getCacheIdentityHash(
      apiUrl,
    )}:${getMistralAuthCacheNamespace(apiKey)}:${hashMistralCacheValue(params)}`;
    if (isCacheEnabled()) {
      const cache = getCache();
      if (cache) {
        const cachedResult = await cache.get<ProviderResponse>(cacheKey);
        if (cachedResult) {
          logger.debug('Returning cached Mistral response', { model: this.modelName });
          return {
            ...cachedResult,
            cached: true,
            tokenUsage: {
              ...cachedResult.tokenUsage,
              cached: cachedResult.tokenUsage?.total,
            },
          };
        }
      }
    }

    const url = `${apiUrl}/chat/completions`;
    logger.debug('Mistral API request', {
      endpoint: getMistralUrlMetadata(url),
      params: getMistralRequestMetadata(params),
    });

    let data,
      cached = false;

    try {
      ({ data, cached } = await fetchMistralWithDedupe(cacheKey, async () => {
        return (await fetchWithCache(
          url,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-promptfoo-silent': 'true',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(params),
          },
          REQUEST_TIMEOUT_MS,
          'json',
          true,
        )) as unknown as MistralFetchResult;
      }));
    } catch (err) {
      return {
        error: `API call error: ${String(err)}`,
      };
    }

    logger.debug('Mistral API response', getMistralResponseMetadata(data));

    if (data.error) {
      return {
        error: `API call error: ${data.error}`,
      };
    }
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      return {
        error: `Malformed response data: ${JSON.stringify(data)}`,
      };
    }

    const message = data.choices[0].message;
    let output: string | object;
    if (message.content && message.tool_calls?.length) {
      output = message;
    } else if (message.tool_calls?.length) {
      output = message.tool_calls;
    } else {
      output = message.content;
    }

    const result: ProviderResponse = {
      output,
      tokenUsage: getTokenUsage(data, cached),
      cached,
      cost: calculateMistralCost(
        this.modelName,
        config,
        data.usage?.prompt_tokens,
        data.usage?.completion_tokens,
      ),
    };

    if (isCacheEnabled()) {
      try {
        await getCache().set(cacheKey, result);
      } catch (err) {
        logger.error(`Failed to cache response: ${String(err)}`);
      }
    }

    return result;
  }
}

export class MistralEmbeddingProvider implements ApiProvider {
  modelName: string;
  config: MistralChatCompletionOptions;
  env?: EnvOverrides;

  constructor(
    options: { config?: MistralChatCompletionOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    const { config, env } = options;
    this.modelName = 'mistral-embed';
    this.config = config || {};
    this.env = env;
  }

  id(): string {
    return `mistral:embedding:${this.modelName}`;
  }

  toString(): string {
    return `[Mistral Embedding Provider ${this.modelName}]`;
  }

  getApiUrlDefault(): string {
    return 'https://api.mistral.ai/v1';
  }

  getApiUrl(): string {
    const apiHost =
      this.config.apiHost || this.env?.MISTRAL_API_HOST || getEnvString('MISTRAL_API_HOST');
    if (apiHost) {
      return `https://${apiHost}/v1`;
    }
    return (
      this.config.apiBaseUrl ||
      this.env?.MISTRAL_API_BASE_URL ||
      getEnvString('MISTRAL_API_BASE_URL') ||
      this.getApiUrlDefault()
    );
  }

  requiresApiKey(): boolean {
    return true;
  }

  getApiKey(): string | undefined {
    logger.debug(`Mistral apiKeyenvar: ${this.config.apiKeyEnvar}`);
    const apiKeyCandidate =
      this.config?.apiKey ||
      (this.config?.apiKeyEnvar
        ? getEnvString(this.config.apiKeyEnvar as EnvVarKey) ||
          this.env?.[this.config.apiKeyEnvar as keyof EnvOverrides]
        : undefined) ||
      this.env?.MISTRAL_API_KEY ||
      getEnvString('MISTRAL_API_KEY');
    return apiKeyCandidate;
  }

  private getCacheIdentityHash(apiUrl: string): string {
    return hashMistralCacheValue({
      apiUrl,
    });
  }

  async callApi(text: string): Promise<ProviderResponse> {
    try {
      const embeddingResponse = await this.callEmbeddingApi(text);
      return {
        output: JSON.stringify(embeddingResponse.embedding),
        tokenUsage: embeddingResponse.tokenUsage,
        cost: embeddingResponse.cost,
        ...(embeddingResponse.cached ? { cached: true } : {}),
      };
    } catch (err) {
      return {
        error: `Embedding API call error: ${String(err)}`,
      };
    }
  }

  async callEmbeddingApi(text: string): Promise<ProviderEmbeddingResponse> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('Mistral API key must be set for embedding');
    }

    const body = {
      model: this.modelName,
      input: text,
    };

    const apiUrl = this.getApiUrl();
    const url = `${apiUrl}/embeddings`;
    const cacheKey = `mistral:embedding:${this.modelName}:${this.getCacheIdentityHash(
      apiUrl,
    )}:${getMistralAuthCacheNamespace(apiKey)}:${hashMistralCacheValue(body)}`;

    let data;
    let cached = false;
    const cache = isCacheEnabled() ? getCache() : undefined;
    if (cache) {
      try {
        const cachedData = await cache.get<any>(cacheKey);
        if (cachedData) {
          logger.debug('Returning cached Mistral embedding response', { model: this.modelName });
          data = cachedData;
          cached = true;
        }
      } catch (err) {
        logger.error(`Failed to read Mistral embedding cache: ${String(err)}`);
      }
    }

    if (!cached) {
      logger.debug('Mistral embeddings API request', {
        endpoint: getMistralUrlMetadata(url),
        params: {
          model: body.model,
          inputCount: 1,
        },
      });

      try {
        ({ data, cached } = await fetchMistralWithDedupe(cacheKey, async () => {
          return (await fetchWithCache(
            url,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-promptfoo-silent': 'true',
                Authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify(body),
            },
            REQUEST_TIMEOUT_MS,
            'json',
            true,
          )) as unknown as MistralFetchResult;
        }));
      } catch (err) {
        logger.error(`API call error: ${err}`);
        throw err;
      }
    }

    logger.debug('Mistral embeddings API response', getMistralEmbeddingResponseMetadata(data));

    try {
      const embedding = data?.data?.[0]?.embedding;
      if (!embedding) {
        throw new Error('No embedding found in Mistral Embedding API response');
      }
      const tokenUsage = getTokenUsage(data, cached);
      const promptTokens = tokenUsage.prompt || 0;
      const completionTokens = 0; // Embeddings don't have completion tokens
      const result = {
        embedding,
        tokenUsage: {
          ...tokenUsage,
          completion: completionTokens,
        },
        cost: calculateMistralCost(this.modelName, this.config, promptTokens, completionTokens),
        ...(cached ? { cached: true } : {}),
      };
      if (!cached && cache) {
        try {
          await cache.set(cacheKey, data);
        } catch (err) {
          logger.error(`Failed to cache Mistral embedding response: ${String(err)}`);
        }
      }
      return result;
    } catch (err) {
      logger.error('Mistral embeddings API error', getMistralErrorMetadata(data?.error));
      throw err;
    }
  }
}
