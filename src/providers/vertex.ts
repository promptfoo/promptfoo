import Clone from 'rfdc';
import { getCache, isCacheEnabled } from '../cache';
import cliState from '../cliState';
import { getEnvString } from '../envars';
import logger from '../logger';
import type {
  ApiEmbeddingProvider,
  ApiProvider,
  CallApiContextParams,
  ProviderResponse,
  ProviderEmbeddingResponse,
  TokenUsage,
} from '../types';
import type { EnvOverrides } from '../types/env';
import { getNunjucksEngine } from '../util/templates';
import { parseChatPrompt, REQUEST_TIMEOUT_MS } from './shared';
import type { GeminiErrorResponse, GeminiFormat, Palm2ApiResponse } from './vertexUtil';
import {
  getGoogleClient,
  maybeCoerceToGeminiFormat,
  type GeminiApiResponse,
  type GeminiResponseData,
} from './vertexUtil';

interface Blob {
  mimeType: string;
  data: string; // base64-encoded string
}

interface FunctionCall {
  name: string;
  args?: { [key: string]: any };
}

interface FunctionResponse {
  name: string;
  response: { [key: string]: any };
}

interface FileData {
  mimeType?: string;
  fileUri: string;
}

interface Part {
  text?: string;
  inlineData?: Blob;
  functionCall?: FunctionCall;
  functionResponse?: FunctionResponse;
  fileData?: FileData;
}

interface Content {
  parts: Part[];
  role?: string;
}

interface VertexCompletionOptions {
  apiKey?: string;
  apiHost?: string;
  projectId?: string;
  region?: string;
  publisher?: string;
  apiVersion?: string;

  // https://ai.google.dev/api/rest/v1beta/models/streamGenerateContent#request-body
  context?: string;
  examples?: { input: string; output: string }[];
  safetySettings?: { category: string; probability: string }[];
  stopSequence?: string[];
  temperature?: number;
  maxOutputTokens?: number;
  topP?: number;
  topK?: number;

  generationConfig?: {
    context?: string;
    examples?: { input: string; output: string }[];
    stopSequence?: string[];
    temperature?: number;
    maxOutputTokens?: number;
    topP?: number;
    topK?: number;
  };

  toolConfig?: {
    functionCallingConfig?: {
      mode?: 'MODE_UNSPECIFIED' | 'AUTO' | 'ANY' | 'NONE';
      allowedFunctionNames?: string[];
    };
  };

  systemInstruction?: Content;
}

const clone = Clone();

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
      getEnvString('VERTEX_API_HOST') ||
      `${this.getRegion()}-aiplatform.googleapis.com`
    );
  }

  async getProjectId() {
    return (
      (await getGoogleClient()).projectId ||
      this.config.projectId ||
      this.env?.VERTEX_PROJECT_ID ||
      getEnvString('VERTEX_PROJECT_ID')
    );
  }

  getApiKey(): string | undefined {
    return this.config.apiKey || this.env?.VERTEX_API_KEY || getEnvString('VERTEX_API_KEY');
  }

  getRegion(): string {
    return (
      this.config.region ||
      this.env?.VERTEX_REGION ||
      getEnvString('VERTEX_REGION') ||
      'us-central1'
    );
  }

  getPublisher(): string | undefined {
    return (
      this.config.publisher ||
      this.env?.VERTEX_PUBLISHER ||
      getEnvString('VERTEX_PUBLISHER') ||
      'google'
    );
  }

  getApiVersion(): string {
    return (
      this.config.apiVersion ||
      this.env?.VERTEX_API_VERSION ||
      getEnvString('VERTEX_API_VERSION') ||
      'v1'
    );
  }

  // @ts-ignore: Prompt is not used in this implementation
  async callApi(prompt: string): Promise<ProviderResponse> {
    throw new Error('Not implemented');
  }
}

