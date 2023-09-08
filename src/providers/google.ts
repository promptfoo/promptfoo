import logger from '../logger';
import { fetchWithCache } from '../cache';
import { REQUEST_TIMEOUT_MS, parseChatPrompt } from './shared';

import type {
  ApiProvider,
  EnvOverrides,
  ProviderResponse,
} from '../types.js';

const DEFAULT_GOOGLE_HOST = 'generativelanguage.googleapis.com';

interface GoogleCompletionOptions {
  apiKey?: string;
  apiHost?: string;
}

class GoogleGenericProvider implements ApiProvider {
  modelName: string;

  config: GoogleCompletionOptions;
  env?: EnvOverrides;

  constructor(
    modelName: string,
    options: { config?: GoogleCompletionOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    const { config, id, env } = options;
    this.env = env;
    this.modelName = modelName;
    this.config = config || {};
    this.id = id ? () => id : this.id;
  }

  id(): string {
    return `google:${this.modelName}`;
  }

  toString(): string {
    return `[Google Provider ${this.modelName}]`;
  }

  getApiHost(): string | undefined {
    return (
      this.config.apiHost ||
      this.env?.GOOGLE_API_HOST ||
      process.env.GOOGLE_API_HOST ||
      DEFAULT_GOOGLE_HOST
    );
  }

  getApiKey(): string | undefined {
    return this.config.apiKey || this.env?.GOOGLE_API_KEY || process.env.GOOGLE_API_KEY;
  }

  // @ts-ignore: Prompt is not used in this implementation
  async callApi(prompt: string): Promise<ProviderResponse> {
    throw new Error('Not implemented');
  }
}

export class GoogleChatProvider extends GoogleGenericProvider {
  static GOOGLE_CHAT_MODELS = ['text-bison-001'];

  constructor(
    modelName: string,
    options: { config?: GoogleCompletionOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    if (!GoogleChatProvider.GOOGLE_CHAT_MODELS.includes(modelName)) {
      logger.warn(`Using unknown Google chat model: ${modelName}`);
    }
    super(modelName, options);
  }

  async callApi(prompt: string): Promise<ProviderResponse> {
    if (!this.getApiKey()) {
      throw new Error(
        'Google API key is not set. Set the GOOGLE_API_KEY environment variable or add `apiKey` to the provider config.',
      );
    }

    const messages = parseChatPrompt(prompt);

    const body = {
      prompt: { messages },
    };
    logger.debug(`Calling Google API: ${JSON.stringify(body)}`);

    let data;
    try {
      ({ data } = (await fetchWithCache(
        `https://${this.getApiHost()}/v1beta2/models/${this.modelName}:generateMessage?key=${this.getApiKey()}`,
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

    logger.debug(`\tGoogle API response: ${JSON.stringify(data)}`);
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
