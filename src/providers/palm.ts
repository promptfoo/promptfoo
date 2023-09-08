import logger from '../logger';
import { fetchWithCache } from '../cache';
import { parseChatPrompt, REQUEST_TIMEOUT_MS } from './shared';

import type { ApiProvider, EnvOverrides, ProviderResponse } from '../types.js';

const DEFAULT_API_HOST = 'generativelanguage.googleapis.com';

interface PalmCompletionOptions {
  apiKey?: string;
  apiHost?: string;
  safetySettings?: { category: string; probability: string }[];
  stopSequences?: string[];
  temperature?: number;
  maxOutputTokens?: number;
  topP?: number;
  topK?: number;
}

class PalmGenericProvider implements ApiProvider {
  modelName: string;

  config: PalmCompletionOptions;
  env?: EnvOverrides;

  constructor(
    modelName: string,
    options: { config?: PalmCompletionOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    const { config, id, env } = options;
    this.env = env;
    this.modelName = modelName;
    this.config = config || {};
    this.id = id ? () => id : this.id;
  }

  id(): string {
    return `palm:${this.modelName}`;
  }

  toString(): string {
    return `[Google PaLM Provider ${this.modelName}]`;
  }

  getApiHost(): string | undefined {
    return (
      this.config.apiHost ||
      this.env?.PALM_API_HOST ||
      process.env.PALM_API_HOST ||
      DEFAULT_API_HOST
    );
  }

  getApiKey(): string | undefined {
    return this.config.apiKey || this.env?.PALM_API_KEY || process.env.PALM_API_KEY;
  }

  // @ts-ignore: Prompt is not used in this implementation
  async callApi(prompt: string): Promise<ProviderResponse> {
    throw new Error('Not implemented');
  }
}

export class PalmChatProvider extends PalmGenericProvider {
  static CHAT_MODELS = ['chat-bison-001'];

  constructor(
    modelName: string,
    options: { config?: PalmCompletionOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    if (!PalmChatProvider.CHAT_MODELS.includes(modelName)) {
      logger.warn(`Using unknown Google PaLM chat model: ${modelName}`);
    }
    super(modelName, options);
  }

  async callApi(prompt: string): Promise<ProviderResponse> {
    if (!this.getApiKey()) {
      throw new Error(
        'Google PaLM API key is not set. Set the PALM_API_KEY environment variable or add `apiKey` to the provider config.',
      );
    }

    // https://developers.generativeai.google/tutorials/curl_quickstart
    const messages = parseChatPrompt(prompt, [{ content: prompt }]);
    const body = {
      prompt: { messages },
      safetySettings: this.config.safetySettings,
      stopSequences: this.config.stopSequences,
      temperature: this.config.temperature,
      maxOutputTokens: this.config.maxOutputTokens,
      topP: this.config.topP,
      topK: this.config.topK,
    };
    logger.debug(`Calling Google PaLM API: ${JSON.stringify(body)}`);

    let data;
    try {
      ({ data } = (await fetchWithCache(
        `https://${this.getApiHost()}/v1beta2/models/${
          this.modelName
        }:generateMessage?key=${this.getApiKey()}`,
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

    logger.debug(`\tPaLM API response: ${JSON.stringify(data)}`);
    try {
      const output = data.candidates[0].content;
      return {
        output,
      };
    } catch (err) {
      return {
        error: `API response error: ${String(err)}: ${JSON.stringify(data)}`,
      };
    }
  }
}
