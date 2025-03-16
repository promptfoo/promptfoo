import type { GaxiosError } from 'gaxios';
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
import { renderVarsInObject } from '../util';
import { maybeLoadFromExternalFile } from '../util';
import { isValidJson } from '../util/json';
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

interface Schema {
  type: 'TYPE_UNSPECIFIED' | 'STRING' | 'NUMBER' | 'INTEGER' | 'BOOLEAN' | 'ARRAY' | 'OBJECT';
  format?: string;
  description?: string;
  nullable?: boolean;
  enum?: string[];
  maxItems?: string;
  minItems?: string;
  properties?: { [key: string]: Schema };
  required?: string[];
  propertyOrdering?: string[];
  items?: Schema;
}

interface FunctionDeclaration {
  name: string;
  description: string;
  parameters?: Schema;
  response?: Schema;
}

export type FunctionParameters = Record<string, unknown>;

interface GoogleSearchRetrieval {
  dynamicRetrievalConfig: {
    mode?: 'MODE_UNSPECIFIED' | 'MODE_DYNAMIC';
    dynamicThreshold?: number;
  };
}

interface Tool {
  functionDeclarations?: FunctionDeclaration[];
  googleSearchRetrieval?: GoogleSearchRetrieval;
  codeExecution?: object;
  googleSearch?: object;
}

interface VertexCompletionOptions {
  apiKey?: string;
  apiHost?: string;
  projectId?: string;
  region?: string;
  publisher?: string;
  apiVersion?: string;
  anthropicVersion?: string;
  anthropic_version?: string; // Alternative format

  // https://ai.google.dev/api/rest/v1beta/models/streamGenerateContent#request-body
  context?: string;
  examples?: { input: string; output: string }[];
  safetySettings?: { category: string; probability: string }[];
  stopSequence?: string[];
  temperature?: number;
  maxOutputTokens?: number;
  max_tokens?: number; // Alternative format for Claude models
  topP?: number;
  top_p?: number; // Alternative format for Claude models
  topK?: number;
  top_k?: number; // Alternative format for Claude models

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

  tools?: Tool[];

  /**
   * If set, automatically call these functions when the assistant activates
   * these function tools.
   */
  functionToolCallbacks?: Record<string, (arg: string) => Promise<string>>;

  systemInstruction?: Content;

  /**
   * Model-specific configuration for Llama models
   */
  llamaConfig?: {
    safetySettings?: {
      enabled?: boolean;
      llama_guard_settings?: Record<string, unknown>;
    };
  };
}

// Claude API interfaces
interface ClaudeMessage {
  role: string;
  content: Array<{
    type: string;
    text: string;
  }>;
}

interface ClaudeRequest {
  anthropic_version: string;
  stream: boolean;
  max_tokens: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  messages: ClaudeMessage[];
}