export class VertexChatProvider extends VertexGenericProvider {
  // TODO(ian): Completion models
  // https://cloud.google.com/vertex-ai/generative-ai/docs/learn/model-versioning#gemini-model-versions
  constructor(
    modelName: string,
    options: { config?: VertexCompletionOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    super(modelName, options);
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    if (this.modelName.includes('gemini')) {
      return this.callGeminiApi(prompt, context);
    }
    return this.callPalm2Api(prompt);
  }

  async callGeminiApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    // https://cloud.google.com/vertex-ai/docs/generative-ai/model-reference/gemini#gemini-pro
    let contents: GeminiFormat | { role: string; parts: { text: string } } = parseChatPrompt(
      prompt,
      {
        role: 'user',
        parts: {
          text: prompt,
        },
      },
    );
    const {
      contents: updatedContents,
      coerced,
      systemInstruction: parsedSystemInstruction,
    } = maybeCoerceToGeminiFormat(contents);
    if (coerced) {
      logger.debug(`Coerced JSON prompt to Gemini format: ${JSON.stringify(contents)}`);
      contents = updatedContents;
    }

    let systemInstruction: Content | undefined = parsedSystemInstruction;
    if (this.config.systemInstruction && !systemInstruction) {
      // Make a copy
      systemInstruction = clone(this.config.systemInstruction);
      if (systemInstruction && context?.vars) {
        const nunjucks = getNunjucksEngine();
        for (const part of systemInstruction.parts) {
          if (part.text) {
            part.text = nunjucks.renderString(part.text, context.vars);
          }
        }
      }
    }
    // https://ai.google.dev/api/rest/v1/models/streamGenerateContent
    const body = {
      contents: contents as GeminiFormat,
      generationConfig: {
        context: this.config.context,
        examples: this.config.examples,
        stopSequence: this.config.stopSequence,
        temperature: this.config.temperature,
        maxOutputTokens: this.config.maxOutputTokens,
        topP: this.config.topP,
        topK: this.config.topK,
        ...this.config.generationConfig,
      },
      ...(this.config.safetySettings ? { safetySettings: this.config.safetySettings } : {}),
      ...(this.config.toolConfig ? { toolConfig: this.config.toolConfig } : {}),
      ...(systemInstruction ? { systemInstruction } : {}),
    };
    logger.debug(`Preparing to call Google Vertex API (Gemini) with body: ${JSON.stringify(body)}`);

    const cache = await getCache();
    const cacheKey = `vertex:gemini:${JSON.stringify(body)}`;

    let cachedResponse;
    if (isCacheEnabled()) {
      cachedResponse = await cache.get(cacheKey);
      if (cachedResponse) {
        const parsedCachedResponse = JSON.parse(cachedResponse as string);
        const tokenUsage = parsedCachedResponse.tokenUsage as TokenUsage;
        if (tokenUsage) {
          tokenUsage.cached = tokenUsage.total;
        }
        logger.debug(`Returning cached response: ${cachedResponse}`);
        return { ...parsedCachedResponse, cached: true };
      }
    }

    let data;
    try {
      const { client, projectId } = await getGoogleClient();
      const url = `https://${this.getApiHost()}/${this.getApiVersion()}/projects/${projectId}/locations/${this.getRegion()}/publishers/${this.getPublisher()}/models/${
        this.modelName
      }:streamGenerateContent`;
      const res = await client.request({
        url,
        method: 'POST',
        data: body,
        timeout: REQUEST_TIMEOUT_MS,
      });
      data = res.data as GeminiApiResponse;
      logger.debug(`Gemini API response: ${JSON.stringify(data)}`);
    } catch (err) {
      const geminiError = err as any;
      logger.debug(
        `Gemini API error:\nString:\n${String(geminiError)}\nJSON:\n${JSON.stringify(geminiError)}]`,
      );
      if (
        geminiError.response &&
        geminiError.response.data &&
        geminiError.response.data[0] &&
        geminiError.response.data[0].error
      ) {
        const errorDetails = geminiError.response.data[0].error;
        const code = errorDetails.code;
        const message = errorDetails.message;
        const status = errorDetails.status;
        return {
          error: `API call error: Status ${status}, Code ${code}, Message:\n\n${message}`,
        };
      }
      return {
        error: `API call error: ${String(err)}`,
      };
    }

    logger.debug(`Gemini API response: ${JSON.stringify(data)}`);
    try {
      const dataWithError = data as GeminiErrorResponse[];
      const error = dataWithError[0]?.error;
      if (error) {
        return {
          error: `Error ${error.code}: ${error.message}`,
        };
      }
      const dataWithResponse = data as GeminiResponseData[];
      let output = '';
      for (const datum of dataWithResponse) {
        if (datum.candidates && datum.candidates[0]?.content?.parts) {
          for (const candidate of datum.candidates) {
            if (candidate.content?.parts) {
              for (const part of candidate.content.parts) {
                if ('text' in part) {
                  output += part.text;
                } else {
                  output += JSON.stringify(part);
                }
              }
            }
          }
        } else if (datum.candidates && datum.candidates[0]?.finishReason === 'SAFETY') {
          if (cliState.config?.redteam) {
            // Refusals are not errors during redteams, they're actually successes.
            return {
              output: 'Content was blocked due to safety settings.',
            };
          }
          return {
            error: 'Content was blocked due to safety settings.',
          };
        }
      }

      if ('promptFeedback' in data[0] && data[0].promptFeedback?.blockReason) {
        if (cliState.config?.redteam) {
          // Refusals are not errors during redteams, they're actually successes.
          return {
            output: `Content was blocked due to safety settings: ${data[0].promptFeedback.blockReason}`,
          };
        }
        return {
          error: `Content was blocked due to safety settings: ${data[0].promptFeedback.blockReason}`,
        };
      }

      if (!output) {
        return {
          error: `No output found in response: ${JSON.stringify(data)}`,
        };
      }

      const lastData = dataWithResponse[dataWithResponse.length - 1];
      const tokenUsage = {
        total: lastData.usageMetadata?.totalTokenCount || 0,
        prompt: lastData.usageMetadata?.promptTokenCount || 0,
        completion: lastData.usageMetadata?.candidatesTokenCount || 0,
      };
      const response = {
        cached: false,
        output,
        tokenUsage,
      };

      if (isCacheEnabled()) {
        await cache.set(cacheKey, JSON.stringify(response));
      }

      return response;
    } catch (err) {
      return {
        error: `Gemini API response error: ${String(err)}. Response data: ${JSON.stringify(data)}`,
      };
    }
  }

