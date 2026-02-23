import { getCache, isCacheEnabled } from '../../cache';
import cliState from '../../cliState';
import { getEnvString } from '../../envars';
import logger from '../../logger';
import {
  type GenAISpanContext,
  type GenAISpanResult,
  withGenAISpan,
} from '../../tracing/genaiTracer';
import { fetchWithProxy } from '../../util/fetch/index';
import { maybeLoadFromExternalFile } from '../../util/file';
import { renderVarsInObject } from '../../util/index';
import { isValidJson } from '../../util/json';
import { parseChatPrompt, REQUEST_TIMEOUT_MS } from '../shared';
import { GoogleGenericProvider, type GoogleProviderOptions } from './base';
import {
  formatCandidateContents,
  geminiFormatAndSystemInstructions,
  getCandidate,
  getGoogleClient,
  loadCredentials,
  mergeParts,
  resolveProjectId,
} from './util';

import type { EnvOverrides } from '../../types/env';
import type {
  ApiEmbeddingProvider,
  CallApiContextParams,
  GuardrailResponse,
  ProviderEmbeddingResponse,
  ProviderResponse,
  TokenUsage,
} from '../../types/index';
import type { ClaudeRequest, ClaudeResponse } from './types';
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

/**
 * Vertex AI provider for Gemini, Claude, Llama, and Palm2 models.
 *
 * Extends GoogleGenericProvider for shared functionality like MCP integration,
 * authentication management, and resource cleanup.
 */
export class VertexChatProvider extends GoogleGenericProvider {
  constructor(modelName: string, options: GoogleProviderOptions = {}) {
    // Force vertex mode for Vertex AI provider
    super(modelName, {
      ...options,
      config: { ...options.config, vertexai: true },
    });
  }

  /**
   * Get the Vertex AI API host based on region.
   * Public for use by integrations like Adaline Gateway.
   */
  getApiHost(): string {
    const region = this.getRegion();
    return (
      this.config.apiHost ||
      this.env?.VERTEX_API_HOST ||
      getEnvString('VERTEX_API_HOST') ||
      (region === 'global' ? 'aiplatform.googleapis.com' : `${region}-aiplatform.googleapis.com`)
    );
  }

  /**
   * Get the API version for Vertex AI.
   */
  private getApiVersion(): string {
    return (
      this.config.apiVersion ||
      this.env?.VERTEX_API_VERSION ||
      getEnvString('VERTEX_API_VERSION') ||
      'v1'
    );
  }

  /**
   * Get the publisher for the model.
   */
  private getPublisher(): string {
    return (
      this.config.publisher ||
      this.env?.VERTEX_PUBLISHER ||
      getEnvString('VERTEX_PUBLISHER') ||
      'google'
    );
  }

  /**
   * Get the API endpoint URL for Vertex AI.
   * Note: For Gemini, the actual endpoint is constructed dynamically based on mode.
   */
  getApiEndpoint(action?: string): string {
    // This provides a default endpoint - actual endpoints are model-specific
    const actionSuffix = action ? `:${action}` : '';
    return `https://${this.getApiHost()}/${this.getApiVersion()}/publishers/${this.getPublisher()}/models/${this.modelName}${actionSuffix}`;
  }

