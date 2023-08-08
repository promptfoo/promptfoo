import logger from '../logger';
import { fetchWithCache } from '../cache';
import { REQUEST_TIMEOUT_MS, parseChatPrompt } from './shared';

import type { ApiProvider, ProviderResponse } from '../types.js';

class LocalAiGenericProvider implements ApiProvider {
  modelName: string;
  apiBaseUrl: string;

  constructor(modelName: string) {
    this.modelName = modelName;
    this.apiBaseUrl = process.env.LOCALAI_BASE_URL || 'http://localhost:8080/v1';
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
    const messages = parseChatPrompt(prompt);
    const body = {
      model: this.modelName,
      messages: messages,
      temperature: process.env.LOCALAI_TEMPERATURE || 0.7,
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
    logger.debug(`	LocalAI API response: ${JSON.stringify(data)}`);
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

export class LocalAiCompletionProvider extends LocalAiGenericProvider {
  async callApi(prompt: string): Promise<ProviderResponse> {
    const body = {
      model: this.modelName,
      prompt,
      temperature: process.env.LOCALAI_TEMPERATURE || 0.7,
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
    logger.debug(`	LocalAI API response: ${JSON.stringify(data)}`);
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
