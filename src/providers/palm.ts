import { fetchWithCache } from '../cache';
import { getEnvString } from '../envars';
import logger from '../logger';
import type { ApiProvider, ProviderResponse, CallApiContextParams } from '../types';
import type { EnvOverrides } from '../types/env';
import { maybeLoadFromExternalFile, renderVarsInObject } from '../util';
import { CHAT_MODELS } from './googleShared';
import { parseChatPrompt, REQUEST_TIMEOUT_MS } from './shared';
import { maybeCoerceToGeminiFormat } from './vertexUtil';

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
  responseSchema?: string;
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
    return `[Google AI Studio Provider ${this.modelName}]`;
  }

  getApiHost(): string | undefined {
    return (
      this.config.apiHost ||
      this.env?.GOOGLE_API_HOST ||
      this.env?.PALM_API_HOST ||
      getEnvString('GOOGLE_API_HOST') ||
      getEnvString('PALM_API_HOST') ||
      DEFAULT_API_HOST
    );
  }

  getApiKey(): string | undefined {
    return (
      this.config.apiKey ||
      this.env?.GOOGLE_API_KEY ||
      this.env?.PALM_API_KEY ||
      getEnvString('GOOGLE_API_KEY') ||
      getEnvString('PALM_API_KEY')
    );
  }

  // @ts-ignore: Prompt is not used in this implementation
  async callApi(prompt: string): Promise<ProviderResponse> {
    throw new Error('Not implemented');
  }
}

export class PalmChatProvider extends PalmGenericProvider {
  constructor(
    modelName: string,
    options: { config?: PalmCompletionOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    if (!CHAT_MODELS.includes(modelName)) {
      logger.debug(`Using unknown Google chat model: ${modelName}`);
    }
    super(modelName, options);
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    if (!this.getApiKey()) {
      throw new Error(
        'Google API key is not set. Set the GOOGLE_API_KEY environment variable or add `apiKey` to the provider config.',
      );
    }

    const isGemini = this.modelName.startsWith('gemini');
    if (isGemini) {
      return this.callGemini(prompt, context);
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

  async callGemini(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    const { contents, systemInstruction } = maybeCoerceToGeminiFormat(
      parseChatPrompt(prompt, [{ content: prompt }]),
    );
    const body: Record<string, any> = {
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
      ...(systemInstruction ? { system_instruction: systemInstruction } : {}),
    };

    if (this.config.responseSchema) {
      // If the `response_schema` has already been set by the client.
      if (body.generationConfig.response_schema) {
        throw new Error(
          '`responseSchema` provided but `generationConfig.response_schema` already set.',
        );
      }

      const schema = maybeLoadFromExternalFile(
        renderVarsInObject(this.config.responseSchema, context?.vars),
      );

      body.generationConfig.response_schema = schema;
      body.generationConfig.response_mime_type = 'application/json';
    }

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
