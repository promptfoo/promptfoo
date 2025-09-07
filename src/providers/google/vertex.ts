import path from 'path';

import { getCache, isCacheEnabled } from '../../cache';
import cliState from '../../cliState';
import { getEnvString } from '../../envars';
import { importModule } from '../../esm';
import logger from '../../logger';
import {
  type GenAISpanContext,
  type GenAISpanResult,
  withGenAISpan,
} from '../../tracing/genaiTracer';
import { fetchWithProxy } from '../../util/fetch/index';
import { maybeLoadFromExternalFile } from '../../util/file';
import { isJavascriptFile } from '../../util/fileExtensions';
import { maybeLoadToolsFromExternalFile, renderVarsInObject } from '../../util/index';
import { isValidJson } from '../../util/json';
import { MCPClient } from '../mcp/client';
import { transformMCPToolsToGoogle } from '../mcp/transform';
import { parseChatPrompt, REQUEST_TIMEOUT_MS } from '../shared';
import {
  formatCandidateContents,
  geminiFormatAndSystemInstructions,
  getCandidate,
  getGoogleClient,
  loadCredentials,
  mergeParts,
  normalizeTools,
  resolveProjectId,
} from './util';

import type { EnvOverrides } from '../../types/env';
import type {
  ApiEmbeddingProvider,
  ApiProvider,
  CallApiContextParams,
  GuardrailResponse,
  ProviderEmbeddingResponse,
  ProviderResponse,
  TokenUsage,
} from '../../types/index';
import type { ClaudeRequest, ClaudeResponse, CompletionOptions } from './types';
import type {
  GeminiApiResponse,
  GeminiErrorResponse,
  GeminiFormat,
  GeminiResponseData,
  Palm2ApiResponse,
} from './util';

// Type for Google API errors - using 'any' to avoid gaxios dependency
type GaxiosError = any;

function getVertexApiHost(
  region: string,
  configApiHost?: string,
  envOverrides?: EnvOverrides,
): string {
  return (
    configApiHost ||
    envOverrides?.VERTEX_API_HOST ||
    getEnvString('VERTEX_API_HOST') ||
    (region === 'global' ? 'aiplatform.googleapis.com' : `${region}-aiplatform.googleapis.com`)
  );
}

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

  getApiHost(): string {
    return getVertexApiHost(this.getRegion(), this.config.apiHost, this.env);
  }

  async getProjectId(): Promise<string> {
    return await resolveProjectId(this.config, this.env);
  }

  getApiKey(): string | undefined {
    // For Vertex provider, prioritize VERTEX_API_KEY over GEMINI_API_KEY
    return (
      this.config.apiKey ||
      this.env?.VERTEX_API_KEY ||
      this.env?.GEMINI_API_KEY ||
      getEnvString('VERTEX_API_KEY') ||
      getEnvString('GEMINI_API_KEY')
    );
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

  /**
   * Helper method to get Google client with credentials support
   */
  async getClientWithCredentials() {
    const credentials = loadCredentials(this.config.credentials);
    const { client } = await getGoogleClient({ credentials });
    return client;
  }

  // @ts-ignore: Prompt is not used in this implementation
  async callApi(_prompt: string): Promise<ProviderResponse> {
    throw new Error('Not implemented');
  }
}

export class VertexChatProvider extends VertexGenericProvider {
  private mcpClient: MCPClient | null = null;
  private initializationPromise: Promise<void> | null = null;
  private loadedFunctionCallbacks: Record<string, Function> = {};

  constructor(
    modelName: string,
    options: { config?: CompletionOptions; id?: string; env?: EnvOverrides } = {},
  ) {
    super(modelName, options);
    if (this.config.mcp?.enabled) {
      this.initializationPromise = this.initializeMCP();
    }
  }

  private async initializeMCP(): Promise<void> {
    this.mcpClient = new MCPClient(this.config.mcp!);
    await this.mcpClient.initialize();
  }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    // Determine the system based on model name
    let system = 'vertex';
    if (this.modelName.includes('claude')) {
      system = 'vertex:anthropic';
    } else if (this.modelName.includes('gemini')) {
      system = 'vertex:gemini';
    } else if (this.modelName.includes('llama')) {
      system = 'vertex:llama';
    } else {
      system = 'vertex:palm2';
    }

