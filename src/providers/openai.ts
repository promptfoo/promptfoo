import logger from '../logger';
import { fetchWithCache } from '../cache';
import { REQUEST_TIMEOUT_MS, parseChatPrompt } from './shared';

import type { ApiProvider, ProviderEmbeddingResponse, ProviderResponse } from '../types.js';

const DEFAULT_OPENAI_HOST = 'api.openai.com';

interface OpenAiCompletionOptions {
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  best_of?: number;
  functions?: {
    name: string;
    description?: string;
    parameters: any;
  }[];
  function_call?: 'none' | 'auto';
  apiKey?: string;
  organization?: string;
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

  getOrganization(options?: OpenAiCompletionOptions): string | undefined {
    return options?.organization || process.env.OPENAI_ORGANIZATION;
  }

  getApiKey(options?: OpenAiCompletionOptions): string | undefined {
    return options?.apiKey || this.apiKey;
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
      ({ data, cached } = (await fetchWithCache(
        `https://${this.apiHost}/v1/embeddings`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.getApiKey()}`,
            ...(this.getOrganization()
              ? { 'OpenAI-Organization': this.getOrganization() }
              : {}),
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

  options: OpenAiCompletionOptions;

  constructor(modelName: string, apiKey?: string, context?: OpenAiCompletionOptions, id?: string) {
    if (!OpenAiCompletionProvider.OPENAI_COMPLETION_MODELS.includes(modelName)) {
      logger.warn(`Using unknown OpenAI completion model: ${modelName}`);
    }
    super(modelName, apiKey);
    this.options = context || {};
    this.id = id ? () => id : this.id;
  }

  async callApi(prompt: string, options?: OpenAiCompletionOptions): Promise<ProviderResponse> {
    if (!this.apiKey) {
      throw new Error(
        'OpenAI API key is not set. Set OPENAI_API_KEY environment variable or pass it as an argument to the constructor.',
      );
    }

    let stop: string;
    try {
      stop = process.env.OPENAI_STOP
        ? JSON.parse(process.env.OPENAI_STOP)
        : ['<|im_end|>', '<|endoftext|>'];
    } catch (err) {
      throw new Error(`OPENAI_STOP is not a valid JSON string: ${err}`);
    }
    const body = {
      model: this.modelName,
      prompt,
      max_tokens:
        options?.max_tokens ??
        this.options.max_tokens ??
        parseInt(process.env.OPENAI_MAX_TOKENS || '1024'),
      temperature:
        options?.temperature ??
        this.options.temperature ??
        parseFloat(process.env.OPENAI_TEMPERATURE || '0'),
      top_p: options?.top_p ?? this.options.top_p ?? parseFloat(process.env.OPENAI_TOP_P || '1'),
      presence_penalty:
        options?.presence_penalty ??
        this.options.presence_penalty ??
        parseFloat(process.env.OPENAI_PRESENCE_PENALTY || '0'),
      frequency_penalty:
        options?.frequency_penalty ??
        this.options.frequency_penalty ??
        parseFloat(process.env.OPENAI_FREQUENCY_PENALTY || '0'),
      best_of:
        options?.best_of ?? this.options.best_of ?? parseInt(process.env.OPENAI_BEST_OF || '1'),
      stop,
    };
    logger.debug(`Calling OpenAI API: ${JSON.stringify(body)}`);
    let data,
      cached = false;
    try {
      ({ data, cached } = (await fetchWithCache(
        `https://${this.apiHost}/v1/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.getApiKey(options)}`,
            ...(this.getOrganization(options)
              ? { 'OpenAI-Organization': this.getOrganization(options) }
              : {}),
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
    'gpt-4-0613',
    'gpt-4-32k',
    'gpt-4-32k-0314',
    'gpt-3.5-turbo',
    'gpt-3.5-turbo-0301',
    'gpt-3.5-turbo-0613',
    'gpt-3.5-turbo-16k',
    'gpt-3.5-turbo-16k-0613',
  ];

  options: OpenAiCompletionOptions;

  constructor(modelName: string, apiKey?: string, context?: OpenAiCompletionOptions, id?: string) {
    if (!OpenAiChatCompletionProvider.OPENAI_CHAT_MODELS.includes(modelName)) {
      logger.warn(`Using unknown OpenAI chat model: ${modelName}`);
    }
    super(modelName, apiKey);
    this.options = context || {};
    this.id = id ? () => id : this.id;
  }

  async callApi(prompt: string, options?: OpenAiCompletionOptions): Promise<ProviderResponse> {
    if (!this.apiKey) {
      throw new Error(
        'OpenAI API key is not set. Set OPENAI_API_KEY environment variable or pass it as an argument to the constructor.',
      );
    }

    const messages = parseChatPrompt(prompt);
    const body = {
      model: this.modelName,
      messages: messages,
      max_tokens:
        options?.max_tokens ??
        this.options.max_tokens ??
        parseInt(process.env.OPENAI_MAX_TOKENS || '1024'),
      temperature:
        options?.temperature ??
        this.options.temperature ??
        parseFloat(process.env.OPENAI_TEMPERATURE || '0'),
      top_p: options?.top_p ?? this.options.top_p ?? parseFloat(process.env.OPENAI_TOP_P || '1'),
      presence_penalty:
        options?.presence_penalty ??
        this.options.presence_penalty ??
        parseFloat(process.env.OPENAI_PRESENCE_PENALTY || '0'),
      frequency_penalty:
        options?.frequency_penalty ??
        this.options.frequency_penalty ??
        parseFloat(process.env.OPENAI_FREQUENCY_PENALTY || '0'),
      functions: options?.functions || this.options.functions || undefined,
      function_call: options?.function_call || this.options.function_call || undefined,
    };
    logger.debug(`Calling OpenAI API: ${JSON.stringify(body)}`);

    let data,
      cached = false;
    try {
      ({ data, cached } = (await fetchWithCache(
        `https://${this.apiHost}/v1/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.getApiKey(options)}`,
            ...(this.getOrganization(options)
              ? { 'OpenAI-Organization': this.getOrganization(options) }
              : {}),
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
      const message = data.choices[0].message;
      const output =
        message.content === null ? JSON.stringify(message.function_call) : message.content;
      return {
        output,
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
export const DefaultGradingProvider = new OpenAiChatCompletionProvider('gpt-4-0613');
export const DefaultSuggestionsProvider = new OpenAiChatCompletionProvider('gpt-4-0613');
