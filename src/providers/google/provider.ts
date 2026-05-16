/**
 * Unified Google Provider for Gemini models.
 *
 * This provider handles both Google AI Studio and Vertex AI modes
 * for Gemini models, with the mode determined by the `vertexai` config flag.
 *
 * @example
 * // Google AI Studio mode (default)
 * new GoogleProvider('gemini-2.5-pro', { config: { apiKey: 'your-key' }})
 *
 * // Vertex AI mode
 * new GoogleProvider('gemini-2.5-pro', { config: { vertexai: true, projectId: 'my-project' }})
 */

import { fetchWithCache } from '../../cache';
import { getEnvString } from '../../envars';
import logger from '../../logger';
import { fetchWithProxy } from '../../util/fetch/index';
import { maybeLoadFromExternalFile } from '../../util/file';
import { renderVarsInObject } from '../../util/index';
import { getNunjucksEngine } from '../../util/templates';
import { getRequestTimeoutMs } from '../shared';
import { GoogleGenericProvider, type GoogleProviderOptions } from './base';
import {
  calculateGoogleCost,
  createAuthCacheDiscriminator,
  formatCandidateContents,
  geminiFormatAndSystemInstructions,
  getCandidate,
  getGoogleClient,
  loadCredentials,
  mergeGoogleCompletionOptions,
  normalizeSafetySettings,
  removeGoogleFunctionDeclarations,
  resolveGoogleToolConfig,
} from './util';

import type {
  CallApiContextParams,
  GuardrailResponse,
  ProviderResponse,
  TokenUsage,
} from '../../types/index';
import type { CompletionOptions } from './types';
import type { GeminiApiResponse, GeminiErrorResponse, GeminiResponseData } from './util';

// Type for Google API errors
type GaxiosError = any;

const DEFAULT_AI_STUDIO_HOST = 'generativelanguage.googleapis.com';

/**
 * Unified Google provider for Gemini models.
 *
 * Supports both Google AI Studio and Vertex AI modes, determined by the
 * `vertexai` configuration option (Python SDK alignment).
 *
 * Mode determination priority:
 * 1. Explicit `vertexai: true/false` in config
 * 2. `GOOGLE_GENAI_USE_VERTEXAI` environment variable
 * 3. Auto-detect from projectId/credentials presence
 * 4. Default: false (Google AI Studio)
 */
export class GoogleProvider extends GoogleGenericProvider {
  constructor(modelName: string, options: GoogleProviderOptions = {}) {
    super(modelName, options);

    // Log mode for debugging
    logger.debug(
      `[GoogleProvider] Initialized with model=${modelName}, vertexMode=${this.isVertexMode}`,
    );
  }

  /**
   * Get the API host based on mode.
   * Public for use by integrations like Adaline Gateway.
   */
  getApiHost(): string {
    if (this.isVertexMode) {
      // Vertex AI mode
      const region = this.getRegion();
      return (
        this.config.apiHost ||
        this.env?.VERTEX_API_HOST ||
        getEnvString('VERTEX_API_HOST') ||
        (region === 'global' ? 'aiplatform.googleapis.com' : `${region}-aiplatform.googleapis.com`)
      );
    } else {
      // AI Studio mode
      const apiHost =
        this.config.apiHost ||
        this.env?.GOOGLE_API_HOST ||
        this.env?.PALM_API_HOST ||
        getEnvString('GOOGLE_API_HOST') ||
        getEnvString('PALM_API_HOST') ||
        DEFAULT_AI_STUDIO_HOST;
      return getNunjucksEngine().renderString(apiHost, {});
    }
  }

  /**
   * Get the API version.
   *
   * For Vertex AI: Uses config.apiVersion, env vars, or defaults to 'v1'.
   * For AI Studio: Uses config.apiVersion if set, otherwise auto-detects
   * based on model (v1alpha for thinking/gemini-3 models, v1beta for others).
   */
  private getApiVersion(): string {
    if (this.isVertexMode) {
      return (
        this.config.apiVersion ||
        this.env?.VERTEX_API_VERSION ||
        getEnvString('VERTEX_API_VERSION') ||
        'v1'
      );
    } else {
      // AI Studio: allow explicit override, then auto-detect based on model
      if (this.config.apiVersion) {
        return this.config.apiVersion;
      }
      // Auto-detect: v1alpha for thinking models and gemini-3, v1beta for others
      return this.modelName === 'gemini-2.0-flash-thinking-exp' ||
        this.modelName.startsWith('gemini-3-')
        ? 'v1alpha'
        : 'v1beta';
    }
  }