    // Set up tracing context
    const spanContext: GenAISpanContext = {
      system,
      operationName: 'chat',
      model: this.modelName,
      providerId: this.id(),
      temperature: this.config.temperature,
      topP: this.config.topP,
      maxTokens: this.config.maxOutputTokens || this.config.max_tokens,
      testIndex: context?.test?.vars?.__testIdx as number | undefined,
      promptLabel: context?.prompt?.label,
      // W3C Trace Context for linking to evaluation trace
      traceparent: context?.traceparent,
    };

    // Result extractor to set response attributes on the span
    const resultExtractor = (response: ProviderResponse): GenAISpanResult => {
      const result: GenAISpanResult = {};
      if (response.tokenUsage) {
        result.tokenUsage = {
          prompt: response.tokenUsage.prompt,
          completion: response.tokenUsage.completion,
          total: response.tokenUsage.total,
        };
      }
      return result;
    };

    return withGenAISpan(spanContext, () => this.callApiInternal(prompt, context), resultExtractor);
  }

  private async callApiInternal(
    prompt: string,
    context?: CallApiContextParams,
  ): Promise<ProviderResponse> {
    if (this.modelName.includes('claude')) {
      return this.callClaudeApi(prompt, context);
    } else if (this.modelName.includes('gemini')) {
      return this.callGeminiApi(prompt, context);
    } else if (this.modelName.includes('llama')) {
      return this.callLlamaApi(prompt, context);
    }
    return this.callPalm2Api(prompt);
  }

  async callClaudeApi(prompt: string, _context?: CallApiContextParams): Promise<ProviderResponse> {
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
      const client = await this.getClientWithCredentials();
      const projectId = await this.getProjectId();
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
        numRequests: 1,
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

  /**
   * Check if express mode should be used (API key without OAuth)
   * Express mode uses a simplified endpoint format without project/location.
   *
   * Express mode is AUTOMATIC when:
   * 1. API key is available (VERTEX_API_KEY or GEMINI_API_KEY), AND
   * 2. No explicit projectId in config, AND
   * 3. No explicit credentials in config, AND
   * 4. User hasn't explicitly disabled it (expressMode !== false)
   *
   * This mirrors how AWS Bedrock handles authentication - automatic detection
   * of the simplest auth method available.
   */
  private isExpressMode(): boolean {
    const hasApiKey = Boolean(this.getApiKey());
    const hasExplicitProjectId = Boolean(this.config.projectId);
    const hasExplicitCredentials = Boolean(this.config.credentials);
    const explicitlyDisabled = this.config.expressMode === false;

    // Express mode is automatic when API key is available and no explicit OAuth config
    return hasApiKey && !hasExplicitProjectId && !hasExplicitCredentials && !explicitlyDisabled;
  }

  async callGeminiApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    if (this.initializationPromise) {
      await this.initializationPromise;
    }

    // Merge configs from the provider and the prompt
    const config = {
      ...this.config,
      ...context?.prompt?.config,
    };

    // https://cloud.google.com/vertex-ai/docs/generative-ai/model-reference/gemini#gemini-pro
    const { contents, systemInstruction } = geminiFormatAndSystemInstructions(
      prompt,
      context?.vars,
      config.systemInstruction,
      { useAssistantRole: config.useAssistantRole },
    );
    // --- MCP tool injection logic ---
    const mcpTools = this.mcpClient ? transformMCPToolsToGoogle(this.mcpClient.getAllTools()) : [];
    const fileTools = config.tools
      ? await maybeLoadToolsFromExternalFile(config.tools, context?.vars)
      : [];
    const allTools = [
      ...mcpTools,
      ...(Array.isArray(fileTools) ? normalizeTools(fileTools) : fileTools ? [fileTools] : []),
    ];
    // --- End MCP tool injection logic ---
    // https://ai.google.dev/api/rest/v1/models/streamGenerateContent
    const body = {
      contents: contents as GeminiFormat,
      generationConfig: {
        context: config.context,
        examples: config.examples,
        stopSequences: config.stopSequences,
        temperature: config.temperature,
        maxOutputTokens: config.maxOutputTokens,
        topP: config.topP,
        topK: config.topK,
        ...config.generationConfig,
      },
      ...(config.safetySettings ? { safetySettings: config.safetySettings } : {}),
      ...(config.toolConfig ? { toolConfig: config.toolConfig } : {}),
      ...(allTools.length > 0 ? { tools: allTools } : {}),
      ...(systemInstruction ? { systemInstruction } : {}),
      // Model Armor integration: inject template configuration for prompt/response screening
      // See: https://cloud.google.com/security-command-center/docs/model-armor-vertex-integration
      ...(config.modelArmor &&
        (config.modelArmor.promptTemplate || config.modelArmor.responseTemplate) && {
          model_armor_config: {
            ...(config.modelArmor.promptTemplate && {
              prompt_template_name: config.modelArmor.promptTemplate,
            }),
            ...(config.modelArmor.responseTemplate && {
              response_template_name: config.modelArmor.responseTemplate,
            }),
          },
        }),
    };

    if (config.responseSchema) {
      if (body.generationConfig.response_schema) {
        throw new Error(
          '`responseSchema` provided but `generationConfig.response_schema` already set.',
        );
      }

      let schema = maybeLoadFromExternalFile(
        renderVarsInObject(config.responseSchema, context?.vars),
      );

      // Parse JSON string if it's a string (not loaded from file)
      if (typeof schema === 'string') {
        try {
          schema = JSON.parse(schema);
        } catch (error) {
          throw new Error(`Invalid JSON in responseSchema: ${error}`);
        }
      }

      // Apply variable substitution to the loaded schema
      schema = renderVarsInObject(schema, context?.vars);

      body.generationConfig.response_schema = schema;
      body.generationConfig.response_mime_type = 'application/json';
    }

    // Enable image generation for Gemini 2.5 Flash Image models
    if (this.modelName.includes('gemini-2.5-flash-image')) {
      // Allow both text and image responses for image generation models
      body.generationConfig.responseModalities = ['IMAGE', 'TEXT'];
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
        // Default to non-streaming (generateContent) since:
        // 1. Model Armor floor settings only work with non-streaming endpoint
        // 2. Promptfoo collects full responses for evaluation anyway
        // Set streaming: true to use streamGenerateContent if needed
        const endpoint = config.streaming === true ? 'streamGenerateContent' : 'generateContent';

        // Check if we should use express mode (API key without OAuth)
        if (this.isExpressMode()) {
          // Express mode: use simplified endpoint with API key
          const apiKey = this.getApiKey();
          const url = `https://aiplatform.googleapis.com/${this.getApiVersion()}/publishers/${this.getPublisher()}/models/${this.modelName}:${endpoint}?key=${apiKey}`;

          const res = await fetchWithProxy(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          });

          if (!res.ok) {
            const errorData = await res.json().catch(() => null);
            logger.debug(`Gemini API express mode error:\n${JSON.stringify(errorData)}`);
            return {
              error: `API call error: ${res.status} ${res.statusText}${errorData ? `: ${JSON.stringify(errorData)}` : ''}`,
            };
          }

          data = (await res.json()) as GeminiApiResponse;
        } else {
          // Standard mode: use OAuth and full endpoint
          const client = await this.getClientWithCredentials();
          const projectId = await this.getProjectId();
          const url = `https://${this.getApiHost()}/${this.getApiVersion()}/projects/${projectId}/locations/${this.getRegion()}/publishers/${this.getPublisher()}/models/${
            this.modelName
          }:${endpoint}`;
          const res = await client.request({
            url,
            method: 'POST',
            data: body,
            timeout: REQUEST_TIMEOUT_MS,
          });
          data = res.data as GeminiApiResponse;
        }
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
          logger.error(`Gemini API error:\n${JSON.stringify(errorDetails)}`);
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
        // Normalize response: non-streaming returns single object, streaming returns array
        const normalizedData = Array.isArray(data) ? data : [data];

        const dataWithError = normalizedData as GeminiErrorResponse[];
        const error = dataWithError[0]?.error;
        if (error) {
          return {
            error: `Error ${error.code}: ${error.message}`,
          };
        }
        const dataWithResponse = normalizedData as GeminiResponseData[];
        let output;
        for (const datum of dataWithResponse) {
          // Check for blockReason first (before getCandidate) since blocked responses have no candidates
          if (datum.promptFeedback?.blockReason) {
            // Handle Model Armor blocks with detailed guardrails information
            const isModelArmor = datum.promptFeedback.blockReason === 'MODEL_ARMOR';
            const blockReasonMessage =
              datum.promptFeedback.blockReasonMessage ||
              `Content was blocked due to ${isModelArmor ? 'Model Armor' : 'safety settings'}: ${datum.promptFeedback.blockReason}`;

            const tokenUsage = {
              total: datum.usageMetadata?.totalTokenCount || 0,
              prompt: datum.usageMetadata?.promptTokenCount || 0,
              completion: datum.usageMetadata?.candidatesTokenCount || 0,
            };

            // Build guardrails response with Model Armor details
            const guardrails: GuardrailResponse = {
              flagged: true,
              flaggedInput: true,
              flaggedOutput: false,
              reason: blockReasonMessage,
            };

            // Return as output (not error) so guardrails assertions can evaluate the block:
            // - In redteam mode: refusals are successes (model correctly refused harmful content)
            // - In non-redteam mode: allows guardrails/not-guardrails assertions to run
            // The guardrails object (flagged=true) indicates the block, metadata has details
            return {
              output: blockReasonMessage,
              tokenUsage,
              guardrails,
              metadata: {
                modelArmor: isModelArmor
                  ? {
                      blockReason: datum.promptFeedback.blockReason,
                      ...(datum.promptFeedback.blockReasonMessage && {
                        blockReasonMessage: datum.promptFeedback.blockReasonMessage,
                      }),
                    }
                  : undefined,
              },
            };
          }

          const candidate = getCandidate(datum);
          const safetyFinishReasons = [
            'SAFETY',
            'PROHIBITED_CONTENT',
            'RECITATION',
            'BLOCKLIST',
            'SPII',
            'IMAGE_SAFETY',
          ];
          if (candidate.finishReason && safetyFinishReasons.includes(candidate.finishReason)) {
            const finishReason = `Content was blocked due to safety settings with finish reason: ${candidate.finishReason}.`;
            const tokenUsage = {
              total: datum.usageMetadata?.totalTokenCount || 0,
              prompt: datum.usageMetadata?.promptTokenCount || 0,
              completion: datum.usageMetadata?.candidatesTokenCount || 0,
            };
            // Build guardrails response for safety blocks
            const guardrails: GuardrailResponse = {
              flagged: true,
              flaggedInput: false,
              flaggedOutput: true,
              reason: finishReason,
            };
            if (cliState.config?.redteam) {
              // Refusals are not errors during redteams, they're actually successes.
              return { output: finishReason, tokenUsage, guardrails };
            }
            return { error: finishReason, guardrails };
          } else if (candidate.finishReason && candidate.finishReason === 'MAX_TOKENS') {
            // MAX_TOKENS is treated as a successful completion with the generated output
            if (candidate.content?.parts) {
              output = mergeParts(output, formatCandidateContents(candidate));
            }
            const outputTokens = datum.usageMetadata?.candidatesTokenCount || 0;
            logger.debug(`Gemini API: MAX_TOKENS reached`, {
              finishReason: candidate.finishReason,
              outputTokens,
              totalTokens: datum.usageMetadata?.totalTokenCount || 0,
            });
            // Continue processing - do not return error
          } else if (candidate.finishReason && candidate.finishReason !== 'STOP') {
            logger.error(`Gemini API error due to finish reason: ${candidate.finishReason}.`);
            // e.g. MALFORMED_FUNCTION_CALL
            return {
              error: `Finish reason ${candidate.finishReason}: ${JSON.stringify(data)}`,
            };
          } else if (candidate.content?.parts) {
            output = mergeParts(output, formatCandidateContents(candidate));
          } else {
            return {
              error: `No output found in response: ${JSON.stringify(data)}`,
            };
          }
        }

        const lastData = dataWithResponse[dataWithResponse.length - 1];
        const tokenUsage = {
          total: lastData.usageMetadata?.totalTokenCount || 0,
          prompt: lastData.usageMetadata?.promptTokenCount || 0,
          completion: lastData.usageMetadata?.candidatesTokenCount || 0,
          ...(lastData.usageMetadata?.thoughtsTokenCount !== undefined && {
            completionDetails: {
              reasoning: lastData.usageMetadata.thoughtsTokenCount,
              acceptedPrediction: 0,
              rejectedPrediction: 0,
            },
          }),
        };

        // Calculate cost based on token usage and model
        let cost: number | undefined;
        if (tokenUsage && tokenUsage.total) {
          cost = this.calculateCost(tokenUsage.total);
        }

        response = {
          cached: false,
          output,
          tokenUsage,
          cost,
          metadata: {},
        };

        // Extract search grounding metadata from candidates
        const candidateWithMetadata = dataWithResponse
          .map((datum) => getCandidate(datum))
          .find(
            (candidate) =>
              candidate.groundingMetadata ||
              candidate.groundingChunks ||
              candidate.groundingSupports ||
              candidate.webSearchQueries,
          );

        if (candidateWithMetadata) {
          response.metadata = {
            ...(candidateWithMetadata.groundingMetadata && {
              groundingMetadata: candidateWithMetadata.groundingMetadata,
            }),
            ...(candidateWithMetadata.groundingChunks && {
              groundingChunks: candidateWithMetadata.groundingChunks,
            }),
            ...(candidateWithMetadata.groundingSupports && {
              groundingSupports: candidateWithMetadata.groundingSupports,
            }),
            ...(candidateWithMetadata.webSearchQueries && {
              webSearchQueries: candidateWithMetadata.webSearchQueries,
            }),
          };
        }

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
      if (config.functionToolCallbacks && isValidJson(response.output)) {
        const structured_output = JSON.parse(response.output);
        if (structured_output.functionCall) {
          const results = [];
          const functionName = structured_output.functionCall.name;
          if (config.functionToolCallbacks[functionName]) {
            try {
              const functionResult = await this.executeFunctionCallback(
                functionName,
                JSON.stringify(
                  typeof structured_output.functionCall.args === 'string'
                    ? JSON.parse(structured_output.functionCall.args)
                    : structured_output.functionCall.args,
                ),
                config,
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
      const client = await this.getClientWithCredentials();
      const projectId = await this.getProjectId();
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

  async callLlamaApi(prompt: string, _context?: CallApiContextParams): Promise<ProviderResponse> {
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
      const client = await this.getClientWithCredentials();
      const projectId = await this.getProjectId();
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
        numRequests: 1,
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

  async cleanup(): Promise<void> {
    if (this.mcpClient) {
      await this.initializationPromise;
      await this.mcpClient.cleanup();
      this.mcpClient = null;
    }
  }

  /**
   * Loads a function from an external file
   * @param fileRef The file reference in the format 'file://path/to/file:functionName'
   * @returns The loaded function
   */
  private async loadExternalFunction(fileRef: string): Promise<Function> {
    let filePath = fileRef.slice('file://'.length);
    let functionName: string | undefined;

    if (filePath.includes(':')) {
      const splits = filePath.split(':');
      if (splits[0] && isJavascriptFile(splits[0])) {
        [filePath, functionName] = splits;
      }
    }

    try {
      const resolvedPath = path.resolve(cliState.basePath || '', filePath);
      logger.debug(
        `Loading function from ${resolvedPath}${functionName ? `:${functionName}` : ''}`,
      );

      const requiredModule = await importModule(resolvedPath, functionName);

      if (typeof requiredModule === 'function') {
        return requiredModule;
      } else if (
        requiredModule &&
        typeof requiredModule === 'object' &&
        functionName &&
        functionName in requiredModule
      ) {
        const fn = requiredModule[functionName];
        if (typeof fn === 'function') {
          return fn;
        }
      }

      throw new Error(
        `Function callback malformed: ${filePath} must export ${
          functionName
            ? `a named function '${functionName}'`
            : 'a function or have a default export as a function'
        }`,
      );
    } catch (error: any) {
      throw new Error(`Error loading function from ${filePath}: ${error.message || String(error)}`);
    }
  }

  /**
   * Executes a function callback with proper error handling
   */
  private async executeFunctionCallback(
    functionName: string,
    args: string,
    config: any,
  ): Promise<any> {
    try {
      // Check if we've already loaded this function
      let callback = this.loadedFunctionCallbacks[functionName];

      // If not loaded yet, try to load it now
      if (!callback) {
        const callbackRef = config.functionToolCallbacks?.[functionName];

        if (callbackRef && typeof callbackRef === 'string') {
          const callbackStr: string = callbackRef;
          if (callbackStr.startsWith('file://')) {
            callback = await this.loadExternalFunction(callbackStr);
          } else {
            callback = new Function('return ' + callbackStr)();
          }

          // Cache for future use
          this.loadedFunctionCallbacks[functionName] = callback;
        } else if (typeof callbackRef === 'function') {
          callback = callbackRef;
          this.loadedFunctionCallbacks[functionName] = callback;
        }
      }

      if (!callback) {
        throw new Error(`No callback found for function '${functionName}'`);
      }

      // Execute the callback
      logger.debug(`Executing function '${functionName}' with args: ${args}`);
      const result = await callback(args);

      return result;
    } catch (error: any) {
      logger.error(`Error executing function '${functionName}': ${error.message || String(error)}`);
      throw error; // Re-throw so caller can handle fallback behavior
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

  /**
   * Helper method to get Google client with credentials support
   */
  async getClientWithCredentials() {
    const credentials = loadCredentials(this.config.credentials);
    const { client } = await getGoogleClient({ credentials });
    return client;
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

  getApiHost(): string {
    return getVertexApiHost(this.getRegion(), this.config.apiHost, this.env);
  }

  async getProjectId(): Promise<string> {
    return await resolveProjectId(this.config, this.env);
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
      const client = await this.getClientWithCredentials();
      const projectId = await this.getProjectId();
      const url = `https://${this.getApiHost()}/${this.getApiVersion()}/projects/${projectId}/locations/${this.getRegion()}/publishers/google/models/${
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
          numRequests: 1,
        },
      };
    } catch (err) {
      logger.error(`Error parsing Vertex embeddings API response: ${err}`);
      throw err;
    }
  }

  private calculateCost(totalTokens: number): number {
    // Cost calculation based on Google's pricing
    // For image generation models like gemini-2.5-flash-image: $30 per 1M output tokens
    // For regular text models: varies by model (e.g., gemini-2.5-flash: $0.30 input, $2.50 output)

    if (this.modelName.includes('gemini-2.5-flash-image')) {
      // Image generation: $30 per 1M tokens (all output tokens)
      return (totalTokens / 1000000) * 30.0;
    }

    // For text models, we'd need more sophisticated calculation with input/output breakdown
    // For now, use a conservative estimate for mixed models
    if (this.modelName.includes('gemini-2.5-flash')) {
      // Assume average of input ($0.30) and output ($2.50) pricing
      return (totalTokens / 1000000) * 1.4; // Conservative estimate
    }

    if (this.modelName.includes('gemini-2.5-pro')) {
      // Pro model pricing (varies by region, using standard pricing)
      return (totalTokens / 1000000) * 3.5; // Conservative estimate
    }

    // Default fallback for unknown models
    return (totalTokens / 1000000) * 2.0;
  }
}

export const DefaultGradingProvider = new VertexChatProvider('gemini-2.5-pro');
export const DefaultEmbeddingProvider = new VertexEmbeddingProvider('text-embedding-004');
