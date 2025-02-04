import { fetchWithCache } from '../cache';
import { getEnvFloat, getEnvString } from '../envars';
import logger from '../logger';
import type { ApiProvider, ProviderEmbeddingResponse, ProviderResponse } from '../types';
import type { EnvOverrides } from '../types/env';
import { REQUEST_TIMEOUT_MS, parseChatPrompt } from './shared';

interface LocalAiCompletionOptions {
  apiBaseUrl?: string;
  temperature?: number;
}

class LocalAiGenericProvider implements ApiProvider {
  modelName: string;
  apiBaseUrl: string;
  config: LocalAiCompletionOptions;

  constructor(
    modelName: string,
    options: { config?: LocalAiCompletionOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    const { id, config, env } = options;
    this.modelName = modelName;
    this.apiBaseUrl =
      config?.apiBaseUrl ||
      env?.LOCALAI_BASE_URL ||
      getEnvString('LOCALAI_BASE_URL') ||
      'http://localhost:8080/v1';
    this.config = config || {};
    this.id = id ? () => id : this.id;
  }

  id(): string {
    return `localai:${this.modelName}`;
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
      messages,
      temperature: this.config.temperature || getEnvFloat('LOCALAI_TEMPERATURE') || 0.7,
    };
    logger.debug(`Calling LocalAI API: ${JSON.stringify(body)}`);

    let data;
    try {
      ({ data } = (await fetchWithCache(
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
    let data;
    try {
      ({ data } = (await fetchWithCache(
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
      temperature: this.config.temperature || getEnvFloat('LOCALAI_TEMPERATURE') || 0.7,
    };
    logger.debug(`Calling LocalAI API: ${JSON.stringify(body)}`);

    let data;
    try {
      ({ data } = (await fetchWithCache(
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
