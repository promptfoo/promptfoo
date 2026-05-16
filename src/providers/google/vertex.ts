import { createHmac } from 'crypto';

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
import {
  calculateAnthropicCost,
  getTokenUsage,
  isClaudeOpus47Model,
  outputFromMessage,
  parseMessages,
} from '../anthropic/util';
import { getRequestTimeoutMs, parseChatPrompt } from '../shared';
import { GoogleGenericProvider, type GoogleProviderOptions } from './base';
import {
  calculateGoogleCost,
  formatCandidateContents,
  geminiFormatAndSystemInstructions,
  getCandidate,
  getGoogleClient,
  loadCredentials,
  mergeGoogleCompletionOptions,
  mergeParts,
  normalizeSafetySettings,
  parseConfigSystemInstruction,
  removeGoogleFunctionDeclarations,
  resolveGoogleToolConfig,
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
import type {
  ClaudeRequest,
  ClaudeResponse,
  ClaudeThinkingConfig,
  CompletionOptions,
  GoogleProviderConfig,
  Part,
} from './types';
import type {
  GeminiApiResponse,
  GeminiErrorResponse,
  GeminiFormat,
  GeminiResponseData,
  Palm2ApiResponse,
} from './util';

// Type for Google API errors - using 'any' to avoid gaxios dependency
type GaxiosError = any;

type VertexEmbeddingPredictResponse = {
  predictions?: Array<{
    embeddings?: {
      values?: number[];
      statistics?: {
        token_count?: number;
      };
    };
  }>;
};

type VertexEmbeddingProviderConfig = GoogleProviderConfig & {
  autoTruncate?: boolean;
};

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

function getVertexBodyCacheKey(prefix: string, body: unknown): string {
  const serialized = typeof body === 'string' ? body : JSON.stringify(body);
  return `${prefix}:${createHmac('sha256', 'promptfoo:vertex:cache-key:v1')
    .update(serialized ?? String(body))
    .digest('hex')}`;
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
    const system = this.modelName.includes('claude')
      ? 'vertex:anthropic'
      : this.modelName.includes('gemini')
        ? 'vertex:gemini'
        : this.modelName.includes('llama')
          ? 'vertex:llama'
          : 'vertex:palm2';

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

  async callClaudeApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    const normalizedPrompt = await this.normalizeClaudePrompt(prompt);
    if ('error' in normalizedPrompt) {
      return normalizedPrompt;
    }
    const parsedPrompt = parseMessages(normalizedPrompt.prompt);
    const thinkingConfig = this.resolveClaudeThinkingConfig(parsedPrompt.thinking);
    const showThinking = this.config.showThinking ?? this.isClaudeThinkingEnabled(thinkingConfig);
    const body = this.buildClaudeRequestBody(
      parsedPrompt.system,
      parsedPrompt.extractedMessages,
      thinkingConfig,
      context,
    );
    const cache = await getCache();
    const cacheKey = getVertexBodyCacheKey(
      `vertex:claude:${this.modelName}:showThinking=${showThinking}`,
      body,
    );
    const cachedResponse = await this.getCachedVertexResponse(cache, cacheKey, 'Claude');
    if (cachedResponse) {
      return cachedResponse;
    }

    const requestResult = await this.requestClaudeResponse(body);
    if ('error' in requestResult) {
      return requestResult;
    }

    const response = this.parseClaudeResponse(requestResult.data, showThinking);
    if (!response.error && isCacheEnabled()) {
      await cache.set(cacheKey, JSON.stringify(response));
    }
    return response;
  }

  private async normalizeClaudePrompt(
    prompt: string,
  ): Promise<{ prompt: string } | { error: string }> {
    if (!prompt.trim().startsWith('- role:')) {
      return { prompt };
    }

    try {
      const yaml = await import('js-yaml');
      return { prompt: JSON.stringify(yaml.default.load(prompt)) };
    } catch (err) {
      return { error: `Chat Completion prompt is not a valid YAML string: ${err}` };
    }
  }

  private resolveClaudeThinkingConfig(thinking: unknown): ClaudeThinkingConfig | undefined {
    return this.config.thinking || (thinking as ClaudeThinkingConfig | undefined);
  }

  private isClaudeThinkingEnabled(thinkingConfig?: ClaudeThinkingConfig): boolean {
    return thinkingConfig?.type === 'enabled';
  }

  private buildClaudeRequestBody(
    system: ClaudeRequest['system'] | undefined,
    extractedMessages: unknown,
    thinkingConfig: ClaudeThinkingConfig | undefined,
    context?: CallApiContextParams,
  ): ClaudeRequest {
    const mergedSystem = this.mergeClaudeSystemInstruction(system, context);
    const maxTokens = this.resolveClaudeMaxTokens(thinkingConfig);
    return {
      anthropic_version:
        this.config.anthropicVersion || this.config.anthropic_version || 'vertex-2023-10-16',
      stream: false,
      max_tokens: maxTokens,
      temperature: isClaudeOpus47Model(this.modelName) ? undefined : this.config.temperature,
      top_p: this.config.top_p || this.config.topP,
      top_k: this.config.top_k || this.config.topK,
      ...(mergedSystem ? { system: mergedSystem } : {}),
      ...(thinkingConfig ? { thinking: thinkingConfig } : {}),
      messages: extractedMessages as ClaudeRequest['messages'],
    };
  }

  private mergeClaudeSystemInstruction(
    system: ClaudeRequest['system'] | undefined,
    context?: CallApiContextParams,
  ): ClaudeRequest['system'] | undefined {
    const parsedConfigInstruction = parseConfigSystemInstruction(
      this.config.systemInstruction,
      context?.vars,
    );
    if (!parsedConfigInstruction) {
      return system;
    }

    const configSystemBlocks = parsedConfigInstruction.parts
      .filter((part) => Boolean(part.text))
      .map((part) => ({ type: 'text' as const, text: part.text as string }));
    return configSystemBlocks.length > 0 ? [...configSystemBlocks, ...(system || [])] : system;
  }

  private resolveClaudeMaxTokens(thinkingConfig?: ClaudeThinkingConfig): number {
    const isThinkingEnabled = this.isClaudeThinkingEnabled(thinkingConfig);
    let maxTokens = this.config.max_tokens || this.config.maxOutputTokens || 0;
    if (!maxTokens) {
      maxTokens = isThinkingEnabled ? 2048 : 512;
    }
    if (
      isThinkingEnabled &&
      thinkingConfig?.budget_tokens &&
      maxTokens < thinkingConfig.budget_tokens
    ) {
      return thinkingConfig.budget_tokens + 1024;
    }
    return maxTokens;
  }

  private async getCachedVertexResponse(
    cache: Awaited<ReturnType<typeof getCache>>,
    cacheKey: string,
    label: 'Claude' | 'Gemini' | 'Palm2',
  ): Promise<ProviderResponse | undefined> {
    if (!isCacheEnabled()) {
      return undefined;
    }

    const cachedResponse = await cache.get(cacheKey);
    if (!cachedResponse) {
      return undefined;
    }

    const parsedCachedResponse = JSON.parse(cachedResponse as string);
    const tokenUsage = parsedCachedResponse.tokenUsage as TokenUsage;
    if (tokenUsage) {
      tokenUsage.cached = tokenUsage.total;
    }
    logger.debug(`Returning cached Vertex ${label} response`, {
      model: this.modelName,
      cacheKey,
    });
    return { ...parsedCachedResponse, cached: true };
  }

  private async requestClaudeResponse(
    body: ClaudeRequest,
  ): Promise<{ data: ClaudeResponse } | { error: string }> {
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
        timeout: getRequestTimeoutMs(),
      });
      return { data: res.data as ClaudeResponse };
    } catch (err) {
      const error = err as GaxiosError;
      if (error.response?.data) {
        logger.debug(`Claude API error:\n${JSON.stringify(error.response.data)}`);
        return { error: `API call error: ${JSON.stringify(error.response.data)}` };
      }
      logger.debug(`Claude API error:\n${JSON.stringify(err)}`);
      return { error: `API call error: ${String(err)}` };
    }
  }

  private parseClaudeResponse(data: ClaudeResponse, showThinking: boolean): ProviderResponse {
    try {
      const output = outputFromMessage(data as any, showThinking);
      if (!output) {
        return { error: `No output found in Claude API response: ${JSON.stringify(data)}` };
      }

      const tokenUsage: TokenUsage = {
        ...getTokenUsage(data, false),
        numRequests: 1,
      };
      const normalizedModelName = this.modelName.replace(/-v\d+@/, '-').replace('@', '-');
      return {
        cached: false,
        output,
        tokenUsage,
        cost: calculateAnthropicCost(
          normalizedModelName,
          this.config,
          data.usage?.input_tokens,
          data.usage?.output_tokens,
        ),
      };
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

  async callGeminiApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    if (this.initializationPromise != null) {
      await this.initializationPromise;
    }
    const config = mergeGoogleCompletionOptions(
      this.config,
      context?.prompt?.config as Partial<CompletionOptions> | undefined,
    );
    const { body, toolsDisabled } = await this.buildVertexGeminiRequestBody(
      prompt,
      config,
      context,
    );
    const cache = await getCache();
    const cacheKey = getVertexBodyCacheKey(`vertex:${this.modelName}`, body);
    let response = await this.getCachedVertexResponse(cache, cacheKey, 'Gemini');

    if (!response) {
      const requestResult = await this.requestVertexGeminiResponse(body, config);
      if ('error' in requestResult) {
        return requestResult;
      }
      response = await this.parseVertexGeminiResponse(requestResult.data, config);
      if (!response.error && isCacheEnabled()) {
        await cache.set(cacheKey, JSON.stringify(response));
      }
    }

    return this.applyVertexGeminiFunctionCallbacks(response, config, toolsDisabled);
  }

  private async buildVertexGeminiRequestBody(
    prompt: string,
    config: CompletionOptions,
    context?: CallApiContextParams,
  ): Promise<{ body: Record<string, any>; toolsDisabled: boolean }> {
    const { contents, systemInstruction } = geminiFormatAndSystemInstructions(
      prompt,
      context?.vars,
      config.systemInstruction,
      { useAssistantRole: config.useAssistantRole },
    );

    const { toolConfig, toolsDisabled } = resolveGoogleToolConfig(config);
    // Get all tools (MCP + config tools) using base class method
    const allTools = await this.getAllTools(context, {
      skipExecutableToolFiles: toolsDisabled,
    });
    const requestTools = toolsDisabled ? removeGoogleFunctionDeclarations(allTools) : allTools;
    const body: Record<string, any> = {
      contents: contents as GeminiFormat,
      generationConfig: this.buildVertexGeminiGenerationConfig(config),
      ...(config.safetySettings
        ? { safetySettings: normalizeSafetySettings(config.safetySettings) }
        : {}),
      ...(toolConfig ? { toolConfig } : {}),
      ...(requestTools.length > 0 ? { tools: requestTools } : {}),
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
    this.applyVertexGeminiResponseSchema(body, config, context);
    return { body, toolsDisabled };
  }

  private buildVertexGeminiGenerationConfig(config: CompletionOptions) {
    return {
      context: config.context,
      examples: config.examples,
      stopSequences: config.stopSequences,
      temperature: config.temperature,
      maxOutputTokens: config.maxOutputTokens,
      topP: config.topP,
      topK: config.topK,
      ...config.generationConfig,
    };
  }

  private applyVertexGeminiResponseSchema(
    body: Record<string, any>,
    config: CompletionOptions,
    context?: CallApiContextParams,
  ): void {
    if (!config.responseSchema) {
      return;
    }
    if (body.generationConfig.response_schema) {
      throw new Error(
        '`responseSchema` provided but `generationConfig.response_schema` already set.',
      );
    }
    body.generationConfig.response_schema = this.loadVertexGeminiResponseSchema(
      config.responseSchema,
      context,
    );
    body.generationConfig.response_mime_type = 'application/json';
  }

  private loadVertexGeminiResponseSchema(
    responseSchema: unknown,
    context?: CallApiContextParams,
  ): unknown {
    let schema = maybeLoadFromExternalFile(
      renderVarsInObject(responseSchema as any, context?.vars),
    );
    if (typeof schema === 'string') {
      try {
        schema = JSON.parse(schema);
      } catch (error) {
        throw new Error(`Invalid JSON in responseSchema: ${error}`);
      }
    }
    return renderVarsInObject(schema, context?.vars);
  }

  private async requestVertexGeminiResponse(
    body: Record<string, any>,
    config: CompletionOptions,
  ): Promise<{ data: GeminiApiResponse } | { error: string }> {
    try {
      if (this.isExpressMode()) {
        return this.requestVertexGeminiExpress(body, config);
      }
      return { data: await this.requestVertexGeminiOauth(body, config) };
    } catch (err) {
      return this.formatVertexGeminiRequestError(err);
    }
  }

  private async requestVertexGeminiExpress(
    body: Record<string, any>,
    config: CompletionOptions,
  ): Promise<{ data: GeminiApiResponse } | { error: string }> {
    const endpoint = this.getVertexGeminiEndpoint(config);
    const url = `https://${this.getApiHost()}/${this.getApiVersion()}/publishers/${this.getPublisher()}/models/${this.modelName}:${endpoint}`;
    const res = await fetchWithProxy(url, {
      method: 'POST',
      headers: await this.getAuthHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(getRequestTimeoutMs()),
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

  private async requestVertexGeminiOauth(
    body: Record<string, any>,
    config: CompletionOptions,
  ): Promise<GeminiApiResponse> {
    const client = await this.getClientWithCredentials();
    const projectId = await this.getProjectId();
    const endpoint = this.getVertexGeminiEndpoint(config);
    const url = `https://${this.getApiHost()}/${this.getApiVersion()}/projects/${projectId}/locations/${this.getRegion()}/publishers/${this.getPublisher()}/models/${this.modelName}:${endpoint}`;
    const res = await client.request({
      url,
      method: 'POST',
      data: body,
      timeout: getRequestTimeoutMs(),
    });
    return res.data as GeminiApiResponse;
  }

  private getVertexGeminiEndpoint(config: CompletionOptions): string {
    return config.streaming === true ? 'streamGenerateContent' : 'generateContent';
  }

  private formatVertexGeminiRequestError(err: unknown): { error: string } {
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

  private async parseVertexGeminiResponse(
    data: GeminiApiResponse,
    config: CompletionOptions,
  ): Promise<ProviderResponse> {
    try {
      const normalizedData = Array.isArray(data) ? data : [data];
      const error = (normalizedData as GeminiErrorResponse[])[0]?.error;
      if (error) {
        return { error: `Error ${error.code}: ${error.message}` };
      }

      const dataWithResponse = normalizedData as GeminiResponseData[];
      const outputResult = this.extractVertexGeminiOutput(dataWithResponse, data);
      if ('error' in outputResult || 'guardrails' in outputResult) {
        return outputResult;
      }

      const lastData = dataWithResponse[dataWithResponse.length - 1];
      const tokenUsage = this.buildVertexGeminiTokenUsage(lastData);
      const response: ProviderResponse = {
        cached: false,
        output: outputResult.output,
        tokenUsage,
        cost: this.calculateVertexGeminiCost(lastData, config),
        metadata: this.buildVertexGeminiMetadata(dataWithResponse),
      };
      return response;
    } catch (err) {
      return {
        error: `Gemini API response error: ${String(err)}. Response data: ${JSON.stringify(data)}`,
      };
    }
  }

  private extractVertexGeminiOutput(
    data: GeminiResponseData[],
    rawData: GeminiApiResponse,
  ): { output: unknown } | ProviderResponse {
    let output: Part[] | string | undefined;
    for (const datum of data) {
      const promptBlock = this.getVertexGeminiPromptBlockResponse(datum);
      if (promptBlock) {
        return promptBlock;
      }

      const candidate = getCandidate(datum);
      const candidateResult = this.processVertexGeminiCandidate(candidate, datum, output, rawData);
      if ('error' in candidateResult || 'guardrails' in candidateResult) {
        return candidateResult;
      }
      output = candidateResult.output;
    }
    return { output };
  }

  private getVertexGeminiPromptBlockResponse(
    datum: GeminiResponseData,
  ): ProviderResponse | undefined {
    const blockReason = datum.promptFeedback?.blockReason;
    if (!blockReason) {
      return undefined;
    }

    const isModelArmor = blockReason === 'MODEL_ARMOR';
    const blockReasonMessage =
      datum.promptFeedback?.blockReasonMessage ||
      `Content was blocked due to ${isModelArmor ? 'Model Armor' : 'safety settings'}: ${blockReason}`;
    return {
      output: blockReasonMessage,
      tokenUsage: this.getVertexGeminiUsage(datum),
      guardrails: {
        flagged: true,
        flaggedInput: true,
        flaggedOutput: false,
        reason: blockReasonMessage,
      },
      metadata: {
        modelArmor: isModelArmor
          ? {
              blockReason,
              ...(datum.promptFeedback?.blockReasonMessage && {
                blockReasonMessage: datum.promptFeedback.blockReasonMessage,
              }),
            }
          : undefined,
      },
    };
  }

  private processVertexGeminiCandidate(
    candidate: ReturnType<typeof getCandidate>,
    datum: GeminiResponseData,
    currentOutput: Part[] | string | undefined,
    rawData: GeminiApiResponse,
  ): { output: Part[] | string | undefined } | ProviderResponse {
    const safetyResponse = this.getVertexGeminiSafetyResponse(candidate, datum);
    if (safetyResponse) {
      return safetyResponse;
    }
    if (candidate.finishReason === 'MAX_TOKENS') {
      if (candidate.content?.parts) {
        currentOutput = mergeParts(currentOutput, formatCandidateContents(candidate));
      }
      logger.debug(`Gemini API: MAX_TOKENS reached`, {
        finishReason: candidate.finishReason,
        outputTokens: datum.usageMetadata?.candidatesTokenCount || 0,
        totalTokens: datum.usageMetadata?.totalTokenCount || 0,
      });
      return { output: currentOutput };
    }
    if (candidate.finishReason && candidate.finishReason !== 'STOP') {
      logger.error(`Gemini API error due to finish reason: ${candidate.finishReason}.`);
      return { error: `Finish reason ${candidate.finishReason}: ${JSON.stringify(rawData)}` };
    }
    if (candidate.content?.parts) {
      return { output: mergeParts(currentOutput, formatCandidateContents(candidate)) };
    }
    return { error: `No output found in response: ${JSON.stringify(rawData)}` };
  }

  private getVertexGeminiSafetyResponse(
    candidate: ReturnType<typeof getCandidate>,
    datum: GeminiResponseData,
  ): ProviderResponse | undefined {
    const safetyFinishReasons = [
      'SAFETY',
      'PROHIBITED_CONTENT',
      'RECITATION',
      'BLOCKLIST',
      'SPII',
      'IMAGE_SAFETY',
    ];
    if (!candidate.finishReason || !safetyFinishReasons.includes(candidate.finishReason)) {
      return undefined;
    }

    const finishReason = `Content was blocked due to safety settings with finish reason: ${candidate.finishReason}.`;
    const guardrails: GuardrailResponse = {
      flagged: true,
      flaggedInput: false,
      flaggedOutput: true,
      reason: finishReason,
    };
    if (cliState.config?.redteam) {
      return { output: finishReason, tokenUsage: this.getVertexGeminiUsage(datum), guardrails };
    }
    return { error: finishReason, guardrails };
  }

  private getVertexGeminiUsage(datum: GeminiResponseData) {
    return {
      total: datum.usageMetadata?.totalTokenCount || 0,
      prompt: datum.usageMetadata?.promptTokenCount || 0,
      completion: datum.usageMetadata?.candidatesTokenCount || 0,
    };
  }

  private buildVertexGeminiTokenUsage(lastData: GeminiResponseData): TokenUsage {
    const promptTokenCount = lastData.usageMetadata?.promptTokenCount;
    const completionTokenCount = lastData.usageMetadata?.candidatesTokenCount;
    const thoughtsTokenCount = lastData.usageMetadata?.thoughtsTokenCount;
    return {
      total: lastData.usageMetadata?.totalTokenCount || 0,
      prompt: promptTokenCount || 0,
      completion: completionTokenCount || 0,
      ...(thoughtsTokenCount !== undefined && {
        completionDetails: {
          reasoning: thoughtsTokenCount,
          acceptedPrediction: 0,
          rejectedPrediction: 0,
        },
      }),
    };
  }

  private calculateVertexGeminiCost(lastData: GeminiResponseData, config: CompletionOptions) {
    const promptTokenCount = lastData.usageMetadata?.promptTokenCount;
    const completionTokenCount = lastData.usageMetadata?.candidatesTokenCount;
    const thoughtsTokenCount = lastData.usageMetadata?.thoughtsTokenCount;
    const completionForCost =
      completionTokenCount == null ? undefined : completionTokenCount + (thoughtsTokenCount ?? 0);
    return calculateGoogleCost(this.modelName, config, promptTokenCount, completionForCost, true);
  }

  private buildVertexGeminiMetadata(data: GeminiResponseData[]): Record<string, unknown> {
    const candidateWithMetadata = data
      .map((datum) => getCandidate(datum))
      .find(
        (candidate) =>
          candidate.groundingMetadata ||
          candidate.groundingChunks ||
          candidate.groundingSupports ||
          candidate.webSearchQueries,
      );
    if (!candidateWithMetadata) {
      return {};
    }
    return {
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

  private async applyVertexGeminiFunctionCallbacks(
    response: ProviderResponse,
    config: CompletionOptions,
    toolsDisabled: boolean,
  ): Promise<ProviderResponse> {
    try {
      if (toolsDisabled || !config.functionToolCallbacks || !isValidJson(response.output)) {
        return response;
      }
      const structuredOutput = JSON.parse(response.output as string);
      const functionCall = structuredOutput.functionCall;
      if (!functionCall) {
        return response;
      }
      const functionName = functionCall.name;
      if (!config.functionToolCallbacks[functionName]) {
        return response;
      }
      try {
        const functionResult = await this.executeFunctionCallback(
          functionName,
          JSON.stringify(
            typeof functionCall.args === 'string'
              ? JSON.parse(functionCall.args)
              : functionCall.args,
          ),
          config,
        );
        return { ...response, output: functionResult };
      } catch (error) {
        logger.error(`Error executing function ${functionName}: ${error}`);
        return response;
      }
    } catch (err) {
      return { error: `Tool callback error: ${String(err)}.` };
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
        safetySettings: normalizeSafetySettings(this.config.safetySettings),
        stopSequences: this.config.stopSequences,
        temperature: this.config.temperature,
        maxOutputTokens: this.config.maxOutputTokens,
        topP: this.config.topP,
        topK: this.config.topK,
      },
    };

    const cache = await getCache();
    const cacheKey = getVertexBodyCacheKey(`vertex:palm2:${this.modelName}`, body);

    let cachedResponse;
    if (isCacheEnabled()) {
      cachedResponse = await cache.get(cacheKey);
      if (cachedResponse) {
        const parsedCachedResponse = JSON.parse(cachedResponse as string);
        const tokenUsage = parsedCachedResponse.tokenUsage as TokenUsage;
        if (tokenUsage) {
          tokenUsage.cached = tokenUsage.total;
        }
        logger.debug('Returning cached Vertex Palm2 response', {
          model: this.modelName,
          cacheKey,
        });
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
        timeout: getRequestTimeoutMs(),
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

    const cache = await getCache();
    const cacheKey = getVertexBodyCacheKey(`vertex:llama:${this.modelName}`, body);
    logger.debug('Preparing to call Llama API', {
      model: this.modelName,
      region: this.getRegion(),
      messageCount: messages.length,
      maxTokens: body.max_tokens,
      temperature: body.temperature,
      topP: body.top_p,
      topK: body.top_k,
      safetySettingsEnabled: modelSafetySettings.enabled,
      llamaGuardSettingCount: Object.keys(modelSafetySettings.llama_guard_settings).length,
      cacheKey,
    });

    let cachedResponse;
    if (isCacheEnabled()) {
      cachedResponse = await cache.get(cacheKey);
      if (cachedResponse) {
        const parsedCachedResponse = JSON.parse(cachedResponse as string);
        const tokenUsage = parsedCachedResponse.tokenUsage as TokenUsage;
        if (tokenUsage) {
          tokenUsage.cached = tokenUsage.total;
        }
        logger.debug('Returning cached Vertex Llama response', {
          model: this.modelName,
          cacheKey,
        });
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
        timeout: getRequestTimeoutMs(),
      });

      data = res.data as LlamaResponse;
      logger.debug('Llama API response', {
        choiceCount: data.choices?.length ?? 0,
        hasUsage: data.usage !== undefined,
        totalTokens: data.usage?.total_tokens,
        promptTokens: data.usage?.prompt_tokens,
        completionTokens: data.usage?.completion_tokens,
      });
    } catch (err) {
      const error = err as GaxiosError;
      if (error.response && error.response.data) {
        logger.debug('Llama API error', {
          status: error.response.status,
          statusText: error.response.statusText,
          hasResponseData: error.response.data !== undefined,
        });
        return {
          error: `API call error: ${JSON.stringify(error.response.data)}`,
        };
      }
      logger.debug('Llama API error', {
        error: err instanceof Error ? err.message : String(err),
      });
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
  config: VertexEmbeddingProviderConfig;
  env?: EnvOverrides;

  constructor(modelName: string, options: GoogleProviderOptions = {}) {
    this.modelName = modelName;
    this.config = options.config || {};
    this.env = options.env;
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

    let data: VertexEmbeddingPredictResponse = {};
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
      data = res.data as VertexEmbeddingPredictResponse;
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

const DEFAULT_VERTEX_MODEL = 'gemini-2.5-pro';
const DEFAULT_VERTEX_EMBEDDING_MODEL = 'gemini-embedding-001';

export function getGoogleVertexEmbeddingProvider(env?: EnvOverrides) {
  return new VertexEmbeddingProvider(DEFAULT_VERTEX_EMBEDDING_MODEL, { env });
}

export function getGoogleVertexProviders(env?: EnvOverrides) {
  const gradingProvider = new VertexChatProvider(DEFAULT_VERTEX_MODEL, { env });
  return {
    embeddingProvider: getGoogleVertexEmbeddingProvider(env),
    gradingJsonProvider: gradingProvider,
    gradingProvider,
    suggestionsProvider: gradingProvider,
    synthesizeProvider: gradingProvider,
  };
}
