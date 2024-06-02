import logger from '../logger';
import { parseChatPrompt } from './shared';
import { getCache, isCacheEnabled } from '../cache';

import {
  maybeCoerceToGeminiFormat,
  type GeminiApiResponse,
  type GeminiResponseData,
  GeminiErrorResponse,
  Palm2ApiResponse,
} from './vertexUtil';

import type { GoogleAuth } from 'google-auth-library';

import type { ApiProvider, EnvOverrides, ProviderResponse, TokenUsage } from '../types.js';

let cachedAuth: GoogleAuth | undefined;
async function getGoogleClient() {
  if (!cachedAuth) {
    let GoogleAuth;
    try {
      const importedModule = await import('google-auth-library');
      GoogleAuth = importedModule.GoogleAuth;
    } catch (err) {
      throw new Error(
        'The google-auth-library package is required as a peer dependency. Please install it in your project or globally.',
      );
    }
    cachedAuth = new GoogleAuth({
      scopes: 'https://www.googleapis.com/auth/cloud-platform',
    });
  }
  const client = await cachedAuth.getClient();
  const projectId = await cachedAuth.getProjectId();
  return { client, projectId };
}

interface VertexCompletionOptions {
  apiKey?: string;
  apiHost?: string;
  projectId?: string;
  region?: string;
  publisher?: string;

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

interface Content {
  parts: Part[];
  role?: string;
}

interface Part {
  text?: string;
  inlineData?: Blob;
  functionCall?: FunctionCall;
  functionResponse?: FunctionResponse;
  fileData?: FileData;
}

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

  async getProjectId() {
    return (
      (await getGoogleClient()).projectId ||
      this.config.projectId ||
      this.env?.VERTEX_PROJECT_ID ||
      process.env.VERTEX_PROJECT_ID
    );
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
  // TODO(ian): Completion models
  // https://cloud.google.com/vertex-ai/generative-ai/docs/learn/model-versioning#gemini-model-versions
  static CHAT_MODELS = [
    'chat-bison',
    'chat-bison@001',
    'chat-bison@002',
    'chat-bison-32k',
    'chat-bison-32k@001',
    'chat-bison-32k@002',
    'codechat-bison',
    'codechat-bison@001',
    'codechat-bison@002',
    'codechat-bison-32k',
    'codechat-bison-32k@001',
    'codechat-bison-32k@002',
    'gemini-pro',
    'gemini-ultra',
    'gemini-1.0-pro-vision',
    'gemini-1.0-pro-vision-001',
    'gemini-1.0-pro',
    'gemini-1.0-pro-001',
    'gemini-1.0-pro-002',
    'gemini-pro-vision',
    'gemini-1.5-pro-latest',
    'gemini-1.5-pro-preview-0409',
    'gemini-1.5-pro-preview-0514',
    'gemini-1.5-flash-preview-0514',
    'aqa',
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
    if (this.modelName.includes('gemini')) {
      return this.callGeminiApi(prompt);
    }
    return this.callPalm2Api(prompt);
  }

  async callGeminiApi(prompt: string): Promise<ProviderResponse> {
    // https://cloud.google.com/vertex-ai/docs/generative-ai/model-reference/gemini#gemini-pro
    let contents = parseChatPrompt(prompt, {
      role: 'user',
      parts: {
        text: prompt,
      },
    });
    const { contents: updatedContents, coerced } = maybeCoerceToGeminiFormat(contents);
    if (coerced) {
      logger.debug(`Coerced JSON prompt to Gemini format: ${JSON.stringify(contents)}`);
      contents = updatedContents;
    }

    // https://ai.google.dev/api/rest/v1/models/streamGenerateContent
    const body = {
      contents,
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
      ...(this.config.systemInstruction
        ? { systemInstruction: this.config.systemInstruction }
        : {}),
    };
    logger.debug(`Preparing to call Google Vertex API (Gemini) with body: ${JSON.stringify(body)}`);

    const cache = await getCache();
    const cacheKey = `vertex:gemini:${JSON.stringify(body)}`;

    let cachedResponse;
    if (isCacheEnabled()) {
      cachedResponse = await cache.get(cacheKey);
      if (cachedResponse) {
        logger.debug(`Returning cached response for prompt: ${prompt}`);
        const parsedCachedResponse = JSON.parse(cachedResponse as string);
        const tokenUsage = parsedCachedResponse.tokenUsage as TokenUsage;
        if (tokenUsage) {
          tokenUsage.cached = tokenUsage.total;
        }
        return { ...parsedCachedResponse, cached: true };
      }
    }

    let data;
    try {
      const { client, projectId } = await getGoogleClient();
      const url = `https://${this.getApiHost()}/v1/projects/${projectId}/locations/${this.getRegion()}/publishers/${this.getPublisher()}/models/${
        this.modelName
      }:streamGenerateContent`;
      const res = await client.request({
        url,
        method: 'POST',
        data: body,
      });
      data = res.data as GeminiApiResponse;
    } catch (err) {
      const geminiError = err as any;
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
        error: `API call error: ${JSON.stringify(err, null, 2)}`,
      };
    }

    logger.debug(`Gemini API response: ${JSON.stringify(data)}`);
    try {
      const dataWithError = data as GeminiErrorResponse[];
      const error = dataWithError[0].error;
      if (error) {
        return {
          error: `Error ${error.code}: ${error.message}`,
        };
      }
      const dataWithResponse = data as GeminiResponseData[];
      const output = dataWithResponse
        .map((datum: GeminiResponseData) => {
          const part = datum.candidates[0].content.parts[0];
          if ('text' in part) {
            return part.text;
          }
          return JSON.stringify(part);
        })
        .join('');
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
        error: `Gemini API response error: ${String(err)}: ${JSON.stringify(data)}`,
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
        logger.debug(`Returning cached response for prompt: ${prompt}`);
        const parsedCachedResponse = JSON.parse(cachedResponse as string);
        const tokenUsage = parsedCachedResponse.tokenUsage as TokenUsage;
        if (tokenUsage) {
          tokenUsage.cached = tokenUsage.total;
        }
        return { ...parsedCachedResponse, cached: true };
      }
    }

    let data: Palm2ApiResponse;
    try {
      const { client, projectId } = await getGoogleClient();
      const url = `https://${this.getApiHost()}/v1/projects/${projectId}/locations/${this.getRegion()}/publishers/${this.getPublisher()}/models/${
        this.modelName
      }:predict`;
      const res = await client.request<Palm2ApiResponse>({
        url,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        data: body,
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
