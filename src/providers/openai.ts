import logger from '../logger';
import { fetchWithCache } from '../cache';
import { REQUEST_TIMEOUT_MS, parseChatPrompt } from './shared';

import type {
  ApiProvider,
  EnvOverrides,
  ProviderEmbeddingResponse,
  ProviderResponse,
} from '../types.js';

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
  function_call?: 'none' | 'auto' | { name: string; };
  stop?: string[];

  apiKey?: string;
  apiHost?: string;
  organization?: string;
}

class OpenAiGenericProvider implements ApiProvider {
  modelName: string;

  config: OpenAiCompletionOptions;
  env?: EnvOverrides;

  constructor(
    modelName: string,
    options: { config?: OpenAiCompletionOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    const { config, id, env } = options;
    this.env = env;
    this.modelName = modelName;
    this.config = config || {};
    this.id = id ? () => id : this.id;
  }

  id(): string {
    return `openai:${this.modelName}`;
  }

  toString(): string {
    return `[OpenAI Provider ${this.modelName}]`;
  }

  getOrganization(): string | undefined {
    return (
      this.config.organization || this.env?.OPENAI_ORGANIZATION || process.env.OPENAI_ORGANIZATION
    );
  }

  getApiHost(): string | undefined {
    return (
      this.config.apiHost ||
      this.env?.OPENAI_API_HOST ||
      process.env.OPENAI_API_HOST ||
      DEFAULT_OPENAI_HOST
    );
  }

  getApiKey(): string | undefined {
    return this.config.apiKey || this.env?.OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  }

  // @ts-ignore: Prompt is not used in this implementation
  async callApi(prompt: string): Promise<ProviderResponse> {
    throw new Error('Not implemented');
  }
}

export class OpenAiEmbeddingProvider extends OpenAiGenericProvider {
  async callEmbeddingApi(text: string): Promise<ProviderEmbeddingResponse> {
    if (!this.getApiKey()) {
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
        `https://${this.getApiHost()}/v1/embeddings`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.getApiKey()}`,
            ...(this.getOrganization() ? { 'OpenAI-Organization': this.getOrganization() } : {}),
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
        throw new Error(`No embedding found in OpenAI embeddings API response: ${JSON.stringify(data)}`);
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
    'gpt-3.5-turbo-instruct',
    'gpt-3.5-turbo-instruct-0914',
    'text-davinci-003',
    'text-davinci-002',
    'text-curie-001',
    'text-babbage-001',
    'text-ada-001',
  ];

  constructor(
    modelName: string,
    options: { config?: OpenAiCompletionOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    if (!OpenAiCompletionProvider.OPENAI_COMPLETION_MODELS.includes(modelName)) {
      logger.warn(`Using unknown OpenAI completion model: ${modelName}`);
    }
    super(modelName, options);
  }

  async callApi(prompt: string): Promise<ProviderResponse> {
    if (!this.getApiKey()) {
      throw new Error(
        'OpenAI API key is not set. Set the OPENAI_API_KEY environment variable or add `apiKey` to the provider config.',
      );
    }

    let stop: string;
    try {
      stop = process.env.OPENAI_STOP
        ? JSON.parse(process.env.OPENAI_STOP)
        : this.config?.stop || ['<|im_end|>', '<|endoftext|>'];
    } catch (err) {
      throw new Error(`OPENAI_STOP is not a valid JSON string: ${err}`);
    }
    const body = {
      model: this.modelName,
      prompt,
      max_tokens: this.config.max_tokens ?? parseInt(process.env.OPENAI_MAX_TOKENS || '1024'),
      temperature: this.config.temperature ?? parseFloat(process.env.OPENAI_TEMPERATURE || '0'),
      top_p: this.config.top_p ?? parseFloat(process.env.OPENAI_TOP_P || '1'),
      presence_penalty:
        this.config.presence_penalty ?? parseFloat(process.env.OPENAI_PRESENCE_PENALTY || '0'),
      frequency_penalty:
        this.config.frequency_penalty ?? parseFloat(process.env.OPENAI_FREQUENCY_PENALTY || '0'),
      best_of: this.config.best_of ?? parseInt(process.env.OPENAI_BEST_OF || '1'),
      stop,
    };
    logger.debug(`Calling OpenAI API: ${JSON.stringify(body)}`);
    let data,
      cached = false;
    try {
      ({ data, cached } = (await fetchWithCache(
        `https://${this.getApiHost()}/v1/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.getApiKey()}`,
            ...(this.getOrganization() ? { 'OpenAI-Organization': this.getOrganization() } : {}),
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

  constructor(
    modelName: string,
    options: { config?: OpenAiCompletionOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    if (!OpenAiChatCompletionProvider.OPENAI_CHAT_MODELS.includes(modelName)) {
      logger.warn(`Using unknown OpenAI chat model: ${modelName}`);
    }
    super(modelName, options);
  }

  async callApi(prompt: string): Promise<ProviderResponse> {
    if (!this.getApiKey()) {
      throw new Error(
        'OpenAI API key is not set. Set the OPENAI_API_KEY environment variable or add `apiKey` to the provider config.',
      );
    }

    const messages = parseChatPrompt(prompt, [{ role: 'user', content: prompt }]);

    let stop: string;
    try {
      stop = process.env.OPENAI_STOP
        ? JSON.parse(process.env.OPENAI_STOP)
        : this.config?.stop || [];
    } catch (err) {
      throw new Error(`OPENAI_STOP is not a valid JSON string: ${err}`);
    }
    const body = {
      model: this.modelName,
      messages: messages,
      max_tokens: this.config.max_tokens ?? parseInt(process.env.OPENAI_MAX_TOKENS || '1024'),
      temperature: this.config.temperature ?? parseFloat(process.env.OPENAI_TEMPERATURE || '0'),
      top_p: this.config.top_p ?? parseFloat(process.env.OPENAI_TOP_P || '1'),
      presence_penalty:
        this.config.presence_penalty ?? parseFloat(process.env.OPENAI_PRESENCE_PENALTY || '0'),
      frequency_penalty:
        this.config.frequency_penalty ?? parseFloat(process.env.OPENAI_FREQUENCY_PENALTY || '0'),
      functions: this.config.functions || undefined,
      function_call: this.config.function_call || undefined,
      stop,
    };
    logger.debug(`Calling OpenAI API: ${JSON.stringify(body)}`);

    let data,
      cached = false;
    try {
      ({ data, cached } = (await fetchWithCache(
        `https://${this.getApiHost()}/v1/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.getApiKey()}`,
            ...(this.getOrganization() ? { 'OpenAI-Organization': this.getOrganization() } : {}),
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
      const output = message.content === null ? message.function_call : message.content;
      return {
        output,
        tokenUsage: cached
          ? { cached: data.usage.total_tokens }
          : {
              total: data.usage.total_tokens,
              prompt: data.usage.prompt_tokens,
              completion: data.usage.completion_tokens,
            },
        cached,
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