interface ClaudeResponse {
  id: string;
  type: string;
  role: string;
  model: string;
  content: Array<{
    type: string;
    text: string;
  }>;
  stop_reason: string;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
    output_tokens: number;
  };
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
    if (this.modelName.includes('claude')) {
      return this.callClaudeApi(prompt, context);
    } else if (this.modelName.includes('gemini')) {
      return this.callGeminiApi(prompt, context);
    } else if (this.modelName.includes('llama')) {
      return this.callLlamaApi(prompt, context);
    }
    return this.callPalm2Api(prompt);
  }

  async callClaudeApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    const messages = parseChatPrompt(prompt, [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: prompt,
          },
        ],
      },
    ]);

    const body: ClaudeRequest = {
      anthropic_version:
        this.config.anthropicVersion || this.config.anthropic_version || 'vertex-2023-10-16',
      stream: false,
      max_tokens: this.config.max_tokens || this.config.maxOutputTokens || 512,
      temperature: this.config.temperature,
      top_p: this.config.top_p || this.config.topP,
      top_k: this.config.top_k || this.config.topK,
      messages,
    };

    logger.debug(`Preparing to call Claude API with body: ${JSON.stringify(body)}`);

    const cache = await getCache();
    const cacheKey = `vertex:claude:${this.modelName}:${JSON.stringify(body)}`;

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

    let data: ClaudeResponse;
    try {
      const { client, projectId } = await getGoogleClient();
      const url = `https://${this.getApiHost()}/v1/projects/${projectId}/locations/${this.getRegion()}/publishers/anthropic/models/${this.modelName}:rawPredict`;

      const res = await client.request({
        url,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
        },
        data: body,
        timeout: REQUEST_TIMEOUT_MS,
      });

      data = res.data as ClaudeResponse;
      logger.debug(`Claude API response: ${JSON.stringify(data)}`);
    } catch (err) {
      const error = err as GaxiosError;
      if (error.response && error.response.data) {
        logger.debug(`Claude API error:\n${JSON.stringify(error.response.data)}`);
        return {
          error: `API call error: ${JSON.stringify(error.response.data)}`,
        };
      }
      logger.debug(`Claude API error:\n${JSON.stringify(err)}`);
      return {
        error: `API call error: ${String(err)}`,
      };
    }

    try {
      // Extract the text from the response
      let output = '';
      if (data.content && data.content.length > 0) {
        for (const part of data.content) {
          if (part.type === 'text') {
            output += part.text;
          }
        }
      }

      if (!output) {
        return {
          error: `No output found in Claude API response: ${JSON.stringify(data)}`,
        };
      }

      // Extract token usage information
      const tokenUsage: TokenUsage = {
        total: data.usage.input_tokens + data.usage.output_tokens || 0,
        prompt: data.usage.input_tokens || 0,
        completion: data.usage.output_tokens || 0,
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
        error: `Claude API response error: ${String(err)}. Response data: ${JSON.stringify(data)}`,
      };
    }
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

    const cache = await getCache();
    const cacheKey = `vertex:${this.modelName}:${JSON.stringify(body)}`;

    let response;
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
        response = { ...parsedCachedResponse, cached: true };
      }
    }
    if (response === undefined) {
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
        const geminiError = err as GaxiosError;
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
          logger.debug(`Gemini API error:\n${JSON.stringify(errorDetails)}`);
          return {
            error: `API call error: Status ${status}, Code ${code}, Message:\n\n${message}`,
          };
        }
        logger.debug(`Gemini API error:\n${JSON.stringify(err)}`);
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
          } else if (datum.candidates && datum.candidates[0]?.finishReason !== 'STOP') {
            // e.g. MALFORMED_FUNCTION_CALL
            return {
              error: `Finish reason ${datum.candidates[0]?.finishReason}: ${JSON.stringify(data)}`,
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
        response = {
          cached: false,
          output,
          tokenUsage,
        };

        if (isCacheEnabled()) {
          await cache.set(cacheKey, JSON.stringify(response));
        }
      } catch (err) {
        return {
          error: `Gemini API response error: ${String(err)}. Response data: ${JSON.stringify(data)}`,
        };
      }
    }
    try {
      // Handle function tool callbacks
      if (this.config.functionToolCallbacks && isValidJson(response.output)) {
        const structured_output = JSON.parse(response.output);
        if (structured_output.functionCall) {
          const results = [];
          const functionName = structured_output.functionCall.name;
          if (this.config.functionToolCallbacks[functionName]) {
            try {
              const functionResult = await this.config.functionToolCallbacks[functionName](
                JSON.stringify(
                  typeof structured_output.functionCall.args === 'string'
                    ? JSON.parse(structured_output.functionCall.args)
                    : structured_output.functionCall.args,
                ),
              );
              results.push(functionResult);
            } catch (error) {
              logger.error(`Error executing function ${functionName}: ${error}`);
            }
          }
          if (results.length > 0) {
            response = {
              cached: response.cached,
              output: results.join('\n'),
              tokenUsage: response.tokenUsage,
            };
          }
        }
      }
    } catch (err) {
      return {
        error: `Tool callback error: ${String(err)}.`,
      };
    }
    return response;
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

  async callLlamaApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    // Validate region for Llama models (only available in us-central1)
    const region = this.getRegion();
    if (region !== 'us-central1') {
      return {
        error: `Llama models are only available in the us-central1 region. Current region: ${region}. Please set region: 'us-central1' in your configuration.`,
      };
    }

    // Parse the chat prompt into Llama format
    const messages = parseChatPrompt(prompt, [
      {
        role: 'user',
        content: prompt,
      },
    ]);

    // Define proper type for Llama model safety settings
    interface LlamaModelSafetySettings {
      enabled: boolean;
      llama_guard_settings: Record<string, unknown>;
    }

    // Validate llama_guard_settings if provided
    const llamaGuardSettings = this.config.llamaConfig?.safetySettings?.llama_guard_settings;
    if (
      llamaGuardSettings !== undefined &&
      (typeof llamaGuardSettings !== 'object' || llamaGuardSettings === null)
    ) {
      return {
        error: `Invalid llama_guard_settings: must be an object, received ${typeof llamaGuardSettings}`,
      };
    }

    // Extract safety settings from config - default to enabled if not specified
    const modelSafetySettings: LlamaModelSafetySettings = {
      enabled: this.config.llamaConfig?.safetySettings?.enabled !== false, // Default to true
      llama_guard_settings: llamaGuardSettings || {},
    };

    // Prepare the request body for Llama models
    const body = {
      model: `meta/${this.modelName}`,
      messages,
      max_tokens: this.config.maxOutputTokens || 1024,
      stream: false,
      temperature: this.config.temperature,
      top_p: this.config.topP,
      top_k: this.config.topK,
      extra_body: {
        google: {
          model_safety_settings: modelSafetySettings,
        },
      },
    };

    logger.debug(`Preparing to call Llama API with body: ${JSON.stringify(body)}`);

    const cache = await getCache();
    const cacheKey = `vertex:llama:${this.modelName}:${JSON.stringify(body)}`;

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

    // Define the expected response structure
    interface LlamaResponse {
      choices?: Array<{
        message: {
          content: string;
        };
      }>;
      usage?: {
        total_tokens: number;
        prompt_tokens: number;
        completion_tokens: number;
      };
    }

    let data: LlamaResponse;
    try {
      const { client, projectId } = await getGoogleClient();
      // Llama models use a different endpoint format
      const url = `https://${this.getRegion()}-aiplatform.googleapis.com/v1beta1/projects/${projectId}/locations/${this.getRegion()}/endpoints/openapi/chat/completions`;

      const res = await client.request<LlamaResponse>({
        url,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
        },
        data: body,
        timeout: REQUEST_TIMEOUT_MS,
      });

      data = res.data;
      logger.debug(`Llama API response: ${JSON.stringify(data)}`);
    } catch (err) {
      const error = err as GaxiosError;
      if (error.response && error.response.data) {
        logger.debug(`Llama API error:\n${JSON.stringify(error.response.data)}`);
        return {
          error: `API call error: ${JSON.stringify(error.response.data)}`,
        };
      }
      logger.debug(`Llama API error:\n${JSON.stringify(err)}`);
      return {
        error: `API call error: ${String(err)}`,
      };
    }

    try {
      // Extract the completion text from the response
      let output = '';
      if (data.choices && data.choices.length > 0) {
        output = data.choices[0].message.content;
      }

      if (!output) {
        return {
          error: `No output found in Llama API response: ${JSON.stringify(data)}`,
        };
      }

      // Extract token usage information if available
      const tokenUsage: TokenUsage = {
        total: data.usage?.total_tokens || 0,
        prompt: data.usage?.prompt_tokens || 0,
        completion: data.usage?.completion_tokens || 0,
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
        error: `Llama API response error: ${String(err)}. Response data: ${JSON.stringify(data)}`,
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
