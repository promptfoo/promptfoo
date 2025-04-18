import type { GaxiosError } from 'gaxios';
import { getCache, isCacheEnabled } from '../../cache';
import cliState from '../../cliState';
import { getEnvString } from '../../envars';
import logger from '../../logger';
import type {
  ApiEmbeddingProvider,
  ApiProvider,
  CallApiContextParams,
  ProviderResponse,
  ProviderEmbeddingResponse,
  TokenUsage,
} from '../../types';
import type { EnvOverrides } from '../../types/env';
import { isValidJson } from '../../util/json';
import { parseChatPrompt, REQUEST_TIMEOUT_MS } from '../shared';
import type { ClaudeRequest, ClaudeResponse, CompletionOptions } from './types';
import type { Part } from './types';
import type {
  GeminiApiResponse,
  GeminiErrorResponse,
  GeminiFormat,
  GeminiResponseData,
  Palm2ApiResponse,
} from './util';
import {
  geminiFormatAndSystemInstructions,
  getCandidate,
  getGoogleClient,
  loadFile,
  formatCandidateContents,
} from './util';

class VertexGenericProvider implements ApiProvider {
  modelName: string;

  config: CompletionOptions;
  env?: EnvOverrides;

  constructor(
    modelName: string,
    options: { config?: CompletionOptions; id?: string; env?: EnvOverrides } = {},
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
    options: { config?: CompletionOptions; id?: string; env?: EnvOverrides } = {},
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
    const { contents, systemInstruction } = geminiFormatAndSystemInstructions(
      prompt,
      context?.vars,
      this.config.systemInstruction,
    );

    // Override API version if needed for specific models
    let apiVersion = this.getApiVersion();
    if (
      this.modelName.includes('gemini-2.5-flash') &&
      apiVersion === 'v1' &&
      !this.config.apiVersion
    ) {
      logger.debug(`Using v1beta API for Gemini 2.5 Flash model instead of v1`);
      apiVersion = 'v1beta';
    }

    // https://ai.google.dev/api/rest/v1/models/streamGenerateContent
    const body = {
      contents: contents as GeminiFormat,
      generationConfig: {
        context: this.config.context,
        examples: this.config.examples,
        stopSequences: this.config.stopSequences,
        temperature: this.config.temperature,
        maxOutputTokens: this.config.maxOutputTokens,
        topP: this.config.topP,
        topK: this.config.topK,
        ...this.config.generationConfig,
      },
      ...(this.config.safetySettings ? { safetySettings: this.config.safetySettings } : {}),
      ...(this.config.toolConfig ? { toolConfig: this.config.toolConfig } : {}),
      ...(this.config.tools ? { tools: loadFile(this.config.tools, context?.vars) } : {}),
      ...(systemInstruction ? { systemInstruction } : {}),
    };

    // Add thinking configuration for Gemini 2.5 models
    if (this.config.thinkingConfig && this.modelName.includes('2.5')) {
      // For clarity and to accommodate both API versions, use thinking_config
      (body as any).thinking_config = {
        ...(this.config.thinkingConfig.thinking_budget !== undefined && {
          thinking_budget: this.config.thinkingConfig.thinking_budget,
        }),
        ...(this.config.thinkingConfig.thinkingBudget !== undefined && {
          thinking_budget: this.config.thinkingConfig.thinkingBudget,
        }),
      };

      logger.debug(
        `Added thinking configuration: ${JSON.stringify((body as any).thinking_config)}`,
      );
    }

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
        const url = `https://${this.getApiHost()}/${apiVersion}/projects/${projectId}/locations/${this.getRegion()}/publishers/${this.getPublisher()}/models/${
          this.modelName
        }:streamGenerateContent`;

        logger.debug(`Making API request to ${url}`);
        logger.debug(`For model: ${this.modelName}`);

        const res = await client.request({
          url,
          method: 'POST',
          data: body,
          timeout: REQUEST_TIMEOUT_MS,
        });
        data = res.data as GeminiApiResponse;
        logger.debug(`Gemini API response type: ${typeof data}`);
        logger.debug(`Gemini API response structure: ${Array.isArray(data) ? 'Array' : 'Object'}`);
        logger.debug(`Gemini API response: ${JSON.stringify(data, null, 2)}`);
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

      try {
        const dataWithError = data as GeminiErrorResponse[];
        const error = dataWithError[0]?.error;
        if (error) {
          return {
            error: `Error ${error.code}: ${error.message}`,
          };
        }

        const dataWithResponse = data as GeminiResponseData[];
        let output = null;

        for (const datum of dataWithResponse) {
          const candidate = getCandidate(datum);

          if (candidate.finishReason && candidate.finishReason === 'SAFETY') {
            const finishReason = 'Content was blocked due to safety settings.';
            if (cliState.config?.redteam) {
              // Refusals are not errors during redteams, they're actually successes.
              return { output: finishReason };
            }
            return { error: finishReason };
          } else if (candidate.finishReason && candidate.finishReason !== 'STOP') {
            // e.g. MALFORMED_FUNCTION_CALL
            return {
              error: `Finish reason ${candidate.finishReason}: ${JSON.stringify(data)}`,
            };
          } else if (datum.promptFeedback?.blockReason) {
            const blockReason = `Content was blocked due to safety settings: ${datum.promptFeedback.blockReason}`;
            if (cliState.config?.redteam) {
              // Refusals are not errors during redteams, they're actually successes.
              return { output: blockReason };
            }
            return { error: blockReason };
          } else if (candidate.content?.parts) {
            // Gemini 2.5 models with thinking may return different response structures
            // Try to handle both standard format and thinking format
            let formattedContent;
            try {
              formattedContent = formatCandidateContents(candidate);
              // If this is a Gemini 2.5 model with thinking, look for thinking content
              if (this.config.thinkingConfig && this.modelName.includes('2.5')) {
                logger.debug(
                  `Checking for thinking content in candidate: ${JSON.stringify(candidate)}`,
                );
                if (candidate.thinking) {
                  logger.debug(`Found thinking content: ${JSON.stringify(candidate.thinking)}`);
                }
              }
            } catch (formatError) {
              logger.debug(`Error formatting candidate content: ${formatError}`);
              return {
                error: `Error parsing response content: ${String(formatError)}. Response: ${JSON.stringify(candidate)}`,
              };
            }

            output = mergeParts(output, formattedContent);
          } else {
            // Try to find response content in unexpected structure for Gemini 2.5
            if (this.modelName.includes('2.5')) {
              logger.debug(`Attempting to extract content from non-standard response structure`);

              // Try different possible structures
              if (datum.candidates && datum.candidates[0]?.content?.parts) {
                const parts = datum.candidates[0].content.parts;
                output = mergeParts(
                  output,
                  formatCandidateContents({
                    content: { parts },
                    safetyRatings: [],
                  }),
                );
                logger.debug(`Found content in datum.candidates[0].content.parts`);
              } else if (
                datum.response &&
                datum.response.candidates &&
                datum.response.candidates[0]?.content
              ) {
                const parts = datum.response.candidates[0].content.parts;
                output = mergeParts(
                  output,
                  formatCandidateContents({
                    content: { parts },
                    safetyRatings: [],
                  }),
                );
                logger.debug(`Found content in datum.response.candidates[0].content`);
              } else {
                // Last resort - try to find any text content
                logger.debug(
                  `Searching for text content in non-standard response: ${JSON.stringify(datum)}`,
                );
                // Stringify the response and look for potential output
                return {
                  error: `Could not find response content in API response. Full response: ${JSON.stringify(datum)}`,
                };
              }
            } else {
              return {
                error: `No output found in response: ${JSON.stringify(data)}`,
              };
            }
          }
        }

        if (output === null) {
          return {
            error: `Could not extract any content from the API response: ${JSON.stringify(data)}`,
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
        stopSequences: this.config.stopSequences,
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

export function mergeParts(parts1: Part[] | string | undefined | null, parts2: Part[] | string) {
  if (parts1 === undefined || parts1 === null) {
    return parts2;
  }

  if (typeof parts1 === 'string' && typeof parts2 === 'string') {
    return parts1 + parts2;
  }

  const array1: Part[] = typeof parts1 === 'string' ? [{ text: parts1 }] : parts1;

  const array2: Part[] = typeof parts2 === 'string' ? [{ text: parts2 }] : parts2;

  array1.push(...array2);

  return array1;
}