  /**
   * Get authentication headers for Vertex AI.
   * For OAuth mode, this returns minimal headers; the client handles auth.
   * For express mode, the API key is passed via x-goog-api-key header for improved security.
   */
  async getAuthHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.config.headers,
    };

    // In express mode, add the API key to headers
    if (this.isExpressMode()) {
      const apiKey = this.getApiKey();
      if (apiKey) {
        headers['x-goog-api-key'] = apiKey;
      }
    }

    return headers;
  }

  /**
   * Helper method to get Google client with credentials support.
   * Public for use by integrations like Adaline Gateway.
   */
  async getClientWithCredentials() {
    const credentials = loadCredentials(this.config.credentials);
    const { client } = await getGoogleClient({
      credentials,
      googleAuthOptions: this.config.googleAuthOptions,
      scopes: this.config.scopes,
      keyFilename: this.config.keyFilename,
    });
    return client;
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
   * Check if express mode should be used (API key without OAuth).
   * Express mode uses a simplified endpoint format without project/location.
   *
   * Express mode is automatic when an API key is available - users don't need
   * to think about it. Just provide an API key and it works.
   *
   * Express mode is used when:
   * 1. API key is available (VERTEX_API_KEY, GOOGLE_API_KEY, or config.apiKey)
   * 2. User hasn't explicitly disabled it with `expressMode: false`
   * 3. No OAuth/ADC credentials are configured (OAuth takes priority)
   */
  private isExpressMode(): boolean {
    const hasApiKey = Boolean(this.getApiKey());
    const explicitlyDisabled = this.config.expressMode === false;

    // Check if OAuth/ADC credentials are explicitly configured - they take priority
    const hasOAuthConfig = Boolean(
      this.config.credentials ||
        this.config.keyFilename ||
        this.config.googleAuthOptions?.keyFilename ||
        this.config.googleAuthOptions?.credentials,
    );

    // Auto-enable express mode when API key is available AND no OAuth config
    // OAuth credentials take priority over express mode
    return hasApiKey && !explicitlyDisabled && !hasOAuthConfig;
  }

  /**
   * Build the Vertex Gemini request body.
   */
  private async buildVertexGeminiBody(
    prompt: string,
    context: CallApiContextParams | undefined,
    config: ReturnType<typeof this.mergeConfig>,
  ) {
    const { contents, systemInstruction } = geminiFormatAndSystemInstructions(
      prompt,
      context?.vars,
      config.systemInstruction,
      { useAssistantRole: config.useAssistantRole },
    );

    const allTools = await this.getAllTools(context);

    const body: any = {
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

      if (typeof schema === 'string') {
        try {
          schema = JSON.parse(schema);
        } catch (error) {
          throw new Error(`Invalid JSON in responseSchema: ${error}`);
        }
      }

      schema = renderVarsInObject(schema, context?.vars);
      body.generationConfig.response_schema = schema;
      body.generationConfig.response_mime_type = 'application/json';
    }

    return body;
  }

  /**
   * Merge provider config with prompt-level config.
   */
  private mergeConfig(context: CallApiContextParams | undefined) {
    return { ...this.config, ...context?.prompt?.config };
  }

  /**
   * Fetch raw Gemini data from Vertex (express or standard mode).
   */
  private async fetchVertexGeminiData(
    body: any,
    config: ReturnType<typeof this.mergeConfig>,
  ): Promise<{ data: GeminiApiResponse } | ProviderResponse> {
    const endpoint = config.streaming === true ? 'streamGenerateContent' : 'generateContent';

    if (this.isExpressMode()) {
      const url = `https://${this.getApiHost()}/${this.getApiVersion()}/publishers/${this.getPublisher()}/models/${this.modelName}:${endpoint}`;

      const res = await fetchWithProxy(url, {
        method: 'POST',
        headers: await this.getAuthHeaders(),
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

      return { data: (await res.json()) as GeminiApiResponse };
    }

    // Standard OAuth mode
    const client = await this.getClientWithCredentials();
    const projectId = await this.getProjectId();
    const url = `https://${this.getApiHost()}/${this.getApiVersion()}/projects/${projectId}/locations/${this.getRegion()}/publishers/${this.getPublisher()}/models/${this.modelName}:${endpoint}`;
    const res = await client.request({
      url,
      method: 'POST',
      data: body,
      timeout: REQUEST_TIMEOUT_MS,
    });
    return { data: res.data as GeminiApiResponse };
  }

  /**
   * Process a blocked Vertex datum (Model Armor / safety block).
   */
  private processVertexBlockedDatum(datum: GeminiResponseData): ProviderResponse {
    const isModelArmor = datum.promptFeedback!.blockReason === 'MODEL_ARMOR';
    const blockReasonMessage =
      datum.promptFeedback!.blockReasonMessage ||
      `Content was blocked due to ${isModelArmor ? 'Model Armor' : 'safety settings'}: ${datum.promptFeedback!.blockReason}`;

    const tokenUsage = {
      total: datum.usageMetadata?.totalTokenCount || 0,
      prompt: datum.usageMetadata?.promptTokenCount || 0,
      completion: datum.usageMetadata?.candidatesTokenCount || 0,
    };

    const guardrails: GuardrailResponse = {
      flagged: true,
      flaggedInput: true,
      flaggedOutput: false,
      reason: blockReasonMessage,
    };

    return {
      output: blockReasonMessage,
      tokenUsage,
      guardrails,
      metadata: {
        modelArmor: isModelArmor
          ? {
              blockReason: datum.promptFeedback!.blockReason,
              ...(datum.promptFeedback!.blockReasonMessage && {
                blockReasonMessage: datum.promptFeedback!.blockReasonMessage,
              }),
            }
          : undefined,
      },
    };
  }

  /**
   * Process a candidate's finish reason for Vertex.
   * Returns a ProviderResponse if the finish reason requires immediate return,
   * or 'continue' to keep processing, or null to signal normal content extraction.
   */
  private processVertexCandidateFinishReason(
    candidate: ReturnType<typeof getCandidate>,
    datum: GeminiResponseData,
    data: GeminiApiResponse,
  ): ProviderResponse | 'continue' | null {
    if (!candidate.finishReason) {
      return null;
    }

    const safetyFinishReasons = [
      'SAFETY',
      'PROHIBITED_CONTENT',
      'RECITATION',
      'BLOCKLIST',
      'SPII',
      'IMAGE_SAFETY',
    ];

    if (safetyFinishReasons.includes(candidate.finishReason)) {
      const finishReason = `Content was blocked due to safety settings with finish reason: ${candidate.finishReason}.`;
      const tokenUsage = {
        total: datum.usageMetadata?.totalTokenCount || 0,
        prompt: datum.usageMetadata?.promptTokenCount || 0,
        completion: datum.usageMetadata?.candidatesTokenCount || 0,
      };
      const guardrails: GuardrailResponse = {
        flagged: true,
        flaggedInput: false,
        flaggedOutput: true,
        reason: finishReason,
      };
      if (cliState.config?.redteam) {
        return { output: finishReason, tokenUsage, guardrails };
      }
      return { error: finishReason, guardrails };
    }

    if (candidate.finishReason === 'MAX_TOKENS') {
      const outputTokens = datum.usageMetadata?.candidatesTokenCount || 0;
      logger.debug('Gemini API: MAX_TOKENS reached', {
        finishReason: candidate.finishReason,
        outputTokens,
        totalTokens: datum.usageMetadata?.totalTokenCount || 0,
      });
      return 'continue';
    }

    if (candidate.finishReason === 'STOP') {
      return null;
    }

    logger.error(`Gemini API error due to finish reason: ${candidate.finishReason}.`);
    return { error: `Finish reason ${candidate.finishReason}: ${JSON.stringify(data)}` };
  }

  /**
   * Parse the raw Vertex Gemini data into a response.
   */
  private parseVertexGeminiData(data: GeminiApiResponse): {
    response: any;
    error?: ProviderResponse;
  } {
    const normalizedData = Array.isArray(data) ? data : [data];

    const dataWithError = normalizedData as GeminiErrorResponse[];
    const apiError = dataWithError[0]?.error;
    if (apiError) {
      return { response: null, error: { error: `Error ${apiError.code}: ${apiError.message}` } };
    }

    const dataWithResponse = normalizedData as GeminiResponseData[];
    let output: any;

    for (const datum of dataWithResponse) {
      if (datum.promptFeedback?.blockReason) {
        return { response: null, error: this.processVertexBlockedDatum(datum) };
      }

      const candidate = getCandidate(datum);
      const finishResult = this.processVertexCandidateFinishReason(candidate, datum, data);

      if (finishResult === 'continue') {
        if (candidate.content?.parts) {
          output = mergeParts(output, formatCandidateContents(candidate));
        }
        continue;
      }

      if (finishResult !== null) {
        return { response: null, error: finishResult };
      }

      if (candidate.content?.parts) {
        output = mergeParts(output, formatCandidateContents(candidate));
      } else {
        return {
          response: null,
          error: { error: `No output found in response: ${JSON.stringify(data)}` },
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

    const candidateWithMetadata = dataWithResponse
      .map((datum) => getCandidate(datum))
      .find(
        (c) =>
          c.groundingMetadata || c.groundingChunks || c.groundingSupports || c.webSearchQueries,
      );

    const metadata = candidateWithMetadata
      ? {
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
        }
      : {};

    return { response: { cached: false, output, tokenUsage, metadata } };
  }

  /**
   * Apply function tool callbacks to the response.
   */
  private async applyFunctionToolCallbacks(
    response: any,
    config: ReturnType<typeof this.mergeConfig>,
  ): Promise<any> {
    if (!config.functionToolCallbacks || !isValidJson(response.output)) {
      return response;
    }

    const structured_output = JSON.parse(response.output);
    if (!structured_output.functionCall) {
      return response;
    }

    const results: string[] = [];
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
      return {
        cached: response.cached,
        output: results.join('\n'),
        tokenUsage: response.tokenUsage,
      };
    }

    return response;
  }

  async callGeminiApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    if (this.initializationPromise != null) {
      await this.initializationPromise;
    }

    const config = this.mergeConfig(context);
    const body = await this.buildVertexGeminiBody(prompt, context, config);

    const cache = await getCache();
    const cacheKey = `vertex:${this.modelName}:${JSON.stringify(body)}`;

    // Check cache first
    let response;
    if (isCacheEnabled()) {
      const cachedResponse = await cache.get(cacheKey);
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
      let data: GeminiApiResponse;
      try {
        const fetchResult = await this.fetchVertexGeminiData(body, config);
        if ('error' in fetchResult) {
          return fetchResult as ProviderResponse;
        }
        data = (fetchResult as { data: GeminiApiResponse }).data;
      } catch (err) {
        const geminiError = err as GaxiosError;
        if (geminiError.response?.data?.[0]?.error) {
          const errorDetails = geminiError.response.data[0].error;
          logger.error(`Gemini API error:\n${JSON.stringify(errorDetails)}`);
          return {
            error: `API call error: Status ${errorDetails.status}, Code ${errorDetails.code}, Message:\n\n${errorDetails.message}`,
          };
        }
        logger.debug(`Gemini API error:\n${JSON.stringify(err)}`);
        return { error: `API call error: ${String(err)}` };
      }

      try {
        const { response: parsed, error: parseError } = this.parseVertexGeminiData(data);
        if (parseError) {
          return parseError;
        }
        response = parsed;

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
      response = await this.applyFunctionToolCallbacks(response, config);
    } catch (err) {
      return { error: `Tool callback error: ${String(err)}.` };
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
      const res = await client.request({
        url,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        data: body,
        timeout: REQUEST_TIMEOUT_MS,
      });
      data = res.data as Palm2ApiResponse;
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
      const prediction = data.predictions?.[0];
      if (!prediction?.candidates?.length) {
        return {
          error: `No valid predictions returned from API: ${JSON.stringify(data)}`,
        };
      }
      const output = prediction.candidates[0].content;

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

      const res = await client.request({
        url,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
        },
        data: body,
        timeout: REQUEST_TIMEOUT_MS,
      });

      data = res.data as LlamaResponse;
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

  // cleanup() is inherited from GoogleGenericProvider
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
    const { client } = await getGoogleClient({
      credentials,
      googleAuthOptions: this.config.googleAuthOptions,
      scopes: this.config.scopes,
      keyFilename: this.config.keyFilename,
    });
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
      const res = await client.request({
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

    const prediction = data.predictions?.[0];
    const embeddingData = prediction?.embeddings;
    if (!embeddingData?.values) {
      const errorMsg = `No valid embeddings returned from API: ${JSON.stringify(data)}`;
      logger.error(errorMsg);
      throw new Error(errorMsg);
    }

    return {
      embedding: embeddingData.values,
      tokenUsage: {
        total: embeddingData.statistics?.token_count ?? 0,
        numRequests: 1,
      },
    };
  }
}

export const DefaultGradingProvider = new VertexChatProvider('gemini-2.5-pro');
export const DefaultEmbeddingProvider = new VertexEmbeddingProvider('text-embedding-004');