  /**
   * Get the publisher for Vertex AI.
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
   * Get the API endpoint URL.
   *
   * @param action - Optional action like 'generateContent'
   * @returns The full API endpoint URL
   */
  getApiEndpoint(action?: string): string {
    const actionSuffix = action ? `:${action}` : '';

    if (this.isVertexMode) {
      return `https://${this.getApiHost()}/${this.getApiVersion()}/publishers/${this.getPublisher()}/models/${this.modelName}${actionSuffix}`;
    } else {
      const baseUrl = this.getApiBaseUrl();
      return `${baseUrl}/${this.getApiVersion()}/models/${this.modelName}${actionSuffix}`;
    }
  }

  /**
   * Get the base URL for AI Studio API.
   */
  private getApiBaseUrl(): string {
    // Check for apiHost first (most specific override)
    const apiHost =
      this.config.apiHost ||
      this.env?.GOOGLE_API_HOST ||
      this.env?.PALM_API_HOST ||
      getEnvString('GOOGLE_API_HOST') ||
      getEnvString('PALM_API_HOST');
    if (apiHost) {
      const renderedHost = getNunjucksEngine().renderString(apiHost, {});
      return `https://${renderedHost}`;
    }

    // Check for apiBaseUrl (less specific override)
    if (
      this.config.apiBaseUrl ||
      this.env?.GOOGLE_API_BASE_URL ||
      getEnvString('GOOGLE_API_BASE_URL')
    ) {
      return (
        this.config.apiBaseUrl ||
        this.env?.GOOGLE_API_BASE_URL ||
        getEnvString('GOOGLE_API_BASE_URL')!
      );
    }

    // Default: render the default host with Nunjucks for template variable support
    const renderedHost = getNunjucksEngine().renderString(DEFAULT_AI_STUDIO_HOST, {});
    return `https://${renderedHost}`;
  }

