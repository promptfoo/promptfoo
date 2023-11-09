import logger from '../logger';
import { fetchWithCache } from '../cache';
import { REQUEST_TIMEOUT_MS, parseChatPrompt } from './shared';

import type {
  ApiProvider,
  EnvOverrides,
  ProviderEmbeddingResponse,
  ProviderResponse,
} from '../types.js';

interface AzureOpenAiCompletionOptions {
  apiHost?: string;
  apiKey?: string;
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
  function_call?: 'none' | 'auto' | { name: string };
  stop?: string[];
  deployment_id?: string;
  dataSources?: any;
}

class AzureOpenAiGenericProvider implements ApiProvider {
  deploymentName: string;
  apiKey?: string;
  apiHost?: string;

  config: AzureOpenAiCompletionOptions;

  constructor(
    deploymentName: string,
    options: { config?: AzureOpenAiCompletionOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    const { config, id, env } = options;

    this.deploymentName = deploymentName;

    this.apiKey = config?.apiKey || env?.AZURE_OPENAI_API_KEY || process.env.AZURE_OPENAI_API_KEY;
    this.apiHost =
      config?.apiHost || env?.AZURE_OPENAI_API_HOST || process.env.AZURE_OPENAI_API_HOST;

    this.config = config || {};
    this.id = id ? () => id : this.id;
  }

  id(): string {
    return `azureopenai:${this.deploymentName}`;
  }

  toString(): string {
    return `[Azure OpenAI Provider ${this.deploymentName}]`;
  }

  // @ts-ignore: Prompt is not used in this implementation
  async callApi(prompt: string): Promise<ProviderResponse> {
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
          ? { cached: data.usage.total_tokens, total: data.usage.total_tokens }
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
        tokenUsage: cached
          ? {
              cached: data.usage.total_tokens,
              total: data.usage.total_tokens,
            }
          : {
              total: data?.usage?.total_tokens,
              prompt: data?.usage?.prompt_tokens,
              completion: data?.usage?.completion_tokens,
            },
      };
    }
  }
}

export class AzureOpenAiCompletionProvider extends AzureOpenAiGenericProvider {
  async callApi(prompt: string): Promise<ProviderResponse> {
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
        : this.config?.stop || ['<|im_end|>', '<|endoftext|>'];
    } catch (err) {
      throw new Error(`OPENAI_STOP is not a valid JSON string: ${err}`);
    }
    const body = {
      model: this.deploymentName,
      prompt,
      max_tokens: parseInt(process.env.OPENAI_MAX_TOKENS || '1024'),
      temperature: this.config.temperature ?? parseFloat(process.env.OPENAI_TEMPERATURE || '0'),
      top_p: this.config.top_p ?? parseFloat(process.env.OPENAI_TOP_P || '1'),
      presence_penalty:
        this.config.presence_penalty ?? parseFloat(process.env.OPENAI_PRESENCE_PENALTY || '0'),
      frequency_penalty:
        this.config.frequency_penalty ?? parseFloat(process.env.OPENAI_FREQUENCY_PENALTY || '0'),
      best_of: this.config.best_of ?? parseInt(process.env.OPENAI_BEST_OF || '1'),
      stop,
      ...(this.config.deployment_id ? { deployment_id: this.config.deployment_id } : {}),
      ...(this.config.dataSources ? { dataSources: this.config.dataSources } : {}),
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
          ? { cached: data.usage.total_tokens, total: data.usage.total_tokens }
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
  async callApi(prompt: string): Promise<ProviderResponse> {
    if (!this.apiKey) {
      throw new Error(
        'Azure OpenAI API key is not set. Set the AZURE_OPENAI_API_KEY environment variable or add `apiKey` to the provider config.',
      );
    }
    if (!this.apiHost) {
      throw new Error('Azure OpenAI API host must be set');
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
      model: this.deploymentName,
      messages: messages,
      max_tokens: parseInt(process.env.OPENAI_MAX_TOKENS || '1024'),
      temperature: this.config.temperature ?? parseFloat(process.env.OPENAI_TEMPERATURE || '0'),
      top_p: this.config.top_p ?? parseFloat(process.env.OPENAI_TOP_P || '1'),
      presence_penalty:
        this.config.presence_penalty ?? parseFloat(process.env.OPENAI_PRESENCE_PENALTY || '0'),
      frequency_penalty:
        this.config.frequency_penalty ?? parseFloat(process.env.OPENAI_FREQUENCY_PENALTY || '0'),
      functions: this.config.functions || undefined,
      function_call: this.config.function_call || undefined,
      stop,
      ...(this.config.deployment_id ? { deployment_id: this.config.deployment_id } : {}),
      ...(this.config.dataSources ? { dataSources: this.config.dataSources } : {}),
    };
    logger.debug(`Calling Azure OpenAI API: ${JSON.stringify(body)}`);

    let data,
      cached = false;
    try {
      const url = this.config.dataSources
        ? `https://${this.apiHost}/openai/deployments/${this.deploymentName}/extensions/chat/completions?api-version=2023-07-01-preview`
        : `https://${this.apiHost}/openai/deployments/${this.deploymentName}/chat/completions?api-version=2023-07-01-preview`;

      ({ data, cached } = (await fetchWithCache(
        url,
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
      const message = data.choices[0].messages.find(msg=>msg.role==='assistant');
      const output = message.content == null ? message.function_call : message.content;
      return {
        output,
        tokenUsage: cached
            ? { cached: data?.usage?.total_tokens, total: data?.usage?.total_tokens }
            : {
                total: data?.usage?.total_tokens,
                prompt: data?.usage?.prompt_tokens,
                completion: data?.usage?.completion_tokens,
            },
    };
    } catch (err) {
      return {
        error: `API response error: ${String(err)}: ${JSON.stringify(data)}`,
      };
    }
  }
}
