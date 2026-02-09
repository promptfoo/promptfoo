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
import { REQUEST_TIMEOUT_MS } from '../shared';
import { GoogleGenericProvider, type GoogleProviderOptions } from './base';
import {
  calculateGoogleCost,
  createAuthCacheDiscriminator,
  formatCandidateContents,
  geminiFormatAndSystemInstructions,
  getCandidate,
  getGoogleClient,
  loadCredentials,
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
    // Merge configs from the provider and the prompt
    const config = {
      ...this.config,
      ...context?.prompt?.config,
    };

    const { contents, systemInstruction } = geminiFormatAndSystemInstructions(
      prompt,
      context?.vars,
      config.systemInstruction,
      { useAssistantRole: config.useAssistantRole },
    );

    // Get all tools (MCP + config tools) using base class method
    const allTools = await this.getAllTools(context);

    const body: Record<string, any> = {
      contents,
      generationConfig: {
        ...(config.temperature !== undefined && { temperature: config.temperature }),
        ...(config.topP !== undefined && { topP: config.topP }),
        ...(config.topK !== undefined && { topK: config.topK }),
        ...(config.stopSequences !== undefined && { stopSequences: config.stopSequences }),
        ...(config.maxOutputTokens !== undefined && { maxOutputTokens: config.maxOutputTokens }),
        ...config.generationConfig,
      },
      safetySettings: config.safetySettings,
      ...(config.toolConfig ? { toolConfig: config.toolConfig } : {}),
      ...(allTools.length > 0 ? { tools: allTools } : {}),
      // Vertex AI uses camelCase (systemInstruction), AI Studio uses snake_case (system_instruction)
      ...(systemInstruction
        ? this.isVertexMode
          ? { systemInstruction }
          : { system_instruction: systemInstruction }
        : {}),
    };

    // Handle response schema
    if (config.responseSchema) {
      if (body.generationConfig.response_schema) {
        throw new Error(
          '`responseSchema` provided but `generationConfig.response_schema` already set.',
        );
      }

      let schema = maybeLoadFromExternalFile(
        renderVarsInObject(config.responseSchema, context?.vars),
      );

      // Parse JSON string if it's a string
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

    let data: GeminiApiResponse;
    let cached = false;

    try {
      if (this.isVertexMode && !this.isExpressMode()) {
        // Vertex AI OAuth mode
        const client = await this.getClientWithCredentials();
        const projectId = await this.getProjectId();
        const endpoint = config.streaming === true ? 'streamGenerateContent' : 'generateContent';
        const url = `https://${this.getApiHost()}/${this.getApiVersion()}/projects/${projectId}/locations/${this.getRegion()}/publishers/${this.getPublisher()}/models/${this.modelName}:${endpoint}`;

        const res = await client.request({
          url,
          method: 'POST',
          data: body,
          timeout: REQUEST_TIMEOUT_MS,
        });
        data = res.data as GeminiApiResponse;
      } else if (this.isVertexMode && this.isExpressMode()) {
        // Vertex AI express mode (API key)
        const endpoint = config.streaming === true ? 'streamGenerateContent' : 'generateContent';
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

        data = (await res.json()) as GeminiApiResponse;
      } else {
        // AI Studio mode
        const endpoint = this.getApiEndpoint('generateContent');
        const headers = await this.getAuthHeaders();
        const authDiscriminator = createAuthCacheDiscriminator(headers);
        const result = await fetchWithCache(
          endpoint,
          {
            method: 'POST',
            headers,
            body: JSON.stringify(body),
            // Include auth discriminator in cache key to prevent cross-tenant cache sharing
            ...(authDiscriminator && { _authHash: authDiscriminator }),
          } as RequestInit,
          REQUEST_TIMEOUT_MS,
          'json',
          false,
        );
        data = result.data as GeminiApiResponse;
        cached = result.cached;
      }
    } catch (err) {
      const geminiError = err as GaxiosError;
      if (geminiError.response?.data?.[0]?.error) {
        const errorDetails = geminiError.response.data[0].error;
        logger.error(`Gemini API error:\n${JSON.stringify(errorDetails)}`);
        return {
          error: `API call error: Status ${errorDetails.status}, Code ${errorDetails.code}, Message:\n\n${errorDetails.message}`,
        };
      }
      return {
        error: `API call error: ${String(err)}`,
      };
    }

    // Parse response
    return this.parseGeminiResponse(data, cached, config, context);
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
      // Normalize response: non-streaming returns single object, streaming returns array
      const normalizedData = Array.isArray(data) ? data : [data];

      // Check for error response
      const dataWithError = normalizedData as GeminiErrorResponse[];
      const error = dataWithError[0]?.error;
      if (error) {
        return { error: `Error ${error.code}: ${error.message}` };
      }

      const dataWithResponse = normalizedData as GeminiResponseData[];
      let output;

      for (const datum of dataWithResponse) {
        // Check for blockReason first
        if (datum.promptFeedback?.blockReason) {
          const isModelArmor = datum.promptFeedback.blockReason === 'MODEL_ARMOR';
          const blockReasonMessage =
            datum.promptFeedback.blockReasonMessage ||
            `Content was blocked due to ${isModelArmor ? 'Model Armor' : 'safety settings'}: ${datum.promptFeedback.blockReason}`;

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
          const guardrails: GuardrailResponse = {
            flagged: true,
            flaggedInput: false,
            flaggedOutput: true,
            reason: finishReason,
          };
          return { output: finishReason, tokenUsage, guardrails };
        } else if (candidate.finishReason && candidate.finishReason === 'MAX_TOKENS') {
          // MAX_TOKENS is treated as a successful completion
          if (candidate.content?.parts) {
            output = formatCandidateContents(candidate);
          }
        } else if (candidate.finishReason && candidate.finishReason !== 'STOP') {
          return {
            error: `Finish reason ${candidate.finishReason}: ${JSON.stringify(data)}`,
          };
        } else if (candidate.content?.parts) {
          output = formatCandidateContents(candidate);
        } else {
          return {
            error: `No output found in response: ${JSON.stringify(data)}`,
          };
        }
      }

      const lastData = dataWithResponse[dataWithResponse.length - 1];
      const tokenUsage: TokenUsage = cached
        ? {
            cached: lastData.usageMetadata?.totalTokenCount,
            total: lastData.usageMetadata?.totalTokenCount,
            numRequests: 0,
            ...(lastData.usageMetadata?.thoughtsTokenCount !== undefined && {
              completionDetails: {
                reasoning: lastData.usageMetadata.thoughtsTokenCount,
                acceptedPrediction: 0,
                rejectedPrediction: 0,
              },
            }),
          }
        : {
            prompt: lastData.usageMetadata?.promptTokenCount,
            completion: lastData.usageMetadata?.candidatesTokenCount,
            total: lastData.usageMetadata?.totalTokenCount,
            numRequests: 1,
            ...(lastData.usageMetadata?.thoughtsTokenCount !== undefined && {
              completionDetails: {
                reasoning: lastData.usageMetadata.thoughtsTokenCount,
                acceptedPrediction: 0,
                rejectedPrediction: 0,
              },
            }),
          };

      let guardrails: GuardrailResponse | undefined;
      const candidate = getCandidate(lastData);
      if (lastData.promptFeedback?.safetyRatings || candidate.safetyRatings) {
        const flaggedInput = lastData.promptFeedback?.safetyRatings?.some(
          (r) => r.probability !== 'NEGLIGIBLE',
        );
        const flaggedOutput = candidate.safetyRatings?.some((r) => r.probability !== 'NEGLIGIBLE');
        const flagged = flaggedInput || flaggedOutput;
        guardrails = { flaggedInput, flaggedOutput, flagged };
      }

      // Extract grounding metadata
      const candidateWithMetadata = dataWithResponse
        .map((datum) => getCandidate(datum))
        .find(
          (c) =>
            c.groundingMetadata || c.groundingChunks || c.groundingSupports || c.webSearchQueries,
        );

      // Calculate cost only for AI Studio mode (Vertex AI pricing differs)
      // Include thinking tokens in output cost - Google bills them as output tokens
      const completionForCost =
        tokenUsage.completion != null
          ? tokenUsage.completion + (lastData.usageMetadata?.thoughtsTokenCount ?? 0)
          : undefined;
      const cost =
        !this.isVertexMode && !cached
          ? calculateGoogleCost(this.modelName, config, tokenUsage.prompt, completionForCost)
          : undefined;

      const response: ProviderResponse = {
        output,
        tokenUsage,
        cost,
        raw: data,
        cached,
        ...(guardrails && { guardrails }),
        metadata: {
          ...(candidateWithMetadata?.groundingMetadata && {
            groundingMetadata: candidateWithMetadata.groundingMetadata,
          }),
          ...(candidateWithMetadata?.groundingChunks && {
            groundingChunks: candidateWithMetadata.groundingChunks,
          }),
          ...(candidateWithMetadata?.groundingSupports && {
            groundingSupports: candidateWithMetadata.groundingSupports,
          }),
          ...(candidateWithMetadata?.webSearchQueries && {
            webSearchQueries: candidateWithMetadata.webSearchQueries,
          }),
        },
      };

      // Handle function tool callbacks
      if (config.functionToolCallbacks && typeof output === 'string') {
        try {
          const parsed = JSON.parse(output);
          if (parsed.functionCall) {
            const functionName = parsed.functionCall.name;
            if (config.functionToolCallbacks[functionName]) {
              const functionResult = await this.executeFunctionCallback(
                functionName,
                JSON.stringify(
                  typeof parsed.functionCall.args === 'string'
                    ? JSON.parse(parsed.functionCall.args)
                    : parsed.functionCall.args,
                ),
                config,
              );
              response.output = functionResult;
            }
          }
        } catch {
          // Not JSON or no function call, ignore
        }
      }

      return response;
    } catch (err) {
      return {
        error: `Gemini API response error: ${String(err)}. Response data: ${JSON.stringify(data)}`,
      };
    }
  }

  // cleanup() is inherited from GoogleGenericProvider
}

export default GoogleProvider;