  async callPalm2Api(prompt: string): Promise<ProviderResponse> {
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
    logger.debug(`Calling Vertex Palm2 API: ${JSON.stringify(body)}`);

    const cache = await getCache();
    const cacheKey = `vertex:palm2:${JSON.stringify(body)}`;

    let cachedResponse;
    if (isCacheEnabled()) {
      cachedResponse = await cache.get(cacheKey);
      if (cachedResponse) {
        const parsedCachedResponse = JSON.parse(cachedResponse as string);
        const tokenUsage = parsedCachedResponse.tokenUsage as TokenUsage;
        if (tokenUsage) {
          tokenUsage.cached = tokenUsage.total;
        }
        logger.debug(`Returning cached response: ${cachedResponse}`);
        return { ...parsedCachedResponse, cached: true };
      }
    }

    let data: Palm2ApiResponse;
    try {
      const { client, projectId } = await getGoogleClient();
      const url = `https://${this.getApiHost()}/${this.getApiVersion()}/projects/${projectId}/locations/${this.getRegion()}/publishers/${this.getPublisher()}/models/${
        this.modelName
      }:predict`;
      const res = await client.request<Palm2ApiResponse>({
        url,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        data: body,
        timeout: REQUEST_TIMEOUT_MS,
      });
      data = res.data;
    } catch (err) {
      return {
        error: `API call error: ${JSON.stringify(err)}`,
      };
    }

    logger.debug(`Vertex Palm2 API response: ${JSON.stringify(data)}`);
    try {
      if (data.error) {
        return {
          error: `Error ${data.error.code}: ${data.error.message}`,
        };
      }
      const output = data.predictions?.[0].candidates[0].content;

      const response = {
        output,
        cached: false,
      };

      if (isCacheEnabled()) {
        await cache.set(cacheKey, JSON.stringify(response));
      }

      return response;
    } catch (err) {
      return {
        error: `API response error: ${String(err)}: ${JSON.stringify(data)}`,
      };
    }
  }
}

export class VertexEmbeddingProvider implements ApiEmbeddingProvider {
  modelName: string;
  config: any;
  env?: any;

  constructor(modelName: string, config: any = {}, env?: any) {
    this.modelName = modelName;
    this.config = config;
    this.env = env;
  }

  id() {
    return `vertex:${this.modelName}`;
  }

  getRegion(): string {
    return this.config.region || 'us-central1';
  }

  getApiVersion(): string {
    return this.config.apiVersion || 'v1';
  }

  async callApi(): Promise<ProviderResponse> {
    throw new Error('Vertex API does not provide text inference.');
  }

  async callEmbeddingApi(input: string): Promise<ProviderEmbeddingResponse> {
    // See https://cloud.google.com/vertex-ai/generative-ai/docs/embeddings/get-text-embeddings#get_text_embeddings_for_a_snippet_of_text
    const body = {
      instances: [{ content: input }],
      parameters: {
        autoTruncate: this.config.autoTruncate || false,
      },
    };

    let data: any;
    try {
      const { client, projectId } = await getGoogleClient();
      const url = `https://${this.getRegion()}-aiplatform.googleapis.com/${this.getApiVersion()}/projects/${projectId}/locations/${this.getRegion()}/publishers/google/models/${
        this.modelName
      }:predict`;
      const res = await client.request<any>({
        url,
        method: 'POST',
        data: body,
      });
      data = res.data;
    } catch (err) {
      logger.error(`Vertex API call error: ${err}`);
      throw err;
    }

    logger.debug(`Vertex embeddings API response: ${JSON.stringify(data)}`);

    try {
      const embedding = data.predictions[0].embeddings.values;
      const tokenCount = data.predictions[0].embeddings.statistics.token_count;
      return {
        embedding,
        tokenUsage: {
          total: tokenCount,
        },
      };
    } catch (err) {
      logger.error(`Error parsing Vertex embeddings API response: ${err}`);
      throw err;
    }
  }
}

export const DefaultGradingProvider = new VertexChatProvider('gemini-1.5-pro');
export const DefaultEmbeddingProvider = new VertexEmbeddingProvider('text-embedding-004');
