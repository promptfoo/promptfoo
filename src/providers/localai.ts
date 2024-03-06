import logger from '../logger';
import { fetchWithCache } from '../cache';
import { REQUEST_TIMEOUT_MS, parseChatPrompt } from './shared';

import type {
  ApiProvider,
  EnvOverrides,
  ProviderEmbeddingResponse,
  ProviderOptions,
  ProviderResponse,
} from '../types.js';

interface LocalAiCompletionOptions {
  apiBaseUrl?: string;
  temperature?: number;
}

class LocalAiGenericProvider implements ApiProvider {
  modelName: string;
  options: ProviderOptions & { config?: LocalAiCompletionOptions };
  config: LocalAiCompletionOptions;
  apiBaseUrl: string;

  constructor(
    modelName: string,
    options: ProviderOptions & { config?: LocalAiCompletionOptions } = {},
  ) {
    this.modelName = modelName;
    this.options = options;
    this.config = options.config || {};
    this.apiBaseUrl =
      this.options.env?.LOCALAI_BASE_URL ||
      this.config.apiBaseUrl ||
      process.env.LOCALAI_BASE_URL ||
      'http://localhost:8080/v1';
  }

  get model(): string {
    return `localai:${this.modelName}`;
  }

  get label(): string {
    return this.options.label || this.model;
  }
  toString(): string {
    return `[LocalAI Provider ${this.modelName}]`;
  }

  // @ts-ignore: Prompt is not used in this implementation
  async callApi(prompt: string): Promise<ProviderResponse> {
    throw new Error('Not implemented');
  }
}

export class LocalAiChatProvider extends LocalAiGenericProvider {
  async callApi(prompt: string): Promise<ProviderResponse> {
    const messages = parseChatPrompt(prompt, [{ role: 'user', content: prompt }]);
    const body = {
      model: this.modelName,
      messages: messages,
      temperature: this.config.temperature || process.env.LOCALAI_TEMPERATURE || 0.7,
    };
    logger.debug(`Calling LocalAI API: ${JSON.stringify(body)}`);

    let data,
      cached = false;
    try {
      ({ data, cached } = (await fetchWithCache(
        `${this.apiBaseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
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
    logger.debug(`\tLocalAI API chat completions response: ${JSON.stringify(data)}`);
    try {
      return {
        output: data.choices[0].message.content,
      };
    } catch (err) {
      return {
        error: `API response error: ${String(err)}: ${JSON.stringify(data)}`,
      };
    }
  }
}

export class LocalAiEmbeddingProvider extends LocalAiGenericProvider {
  async callEmbeddingApi(text: string): Promise<ProviderEmbeddingResponse> {
    const body = {
      input: text,
      model: this.modelName,
    };
    let data,
      cached = false;
    try {
      ({ data, cached } = (await fetchWithCache(
        `${this.apiBaseUrl}/embeddings`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
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
    logger.debug(`\tLocalAI embeddings API response: ${JSON.stringify(data)}`);

    try {
      const embedding = data?.data?.[0]?.embedding;
      if (!embedding) {
        throw new Error('No embedding found in LocalAI embeddings API response');
      }
      return {
        embedding,
      };
    } catch (err) {
      return {
        error: `API response error: ${String(err)}: ${JSON.stringify(data)}`,
      };
    }
  }
}

export class LocalAiCompletionProvider extends LocalAiGenericProvider {
  async callApi(prompt: string): Promise<ProviderResponse> {
    const body = {
      model: this.modelName,
      prompt,
      temperature: this.config.temperature || process.env.LOCALAI_TEMPERATURE || 0.7,
    };
    logger.debug(`Calling LocalAI API: ${JSON.stringify(body)}`);

    let data,
      cached = false;
    try {
      ({ data, cached } = (await fetchWithCache(
        `${this.apiBaseUrl}/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
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
    logger.debug(`\tLocalAI completions API response: ${JSON.stringify(data)}`);
    try {
      return {
        output: data.choices[0].text,
      };
    } catch (err) {
      return {
        error: `API response error: ${String(err)}: ${JSON.stringify(data)}`,
      };
    }
  }
}
