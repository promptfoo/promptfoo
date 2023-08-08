import logger from '../logger';
import { fetchWithCache } from '../cache';
import { REQUEST_TIMEOUT_MS, parseChatPrompt } from './shared';

import type { ApiProvider, ProviderEmbeddingResponse, ProviderResponse } from '../types.js';

interface AzureOpenAiCompletionOptions {
  temperature?: number;
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
}

class AzureOpenAiGenericProvider implements ApiProvider {
  deploymentName: string;
  apiKey?: string;
  apiHost?: string;

  constructor(deploymentName: string, apiKey?: string) {
    this.deploymentName = deploymentName;

    this.apiKey = apiKey || process.env.AZURE_OPENAI_API_KEY;

    this.apiHost = process.env.AZURE_OPENAI_API_HOST;
  }

  id(): string {
    return `azureopenai:${this.deploymentName}`;
  }

  toString(): string {
    return `[Azure OpenAI Provider ${this.deploymentName}]`;
  }

  // @ts-ignore: Prompt is not used in this implementation
  async callApi(prompt: string, options?: AzureOpenAiCompletionOptions): Promise<ProviderResponse> {
    throw new Error('Not implemented');
  }
}

export class AzureOpenAiEmbeddingProvider extends AzureOpenAiGenericProvider {
  async callEmbeddingApi(text: string): Promise<ProviderEmbeddingResponse> {
    if (!this.apiKey) {
      throw new Error('Azure OpenAI API key must be set for similarity comparison');
    }
    if (!this.apiHost) {
      throw new Error('Azure OpenAI API host must be set');
    }

    const body = {
      input: text,
      model: this.deploymentName,
    };
    let data,
      cached = false;
    try {
      ({ data, cached } = (await fetchWithCache(
        `https://${this.apiHost}/openai/deployments/${this.deploymentName}/embeddings?api-version=2023-07-01-preview`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': this.apiKey,
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
    logger.debug(`\tAzure OpenAI API response (embeddings): ${JSON.stringify(data)}`);

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

export class AzureOpenAiCompletionProvider extends AzureOpenAiGenericProvider {
  options: AzureOpenAiCompletionOptions;

  constructor(
    deploymentName: string,
    apiKey?: string,
    context?: AzureOpenAiCompletionOptions,
    id?: string,
  ) {
    super(deploymentName, apiKey);
    this.options = context || {};
    this.id = id ? () => id : this.id;
  }

  async callApi(prompt: string, options?: AzureOpenAiCompletionOptions): Promise<ProviderResponse> {
    if (!this.apiKey) {
      throw new Error(
        'Azure OpenAI API key is not set. Set AZURE_OPENAI_API_KEY environment variable or pass it as an argument to the constructor.',
      );
    }
    if (!this.apiHost) {
      throw new Error('Azure OpenAI API host must be set');
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
      model: this.deploymentName,
      prompt,
      max_tokens: parseInt(process.env.OPENAI_MAX_TOKENS || '1024'),
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
    logger.debug(`Calling Azure OpenAI API: ${JSON.stringify(body)}`);
    let data,
      cached = false;
    try {
      ({ data, cached } = (await fetchWithCache(
        `https://${this.apiHost}/openai/deployments/${this.deploymentName}/completions?api-version=2023-07-01-preview`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': this.apiKey,
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
    logger.debug(`\tAzure OpenAI API response: ${JSON.stringify(data)}`);
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

export class AzureOpenAiChatCompletionProvider extends AzureOpenAiGenericProvider {
  options: AzureOpenAiCompletionOptions;

  constructor(
    deploymentName: string,
    apiKey?: string,
    context?: AzureOpenAiCompletionOptions,
    id?: string,
  ) {
    super(deploymentName, apiKey);
    this.options = context || {};
    this.id = id ? () => id : this.id;
  }

  async callApi(prompt: string, options?: AzureOpenAiCompletionOptions): Promise<ProviderResponse> {
    if (!this.apiKey) {
      throw new Error(
        'Azure OpenAI API key is not set. Set AZURE_OPENAI_API_KEY environment variable or pass it as an argument to the constructor.',
      );
    }
    if (!this.apiHost) {
      throw new Error('Azure OpenAI API host must be set');
    }

    const messages = parseChatPrompt(prompt);
    const body = {
      model: this.deploymentName,
      messages: messages,
      max_tokens: parseInt(process.env.OPENAI_MAX_TOKENS || '1024'),
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
    logger.debug(`Calling Azure OpenAI API: ${JSON.stringify(body)}`);

    let data,
      cached = false;
    try {
      ({ data, cached } = (await fetchWithCache(
        `https://${this.apiHost}/openai/deployments/${this.deploymentName}/chat/completions?api-version=2023-07-01-preview`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': this.apiKey,
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

    logger.debug(`\tAzure OpenAI API response: ${JSON.stringify(data)}`);
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
