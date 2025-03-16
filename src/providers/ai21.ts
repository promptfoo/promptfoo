import { fetchWithCache } from '../cache';
import { getEnvString } from '../envars';
import logger from '../logger';
import type { ApiProvider, ProviderResponse, TokenUsage } from '../types';
import type { EnvOverrides } from '../types/env';
import { calculateCost, REQUEST_TIMEOUT_MS, parseChatPrompt } from './shared';

const AI21_CHAT_MODELS = [
  {
    id: 'jamba-1.5-mini',
    cost: {
      input: 0.2 / 1000000,
      output: 0.4 / 1000000,
    },
  },
  {
    id: 'jamba-1.5-large',
    cost: {
      input: 2 / 1000000,
      output: 8 / 1000000,
    },
  },
];

interface AI21ChatCompletionOptions {
  apiKey?: string;
  apiKeyEnvar?: string;
  apiBaseUrl?: string;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  response_format?: { type: 'json_object' | 'text' };
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

function calculateAI21Cost(
  modelName: string,
  config: AI21ChatCompletionOptions,
  promptTokens?: number,
  completionTokens?: number,
): number | undefined {
  return calculateCost(modelName, config, promptTokens, completionTokens, AI21_CHAT_MODELS);
}

export class AI21ChatCompletionProvider implements ApiProvider {
  modelName: string;
  config: AI21ChatCompletionOptions;
  env?: EnvOverrides;

  static AI21_CHAT_MODELS = AI21_CHAT_MODELS;
  static AI21_CHAT_MODELS_NAMES = AI21_CHAT_MODELS.map((model) => model.id);

  constructor(
    modelName: string,
    options: { id?: string; config?: AI21ChatCompletionOptions; env?: EnvOverrides } = {},
  ) {
    if (!AI21ChatCompletionProvider.AI21_CHAT_MODELS_NAMES.includes(modelName)) {
      logger.warn(`Using unknown AI21 chat model: ${modelName}`);
    }
    const { id, config, env } = options;
    this.env = env;
    this.modelName = modelName;
    this.id = id ? () => id : this.id;
    this.config = config || {};
  }

  id(): string {
    return `ai21:${this.modelName}`;
  }

  toString(): string {
    return `[AI21 Provider ${this.modelName}]`;
  }

  getApiUrlDefault(): string {
    return 'https://api.ai21.com/studio/v1';
  }

  getApiUrl(): string {
    return (
      this.config.apiBaseUrl ||
      this.env?.AI21_API_BASE_URL ||
      getEnvString('AI21_API_BASE_URL') ||
      this.getApiUrlDefault()
    );
  }

  getApiKey(): string | undefined {
    logger.debug(`AI21 apiKeyenvar: ${this.config.apiKeyEnvar}`);
    return (
      this.config.apiKey ||
      (this.config?.apiKeyEnvar
        ? process.env[this.config.apiKeyEnvar] ||
          this.env?.[this.config.apiKeyEnvar as keyof EnvOverrides]
        : undefined) ||
      this.env?.AI21_API_KEY ||
      getEnvString('AI21_API_KEY')
    );
  }

  async callApi(prompt: string): Promise<ProviderResponse> {
    if (!this.getApiKey()) {
      throw new Error(
        'AI21 API key is not set. Set the AI21_API_KEY environment variable or add `apiKey` or `apiKeyEnvar` to the provider config.',
      );
    }

    const messages = parseChatPrompt(prompt, [{ role: 'user', content: prompt }]);

    const body = {
      model: this.modelName,
      messages,
      temperature: this.config?.temperature ?? 0.1,
      top_p: this.config?.top_p || 1,
      max_tokens: this.config?.max_tokens || 1024,
      n: 1,
      stop: [],
      response_format: this.config.response_format || { type: 'text' },
    };

    const url = `${this.getApiUrl()}/chat/completions`;
    logger.debug(`AI21 API request: ${url} ${JSON.stringify(body)}`);

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

    logger.debug(`AI21 API response: ${JSON.stringify(data)}`);

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
      cost: calculateAI21Cost(
        this.modelName,
        this.config,
        data.usage?.prompt_tokens,
        data.usage?.completion_tokens,
      ),
    };
  }
}
