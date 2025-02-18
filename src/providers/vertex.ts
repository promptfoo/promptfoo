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
import { renderVarsInObject, maybeLoadFromExternalFile } from '../util';
import { getNunjucksEngine } from '../util/templates';
import { parseMessages } from './anthropic';
import { formatClaudeMessages, formatClaudeResponse, type ClaudeResponse } from './claudeUtil';
import { parseChatPrompt, REQUEST_TIMEOUT_MS } from './shared';
import { calculateCost } from './shared';
import type { GeminiErrorResponse, GeminiFormat, Palm2ApiResponse } from './vertexUtil';
import {
  getGoogleClient,
  maybeCoerceToGeminiFormat,
  type GeminiApiResponse,
  type GeminiResponseData,
} from './vertexUtil';

// Simplified interfaces
interface Part {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  functionCall?: { name: string; args?: Record<string, any> };
  functionResponse?: { name: string; response: Record<string, any> };
  fileData?: { mimeType?: string; fileUri: string };
}

interface Content {
  parts: Part[];
  role?: string;
}

interface Schema {
  type: 'TYPE_UNSPECIFIED' | 'STRING' | 'NUMBER' | 'INTEGER' | 'BOOLEAN' | 'ARRAY' | 'OBJECT';
  format?: string;
  description?: string;
  nullable?: boolean;
  enum?: string[];
  maxItems?: string;
  minItems?: string;
  properties?: Record<string, Schema>;
  required?: string[];
  propertyOrdering?: string[];
  items?: Schema;
}

interface Tool {
  functionDeclarations?: Array<{
    name: string;
    description: string;
    parameters?: Schema;
    response?: Schema;
  }>;
  googleSearchRetrieval?: {
    dynamicRetrievalConfig: {
      mode?: 'MODE_UNSPECIFIED' | 'MODE_DYNAMIC';
      dynamicThreshold?: number;
    };
  };
  codeExecution?: object;
  googleSearch?: object;
}

interface VertexConfig {
  apiKey?: string;
  apiHost?: string;
  projectId?: string;
  region?: string;
  publisher?: string;
  apiVersion?: string;
  cost?: { input?: number; output?: number };
  context?: string;
  examples?: Array<{ input: string; output: string }>;
  safetySettings?: Array<{ category: string; probability: string }>;
  stopSequence?: string[];
  temperature?: number;
  maxOutputTokens?: number;
  topP?: number;
  topK?: number;
  generationConfig?: {
    context?: string;
    examples?: Array<{ input: string; output: string }>;
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
  tools?: Tool[];
  systemInstruction?: Content;
}

const clone = Clone();

// Consolidated model costs
const CLAUDE_MODEL_COSTS = {
  'claude-3-haiku': { input: 0.00025 / 1000, output: 0.00125 / 1000 },
  'claude-3-opus': { input: 0.015 / 1000, output: 0.075 / 1000 },
  'claude-3-5-haiku': { input: 1 / 1e6, output: 5 / 1e6 },
  'claude-3-sonnet': { input: 3 / 1e6, output: 15 / 1e6 },
  'claude-3-5-sonnet': { input: 3 / 1e6, output: 15 / 1e6 },
};

const VERTEX_CLAUDE_MODELS = [
  ...Object.entries(CLAUDE_MODEL_COSTS).flatMap(([baseModel, costs]) => [
    { id: `${baseModel}@20240307`, cost: costs },
    { id: `${baseModel}-latest`, cost: costs },
  ]),
];

// Base provider with common functionality
class VertexGenericProvider implements ApiProvider {
  protected modelName: string;
  public config: VertexConfig;
  protected env?: EnvOverrides;

  constructor(
    modelName: string,
    options: { config?: VertexConfig; id?: string; env?: EnvOverrides } = {},
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

  protected getConfig(key: keyof EnvOverrides, defaultValue?: string): string {
    return (
      (this.config[key as keyof VertexConfig] as string) ||
      this.env?.[key] ||
      getEnvString(key) ||
      defaultValue ||
      ''
    );
  }

  getApiHost(): string {
    return this.getConfig('VERTEX_API_HOST') || `${this.getRegion()}-aiplatform.googleapis.com`;
  }

  async getProjectId(): Promise<string> {
    return (await getGoogleClient()).projectId || this.getConfig('VERTEX_PROJECT_ID');
  }

  getApiKey(): string | undefined {
    return this.getConfig('VERTEX_API_KEY');
  }

  getRegion(): string {
    return (
      this.config.region ||
      this.env?.VERTEX_REGION ||
      getEnvString('VERTEX_REGION') ||
      'us-central1'
    );
  }

  getPublisher(): string {
    return this.getConfig('VERTEX_PUBLISHER', 'google');
  }

  getApiVersion(): string {
    return this.getConfig('VERTEX_API_VERSION', 'v1');
  }

  async callApi(prompt: string): Promise<ProviderResponse> {
    throw new Error('Not implemented');
  }

  protected async handleCachedResponse(cacheKey: string): Promise<ProviderResponse | null> {
    if (!isCacheEnabled()) {
      return null;
    }

    const cache = await getCache();
    const cachedResponse = await cache.get(cacheKey);
    if (!cachedResponse) {
      return null;
    }

    const parsedResponse = JSON.parse(cachedResponse as string);
    const tokenUsage = parsedResponse.tokenUsage as TokenUsage;
    if (tokenUsage) {
      tokenUsage.cached = tokenUsage.total;
    }
    return { ...parsedResponse, cached: true };
  }

  protected async cacheResponse(cacheKey: string, response: ProviderResponse): Promise<void> {
    if (!isCacheEnabled()) {
      return;
    }
    const cache = await getCache();
    await cache.set(cacheKey, JSON.stringify(response));
  }
}

export class VertexChatProvider extends VertexGenericProvider {
  constructor(
    modelName: string,
    options: { config?: VertexConfig; id?: string; env?: EnvOverrides } = {},
  ) {
    super(modelName, options);
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    if (this.modelName.includes('claude')) {
      return this.#callClaudeApi(prompt, context);
    }
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
      ...(this.config.tools
        ? { tools: maybeLoadFromExternalFile(renderVarsInObject(this.config.tools, context?.vars)) }
        : {}),
      ...(systemInstruction ? { systemInstruction } : {}),
    };
    logger.debug(`Preparing to call Google Vertex API (Gemini) with body: ${JSON.stringify(body)}`);

