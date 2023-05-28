import logger from '../logger.js';
import { fetchJsonWithCache } from '../cache.js';
import { REQUEST_TIMEOUT_MS } from './shared.js';

import type { ApiProvider, ProviderEmbeddingResponse, ProviderResponse } from '../types.js';

const DEFAULT_OPENAI_HOST = 'api.openai.com';

interface OpenAiCompletionOptions {
  temperature: number;
}

class OpenAiGenericProvider implements ApiProvider {
  modelName: string;
  apiKey?: string;
  apiHost: string;

  constructor(modelName: string, apiKey?: string) {
    this.modelName = modelName;

    this.apiKey = apiKey || process.env.OPENAI_API_KEY;

    this.apiHost = process.env.OPENAI_API_HOST || DEFAULT_OPENAI_HOST;
  }

  id(): string {
    return `openai:${this.modelName}`;
  }

  toString(): string {
    return `[OpenAI Provider ${this.modelName}]`;
  }

  // @ts-ignore: Prompt is not used in this implementation
  async callApi(prompt: string, options?: OpenAiCompletionOptions): Promise<ProviderResponse> {
    throw new Error('Not implemented');
  }
}

export class OpenAiEmbeddingProvider extends OpenAiGenericProvider {
  async callEmbeddingApi(text: string): Promise<ProviderEmbeddingResponse> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key must be set for similarity comparison');
    }

    const body = {
      input: text,
      model: this.modelName,
    };
    let data,
      cached = false;
    try {
      ({ data, cached } = (await fetchJsonWithCache(
        `https://${this.apiHost}/v1/embeddings`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
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
    logger.debug(`\tOpenAI API response (embeddings): ${JSON.stringify(data)}`);

    try {
      const embedding = data?.data?.[0]?.embedding;
      if (!embedding) {
        throw new Error('No embedding returned');
      }
      const ret = {
        embedding,
        tokenUsage: cached
          ? { cached: data.usage.total_tokens }
          : {
              total: data.usage.total_tokens,
              prompt: data.usage.prompt_tokens,
              completion: data.usage.completion_tokens,
            },
      };
      return ret;
    } catch (err) {
      return {
        error: `API response error: ${String(err)}: ${JSON.stringify(data)}`,
        tokenUsage: {
          total: data?.usage?.total_tokens,
          prompt: data?.usage?.prompt_tokens,
          completion: data?.usage?.completion_tokens,
        },
      };
    }
  }
}

export class OpenAiCompletionProvider extends OpenAiGenericProvider {
  static OPENAI_COMPLETION_MODELS = [
    'text-davinci-003',
    'text-davinci-002',
    'text-curie-001',
    'text-babbage-001',
    'text-ada-001',
  ];

  constructor(modelName: string, apiKey?: string) {
    if (!OpenAiCompletionProvider.OPENAI_COMPLETION_MODELS.includes(modelName)) {
      logger.warn(`Using unknown OpenAI completion model: ${modelName}`);
    }
    super(modelName, apiKey);
  }

  async callApi(prompt: string, options?: OpenAiCompletionOptions): Promise<ProviderResponse> {
    if (!this.apiKey) {
      throw new Error(
        'OpenAI API key is not set. Set OPENAI_API_KEY environment variable or pass it as an argument to the constructor.',
      );
    }

    const body = {
      model: this.modelName,
      prompt,
      max_tokens: process.env.OPENAI_MAX_TOKENS || 1024,
      temperature: options?.temperature ?? (process.env.OPENAI_MAX_TEMPERATURE || 0),
      stop: process.env.OPENAI_STOP ? JSON.parse(process.env.OPENAI_STOP) : undefined,
    };
    logger.debug(`Calling OpenAI API: ${JSON.stringify(body)}`);
    let data,
      cached = false;
    try {
      ({ data, cached } = (await fetchJsonWithCache(
        `https://${this.apiHost}/v1/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(body),
        },
        REQUEST_TIMEOUT_MS,
      )) as unknown as any);
    } catch (err) {
      return {
        error: `API call error: ${String(err)}`,
      };
    }
    logger.debug(`\tOpenAI API response: ${JSON.stringify(data)}`);
    try {
      return {
        output: data.choices[0].text,
        tokenUsage: cached
          ? { cached: data.usage.total_tokens }
          : {
              total: data.usage.total_tokens,
              prompt: data.usage.prompt_tokens,
              completion: data.usage.completion_tokens,
            },
      };
    } catch (err) {
      return {
        error: `API response error: ${String(err)}: ${JSON.stringify(data)}`,
      };
    }
  }
}

export class OpenAiChatCompletionProvider extends OpenAiGenericProvider {
  static OPENAI_CHAT_MODELS = [
    'gpt-4',
    'gpt-4-0314',
    'gpt-4-32k',
    'gpt-4-32k-0314',
    'gpt-3.5-turbo',
    'gpt-3.5-turbo-0301',
  ];

  constructor(modelName: string, apiKey?: string) {
    if (!OpenAiChatCompletionProvider.OPENAI_CHAT_MODELS.includes(modelName)) {
      logger.warn(`Using unknown OpenAI chat model: ${modelName}`);
    }
    super(modelName, apiKey);
  }

  // TODO(ian): support passing in `messages` directly
  async callApi(prompt: string, options?: OpenAiCompletionOptions): Promise<ProviderResponse> {
    if (!this.apiKey) {
      throw new Error(
        'OpenAI API key is not set. Set OPENAI_API_KEY environment variable or pass it as an argument to the constructor.',
      );
    }

    let messages: { role: string; content: string }[];
    try {
      // User can specify `messages` payload as JSON, or we'll just put the
      // string prompt into a `messages` array.
      messages = JSON.parse(prompt);
    } catch (err) {
      messages = [{ role: 'user', content: prompt }];
    }
    const body = {
      model: this.modelName,
      messages: messages,
      max_tokens: process.env.OPENAI_MAX_TOKENS || 1024,
      temperature: options?.temperature ?? (process.env.OPENAI_MAX_TEMPERATURE || 0),
    };
    logger.debug(`Calling OpenAI API: ${JSON.stringify(body)}`);

    let data,
      cached = false;
    try {
      ({ data, cached } = (await fetchJsonWithCache(
        `https://${this.apiHost}/v1/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(body),
        },
        REQUEST_TIMEOUT_MS,
      )) as unknown as any);
    } catch (err) {
      return {
        error: `API call error: ${String(err)}`,
      };
    }

    logger.debug(`\tOpenAI API response: ${JSON.stringify(data)}`);
    try {
      return {
        output: data.choices[0].message.content,
        tokenUsage: cached
          ? { cached: data.usage.total_tokens }
          : {
              total: data.usage.total_tokens,
              prompt: data.usage.prompt_tokens,
              completion: data.usage.completion_tokens,
            },
      };
    } catch (err) {
      return {
        error: `API response error: ${String(err)}: ${JSON.stringify(data)}`,
      };
    }
  }
}

export const DefaultEmbeddingProvider = new OpenAiEmbeddingProvider('text-embedding-ada-002');
export const DefaultGradingProvider = new OpenAiChatCompletionProvider('gpt-4');
export const DefaultSuggestionsProvider = new OpenAiChatCompletionProvider('gpt-4');
