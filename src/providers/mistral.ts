import { fetchWithCache } from '../cache';
import { getEnvString } from '../envars';
import logger from '../logger';
import type {
  ApiProvider,
  EnvOverrides,
  ProviderEmbeddingResponse,
  ProviderResponse,
  TokenUsage,
} from '../types';
import { REQUEST_TIMEOUT_MS, parseChatPrompt } from './shared';

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
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  safe_prompt?: boolean;
  random_seed?: number;
  response_format?: { type: 'json_object' };
  cost?: number;
}

function getTokenUsage(data: any, cached: boolean): Partial<TokenUsage> {
  if (data.usage) {
    if (cached) {
      return { cached: data.usage.total_tokens, total: data.usage.total_tokens };
    } else {
      return {
        total: data.usage.total_tokens,
        prompt: data.usage.prompt_tokens || 0,
        completion: data.usage.completion_tokens || 0,
      };
    }
  }
  return {};
}

function calculateCost(
  modelName: string,
  config: MistralChatCompletionOptions,
  promptTokens?: number,
  completionTokens?: number,
): number | undefined {
  if (!promptTokens || !completionTokens) {
    return undefined;
  }

  const model =
    MISTRAL_CHAT_MODELS.find((m) => m.id === modelName) ||
    MISTRAL_EMBEDDING_MODELS.find((m) => m.id === modelName);
  if (!model || !model.cost) {
    return undefined;
  }

  const inputCost = config.cost ?? model.cost.input;
  const outputCost = config.cost ?? model.cost.output;
  return inputCost * promptTokens + outputCost * completionTokens || undefined;
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

  getApiKey(): string | undefined {
    logger.debug(`Mistral apiKeyenvar: ${this.config.apiKeyEnvar}`);
    return (
      this.config.apiKey ||
      (this.config?.apiKeyEnvar
        ? process.env[this.config.apiKeyEnvar] ||
          this.env?.[this.config.apiKeyEnvar as keyof EnvOverrides]
        : undefined) ||
      this.env?.MISTRAL_API_KEY ||
      getEnvString('MISTRAL_API_KEY')
    );
  }

  async callApi(prompt: string): Promise<ProviderResponse> {
    if (!this.getApiKey()) {
      throw new Error(
        'Mistral API key is not set. Set the MISTRAL_API_KEY environment variable or add `apiKey` or `apiKeyEnvar` to the provider config.',
      );
    }

    const messages = parseChatPrompt(prompt, [{ role: 'user', content: prompt }]);

    const body = {
      model: this.modelName,
      messages,
      temperature: this.config?.temperature,
      top_p: this.config?.top_p || 1,
      max_tokens: this.config?.max_tokens || 1024,
      safe_prompt: this.config?.safe_prompt || false,
      random_seed: this.config?.random_seed || null,
      ...(this.config.response_format ? { response_format: this.config.response_format } : {}),
    };

    const url = `${this.getApiUrl()}/chat/completions`;
    logger.debug(`Mistral API request: ${url} ${JSON.stringify(body)}`);

    let data,
      cached = false;

    try {
      ({ data, cached } = (await fetchWithCache(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.getApiKey()}`,
          },
          body: JSON.stringify(body),
        },
        REQUEST_TIMEOUT_MS,
      )) as unknown as { data: any; cached: boolean });
    } catch (err) {
      return {
        error: `API call error: ${String(err)}`,
      };
    }

    logger.debug(`Mistral API response: ${JSON.stringify(data)}`);

    if (data.error) {
      return {
        error: `API call error: ${data.error}`,
      };
    }
    if (!data.choices[0] && !data.choices[0].message.content) {
      return {
        error: `Malformed response data: ${JSON.stringify(data)}`,
      };
    }

    return {
      output: data.choices[0].message.content,
      tokenUsage: getTokenUsage(data, cached),
      cached,
      cost: calculateCost(
        this.modelName,
        this.config,
        data.usage?.prompt_tokens,
        data.usage?.completion_tokens,
      ),
    };
  }
}

export class MistralEmbeddingProvider extends MistralChatCompletionProvider {
  constructor(
    options: { config?: MistralChatCompletionOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    super('mistral-embed', options);
  }

  id(): string {
    return `mistral:embedding:${this.modelName}`;
  }

  toString(): string {
    return `[Mistral Embedding Provider ${this.modelName}]`;
  }

  async callEmbeddingApi(text: string): Promise<ProviderEmbeddingResponse> {
    if (!this.getApiKey()) {
      throw new Error('Mistral API key must be set for embedding');
    }

    const body = {
      model: this.modelName,
      input: text,
    };

    const url = `${this.getApiUrl()}/embeddings`;
    logger.debug(`Mistral Embedding API request: ${url} ${JSON.stringify(body)}`);

    let data,
      cached = false;

    try {
      ({ data, cached } = (await fetchWithCache(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.getApiKey()}`,
          },
          body: JSON.stringify(body),
        },
        REQUEST_TIMEOUT_MS,
      )) as unknown as { data: any; cached: boolean });
    } catch (err) {
      logger.error(`API call error: ${err}`);
      throw err;
    }

    logger.debug(`Mistral Embedding API response: ${JSON.stringify(data)}`);

    try {
      const embedding = data?.data?.[0]?.embedding;
      if (!embedding) {
        throw new Error('No embedding found in Mistral Embedding API response');
      }
      const tokenUsage = getTokenUsage(data, cached);
      return {
        embedding,
        tokenUsage,
        cost: calculateCost(this.modelName, this.config, tokenUsage.prompt, tokenUsage.completion),
      };
    } catch (err) {
      logger.error(data.error?.message || 'Unknown error');
      throw err;
    }
  }
}