    const cacheKey = `vertex:${this.modelName}:${JSON.stringify(body)}`;
    const cachedResponse = await this.handleCachedResponse(cacheKey);
    if (cachedResponse) {
      return cachedResponse;
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

      await this.cacheResponse(cacheKey, response);

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

    const cacheKey = `vertex:palm2:${JSON.stringify(body)}`;
    const cachedResponse = await this.handleCachedResponse(cacheKey);
    if (cachedResponse) {
      return cachedResponse;
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

      await this.cacheResponse(cacheKey, response);

      return response;
    } catch (err) {
      return {
        error: `API response error: ${String(err)}: ${JSON.stringify(data)}`,
      };
    }
  }

  async #callClaudeApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    // Parse messages using the same format as Anthropic/Bedrock
    const { system, extractedMessages } = parseMessages(prompt);
    const instance = formatClaudeMessages(extractedMessages, system);

    const body = {
      instances: [
        {
          messages: instance.messages,
          context: instance.system,
        },
      ],
      parameters: {
        temperature: this.config.temperature,
        maxOutputTokens: this.config.maxOutputTokens,
        topP: this.config.topP,
        topK: this.config.topK,
        stopSequences: this.config.stopSequence,
      },
    };

    logger.debug(`Preparing to call Google Vertex API (Claude) with body: ${JSON.stringify(body)}`);

    const cacheKey = `vertex:${this.modelName}:${JSON.stringify(body)}`;
    const cachedResponse = await this.handleCachedResponse(cacheKey);
    if (cachedResponse) {
      return cachedResponse;
    }

    try {
      const { client, projectId } = await getGoogleClient();
      const url = `https://${this.getApiHost()}/${this.getApiVersion()}/projects/${projectId}/locations/${this.getRegion()}/publishers/anthropic/models/${this.modelName}:predict`;

      let apiResponse;
      let retryCount = 0;
      const maxRetries = 3;

      while (retryCount <= maxRetries) {
        try {
          apiResponse = await client.request<ClaudeResponse>({
            url,
            method: 'POST',
            data: body,
            timeout: REQUEST_TIMEOUT_MS,
          });
          break;
        } catch (err: any) {
          if (err.status === 429 || err.response?.status === 429) {
            if (retryCount === maxRetries) {
              throw err;
            }
            logger.debug(`Rate limited by Vertex API, attempt ${retryCount + 1}/${maxRetries}`);
            // Use exponential backoff with jitter
            const waitTime = Math.min(1000 * Math.pow(2, retryCount) + Math.random() * 1000, 60000);
            await new Promise((resolve) => setTimeout(resolve, waitTime));
            retryCount++;
            continue;
          }
          throw err;
        }
      }

      if (!apiResponse) {
        throw new Error('Failed to get response from Vertex API after retries');
      }

      const data = apiResponse.data;
      logger.debug(`Claude API response: ${JSON.stringify(data)}`);

      const formattedResponse = formatClaudeResponse(data);
      if ('error' in formattedResponse) {
        return formattedResponse;
      }

      const modelConfig = VERTEX_CLAUDE_MODELS.find((m) => m.id === this.modelName);
      const response = {
        ...formattedResponse,
        cached: false,
        cost:
          modelConfig && formattedResponse.tokenUsage
            ? calculateCost(
                this.modelName,
                { cost: modelConfig.cost.input },
                formattedResponse.tokenUsage.prompt,
                formattedResponse.tokenUsage.completion,
                VERTEX_CLAUDE_MODELS,
              )
            : undefined,
      };

      await this.cacheResponse(cacheKey, response);

      return response;
    } catch (err) {
      logger.error(`Claude API error: ${String(err)} ${JSON.stringify(err)}`);
      return {
        error: `API call error: ${String(err)} ${JSON.stringify(err)}`,
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
