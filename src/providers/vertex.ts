import logger from '../logger';
import { fetchWithCache } from '../cache';
import { parseChatPrompt, REQUEST_TIMEOUT_MS } from './shared';

import type { ApiProvider, EnvOverrides, ProviderResponse } from '../types.js';
import type { GeminiApiResponse, ResponseData } from './vertexUtil';

interface VertexCompletionOptions {
  apiKey?: string;
  apiHost?: string;
  projectId?: string;
  region?: string;
  publisher?: string;

  context?: string;
  examples?: { input: string; output: string }[];
  safetySettings?: { category: string; probability: string }[];
  stopSequence?: string[];
  temperature?: number;
  maxOutputTokens?: number;
  topP?: number;
  topK?: number;
}

class VertexGenericProvider implements ApiProvider {
  modelName: string;

  config: VertexCompletionOptions;
  env?: EnvOverrides;

  constructor(
    modelName: string,
    options: { config?: VertexCompletionOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    const { config, id, env } = options;
    this.env = env;
    this.modelName = modelName;
    this.config = config || {};
    this.id = id ? () => id : this.id;
  }

  id(): string {
    return `vertex:${this.modelName}`;
  }

  toString(): string {
    return `[Google Vertex Provider ${this.modelName}]`;
  }

  getApiHost(): string | undefined {
    return (
      this.config.apiHost ||
      this.env?.VERTEX_API_HOST ||
      process.env.VERTEX_API_HOST ||
      `${this.getRegion()}-aiplatform.googleapis.com`
    );
  }

  getProjectId(): string | undefined {
    return this.config.projectId || this.env?.VERTEX_PROJECT_ID || process.env.VERTEX_PROJECT_ID;
  }

  getApiKey(): string | undefined {
    return this.config.apiKey || this.env?.VERTEX_API_KEY || process.env.VERTEX_API_KEY;
  }

  getRegion(): string {
    return (
      this.config.region || this.env?.VERTEX_REGION || process.env.VERTEX_REGION || 'us-central1'
    );
  }

  getPublisher(): string | undefined {
    return (
      this.config.publisher ||
      this.env?.VERTEX_PUBLISHER ||
      process.env.VERTEX_PUBLISHER ||
      'google'
    );
  }

  // @ts-ignore: Prompt is not used in this implementation
  async callApi(prompt: string): Promise<ProviderResponse> {
    throw new Error('Not implemented');
  }
}

export class VertexChatProvider extends VertexGenericProvider {
  static CHAT_MODELS = [
    'chat-bison',
    'chat-bison@001',
    'chat-bison-32k',
    'chat-bison-32k@001',
    'codechat-bison',
    'codechat-bison@001',
    'codechat-bison-32k',
    'codechat-bison-32k@001',
    'gemini-pro',
    'gemini-ultra',
  ];

  constructor(
    modelName: string,
    options: { config?: VertexCompletionOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    if (!VertexChatProvider.CHAT_MODELS.includes(modelName)) {
      logger.warn(`Using unknown Google Vertex chat model: ${modelName}`);
    }
    super(modelName, options);
  }

  async callApi(prompt: string): Promise<ProviderResponse> {
    if (!this.getApiKey()) {
      throw new Error(
        'Google Vertex API key is not set. Set the VERTEX_API_KEY environment variable or add `apiKey` to the provider config. You can get an API token by running `gcloud auth print-access-token`',
      );
    }
    if (!this.getProjectId()) {
      throw new Error(
        'Google Vertex project ID is not set. Set the VERTEX_PROJECT_ID environment variable or add `projectId` to the provider config.',
      );
    }

    if (this.modelName.includes('gemini')) {
      return this.callGeminiApi(prompt);
    }
    return this.callPalm2Api(prompt);
  }

  async callGeminiApi(prompt: string): Promise<ProviderResponse> {
    // https://cloud.google.com/vertex-ai/docs/generative-ai/model-reference/gemini#gemini-pro
    let contents: string | object | undefined;
    try {
      // Chat or multimodal
      contents = JSON.parse(prompt);
    } catch (err) {
      contents = {
        role: 'user',
        parts: {
          text: prompt,
        },
      };
    }

    const body = {
      contents,
      generation_config: {
        context: this.config.context,
        examples: this.config.examples,
        safetySettings: this.config.safetySettings,
        stopSequence: this.config.stopSequence,
        temperature: this.config.temperature,
        maxOutputTokens: this.config.maxOutputTokens,
        topP: this.config.topP,
        topK: this.config.topK,
      },
    };
    logger.debug(`Calling Google Vertex API (Gemini): ${JSON.stringify(body)}`);

    let data, cached;
    try {
      ({ cached, data } = await fetchWithCache(
        // POST https://us-central1-aiplatform.googleapis.com/
        `https://${this.getApiHost()}/v1/projects/${this.getProjectId()}/locations/${this.getRegion()}/publishers/${this.getPublisher()}/models/${
          this.modelName
        }:streamGenerateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.getApiKey()}`,
          },
          body: JSON.stringify(body),
        },
        REQUEST_TIMEOUT_MS,
      )) as unknown as { cached: boolean; data: GeminiApiResponse };
    } catch (err) {
      return {
        error: `API call error: ${String(err)}`,
      };
    }

    logger.debug(`\tGemini API response: ${JSON.stringify(data)}`);
    try {
      if (data.error) {
        return {
          error: `Error ${data.error.code}: ${data.error.message}`,
        };
      }
      const output = data
        .map((datum: ResponseData) => {
          const part = datum.candidates[0].content.parts[0];
          if ('text' in part) {
            return part.text;
          }
          return JSON.stringify(part);
        })
        .join('');
      const lastData = data[data.length - 1];
      const tokenUsage = cached
        ? lastData.usageMetadata.totalTokenCount
        : {
            total: lastData.usageMetadata.totalTokenCount,
            prompt: lastData.usageMetadata.promptTokenCount,
            completion: lastData.usageMetadata.completionTokenCount,
          };
      return {
        output,
        tokenUsage,
      };
    } catch (err) {
      return {
        error: `Gemini API response error: ${String(err)}: ${JSON.stringify(data)}`,
      };
    }
  }

  async callPalm2Api(prompt: string): Promise<ProviderResponse> {
    // https://cloud.google.com/vertex-ai/docs/generative-ai/model-reference/text-chat#generative-ai-text-chat-drest
    const instances = parseChatPrompt(prompt, [
      {
        messages: [
          {
            author: 'user',
            content: prompt,
          },
        ],
      },
    ]);

    const body = {
      instances,
      parameters: {
        context: this.config.context,
        examples: this.config.examples,
        safetySettings: this.config.safetySettings,
        stopSequence: this.config.stopSequence,
        temperature: this.config.temperature,
        maxOutputTokens: this.config.maxOutputTokens,
        topP: this.config.topP,
        topK: this.config.topK,
      },
    };
    logger.debug(`Calling Google Vertex API: ${JSON.stringify(body)}`);

    let data;
    try {
      ({ data } = (await fetchWithCache(
        // POST https://us-central1-aiplatform.googleapis.com/
        `https://${this.getApiHost()}/v1/projects/${this.getProjectId()}/locations/${this.getRegion()}/publishers/${this.getPublisher()}/models/${
          this.modelName
        }:predict`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.getApiKey()}`,
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

    logger.debug(`\tVertex API response: ${JSON.stringify(data)}`);
    try {
      if (data.error) {
        return {
          error: `Error ${data.error.code}: ${data.error.message}`,
        };
      }
      const output = data.predictions[0].candidates[0].content;
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