  /**
   * Get authentication headers.
   * API key is passed via x-goog-api-key header for improved security.
   */
  async getAuthHeaders(): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.config.headers,
    };

    // Add API key to headers if available and we're using express/API key mode
    if (!this.isVertexMode || this.isExpressMode()) {
      const apiKey = this.getApiKey();
      if (apiKey) {
        headers['x-goog-api-key'] = apiKey;
      }
    }

    return headers;
  }

  /**
   * Check if express mode should be used (API key without OAuth).
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
    if (!this.isVertexMode) {
      return false;
    }

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
   * Get Google client with credentials support for OAuth mode.
   */
  private async getClientWithCredentials() {
    const credentials = loadCredentials(this.config.credentials);
    const { client } = await getGoogleClient({
      credentials,
      googleAuthOptions: this.config.googleAuthOptions,
      scopes: this.config.scopes,
      keyFilename: this.config.keyFilename,
    });
    return client;
  }

  /**
   * Call the API with the given prompt.
   */
  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    // Wait for MCP initialization if pending
    if (this.initializationPromise != null) {
      await this.initializationPromise;
    }

    // Require API key for AI Studio mode
    if (!this.isVertexMode) {
      const apiKey = this.getApiKey();
      if (!apiKey) {
        throw new Error(
          'Google API key is not set. Set the GOOGLE_API_KEY or GEMINI_API_KEY environment variable or add `apiKey` to the provider config.',
        );
      }
    }

    return this.callGeminiApi(prompt, context);
  }

  /**
   * Call the Gemini API.
   */
  private async callGeminiApi(
    prompt: string,
    context?: CallApiContextParams,
  ): Promise<ProviderResponse> {
    const config = mergeGoogleCompletionOptions(
      this.config,
      context?.prompt?.config as Partial<CompletionOptions> | undefined,
    );
    const body = await this.buildGeminiRequestBody(prompt, config, context);
    const requestResult = await this.requestGeminiResponse(body, config);
    if (this.isProviderErrorResponse(requestResult)) {
      return requestResult;
    }
    return this.parseGeminiResponse(requestResult.data, requestResult.cached, config, context);
  }

  private async buildGeminiRequestBody(
    prompt: string,
    config: CompletionOptions,
    context?: CallApiContextParams,
  ): Promise<Record<string, any>> {
    const { contents, systemInstruction } = geminiFormatAndSystemInstructions(
      prompt,
      context?.vars,
      config.systemInstruction,
      { useAssistantRole: config.useAssistantRole },
    );
    const { toolConfig, toolsDisabled } = resolveGoogleToolConfig(config);
    const allTools = await this.getAllTools(context, { skipExecutableToolFiles: toolsDisabled });
    const requestTools = toolsDisabled ? removeGoogleFunctionDeclarations(allTools) : allTools;
    const body: Record<string, any> = {
      contents,
      generationConfig: this.buildGenerationConfig(config),
      safetySettings: normalizeSafetySettings(config.safetySettings),
      ...(toolConfig ? { toolConfig } : {}),
      ...(requestTools.length > 0 ? { tools: requestTools } : {}),
      ...(systemInstruction ? this.buildSystemInstruction(systemInstruction) : {}),
    };
    this.applyResponseSchema(body, config, context);
    return body;
  }

  private buildGenerationConfig(config: CompletionOptions) {
    return {
      ...(config.temperature !== undefined && { temperature: config.temperature }),
      ...(config.topP !== undefined && { topP: config.topP }),
      ...(config.topK !== undefined && { topK: config.topK }),
      ...(config.stopSequences !== undefined && { stopSequences: config.stopSequences }),
      ...(config.maxOutputTokens !== undefined && { maxOutputTokens: config.maxOutputTokens }),
      ...config.generationConfig,
    };
  }

  private buildSystemInstruction(systemInstruction: unknown) {
    return this.isVertexMode ? { systemInstruction } : { system_instruction: systemInstruction };
  }

  private applyResponseSchema(
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
    body.generationConfig.response_schema = this.loadResponseSchema(config.responseSchema, context);
    body.generationConfig.response_mime_type = 'application/json';
  }

  private loadResponseSchema(responseSchema: unknown, context?: CallApiContextParams): unknown {
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

  private async requestGeminiResponse(
    body: Record<string, any>,
    config: CompletionOptions,
  ): Promise<{ data: GeminiApiResponse; cached: boolean } | ProviderResponse> {
    try {
      if (this.isVertexMode && !this.isExpressMode()) {
        return { data: await this.requestVertexOauth(body, config), cached: false };
      }
      if (this.isVertexMode) {
        return await this.requestVertexExpress(body, config);
      }
      return await this.requestAiStudio(body);
    } catch (err) {
      return this.formatGeminiRequestError(err);
    }
  }

  private async requestVertexOauth(
    body: Record<string, any>,
    config: CompletionOptions,
  ): Promise<GeminiApiResponse> {
    const client = await this.getClientWithCredentials();
    const projectId = await this.getProjectId();
    const endpoint = config.streaming === true ? 'streamGenerateContent' : 'generateContent';
    const url = `https://${this.getApiHost()}/${this.getApiVersion()}/projects/${projectId}/locations/${this.getRegion()}/publishers/${this.getPublisher()}/models/${this.modelName}:${endpoint}`;
    const res = await client.request({
      url,
      method: 'POST',
      data: body,
      timeout: getRequestTimeoutMs(),
    });
    return res.data as GeminiApiResponse;
  }

  private async requestVertexExpress(
    body: Record<string, any>,
    config: CompletionOptions,
  ): Promise<{ data: GeminiApiResponse; cached: boolean } | ProviderResponse> {
    const endpoint = config.streaming === true ? 'streamGenerateContent' : 'generateContent';
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
    return { data: (await res.json()) as GeminiApiResponse, cached: false };
  }

  private async requestAiStudio(
    body: Record<string, any>,
  ): Promise<{ data: GeminiApiResponse; cached: boolean } | ProviderResponse> {
    const headers = await this.getAuthHeaders();
    const authDiscriminator = createAuthCacheDiscriminator(headers);
    const result = await fetchWithCache(
      this.getApiEndpoint('generateContent'),
      {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        ...(authDiscriminator && { _authHash: authDiscriminator }),
      } as RequestInit,
      getRequestTimeoutMs(),
      'json',
      false,
    );
    if (!result) {
      return { error: 'API call error: Empty response from Google API' };
    }
    return { data: result.data as GeminiApiResponse, cached: result.cached };
  }

  private formatGeminiRequestError(err: unknown): ProviderResponse {
    const geminiError = err as GaxiosError;
    if (geminiError.response?.data?.[0]?.error) {
      const errorDetails = geminiError.response.data[0].error;
      logger.error(`Gemini API error:\n${JSON.stringify(errorDetails)}`);
      return {
        error: `API call error: Status ${errorDetails.status}, Code ${errorDetails.code}, Message:\n\n${errorDetails.message}`,
      };
    }
    return { error: `API call error: ${String(err)}` };
  }

  private isProviderErrorResponse(
    value: { data: GeminiApiResponse; cached: boolean } | ProviderResponse,
  ): value is ProviderResponse {
    return 'error' in value && !('data' in value);
  }

  /**
   * Parse Gemini API response.
   */
  private async parseGeminiResponse(
    data: GeminiApiResponse,
    cached: boolean,
    config: CompletionOptions,
    _context?: CallApiContextParams,
  ): Promise<ProviderResponse> {
    try {
      const { toolsDisabled } = resolveGoogleToolConfig(config);
      const normalizedData = Array.isArray(data) ? data : [data];
      const dataWithError = normalizedData as GeminiErrorResponse[];
      const error = dataWithError[0]?.error;
      if (error) {
        return { error: `Error ${error.code}: ${error.message}` };
      }
      const dataWithResponse = normalizedData as GeminiResponseData[];
      const outputResult = this.extractGeminiOutput(dataWithResponse, data);
      if ('error' in outputResult || 'guardrails' in outputResult) {
        return outputResult;
      }

      const lastData = dataWithResponse[dataWithResponse.length - 1];
      const tokenUsage = this.buildGeminiTokenUsage(lastData, cached);
      const guardrails = this.buildGeminiGuardrails(lastData);
      const candidateWithMetadata = this.findGroundedCandidate(dataWithResponse);
      const response: ProviderResponse = {
        output: outputResult.output,
        tokenUsage,
        cost: this.calculateGeminiCost(tokenUsage, lastData, config, cached),
        raw: data,
        cached,
        ...(guardrails && { guardrails }),
        metadata: this.buildGeminiMetadata(candidateWithMetadata),
      };

      await this.applyGeminiFunctionCallback(response, config, toolsDisabled);
      return response;
    } catch (err) {
      return {
        error: `Gemini API response error: ${String(err)}. Response data: ${JSON.stringify(data)}`,
      };
    }
  }

  private extractGeminiOutput(
    data: GeminiResponseData[],
    rawData: GeminiApiResponse,
  ): { output: unknown } | ProviderResponse {
    let output: unknown;
    for (const datum of data) {
      const blockedPrompt = this.getBlockedPromptResponse(datum);
      if (blockedPrompt) {
        return blockedPrompt;
      }
      const candidate = getCandidate(datum);
      const blockedCandidate = this.getBlockedCandidateResponse(candidate, datum);
      if (blockedCandidate) {
        return blockedCandidate;
      }
      if (
        candidate.finishReason &&
        candidate.finishReason !== 'STOP' &&
        candidate.finishReason !== 'MAX_TOKENS'
      ) {
        return { error: `Finish reason ${candidate.finishReason}: ${JSON.stringify(rawData)}` };
      }
      if (!candidate.content?.parts) {
        return { error: `No output found in response: ${JSON.stringify(rawData)}` };
      }
      output = formatCandidateContents(candidate);
    }
    return { output };
  }

  private getBlockedPromptResponse(datum: GeminiResponseData): ProviderResponse | undefined {
    if (!datum.promptFeedback?.blockReason) {
      return undefined;
    }
    const isModelArmor = datum.promptFeedback.blockReason === 'MODEL_ARMOR';
    const blockReasonMessage =
      datum.promptFeedback.blockReasonMessage ||
      `Content was blocked due to ${isModelArmor ? 'Model Armor' : 'safety settings'}: ${datum.promptFeedback.blockReason}`;
    return {
      output: blockReasonMessage,
      tokenUsage: this.buildBlockedTokenUsage(datum),
      guardrails: {
        flagged: true,
        flaggedInput: true,
        flaggedOutput: false,
        reason: blockReasonMessage,
      },
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

  private getBlockedCandidateResponse(
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
    return {
      output: finishReason,
      tokenUsage: this.buildBlockedTokenUsage(datum),
      guardrails: {
        flagged: true,
        flaggedInput: false,
        flaggedOutput: true,
        reason: finishReason,
      },
    };
  }

  private buildBlockedTokenUsage(datum: GeminiResponseData) {
    return {
      total: datum.usageMetadata?.totalTokenCount || 0,
      prompt: datum.usageMetadata?.promptTokenCount || 0,
      completion: datum.usageMetadata?.candidatesTokenCount || 0,
    };
  }

  private buildGeminiTokenUsage(lastData: GeminiResponseData, cached: boolean): TokenUsage {
    const completionDetails =
      lastData.usageMetadata?.thoughtsTokenCount === undefined
        ? {}
        : {
            completionDetails: {
              reasoning: lastData.usageMetadata.thoughtsTokenCount,
              acceptedPrediction: 0,
              rejectedPrediction: 0,
            },
          };
    return cached
      ? {
          cached: lastData.usageMetadata?.totalTokenCount,
          total: lastData.usageMetadata?.totalTokenCount,
          numRequests: 0,
          ...completionDetails,
        }
      : {
          prompt: lastData.usageMetadata?.promptTokenCount,
          completion: lastData.usageMetadata?.candidatesTokenCount,
          total: lastData.usageMetadata?.totalTokenCount,
          numRequests: 1,
          ...completionDetails,
        };
  }

  private buildGeminiGuardrails(lastData: GeminiResponseData): GuardrailResponse | undefined {
    const candidate = getCandidate(lastData);
    if (!lastData.promptFeedback?.safetyRatings && !candidate.safetyRatings) {
      return undefined;
    }
    const flaggedInput = lastData.promptFeedback?.safetyRatings?.some(
      (rating) => rating.probability !== 'NEGLIGIBLE',
    );
    const flaggedOutput = candidate.safetyRatings?.some(
      (rating) => rating.probability !== 'NEGLIGIBLE',
    );
    return { flaggedInput, flaggedOutput, flagged: flaggedInput || flaggedOutput };
  }

  private findGroundedCandidate(data: GeminiResponseData[]) {
    return data
      .map((datum) => getCandidate(datum))
      .find(
        (candidate) =>
          candidate.groundingMetadata ||
          candidate.groundingChunks ||
          candidate.groundingSupports ||
          candidate.webSearchQueries,
      );
  }

  private calculateGeminiCost(
    tokenUsage: TokenUsage,
    lastData: GeminiResponseData,
    config: CompletionOptions,
    cached: boolean,
  ): number | undefined {
    if (cached) {
      return undefined;
    }
    const completionForCost =
      tokenUsage.completion == null
        ? undefined
        : tokenUsage.completion + (lastData.usageMetadata?.thoughtsTokenCount ?? 0);
    return calculateGoogleCost(
      this.modelName,
      config,
      tokenUsage.prompt,
      completionForCost,
      this.isVertexMode,
    );
  }

  private buildGeminiMetadata(candidate: ReturnType<typeof getCandidate> | undefined) {
    return {
      ...(candidate?.groundingMetadata && { groundingMetadata: candidate.groundingMetadata }),
      ...(candidate?.groundingChunks && { groundingChunks: candidate.groundingChunks }),
      ...(candidate?.groundingSupports && { groundingSupports: candidate.groundingSupports }),
      ...(candidate?.webSearchQueries && { webSearchQueries: candidate.webSearchQueries }),
    };
  }

  private async applyGeminiFunctionCallback(
    response: ProviderResponse,
    config: CompletionOptions,
    toolsDisabled: boolean,
  ): Promise<void> {
    if (toolsDisabled || !config.functionToolCallbacks || typeof response.output !== 'string') {
      return;
    }
    try {
      const parsed = JSON.parse(response.output);
      if (!parsed.functionCall) {
        return;
      }
      const functionName = parsed.functionCall.name;
      if (!config.functionToolCallbacks[functionName]) {
        return;
      }
      const args =
        typeof parsed.functionCall.args === 'string'
          ? JSON.parse(parsed.functionCall.args)
          : parsed.functionCall.args;
      response.output = await this.executeFunctionCallback(
        functionName,
        JSON.stringify(args),
        config,
      );
    } catch {
      // Not JSON or no function call, ignore
    }
  }

  // cleanup() is inherited from GoogleGenericProvider
}

export default GoogleProvider;
