import logger from '../logger';
import { fetchWithCache } from '../cache';
import { parseChatPrompt, REQUEST_TIMEOUT_MS } from './shared';

import type { ApiProvider, EnvOverrides, ProviderOptions, ProviderResponse } from '../types.js';

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
  generationConfig?: Record<string, any>;
}

class PalmGenericProvider implements ApiProvider {
  modelName: string;
  options: ProviderOptions & { config?: PalmCompletionOptions };
  config: PalmCompletionOptions;

  constructor(
    modelName: string,
    options: ProviderOptions & { config?: PalmCompletionOptions } = {},
  ) {
    this.modelName = modelName;
    this.options = options;
    this.config = options.config || {};
  }

  get model() {
    return `palm:${this.modelName}`;
  }

  get label() {
    return this.options.label || this.model;
  }
  toString(): string {
    return `[Google AI Studio Provider ${this.modelName}]`;
  }

  getApiHost(): string | undefined {
    return (
      this.config.apiHost ||
      this.options.env?.GOOGLE_API_HOST ||
      this.options.env?.PALM_API_HOST ||
      process.env.GOOGLE_API_HOST ||
      process.env.PALM_API_HOST ||
      DEFAULT_API_HOST
    );
  }

  getApiKey(): string | undefined {
    return (
      this.config.apiKey ||
      this.options.env?.GOOGLE_API_KEY ||
      this.options.env?.PALM_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      process.env.PALM_API_KEY
    );
  }

  // @ts-ignore: Prompt is not used in this implementation
  async callApi(prompt: string): Promise<ProviderResponse> {
    throw new Error('Not implemented');
  }
}

export class PalmChatProvider extends PalmGenericProvider {
  static CHAT_MODELS = ['chat-bison-001', 'gemini-pro', 'gemini-pro-vision'];

  constructor(
    modelName: string,
    options: ProviderOptions & { config?: PalmCompletionOptions } = {},
  ) {
    if (!PalmChatProvider.CHAT_MODELS.includes(modelName)) {
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

    const isGemini = this.modelName.startsWith('gemini');
    if (isGemini) {
      return this.callGemini(prompt);
    }

    // https://developers.generativeai.google/tutorials/curl_quickstart
    // https://ai.google.dev/api/rest/v1beta/models/generateMessage
    const messages = parseChatPrompt(prompt, [{ content: prompt }]);
    const body = {
      prompt: { messages },
      temperature: this.config.temperature,
      topP: this.config.topP,
      topK: this.config.topK,

      safetySettings: this.config.safetySettings,
      stopSequences: this.config.stopSequences,
      maxOutputTokens: this.config.maxOutputTokens,
    };
    logger.debug(`Calling Google API: ${JSON.stringify(body)}`);

    let data;
    try {
      ({ data } = (await fetchWithCache(
        `https://${this.getApiHost()}/v1beta3/models/${
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

    logger.debug(`\tGoogle API response: ${JSON.stringify(data)}`);

    if (!data?.candidates || data.candidates.length === 0) {
      return {
        error: `API did not return any candidate responses: ${JSON.stringify(data)}`,
      };
    }

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

  async callGemini(prompt: string): Promise<ProviderResponse> {
    const contents = parseChatPrompt(prompt, [{ parts: [{ text: prompt }] }]);
    const body = {
      contents,
      generationConfig: {
        temperature: this.config.temperature,
        topP: this.config.topP,
        topK: this.config.topK,
        stopSequences: this.config.stopSequences,
        maxOutputTokens: this.config.maxOutputTokens,
        ...this.config.generationConfig,
      },
      safetySettings: this.config.safetySettings,
    };
    logger.debug(`Calling Google API: ${JSON.stringify(body)}`);

    let data;
    try {
      // https://ai.google.dev/docs/gemini_api_overview#curl
      // https://ai.google.dev/tutorials/rest_quickstart
      ({ data } = (await fetchWithCache(
        `https://${this.getApiHost()}/v1beta/models/${
          this.modelName
        }:generateContent?key=${this.getApiKey()}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        },
        REQUEST_TIMEOUT_MS,
      )) as {
        data: {
          candidates: Array<{
            content: { parts: Array<{ text: string }> };
            safetyRatings: Array<{ category: string; probability: string }>;
          }>;
          promptFeedback?: { safetyRatings: Array<{ category: string; probability: string }> };
        };
      });
    } catch (err) {
      return {
        error: `API call error: ${String(err)}`,
      };
    }

    logger.debug(`\tGoogle API response: ${JSON.stringify(data)}`);

    if (!data?.candidates || data.candidates.length === 0) {
      return {
        error: `API did not return any candidate responses: ${JSON.stringify(data)}`,
      };
    }

    const candidate = data.candidates[0];
    const parts = candidate.content.parts.map((part) => part.text).join('');

    try {
      return {
        output: parts,
      };
    } catch (err) {
      return {
        error: `API response error: ${String(err)}: ${JSON.stringify(data)}`,
      };
    }
  }
}
